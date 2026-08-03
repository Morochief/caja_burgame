import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let currentCategory = 'all';
let searchQuery = '';
let cartItems = [];
let currentNotes = '';
let currentCustomerName = '';
let products = [];
let categories = [];

export async function renderVentasPage() {
    const container = document.createElement('div');
    container.className = 'ventas-page';

    // Cargar datos iniciales
    try {
        const [prodData, catData] = await Promise.all([
            productService.getAll(),
            productService.getCategories()
        ]);
        products = prodData || [];
        categories = catData || [];
    } catch (err) {
        showToast({ message: 'Error al cargar productos', type: 'error' });
    }

    container.innerHTML = `
        <div class="ventas-layout">
            <!-- Sección de Selección de Productos (Izquierda / Centro) -->
            <section class="ventas-catalog">
                <div class="ventas-sticky-header">
                    <div class="pos-banner-container" style="margin-bottom: 0.8rem; text-align: center;">
                        <img src="banner.png" alt="Burgame Banner" class="pos-banner-img">
                    </div>
                    <header class="ventas-header">
                        <div class="search-bar">
                            <i data-lucide="search"></i>
                            <input type="text" id="pos-search" placeholder="Buscar producto por nombre..." value="${searchQuery}">
                        </div>
                    </header>

                    <!-- Categorías -->
                    <nav class="categories-bar">
                        <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
                            ⚡ Todos
                        </button>
                        ${categories.map(cat => `
                            <button class="category-tab ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
                                ${cat.icon || '🍔'} ${cat.name}
                            </button>
                        `).join('')}
                    </nav>
                </div>

                <!-- Grid de Productos -->
                <div class="products-grid" id="products-grid">
                    ${renderProductsGrid()}
                </div>
            </section>

            <!-- Sidebar Lateral / Drawer Móvil: Ticket del Pedido Actual -->
            <aside class="ticket-panel" id="ticket-panel">
                <div class="ticket-header">
                    <h2><i data-lucide="shopping-bag"></i> PEDIDO ACTUAL</h2>
                    <button id="btn-close-ticket-drawer" class="btn-close mobile-only">&times;</button>
                </div>

                <div class="ticket-items" id="ticket-items">
                    ${renderCartItems()}
                </div>

                <div class="ticket-summary">
                    <div class="ticket-notes" style="margin-bottom: 0.5rem;">
                        <label for="customer-name"><i data-lucide="user"></i> Nombre del Cliente / Mesa:</label>
                        <input type="text" id="customer-name" placeholder="Ej: Juan Pérez, Mesa 4..." value="${currentCustomerName}">
                    </div>

                    <div class="ticket-notes">
                        <label for="order-notes"><i data-lucide="file-text"></i> Notas para Cocina:</label>
                        <input type="text" id="order-notes" placeholder="Ej: Sin cebolla, extra salsa..." value="${currentNotes}">
                    </div>

                    <div class="ticket-row ticket-row--total">
                        <span>TOTAL</span>
                        <span class="ticket-total-val" id="ticket-total">${formatGs(calculateTotal())}</span>
                    </div>

                    <div class="ticket-actions">
                        <button id="btn-clear-cart" class="btn btn--danger btn--ghost">
                            <i data-lucide="trash-2"></i> Limpiar
                        </button>
                        <button id="btn-send-order" class="btn btn--primary btn--block">
                            ⌨️ ORDENAR PEDIDO
                        </button>
                    </div>
                </div>
            </aside>

            <!-- Botón Flotante para Celulares -->
            <button id="btn-floating-cart" class="mobile-cart-floating-btn">
                <span>🛒 VER PEDIDO (${cartItems.length})</span>
                <span id="floating-cart-total">${formatGs(calculateTotal())}</span>
            </button>
        </div>
    `;

    setupEvents(container);
    return container;
}

function renderProductsGrid() {
    let filtered = products;

    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === currentCategory);
    }

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
    }

    if (filtered.length === 0) {
        return `
            <div class="products-empty">
                <div class="empty-icon">🎮</div>
                <p>No se encontraron productos disponibles</p>
            </div>
        `;
    }

    return filtered.map(product => {
        const imageSrc = product.image_url || 'assets/placeholders/burger-placeholder.svg';
        const comboPrice = product.combo_price || (product.price + 10000);

        return `
            <div class="product-card" data-id="${product.id}">
                <div class="product-card__image">
                    <img src="${imageSrc}" alt="${product.name}">
                </div>
                <div class="product-card__content">
                    <h3 class="product-card__title">${product.name}</h3>
                    <p class="product-card__ingredients">${(product.ingredients || []).join(', ')}</p>
                    
                    <div class="product-card__actions" style="margin-top: 0.6rem; display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;">
                        <button class="btn btn--sm btn--secondary btn-add-single" data-id="${product.id}" title="Agregar hamburguesa sola">
                            🍔 ${formatGs(product.price)}
                        </button>
                        <button class="btn btn--sm btn--primary btn-add-combo" data-id="${product.id}" title="Agregar combo con papas y bebida">
                            🍟 COMBO ${formatGs(comboPrice)}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCartItems() {
    if (cartItems.length === 0) {
        return `
            <div class="cart-empty">
                <i data-lucide="shopping-cart"></i>
                <p>Selecciona productos para iniciar el pedido</p>
            </div>
        `;
    }

    return cartItems.map((item, idx) => `
        <div class="cart-item" style="border-left: 3px solid ${item.isCombo ? 'var(--color-primary)' : 'var(--border-subtle)'};">
            <div class="cart-item__info">
                <div>
                    <div class="cart-item__title" style="font-weight: 700;">${item.productName}</div>
                    <button class="btn-toggle-combo" data-idx="${idx}" style="background: transparent; border: none; padding: 0; font-size: 0.75rem; cursor: pointer; color: ${item.isCombo ? 'var(--color-primary)' : 'var(--text-muted)'}; margin-top: 0.2rem; font-weight: 700;">
                        ${item.isCombo ? '🍟 COMBO (Papas + Bebida)' : '🍔 Solo Hamburguesa (Cambiar a Combo)'}
                    </button>
                </div>
                <div class="cart-item__subtotal">${formatGs(item.price * item.quantity)}</div>
            </div>
            <div class="cart-item__controls">
                <button class="btn-qty" data-action="dec" data-idx="${idx}">-</button>
                <span class="cart-item__qty">${item.quantity}</span>
                <button class="btn-qty" data-action="inc" data-idx="${idx}">+</button>
                <button class="btn-remove" data-action="del" data-idx="${idx}"><i data-lucide="x"></i></button>
            </div>
        </div>
    `).join('');
}

function calculateTotal() {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}

function setupEvents(container) {
    // Filtros de categoría
    container.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.cat;
            container.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            container.querySelector('#products-grid').innerHTML = renderProductsGrid();
            attachProductClickEvents(container);
        });
    });

    // Búsqueda
    const searchInput = container.querySelector('#pos-search');
    searchInput?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        container.querySelector('#products-grid').innerHTML = renderProductsGrid();
        attachProductClickEvents(container);
    });

    // Notas de Cocina
    const notesInput = container.querySelector('#order-notes');
    notesInput?.addEventListener('input', (e) => {
        currentNotes = e.target.value;
    });

    // Limpiar Carrito
    container.querySelector('#btn-clear-cart')?.addEventListener('click', () => {
        cartItems = [];
        updateTicketUI(container);
    });

    // Enviar Pedido
    container.querySelector('#btn-send-order')?.addEventListener('click', () => {
        sendOrderToKitchen(container);
    });

    // Toggle Drawer móvil del carrito
    const ticketPanel = container.querySelector('#ticket-panel');
    const floatBtn = container.querySelector('#btn-floating-cart');
    const closeDrawerBtn = container.querySelector('#btn-close-ticket-drawer');

    floatBtn?.addEventListener('click', () => {
        ticketPanel?.classList.toggle('open');
    });

    closeDrawerBtn?.addEventListener('click', () => {
        ticketPanel?.classList.remove('open');
    });

    attachProductClickEvents(container);
    setupKeyboardShortcuts(container);
}

function attachProductClickEvents(container) {
    // Botón Individual
    container.querySelectorAll('.btn-add-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            addProductToCart(id, false);
            updateTicketUI(container);
        });
    });

    // Botón Combo
    container.querySelectorAll('.btn-add-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            addProductToCart(id, true);
            updateTicketUI(container);
        });
    });

    // Clic general en la tarjeta (agrega Individual por defecto)
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            addProductToCart(id, false);
            updateTicketUI(container);
        });
    });
}

function addProductToCart(productId, isCombo) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const price = isCombo ? (product.combo_price || (product.price + 10000)) : product.price;

    const existingIdx = cartItems.findIndex(ci => ci.productId === product.id && ci.isCombo === isCombo);
    if (existingIdx >= 0) {
        cartItems[existingIdx].quantity++;
    } else {
        cartItems.push({
            productId: product.id,
            productName: product.name,
            price: price,
            quantity: 1,
            isCombo: isCombo,
            aggregates: []
        });
    }
}

function updateTicketUI(container) {
    const ticketItemsContainer = container.querySelector('#ticket-items');
    if (ticketItemsContainer) {
        ticketItemsContainer.innerHTML = renderCartItems();
        if (window.lucide) window.lucide.createIcons();
    }

    const totalGs = formatGs(calculateTotal());

    const totalEl = container.querySelector('#ticket-total');
    if (totalEl) totalEl.textContent = totalGs;

    // Actualizar botón flotante de celular
    const floatBtn = container.querySelector('#btn-floating-cart');
    const floatTotal = container.querySelector('#floating-cart-total');
    if (floatBtn) {
        floatBtn.querySelector('span:first-child').textContent = `🛒 VER PEDIDO (${cartItems.reduce((a, b) => a + b.quantity, 0)})`;
    }
    if (floatTotal) floatTotal.textContent = totalGs;

    // Toggle Combo switch in cart item
    container.querySelectorAll('.btn-toggle-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            const item = cartItems[idx];
            if (!item) return;

            const product = products.find(p => p.id === item.productId);
            item.isCombo = !item.isCombo;
            if (product) {
                item.price = item.isCombo ? (product.combo_price || (product.price + 10000)) : product.price;
            }

            updateTicketUI(container);
        });
    });

    // Attach qty controls
    container.querySelectorAll('.btn-qty, .btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);

            if (action === 'inc') {
                cartItems[idx].quantity++;
            } else if (action === 'dec') {
                cartItems[idx].quantity--;
                if (cartItems[idx].quantity <= 0) {
                    cartItems.splice(idx, 1);
                }
            } else if (action === 'del') {
                cartItems.splice(idx, 1);
            }
            updateTicketUI(container);
        });
    });
}

async function sendOrderToKitchen(container) {
    if (cartItems.length === 0) {
        showToast({ message: 'El carrito está vacío', type: 'error' });
        return;
    }

    const currentRegister = cashService.getCurrentRegister();
    if (!currentRegister) {
        showToast({ message: 'Debes abrir una caja antes de tomar pedidos', type: 'error' });
        return;
    }

    const notesInput = container.querySelector('#order-notes');
    const customerInput = container.querySelector('#customer-name');
    const notes = notesInput ? notesInput.value.trim() : '';
    const customerName = customerInput ? customerInput.value.trim() : '';

    try {
        const order = await orderService.createOrder({
            items: cartItems,
            notes,
            customerName,
            cashRegisterId: currentRegister.id
        });

        showToast({
            message: `🚀 Orden #${order.order_number} enviada a Cocina`,
            type: 'success'
        });

        // Clear cart & inputs
        cartItems = [];
        currentNotes = '';
        currentCustomerName = '';
        if (notesInput) notesInput.value = '';
        if (customerInput) customerInput.value = '';

        // Cerrar drawer móvil si estaba abierto
        container.querySelector('#ticket-panel')?.classList.remove('open');

        updateTicketUI(container);
    } catch (err) {
        showToast({ message: 'Error enviando orden: ' + err.message, type: 'error' });
    }
}

function setupKeyboardShortcuts(container) {
    const handler = (e) => {
        if (e.key.toLowerCase() === 'o' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            sendOrderToKitchen(container);
        }
    };
    window.addEventListener('keydown', handler);
}
