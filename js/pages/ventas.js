import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { customerService } from '../services/customer-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { renderProductCard } from '../components/product-card.js';
import { createCart } from '../components/cart.js';
import { navigate } from '../router.js';

let currentCategory = 'all';
let searchQuery = '';
const cart = createCart();
let currentNotes = '';
let currentCustomerName = '';
let products = [];
let categories = [];
let customers = [];
let customerLookupTimer = null;
let isManualClubOverride = false;

export async function renderVentasPage() {
    const container = document.createElement('div');
    container.className = 'ventas-page';

    // Mostrar layout inmediatamente (sin esperar data de Supabase)
    container.innerHTML = `
        <div class="ventas-layout-full">
            <section class="ventas-catalog">
                <div class="ventas-sticky-header">
                    <div class="pos-banner-container">
                        <img src="banner.png" alt="Burgame Banner" class="pos-banner-img">
                    </div>
                    <header class="ventas-header">
                        <div class="search-bar">
                            <i data-lucide="search"></i>
                            <input type="text" id="pos-search" placeholder="Buscar producto por nombre..." value="${searchQuery}">
                        </div>
                    </header>
                    <nav class="categories-bar" id="categories-bar">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                    </nav>
                </div>
                <div class="products-grid" id="products-grid">
                    <div class="page-loading">
                        <div class="pixel-spinner"></div>
                        <p>Cargando productos...</p>
                    </div>
                </div>
            </section>

            <button id="btn-floating-cart" class="fab-cart" aria-label="Ver Pedido">
                <span class="fab-cart__icon">🛒</span>
                <span class="fab-cart__badge" id="fab-badge">${cart.count || ''}</span>
                <span class="fab-cart__total" id="fab-total">${cart.total > 0 ? formatGs(cart.total) : 'Pedido'}</span>
            </button>
        </div>
    `;

    // Cargar data en background (no bloquea el render)
    loadVentasData(container);

    return container;
}

async function loadVentasData(container) {
    try {
        const [prodData, catData, custData] = await Promise.all([
            productService.getAll(),
            productService.getCategories(),
            customerService.getAll().catch(() => [])
        ]);
        products = prodData || [];
        categories = catData || [];
        customers = custData || [];
    } catch (err) {
        showToast({ message: 'Error al cargar productos', type: 'error' });
    }

    // Render categorías
    const catBar = container.querySelector('#categories-bar');
    if (catBar) {
        catBar.innerHTML = `
            <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
                ⚡ Todos
            </button>
            ${categories.map(cat => `
                <button class="category-tab ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
                    ${cat.icon || '🍔'} ${cat.name}
                </button>
            `).join('')}
        `;
    }

    // Render productos
    const grid = container.querySelector('#products-grid');
    if (grid) {
        grid.innerHTML = renderProductsGrid();
    }

    setupEvents(container);
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
// Catálogo: filtra por categoría + búsqueda y delega el render
// de cada tarjeta a renderProductCard (componente compartido)
// ============================================================
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

    return filtered.map(product => renderProductCard(product)).join('');
}

// ============================================================
// Eventos de la página
// ============================================================
function setupEvents(container) {
    container.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.cat;
            container.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            container.querySelector('#products-grid').innerHTML = renderProductsGrid();
            attachProductClickEvents(container);
        });
    });

    const searchInput = container.querySelector('#pos-search');
    searchInput?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        container.querySelector('#products-grid').innerHTML = renderProductsGrid();
        attachProductClickEvents(container);
    });

    const fabBtn = container.querySelector('#btn-floating-cart');
    fabBtn?.addEventListener('click', () => openCartModal(container));

    // Los listeners del modal (close, clear, send, inputs) se registran
    // directamente en el overlay cuando se abre openCartModal().
    // No usar document.addEventListener aquí: se acumularían en cada navegación.

    attachProductClickEvents(container);
    setupKeyboardShortcuts(container);
}

// ============================================================
// Modal del carrito
// ============================================================
function openCartModal(container) {
    const existing = document.querySelector('#cart-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'cart-modal-overlay';
    overlay.id = 'cart-modal-overlay';
    overlay.innerHTML = `
        <div class="cart-modal" id="cart-modal">
            <div class="cart-modal__header">
                <h2>🛒 PEDIDO ACTUAL</h2>
                <button id="btn-close-cart-modal" class="cart-modal__close" aria-label="Cerrar">&times;</button>
            </div>
            <div class="cart-modal__body">
                <div class="ticket-items" id="ticket-items">
                    ${cart.renderItems({ showComboToggle: true, noteInputClass: 'input-item-note' })}
                </div>
                <div class="ticket-summary">
                    <div class="ticket-notes" style="margin-bottom:0.5rem">
                        <label for="customer-name"><i data-lucide="user"></i> Cliente / Mesa:</label>
                        <input type="text" id="customer-name" list="customer-list" placeholder="Elegir o escribir nuevo..." value="${currentCustomerName}" autocomplete="off">
                        <datalist id="customer-list">
                            ${customers.map(c => `<option value="${c.name}">`).join('')}
                        </datalist>
                        <div id="club-member-hint" class="club-member-hint" style="display:none; margin-top:0.4rem;"></div>
                    </div>
                    <div class="ticket-notes club-toggle-row" style="margin-bottom:0.5rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255,215,0,0.06); border: 1px solid rgba(255,215,0,0.25); border-radius: var(--radius-sm); padding: 0.5rem 0.7rem;">
                        <label for="club-mode-toggle" style="font-size: 0.8rem; font-weight: 800; color: var(--color-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; margin: 0;">
                            👑 Precio Club Burgame
                        </label>
                        <input type="checkbox" id="club-mode-toggle" ${cart.clubMode ? 'checked' : ''} style="accent-color: #FFD700; width: 18px; height: 18px; cursor: pointer;">
                    </div>
                    <div class="ticket-notes">
                        <label for="order-notes"><i data-lucide="file-text"></i> Notas Cocina:</label>
                        <input type="text" id="order-notes" placeholder="Ej: Sin cebolla..." value="${currentNotes}">
                    </div>
                    <div class="ticket-row ticket-row--total">
                        <span>TOTAL</span>
                        <span class="ticket-total-val" id="ticket-total">${formatGs(cart.total)}</span>
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
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    if (window.lucide) window.lucide.createIcons();

    overlay.querySelector('#btn-close-cart-modal')?.addEventListener('click', closeCartModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCartModal(); });

    overlay.querySelector('#btn-clear-cart')?.addEventListener('click', (e) => {
        e.stopPropagation();
        cart.clear();
        cart.setClubMode(false);
        isManualClubOverride = false;
        updateTicketUI(container);
        closeCartModal();
        openCartModal(container);
    });

    overlay.querySelector('#btn-send-order')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendOrderToKitchen(container);
    });

    overlay.querySelector('#customer-name')?.addEventListener('input', (e) => {
        currentCustomerName = e.target.value;
        isManualClubOverride = false; // al cambiar de cliente, se re-evalúa su membresía
        handleCustomerMembershipCheck(container);
    });
    overlay.querySelector('#order-notes')?.addEventListener('input', (e) => { currentNotes = e.target.value; });

    overlay.querySelector('#club-mode-toggle')?.addEventListener('change', (e) => {
        const active = e.target.checked;
        isManualClubOverride = true;
        applyClubMode(container, active);
    });

    setupModalQtyControls(overlay, container);
}

// Mapa productId → producto para aplicar precios Club al carrito.
function getClubLookup() {
    const lookup = {};
    products.forEach(p => { lookup[p.id] = p; });
    return lookup;
}

function applyClubMode(container, active) {
    cart.setClubMode(active, getClubLookup());
    updateTicketUI(container);
    // Mantener el checkbox sincronizado si el modal está abierto
    const checkbox = document.querySelector('#club-mode-toggle');
    if (checkbox) checkbox.checked = !!active;
}

// Consulta (debounce) el estado de membresía del cliente tipeado y,
// si es socio activo, activa el toggle automáticamente.
function handleCustomerMembershipCheck(container) {
    clearTimeout(customerLookupTimer);
    const hintEl = document.querySelector('#club-member-hint');
    const name = currentCustomerName.trim();
    if (!name) {
        if (hintEl) hintEl.style.display = 'none';
        return;
    }

    customerLookupTimer = setTimeout(async () => {
        try {
            // Buscar en caché local de clientes primero
            let customer = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
            if (!customer) {
                customer = await customerService.findByName(name);
            }
            if (!customer) return;

            const status = await customerService.getMembershipStatus(customer.id);
            renderClubHint(hintEl, status, customer);

            // Auto-aplicar precio Club solo si el socio está activo (no vencido)
            if (status.status === 'active' || status.status === 'expiring') {
                if (!cart.clubMode && !isManualClubOverride) {
                    applyClubMode(container, true);
                }
            } else {
                // Socio vencido/sin membresía: no aplicar precio Club
                if (!isManualClubOverride) applyClubMode(container, false);
            }
        } catch (err) {
            console.warn('No se pudo verificar membresía:', err.message);
        }
    }, 350);
}

function renderClubHint(hintEl, status, customer) {
    if (!hintEl) return;
    const name = customer ? customer.name : '';
    const exp = status.membership ? new Date(status.membership.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) : '';

    if (status.status === 'active') {
        hintEl.innerHTML = `<span style="font-size:0.75rem; color:#4CAF50; font-weight:700;">🟢 Socio Club activo · vence el ${exp}</span>`;
        hintEl.style.display = 'block';
    } else if (status.status === 'expiring') {
        hintEl.innerHTML = `<span style="font-size:0.75rem; color:#FFC107; font-weight:700;">⚠️ Socio Club por vencer en ${status.daysLeft} día(s) · vence el ${exp} — renovar en Club</span>`;
        hintEl.style.display = 'block';
    } else if (status.status === 'expired') {
        hintEl.innerHTML = `<span style="font-size:0.75rem; color:#FF5252; font-weight:700;">🔴 Socio vencido (vence el ${exp}) — renovar en Club para precio socio</span>`;
        hintEl.style.display = 'block';
    } else {
        hintEl.style.display = 'none';
    }
}

function closeCartModal() {
    const overlay = document.querySelector('#cart-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 280);
}

function setupModalQtyControls(overlay, container) {
    overlay.querySelectorAll('.btn-toggle-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            const item = cart.items[idx];
            if (!item) return;
            const product = products.find(p => p.id === item.productId);
            item.isCombo = !item.isCombo;
            if (product) {
                // Respetar el modo club: si está activo y el producto participa, usar club_price
                const base = item.isCombo ? (product.combo_price || (product.price + 10000)) : product.price;
                const club = product.club_price;
                item.basePrice = base;
                item.price = (cart.clubMode && club) ? club : base;
                item.clubApplied = !!(cart.clubMode && club);
            }
            updateTicketUI(container);
            closeCartModal();
            openCartModal(container);
        });
    });

    overlay.querySelectorAll('.input-item-note').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(input.dataset.idx, 10);
            cart.setNote(idx, e.target.value);
        });
    });

    overlay.querySelectorAll('.btn-qty, .btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);
            if (action === 'inc') cart.inc(idx);
            else if (action === 'dec') cart.dec(idx);
            else if (action === 'del') cart.remove(idx);
            updateTicketUI(container);
            closeCartModal();
            openCartModal(container);
        });
    });
}

// ============================================================
// Eventos de los botones de producto (delegados desde el grid)
// ============================================================
function attachProductClickEvents(container) {
    container.querySelectorAll('.btn-add-promo, .btn-add-variant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addVariant(product, btn.dataset.vname, parseInt(btn.dataset.vprice, 10));
            updateTicketUI(container);
        });
    });

    container.querySelectorAll('.btn-add-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addProduct(product, false);
            updateTicketUI(container);
        });
    });

    container.querySelectorAll('.btn-add-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addProduct(product, true);
            updateTicketUI(container);
        });
    });

    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const product = products.find(p => p.id === card.dataset.id);
            if (!product) return;
            cart.addProduct(product, false);
            updateTicketUI(container);
        });
    });
}

// ============================================================
// Actualización parcial del UI del carrito (badge + modal)
// ============================================================
function updateTicketUI(container) {
    const totalItems = cart.count;
    const totalGs = formatGs(cart.total);

    const badge = container.querySelector('#fab-badge');
    if (badge) badge.textContent = totalItems > 0 ? totalItems : '';

    const fabTotal = container.querySelector('#fab-total');
    if (fabTotal) fabTotal.textContent = cart.total > 0 ? totalGs : 'Pedido';

    const modalItems = document.querySelector('#ticket-items');
    if (modalItems) {
        modalItems.innerHTML = cart.renderItems({ showComboToggle: true, noteInputClass: 'input-item-note' });
        if (window.lucide) window.lucide.createIcons();
        const modalTotal = document.querySelector('#ticket-total');
        if (modalTotal) modalTotal.textContent = totalGs;
        const overlay = document.querySelector('#cart-modal-overlay');
        if (overlay) setupModalQtyControls(overlay, container);

        // Mantener sincronizado el toggle Club si el modal está abierto
        const clubToggle = document.querySelector('#club-mode-toggle');
        if (clubToggle) clubToggle.checked = !!cart.clubMode;
    }
}

// ============================================================
// Envío de pedido a cocina
// ============================================================
async function sendOrderToKitchen(container) {
    if (cart.items.length === 0) {
        showToast({ message: 'El carrito está vacío', type: 'error' });
        return;
    }

    // GUARD: prevenir doble-envío
    if (window._isSendingOrder) return;
    window._isSendingOrder = true;
    const sendBtn = container.querySelector('#btn-send-order');
    const originalText = sendBtn ? sendBtn.innerHTML : null;
    if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.6'; sendBtn.innerHTML = '⏳ ENVIANDO...'; }

    // Buscar el register de forma asíncrona (appState cacheado o fetch a Supabase)
    let currentRegister = null;
    try {
        if (appState.cashRegister) {
            currentRegister = appState.cashRegister;
        } else {
            currentRegister = await cashService.getCurrentRegister();
        }
    } catch (err) {
        showToast({ message: 'Error al verificar estado de caja', type: 'error' });
        window._isSendingOrder = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; sendBtn.innerHTML = originalText; }
        return;
    }

    if (!currentRegister) {
        showToast({ message: 'Debes abrir una caja antes de tomar pedidos', type: 'error' });
        window._isSendingOrder = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; sendBtn.innerHTML = originalText; }
        return;
    }

    // Los inputs están en el overlay del modal (que se appenda a document.body,
    // no dentro del container de la página). Buscar en document.
    const notesInput = document.querySelector('#order-notes');
    const customerInput = document.querySelector('#customer-name');
    const notes = notesInput ? notesInput.value.trim() : '';
    const customerName = customerInput ? customerInput.value.trim() : '';

    try {
        const order = await orderService.createOrder({
            items: cart.items,
            notes,
            customerName,
            cashRegisterId: currentRegister.id
        });

        showToast({
            message: `🚀 Orden #${order.order_number} enviada a Cocina`,
            type: 'success'
        });

        cart.clear();
        cart.setClubMode(false);
        isManualClubOverride = false;
        currentNotes = '';
        currentCustomerName = '';
        if (notesInput) notesInput.value = '';
        if (customerInput) customerInput.value = '';

        container.querySelector('#ticket-panel')?.classList.remove('open');
        updateTicketUI(container);

        // Cerrar el modal del carrito y llevar al cajero al módulo Órdenes
        // para que procese el pago del cliente.
        closeCartModal();
        navigate('#/ordenes');
    } catch (err) {
        showToast({ message: 'Error enviando orden: ' + err.message, type: 'error' });
    } finally {
        window._isSendingOrder = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; sendBtn.innerHTML = originalText; }
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
