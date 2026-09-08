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
import { initChat } from '../components/chat-ui.js';
import { qrAuthService } from '../services/qr-auth-service.js';
import { supabase } from '../supabase-client.js';

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
let _chatInitialized = false; // inicializar chat solo una vez

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
                    <header class="ventas-header" style="display: flex; gap: 0.8rem; align-items: center;">
                        <div class="search-bar" style="flex: 1;">
                            <i data-lucide="search"></i>
                            <input type="text" id="pos-search" placeholder="Buscar producto por nombre..." value="${searchQuery}">
                        </div>
                        <button id="btn-pos-quick-qr" class="btn btn--secondary btn--sm" style="white-space: nowrap; display: flex; align-items: center; gap: 0.4rem; height: 38px; border-color: var(--border-gold);" title="Ver PIN y QR de Clientes">
                            📱 QR Clientes
                        </button>
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
            productService.getAllFresh(), // fresco: refleja cambios de precios del Menú
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

    // Inicializar chat Admin <-> Cocina (solo una vez aunque se navegue varias veces)
    if (!_chatInitialized) {
        _chatInitialized = true;
        initChat('admin');
    }

    // Escuchar autopedidos entrantes que requieren cobro en caja
    setupIncomingOrdersListener(container);
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

    container.querySelector('#btn-pos-quick-qr')?.addEventListener('click', openQuickQrModal);

    // Los listeners del modal (close, clear, send, inputs) se registran
    // directamente en el overlay cuando se abre openCartModal().
    // No usar document.addEventListener aquí: se acumularían en cada navegación.

    attachProductClickEvents(container);
    setupKeyboardShortcuts(container);
}

// ============================================================
// Modal rápido de QR y PIN para el cajero
// ============================================================
function openQuickQrModal() {
    const existing = document.querySelector('#quick-qr-modal-overlay');
    if (existing) existing.remove();

    const creds = qrAuthService.getCurrentCredentials();
    const customerUrl = qrAuthService.buildCustomerUrl(window.location.origin);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(customerUrl)}&color=FFD700&bgcolor=0E1017`;

    const overlay = document.createElement('div');
    overlay.id = 'quick-qr-modal-overlay';
    overlay.className = 'cart-modal-overlay';
    overlay.innerHTML = `
        <div class="cart-modal" style="max-width: 420px; text-align: center; border: 2px solid var(--color-primary); box-shadow: 0 0 35px var(--color-primary-glow);">
            <div class="cart-modal__header" style="justify-content: space-between; display: flex; align-items: center; padding: 1rem 1.2rem; border-bottom: 1px solid var(--border-subtle);">
                <h3 style="font-family: var(--font-title); font-size: 0.88rem; color: var(--color-primary); margin: 0;">
                    📱 CÓDIGO QR Y PIN CLIENTES
                </h3>
                <button id="btn-close-qr-modal" class="btn btn--sm" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);">✕</button>
            </div>
            <div class="cart-modal__body" style="padding: 1.2rem; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                <div style="background: #000; padding: 0.8rem; border-radius: 12px; border: 2px solid var(--border-gold); box-shadow: 0 0 20px rgba(255,215,0,0.2);">
                    <img src="${qrApiUrl}" alt="QR Clientes" style="width: 190px; height: 190px; display: block; border-radius: 6px;">
                </div>
                <div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 0.3rem;">
                        PIN del Mostrador (Para dictar al cliente):
                    </div>
                    <div style="font-family: var(--font-mono); font-size: 2.2rem; font-weight: 800; color: var(--color-primary); letter-spacing: 0.4rem; background: rgba(255,215,0,0.08); padding: 0.3rem 1.2rem; border-radius: 8px; border: 1px dashed var(--color-primary); display: inline-block;">
                        ${creds.pin}
                    </div>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">
                    ⏳ Código dinámico · Rota automáticamente cada 10 min
                </div>
                <div style="display: flex; gap: 0.6rem; width: 100%; margin-top: 0.5rem;">
                    <a href="pantalla-qr.html" target="_blank" class="btn btn--primary btn--block" style="text-align: center; text-decoration: none; padding: 0.75rem; font-weight: 700;">
                        🖥️ Pantalla Mostrador (TV / Tablet)
                    </a>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelector('#btn-close-qr-modal')?.addEventListener('click', () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 250);
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 250);
        }
    });
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
                    ${cart.renderItems({ showComboToggle: true, noteInputClass: 'input-item-note', editablePrice: true })}
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

    // Edición manual de precio por línea (solo POS)
    overlay.querySelectorAll('.input-item-price').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(input.dataset.idx, 10);
            const val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 0) {
                // valor inválido → restaurar el precio vigente mostrado
                const item = cart.items[idx];
                if (item) input.value = item.price;
                return;
            }
            cart.setPrice(idx, val);
            updateTicketUI(container);
            closeCartModal();
            openCartModal(container);
        });
    });

    // Botón "↺" para restaurar el precio de carta del item editado a mano
    overlay.querySelectorAll('.btn-reset-price').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            cart.resetPrice(idx, getClubLookup());
            updateTicketUI(container);
            closeCartModal();
            openCartModal(container);
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
        modalItems.innerHTML = cart.renderItems({ showComboToggle: true, noteInputClass: 'input-item-note', editablePrice: true });
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

// ============================================================
// Autopedidos entrantes: Notificación y Cobro Rápido en POS
// ============================================================
let incomingOrdersChannel = null;

function setupIncomingOrdersListener(container) {
    if (incomingOrdersChannel) return;

    incomingOrdersChannel = orderService.subscribeToOrders((payload) => {
        if (payload.eventType === 'INSERT' && payload.new?.status === 'pending_payment') {
            showIncomingSelfOrderBanner(payload.new);
        }
    });
}

function showIncomingSelfOrderBanner(order) {
    const existing = document.getElementById(`incoming-order-banner-${order.id}`);
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = `incoming-order-banner-${order.id}`;
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        background: #0E1017;
        border: 2px solid #FFD700;
        box-shadow: 0 0 30px rgba(255, 215, 0, 0.4);
        border-radius: 12px;
        padding: 0.9rem 1.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        animation: fadeIn 0.3s ease-out;
        max-width: 440px;
    `;

    banner.innerHTML = `
        <div style="font-size: 1.6rem; animation: pulse 1s infinite;">🔔</div>
        <div style="flex: 1;">
            <div style="font-family: var(--font-title); font-size: 0.78rem; color: var(--color-primary);">
                ¡NUEVO AUTOPEDIDO #${order.order_number || ''}!
            </div>
            <div style="font-size: 0.88rem; font-weight: 700; color: #FFF; margin-top: 0.15rem;">
                ${order.customer_name || 'Cliente'} — <strong>${formatGs(order.total)}</strong>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">
                Pendiente de cobro para enviar a cocina
            </div>
        </div>
        <button class="btn btn--primary btn--sm btn-banner-cobrar" style="white-space: nowrap; font-weight: 800; padding: 0.45rem 0.8rem;">
            💰 Cobrar
        </button>
        <button class="btn-banner-close" style="background: none; border: none; color: var(--text-muted); font-size: 1.2rem; cursor: pointer; padding: 0 0.3rem;">✕</button>
    `;

    document.body.appendChild(banner);

    banner.querySelector('.btn-banner-close')?.addEventListener('click', () => banner.remove());
    banner.querySelector('.btn-banner-cobrar')?.addEventListener('click', () => {
        banner.remove();
        openCollectSelfOrderModal(order.id);
    });
}

async function openCollectSelfOrderModal(orderId) {
    const existing = document.getElementById('collect-self-order-modal');
    if (existing) existing.remove();

    const { data: order } = await supabase.from('orders').select(`*, order_items(*)`).eq('id', orderId).single();
    if (!order) return;

    const overlay = document.createElement('div');
    overlay.id = 'collect-self-order-modal';
    overlay.className = 'cart-modal-overlay';
    overlay.innerHTML = `
        <div class="cart-modal" style="max-width: 440px; border: 2px solid var(--color-primary); box-shadow: 0 0 35px var(--color-primary-glow);">
            <div class="cart-modal__header" style="justify-content: space-between; display: flex; align-items: center; padding: 1rem 1.2rem; border-bottom: 1px solid var(--border-subtle);">
                <div>
                    <h3 style="font-family: var(--font-title); font-size: 0.88rem; color: var(--color-primary); margin: 0;">
                        PEDIDO #${order.order_number} · AUTOPEDIDO
                    </h3>
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--text-main); margin-top: 0.2rem;">
                        👤 ${order.customer_name || 'Cliente'}
                    </div>
                </div>
                <button id="btn-close-collect-modal" class="btn btn--sm" style="background: none; border: none; font-size: 1.2rem; cursor: pointer; color: var(--text-muted);">✕</button>
            </div>
            <div class="cart-modal__body" style="padding: 1.2rem;">
                <div style="max-height: 180px; overflow-y: auto; margin-bottom: 0.8rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.6rem;">
                    ${(order.order_items || []).map(it => `
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 0.3rem 0;">
                            <span>${it.quantity}x ${it.product_name}</span>
                            <span style="font-weight: 700;">${formatGs(it.price * it.quantity)}</span>
                        </div>
                    `).join('')}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 1.1rem; font-weight: 800; color: var(--color-primary); margin-bottom: 1.2rem;">
                    <span>TOTAL A COBRAR:</span>
                    <span>${formatGs(order.total)}</span>
                </div>
                <div style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; margin-bottom: 0.5rem; color: var(--text-muted);">
                    Cobrar y Enviar Comanda a Cocina:
                </div>
                <div class="payment-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.8rem;">
                    <button class="btn btn--payment btn--cash btn-pay-fast" data-method="efectivo" style="padding: 0.7rem;">💵 Efectivo</button>
                    <button class="btn btn--payment btn--transfer btn-pay-fast" data-method="transferencia" style="padding: 0.7rem;">📱 Transferencia</button>
                    <button class="btn btn--payment btn--debit btn-pay-fast" data-method="debito" style="padding: 0.7rem;">💳 Débito</button>
                    <button class="btn btn--payment btn--credit btn-pay-fast" data-method="credito" style="padding: 0.7rem;">💳 Crédito</button>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button id="btn-fast-approve-kitchen" class="btn btn--secondary btn--sm" style="flex: 1; border-color: var(--border-gold); font-size: 0.78rem;">
                        ⚡ Enviar a Cocina (Cobrar después)
                    </button>
                    <button id="btn-fast-cancel-order" class="btn btn--secondary btn--sm" style="color: #FF5252; border-color: rgba(255,82,82,0.4); font-size: 0.78rem;">
                        ❌ Cancelar
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const closeModal = () => {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 250);
    };

    overlay.querySelector('#btn-close-collect-modal')?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

    overlay.querySelectorAll('.btn-pay-fast').forEach(btn => {
        btn.addEventListener('click', async () => {
            const method = btn.dataset.method;
            try {
                await orderService.processPayment(orderId, method);
                showToast({ message: `💰 ¡Cobrado con ${method.toUpperCase()} y enviado a cocina!`, type: 'success' });
                closeModal();
            } catch (err) {
                showToast({ message: 'Error al cobrar: ' + err.message, type: 'error' });
            }
        });
    });

    overlay.querySelector('#btn-fast-approve-kitchen')?.addEventListener('click', async () => {
        try {
            await orderService.approveOrder(orderId);
            showToast({ message: '⚡ ¡Comanda enviada a cocina!', type: 'success' });
            closeModal();
        } catch (err) {
            showToast({ message: 'Error enviando a cocina: ' + err.message, type: 'error' });
        }
    });

    overlay.querySelector('#btn-fast-cancel-order')?.addEventListener('click', async () => {
        if (!confirm('¿Deseas cancelar y rechazar este autopedido?')) return;
        try {
            await orderService.cancelOrder(orderId);
            showToast({ message: '❌ Pedido cancelado correctamente', type: 'info' });
            closeModal();
        } catch (err) {
            showToast({ message: 'Error al cancelar: ' + err.message, type: 'error' });
        }
    });
}

