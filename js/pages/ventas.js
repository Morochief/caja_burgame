import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { renderProductCard } from '../components/product-card.js';
import { createCart } from '../components/cart.js';

let currentCategory = 'all';
let searchQuery = '';
const cart = createCart();
let currentNotes = '';
let currentCustomerName = '';
let products = [];
let categories = [];

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
        const [prodData, catData] = await Promise.all([
            productService.getAll(),
            productService.getCategories()
        ]);
        products = prodData || [];
        categories = catData || [];
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
                        <label for="customer-name"><i data-lucide="user"></i> Nombre / Mesa:</label>
                        <input type="text" id="customer-name" placeholder="Ej: Juan Pérez, Mesa 4..." value="${currentCustomerName}">
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
        updateTicketUI(container);
        closeCartModal();
        openCartModal(container);
    });

    overlay.querySelector('#btn-send-order')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendOrderToKitchen(container);
    });

    overlay.querySelector('#customer-name')?.addEventListener('input', (e) => { currentCustomerName = e.target.value; });
    overlay.querySelector('#order-notes')?.addEventListener('input', (e) => { currentNotes = e.target.value; });

    setupModalQtyControls(overlay, container);
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
            if (product) item.price = item.isCombo ? (product.combo_price || (product.price + 10000)) : product.price;
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

    const currentRegister = cashService.getCurrentRegister();
    if (!currentRegister) {
        showToast({ message: 'Debes abrir una caja antes de tomar pedidos', type: 'error' });
        window._isSendingOrder = false;
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = ''; sendBtn.innerHTML = originalText; }
        return;
    }

    const notesInput = container.querySelector('#order-notes');
    const customerInput = container.querySelector('#customer-name');
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
        currentNotes = '';
        currentCustomerName = '';
        if (notesInput) notesInput.value = '';
        if (customerInput) customerInput.value = '';

        container.querySelector('#ticket-panel')?.classList.remove('open');
        updateTicketUI(container);
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
