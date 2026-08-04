import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { supabase } from '../supabase-client.js';

let serviceType = 'eat_in'; // 'eat_in' | 'takeaway'
let tableNumber = '';
let customerName = '';
let cartItems = [];
let currentNotes = '';
let activeOrder = null;
let products = [];
let categories = [];
let currentCategory = 'all';

document.addEventListener('DOMContentLoaded', initClienteApp);

async function initClienteApp() {
    const appEl = document.getElementById('cliente-app');
    if (!appEl) return;

    try {
        const [prodData, catData] = await Promise.all([
            productService.getAll(),
            productService.getCategories()
        ]);
        products = prodData || [];
        categories = catData || [];
    } catch {
        showToast({ message: 'Error cargando carta de productos', type: 'error' });
    }

    renderView(appEl);
}

function renderView(appEl) {
    if (activeOrder) {
        renderOrderTracker(appEl);
    } else {
        renderMenuCatalog(appEl);
    }
}

function renderMenuCatalog(appEl) {
    appEl.innerHTML = `
        <div class="cliente-header-banner">
            <img src="banner.png" alt="Burgame Banner" class="cliente-banner-img">
            <p style="font-family: var(--font-title); font-size: 0.75rem; color: var(--color-primary); margin-top: 0.5rem;">
                🎮 HAZ TU PEDIDO DIRECTO DESDE LA MESA
            </p>
        </div>

        <!-- Selector de Tipo de Servicio -->
        <div class="service-type-selector">
            <button class="btn-service-type ${serviceType === 'eat_in' ? 'active' : ''}" id="btn-eat-in">
                <span>🍔 PARA COMER ACÁ</span>
                <span style="font-size: 0.72rem; font-weight: 500;">Servicio en Mesa</span>
            </button>
            <button class="btn-service-type ${serviceType === 'takeaway' ? 'active' : ''}" id="btn-takeaway">
                <span>🛍️ PARA LLEVAR</span>
                <span style="font-size: 0.72rem; font-weight: 500;">Retiro en Barra</span>
            </button>
        </div>

        <!-- Campos de Datos del Cliente -->
        <div class="card" style="margin-bottom: 1.2rem; padding: 1rem;">
            <div class="form-row" style="display: flex; gap: 0.8rem; margin-bottom: 0.5rem;">
                <div class="form-group" style="flex: 1;">
                    <label style="font-size: 0.8rem; font-weight: 700;">Tu Nombre o Apodo:</label>
                    <input type="text" id="cust-name" placeholder="Ej: Juan, Mateo..." value="${customerName}">
                </div>
                ${serviceType === 'eat_in' ? `
                    <div class="form-group" style="width: 120px;">
                        <label style="font-size: 0.8rem; font-weight: 700;">N° Mesa:</label>
                        <input type="text" id="cust-table" placeholder="Ej: 4" value="${tableNumber}">
                    </div>
                ` : ''}
            </div>
        </div>

        <!-- Categorías -->
        <nav class="categories-bar" style="margin-bottom: 1rem;">
            <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">⚡ Todos</button>
            ${categories.map(cat => `
                <button class="category-tab ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
                    ${cat.name}
                </button>
            `).join('')}
        </nav>

        <!-- Catalog Grid -->
        <div class="products-grid" id="products-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.85rem;">
            ${renderProductsGrid()}
        </div>

        <!-- Floating Cart & Checkout Drawer -->
        ${cartItems.length > 0 ? `
            <div class="ticket-panel open" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000; border-radius: 20px 20px 0 0; background: #0E1017; border-top: 2px solid var(--color-primary); padding: 1.2rem; box-shadow: 0 -10px 40px rgba(0,0,0,0.9);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                    <span style="font-weight: 800; font-size: 0.95rem; color: var(--color-primary);">🛒 TU PEDIDO (${cartItems.reduce((a, b) => a + b.quantity, 0)})</span>
                    <span style="font-family: var(--font-title); color: var(--color-primary); font-size: 1.1rem;">${formatGs(calculateTotal())}</span>
                </div>
                
                <div class="ticket-items" style="max-height: 25vh; overflow-y: auto; margin-bottom: 0.8rem;">
                    ${renderCartItems()}
                </div>

                <button id="btn-submit-self-order" class="btn btn--primary btn--block" style="padding: 0.9rem; font-weight: 800; font-size: 1rem;">
                    🚀 CONFIRMAR Y ENVIAR PEDIDO
                </button>
            </div>
        ` : ''}
    `;

    setupEvents(appEl);
}

function renderProductsGrid() {
    let filtered = products;
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === currentCategory);
    }

    return filtered.map(product => {
        const imageSrc = product.image_url || 'assets/placeholders/burger-placeholder.svg';
        const comboPrice = product.combo_price || (product.price + 10000);

        const isBurger = product.category_id === 'burgers' || (product.name.toLowerCase().includes('burger') || product.name.toLowerCase().includes('classic') || product.name.toLowerCase().includes('bowser') || product.name.toLowerCase().includes('cheat') || product.name.toLowerCase().includes('fatality') || product.name.toLowerCase().includes('ronin') || product.name.toLowerCase().includes('yoshi'));
        const isChopp = product.name.toLowerCase().includes('pilsen') || product.name.toLowerCase().includes('chopp');

        return `
            <div class="product-card">
                <div class="product-card__image">
                    <img src="${imageSrc}" alt="${product.name}">
                </div>
                <div class="product-card__content" style="padding: 0.75rem;">
                    <h3 class="product-card__title" style="font-size: 0.95rem; font-weight: 800;">${product.name}</h3>
                    <p class="product-card__ingredients" style="font-size: 0.75rem; min-height: 28px;">${(product.ingredients || []).join(', ')}</p>
                    
                    <div class="product-card__actions" style="margin-top: 0.5rem;">
                        ${isBurger ? `
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; width: 100%;">
                                <button class="btn btn-add-single" data-id="${product.id}" style="padding: 0.4rem 0.2rem; font-size: 0.75rem; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: var(--text-color); border-radius: 6px; cursor: pointer;">
                                    🍔 Solo<br><span style="color: var(--color-primary); font-size: 0.7rem;">${formatGs(product.price)}</span>
                                </button>
                                <button class="btn btn-add-combo" data-id="${product.id}" style="padding: 0.4rem 0.2rem; font-size: 0.75rem; font-weight: 800; background: var(--color-primary); border: none; color: #000; border-radius: 6px; cursor: pointer;">
                                    🍟 Combo<br><span style="font-size: 0.7rem;">${formatGs(comboPrice)}</span>
                                </button>
                            </div>
                        ` : isChopp ? `
                            <div style="display: flex; flex-direction: column; gap: 0.3rem; width: 100%;">
                                <button class="btn btn-add-variant" data-id="${product.id}" data-vname="1 Chopp" data-vprice="15000" style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; font-size: 0.78rem; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: var(--text-color); border-radius: 6px; cursor: pointer;">
                                    <span>🍺 1 Chopp</span>
                                    <span style="color: var(--color-primary); font-weight: 800;">15.000</span>
                                </button>
                                <button class="btn btn-add-variant" data-id="${product.id}" data-vname="2x1 Chopp" data-vprice="25000" style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; font-size: 0.78rem; font-weight: 800; background: rgba(255,215,0,0.12); border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: 6px; cursor: pointer;">
                                    <span>🍻 Promo 2x1</span>
                                    <span style="font-weight: 900;">25.000</span>
                                </button>
                                <button class="btn btn-add-variant" data-id="${product.id}" data-vname="Chopp LIBRE" data-vprice="55000" style="display: flex; justify-content: space-between; align-items: center; padding: 0.45rem 0.6rem; font-size: 0.78rem; font-weight: 900; background: var(--color-primary); border: none; color: #000; border-radius: 6px; cursor: pointer;">
                                    <span>♾️ Chopp LIBRE</span>
                                    <span style="font-weight: 900;">55.000</span>
                                </button>
                            </div>
                        ` : `
                            <button class="btn btn-add-single" data-id="${product.id}" style="width: 100%; padding: 0.45rem 0.5rem; font-size: 0.8rem; font-weight: 800; background: rgba(255,215,0,0.12); border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: 6px; cursor: pointer;">
                                ➕ ${formatGs(product.price)}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCartItems() {
    return cartItems.map((item, idx) => `
        <div class="cart-item" style="padding: 0.6rem; border-left: 3px solid ${item.isCombo ? 'var(--color-primary)' : 'var(--border-subtle)'};">
            <div class="cart-item__info">
                <div>
                    <span style="font-weight: 700; font-size: 0.88rem;">${item.productName} ${item.isCombo ? '(COMBO)' : ''}</span>
                </div>
                <span class="cart-item__subtotal" style="font-size: 0.9rem;">${formatGs(item.price * item.quantity)}</span>
            </div>
            
            <!-- Aclaración individual por producto -->
            <div style="margin-top: 0.4rem;">
                <input type="text" class="input-item-note-cliente" data-idx="${idx}" placeholder="✏️ Aclaración (ej: Sin cebolla, bien cocida...)" value="${item.customNotes || ''}" style="width: 100%; font-size: 0.78rem; padding: 0.35rem 0.6rem; background: #0E1017; border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--color-primary);">
            </div>

            <div class="cart-item__controls" style="margin-top: 0.4rem;">
                <button class="btn-qty" data-action="dec" data-idx="${idx}">-</button>
                <span class="cart-item__qty">${item.quantity}</span>
                <button class="btn-qty" data-action="inc" data-idx="${idx}">+</button>
                <button class="btn-remove" data-action="del" data-idx="${idx}">&times;</button>
            </div>
        </div>
    `).join('');
}

function calculateTotal() {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}

function setupEvents(appEl) {
    // Tipo de Servicio
    appEl.querySelector('#btn-eat-in')?.addEventListener('click', () => {
        serviceType = 'eat_in';
        renderView(appEl);
    });
    appEl.querySelector('#btn-takeaway')?.addEventListener('click', () => {
        serviceType = 'takeaway';
        renderView(appEl);
    });

    // Inputs Nombre / Mesa
    appEl.querySelector('#cust-name')?.addEventListener('input', (e) => customerName = e.target.value);
    appEl.querySelector('#cust-table')?.addEventListener('input', (e) => tableNumber = e.target.value);

    // Add to cart
    appEl.querySelectorAll('.btn-add-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(btn.dataset.id, false);
            renderView(appEl);
        });
    });

    appEl.querySelectorAll('.btn-add-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            addToCart(btn.dataset.id, true);
            renderView(appEl);
        });
    });

    // Agregar variante de bebida cliente
    appEl.querySelectorAll('.btn-add-variant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const vName = btn.dataset.vname;
            const vPrice = parseInt(btn.dataset.vprice, 10);
            addVariantToCart(id, vName, vPrice);
            renderView(appEl);
        });
    });

    // Aclaraciones individuales cliente
    appEl.querySelectorAll('.input-item-note-cliente').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(input.dataset.idx, 10);
            if (cartItems[idx]) {
                cartItems[idx].customNotes = e.target.value;
            }
        });
    });

    // Cart Qty Controls
    appEl.querySelectorAll('.btn-qty, .btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);

            if (action === 'inc') cartItems[idx].quantity++;
            else if (action === 'dec') {
                cartItems[idx].quantity--;
                if (cartItems[idx].quantity <= 0) cartItems.splice(idx, 1);
            } else if (action === 'del') {
                cartItems.splice(idx, 1);
            }
            renderView(appEl);
        });
    });

    // Confirm Self Order
    appEl.querySelector('#btn-submit-self-order')?.addEventListener('click', async () => {
        const nameVal = appEl.querySelector('#cust-name')?.value.trim();
        const tableVal = appEl.querySelector('#cust-table')?.value.trim();

        if (!nameVal) {
            showToast({ message: 'Ingresa tu nombre o apodo antes de enviar', type: 'warning' });
            return;
        }

        if (serviceType === 'eat_in' && !tableVal) {
            showToast({ message: 'Ingresa el número de tu mesa', type: 'warning' });
            return;
        }

        let currentReg = null;
        try {
            currentReg = await cashService.getCurrentRegister();
        } catch { }

        const fullCustomerName = serviceType === 'eat_in' ? `${nameVal} (Mesa ${tableVal})` : `${nameVal} (Para Llevar)`;

        try {
            const order = await orderService.createOrder({
                items: cartItems,
                notes: serviceType === 'eat_in' ? `AUTOPEDIDO MESA ${tableVal}` : `AUTOPEDIDO PARA LLEVAR`,
                customerName: fullCustomerName,
                cashRegisterId: currentReg ? currentReg.id : null
            });

            activeOrder = order;
            cartItems = [];
            showToast({ message: '🏆 ¡Pedido recibido! Cocina ya está trabajando en tu orden.', type: 'success' });
            
            subscribeToLiveTracker(order.id, appEl);
            renderView(appEl);
        } catch (err) {
            showToast({ message: 'Error enviando pedido: ' + err.message, type: 'error' });
        }
    });
}

function addToCart(productId, isCombo) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const price = isCombo ? (product.combo_price || (product.price + 10000)) : product.price;
    const existingIdx = cartItems.findIndex(ci => ci.productId === product.id && ci.isCombo === isCombo && (ci.customNotes || '') === '');

    if (existingIdx >= 0) {
        cartItems[existingIdx].quantity++;
    } else {
        cartItems.push({
            productId: product.id,
            productName: product.name,
            price: price,
            quantity: 1,
            isCombo: isCombo,
            customNotes: ''
        });
    }
}

function addVariantToCart(productId, variantName, variantPrice) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const fullName = `${product.name} (${variantName})`;
    const existingIdx = cartItems.findIndex(ci => ci.productId === product.id && ci.productName === fullName);

    if (existingIdx >= 0) {
        cartItems[existingIdx].quantity++;
    } else {
        cartItems.push({
            productId: product.id,
            productName: fullName,
            price: variantPrice,
            quantity: 1,
            isCombo: false,
            customNotes: ''
        });
    }
}

function renderOrderTracker(appEl) {
    const status = activeOrder.status || 'ordered';
    let progressPct = 33;
    let statusLabel = '⚡ PEDIDO ENVIADO A COCINA';
    let subtext = 'Tu comanda ya ingresó a la fila de preparación.';

    if (status === 'preparing') {
        progressPct = 66;
        statusLabel = '🔥 EN PREPARACIÓN';
        subtext = 'Tus hamburguesas se están cocinando al fuego ahora mismo.';
    } else if (status === 'ready') {
        progressPct = 100;
        statusLabel = '✅ ¡LISTO EN BARRA / MESA!';
        subtext = '¡Tu pedido ya está listo! Retira en barra o te lo llevamos a la mesa.';
    }

    appEl.innerHTML = `
        <div class="cliente-header-banner">
            <img src="banner.png" alt="Burgame Banner" class="cliente-banner-img">
        </div>

        <div class="order-tracker-card" style="margin-top: 1rem;">
            <div class="tracker-title">PEDIDO #${activeOrder.order_number || ''}</div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
                ${activeOrder.customer_name || ''}
            </div>

            <!-- Health Bar / Progress Bar -->
            <div class="tracker-health-bar">
                <div class="tracker-health-fill" style="width: ${progressPct}%;"></div>
            </div>

            <div class="tracker-steps">
                <span class="tracker-step ${progressPct >= 33 ? 'active' : ''}">1. RECIBIDO</span>
                <span class="tracker-step ${progressPct >= 66 ? 'active' : ''}">2. EN COCINA</span>
                <span class="tracker-step ${progressPct >= 100 ? 'active' : ''}">3. ¡LISTO!</span>
            </div>

            <div style="background: rgba(255, 215, 0, 0.08); border: 1px solid var(--border-gold); padding: 1.2rem; border-radius: var(--radius-md);">
                <div style="font-family: var(--font-title); font-size: 0.85rem; color: var(--color-primary); margin-bottom: 0.4rem;">
                    ${statusLabel}
                </div>
                <p style="font-size: 0.85rem; color: var(--text-muted);">${subtext}</p>
            </div>

            <button id="btn-new-self-order" class="btn btn--secondary btn--block" style="margin-top: 1rem;">
                🎮 Realizar Otro Pedido
            </button>
        </div>
    `;

    appEl.querySelector('#btn-new-self-order')?.addEventListener('click', () => {
        activeOrder = null;
        renderView(appEl);
    });
}

function subscribeToLiveTracker(orderId, appEl) {
    supabase.channel(`order-tracker-${orderId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${orderId}`
        }, (payload) => {
            activeOrder = payload.new;
            renderView(appEl);
        })
        .subscribe();
}
