import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { renderProductCard } from '../components/product-card.js';
import { createCart } from '../components/cart.js';
import { supabase } from '../supabase-client.js';
import { qrAuthService } from '../services/qr-auth-service.js';

let serviceType = 'eat_in'; // 'eat_in' | 'takeaway'
let tableNumber = '';
let customerName = '';
const cart = createCart();
let activeOrder = null;
let products = [];
let categories = [];
let currentCategory = 'all';

document.addEventListener('DOMContentLoaded', initClienteApp);

async function initClienteApp() {
    const appEl = document.getElementById('cliente-app');
    if (!appEl) return;

    // 1. Procesar parámetros de URL (token, pin, mesa)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const pinParam = urlParams.get('pin');
    const mesaParam = urlParams.get('mesa') || urlParams.get('table');

    if (mesaParam) {
        tableNumber = mesaParam.trim();
        serviceType = 'eat_in';
    }

    // Validar si vino con token o PIN rotativo válido
    if (tokenParam && qrAuthService.isValidToken(tokenParam)) {
        qrAuthService.startClientSession({ method: 'qr', table: tableNumber });
        window.history.replaceState({}, document.title, window.location.pathname + (tableNumber ? `?mesa=${encodeURIComponent(tableNumber)}` : ''));
    } else if (pinParam && qrAuthService.isValidPin(pinParam)) {
        qrAuthService.startClientSession({ method: 'pin', table: tableNumber });
        window.history.replaceState({}, document.title, window.location.pathname + (tableNumber ? `?mesa=${encodeURIComponent(tableNumber)}` : ''));
    }

    try {
        const [prodData, catData] = await Promise.all([
            productService.getAllFresh(), // fresco: refleja precios Club actualizados
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
    } else if (!qrAuthService.isSessionValid()) {
        renderLockScreen(appEl);
    } else {
        renderMenuCatalog(appEl);
    }
}


// ============================================================
// Catálogo de productos (autopedido desde la mesa)
// ============================================================
function renderMenuCatalog(appEl) {
    appEl.innerHTML = `
        <div class="cliente-header-banner">
            <img src="banner.png" alt="Burgame Banner" class="cliente-banner-img">
            <p style="font-family: var(--font-title); font-size: 0.75rem; color: var(--color-primary); margin-top: 0.5rem;">
                🎮 HAZ TU PEDIDO DIRECTO DESDE LA MESA
            </p>
        </div>

        ${renderSessionBadge()}

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
            <div class="club-toggle-row" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.6rem; background: rgba(255,215,0,0.06); border: 1px solid rgba(255,215,0,0.25); border-radius: var(--radius-sm); padding: 0.55rem 0.7rem;">
                <label for="club-self-toggle" style="font-size: 0.82rem; font-weight: 800; color: var(--color-primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem; margin: 0;">
                    👑 Soy del Club Burgame
                </label>
                <input type="checkbox" id="club-self-toggle" ${cart.clubMode ? 'checked' : ''} style="accent-color: #FFD700; width: 18px; height: 18px; cursor: pointer;">
            </div>
        </div>

        <nav class="categories-bar" style="margin-bottom: 1rem;">
            <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">⚡ Todos</button>
            ${categories.map(cat => `
                <button class="category-tab ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
                    ${cat.name}
                </button>
            `).join('')}
        </nav>

        <div class="products-grid" id="products-grid" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.85rem;">
            ${renderProductsGrid()}
        </div>

        ${cart.items.length > 0 ? `
            <div class="ticket-panel open" style="position: fixed; bottom: 0; left: 0; right: 0; z-index: 1000; border-radius: 20px 20px 0 0; background: #0E1017; border-top: 2px solid var(--color-primary); padding: 1.2rem; box-shadow: 0 -10px 40px rgba(0,0,0,0.9);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                    <span style="font-weight: 800; font-size: 0.95rem; color: var(--color-primary);">🛒 TU PEDIDO (${cart.count})</span>
                    <span style="font-family: var(--font-title); color: var(--color-primary); font-size: 1.1rem;">${formatGs(cart.total)}</span>
                </div>
                <div class="ticket-items" style="max-height: 25vh; overflow-y: auto; margin-bottom: 0.8rem;">
                    ${cart.renderItems({ showComboToggle: false, noteInputClass: 'input-item-note-cliente', notePlaceholder: '✏️ Aclaración (ej: Sin cebolla, bien cocida...)' })}
                </div>
                <button id="btn-submit-self-order" class="btn btn--primary btn--block" style="padding: 0.9rem; font-weight: 800; font-size: 1rem;">
                    🚀 CONFIRMAR Y ENVIAR PEDIDO
                </button>
            </div>
        ` : ''}
    `;

    setupEvents(appEl);
}

// ============================================================
// Catálogo: filtra por categoría y delega el render de tarjetas
// a renderProductCard (componente compartido, modo compacto)
// ============================================================
function renderProductsGrid() {
    let filtered = products;
    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === currentCategory);
    }
    return filtered.map(product => renderProductCard(product, { compact: true })).join('');
}

// ============================================================
// Eventos de la página
// ============================================================
function setupEvents(appEl) {
    // Tipo de servicio
    appEl.querySelector('#btn-eat-in')?.addEventListener('click', () => {
        serviceType = 'eat_in';
        renderView(appEl);
    });
    appEl.querySelector('#btn-takeaway')?.addEventListener('click', () => {
        serviceType = 'takeaway';
        renderView(appEl);
    });

    // Categorías
    appEl.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.cat;
            renderView(appEl);
        });
    });

    // Inputs nombre / mesa
    appEl.querySelector('#cust-name')?.addEventListener('input', (e) => customerName = e.target.value);
    appEl.querySelector('#cust-table')?.addEventListener('input', (e) => tableNumber = e.target.value);

    // Toggle "Soy del Club Burgame"
    appEl.querySelector('#club-self-toggle')?.addEventListener('change', (e) => {
        const active = e.target.checked;
        cart.setClubMode(active, getClubLookup());
        updateCartPanel(appEl);
    });

    // Add to cart: single / combo
    appEl.querySelectorAll('.btn-add-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addProduct(product, false);
            updateCartPanel(appEl);
        });
    });

    appEl.querySelectorAll('.btn-add-combo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addProduct(product, true);
            updateCartPanel(appEl);
        });
    });

    // Promos especiales (Cheat / Bowser) y variantes (Chopp)
    appEl.querySelectorAll('.btn-add-promo, .btn-add-variant').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const product = products.find(p => p.id === btn.dataset.id);
            if (!product) return;
            cart.addVariant(product, btn.dataset.vname, parseInt(btn.dataset.vprice, 10));
            updateCartPanel(appEl);
        });
    });

    // Aclaraciones + controles de cantidad
    setupCartEvents(appEl);

    // Confirm Self Order
    let isSubmittingOrder = false;
    appEl.querySelector('#btn-submit-self-order')?.addEventListener('click', async (e) => {
        if (isSubmittingOrder) return;
        isSubmittingOrder = true;
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        if (!qrAuthService.isSessionValid()) {
            showToast({ message: 'Tu sesión en el local ha expirado. Por favor ingresa el PIN del local.', type: 'warning' });
            isSubmittingOrder = false;
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalText;
            renderView(appEl);
            return;
        }

        const nameVal = appEl.querySelector('#cust-name')?.value.trim();
        const tableVal = appEl.querySelector('#cust-table')?.value.trim();

        if (!nameVal) {
            showToast({ message: 'Ingresa tu nombre o apodo antes de enviar', type: 'warning' });
            isSubmittingOrder = false;
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalText;
            return;
        }

        if (serviceType === 'eat_in' && !tableVal) {
            showToast({ message: 'Ingresa el número de tu mesa', type: 'warning' });
            isSubmittingOrder = false;
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalText;
            return;
        }

        if (cart.items.length === 0) {
            showToast({ message: 'Tu pedido está vacío', type: 'warning' });
            isSubmittingOrder = false;
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalText;
            return;
        }

        // ============================================================
        // VERIFICACIÓN GEOFENCE GPS (Límite 250m del local)
        // ============================================================
        btn.innerHTML = '📍 COMPROBANDO UBICACIÓN...';
        try {
            const geoCheck = await qrAuthService.verifyGeofence();
            if (geoCheck.supported && !geoCheck.inRange) {
                isSubmittingOrder = false;
                btn.disabled = false;
                btn.style.opacity = '';
                btn.innerHTML = originalText;

                if (geoCheck.permissionDenied) {
                    showToast({
                        message: '📍 Por favor activa la ubicación en tu navegador para confirmar que estás en el local.',
                        type: 'warning',
                        duration: 6000
                    });
                } else {
                    showToast({
                        message: `⛔ ${geoCheck.error} Los autopedidos solo se permiten dentro de Burgame.`,
                        type: 'error',
                        duration: 7000
                    });
                }
                return;
            }
        } catch (e) {
            console.warn('Error en verificación de geocerca:', e);
        }

        btn.innerHTML = '⏳ ENVIANDO A COCINA...';

        let currentReg = null;
        try {
            currentReg = await cashService.getCurrentRegister();
        } catch { }

        let fullCustomerName = serviceType === 'eat_in' ? `${nameVal} (Mesa ${tableVal})` : `${nameVal} (Para Llevar)`;
        if (cart.clubMode) fullCustomerName += ' (Club)';

        try {
            const order = await orderService.createOrder({
                items: cart.items,
                notes: serviceType === 'eat_in' ? `AUTOPEDIDO MESA ${tableVal}` : `AUTOPEDIDO PARA LLEVAR`,
                customerName: fullCustomerName,
                cashRegisterId: currentReg ? currentReg.id : null,
                status: 'pending_payment'
            });

            activeOrder = order;
            cart.clear();
            cart.setClubMode(false);
            showToast({ message: '💳 ¡Pedido enviado a Caja! Acércate a abonar para iniciar preparación.', type: 'info', duration: 6000 });

            subscribeToLiveTracker(order.id, appEl);
            renderView(appEl);
        } catch (err) {
            showToast({ message: 'Error enviando pedido: ' + err.message, type: 'error' });
        } finally {
            isSubmittingOrder = false;
            btn.disabled = false;
            btn.style.opacity = '';
            btn.innerHTML = originalText;
        }
    });
}

// ============================================================
// Mapa productId → producto para aplicar precios Club al carrito
// ============================================================
function getClubLookup() {
    const lookup = {};
    products.forEach(p => { lookup[p.id] = p; });
    return lookup;
}

// ============================================================
// Render SOLO del carrito/drawer (evita reconstruir el catálogo)
// ============================================================
function updateCartPanel(appEl) {
    const ticketPanel = appEl.querySelector('.ticket-panel.open');

    if (!ticketPanel || cart.items.length === 0) {
        renderView(appEl);
        return;
    }

    const totalQty = cart.count;
    const totalGs = cart.total;

    const headerSpans = ticketPanel.querySelectorAll('div[style*="justify-content: space-between"] > span');
    if (headerSpans.length >= 2) {
        headerSpans[0].textContent = `🛒 TU PEDIDO (${totalQty})`;
        headerSpans[1].textContent = formatGs(totalGs);
    }

    const itemsContainer = ticketPanel.querySelector('.ticket-items');
    if (itemsContainer) {
        itemsContainer.innerHTML = cart.renderItems({ showComboToggle: false, noteInputClass: 'input-item-note-cliente', notePlaceholder: '✏️ Aclaración (ej: Sin cebolla, bien cocida...)' });
    }

    setupCartEvents(appEl);
}

// ============================================================
// Eventos del carrito (notas individuales + qty controls)
// ============================================================
function setupCartEvents(appEl) {
    appEl.querySelectorAll('.input-item-note-cliente').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(input.dataset.idx, 10);
            cart.setNote(idx, e.target.value);
        });
    });

    appEl.querySelectorAll('.btn-qty, .btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);
            if (action === 'inc') cart.inc(idx);
            else if (action === 'dec') cart.dec(idx);
            else if (action === 'del') cart.remove(idx);
            updateCartPanel(appEl);
        });
    });
}

// ============================================================
// Order Tracker (estado del pedido en tiempo real)
// ============================================================
function renderOrderTracker(appEl) {
    const status = activeOrder.status || 'pending_payment';
    let progressPct = 25;
    let statusLabel = '💳 PENDIENTE DE PAGO EN CAJA';
    let subtext = 'Tu pedido fue recibido en la caja. Por favor acércate a abonar (Efectivo, Tarjeta o Transferencia). Una vez cobrado, ¡viaja de inmediato a cocina!';

    if (status === 'ordered') {
        progressPct = 50;
        statusLabel = '⚡ ¡PAGO CONFIRMADO! EN COCINA';
        subtext = 'Tu comanda ya ingresó a la fila de preparación de los cocineros.';
    } else if (status === 'preparing') {
        progressPct = 75;
        statusLabel = '🔥 EN PREPARACIÓN';
        subtext = 'Tus hamburguesas se están cocinando al fuego ahora mismo.';
    } else if (status === 'ready') {
        progressPct = 100;
        statusLabel = '✅ ¡LISTO EN BARRA / MESA!';
        subtext = '¡Tu pedido ya está listo! Retira en barra o te lo llevamos a la mesa.';
    } else if (status === 'cancelled') {
        progressPct = 0;
        statusLabel = '❌ PEDIDO CANCELADO';
        subtext = 'Este pedido ha sido cancelado o rechazado.';
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

            <div class="tracker-health-bar">
                <div class="tracker-health-fill" style="width: ${progressPct}%;"></div>
            </div>

            <div class="tracker-steps">
                <span class="tracker-step ${progressPct >= 25 ? 'active' : ''}">1. EN CAJA</span>
                <span class="tracker-step ${progressPct >= 50 ? 'active' : ''}">2. EN COCINA</span>
                <span class="tracker-step ${progressPct >= 75 ? 'active' : ''}">3. COCINANDO</span>
                <span class="tracker-step ${progressPct >= 100 ? 'active' : ''}">4. ¡LISTO!</span>
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
        cleanupTracker();
        activeOrder = null;
        renderView(appEl);
    });
}

// ============================================================
// Realtime: track del pedido en vivo
// ============================================================
let activeTrackerChannel = null;

function subscribeToLiveTracker(orderId, appEl) {
    if (activeTrackerChannel) {
        supabase.removeChannel(activeTrackerChannel);
        activeTrackerChannel = null;
    }

    activeTrackerChannel = supabase.channel(`order-tracker-${orderId}`)
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

function cleanupTracker() {
    if (activeTrackerChannel) {
        supabase.removeChannel(activeTrackerChannel);
        activeTrackerChannel = null;
    }
}

// Limpiar canal al salir de la página / recargar
window.addEventListener('beforeunload', cleanupTracker);

// ============================================================
// Funciones de Seguridad, Sesión y Pantalla de Bloqueo
// ============================================================
function renderSessionBadge() {
    const session = qrAuthService.getActiveSession();
    if (!session) return '';
    const minsLeft = Math.max(1, Math.round((session.expiresAt - Date.now()) / 60000));
    return `
        <div class="session-badge-bar">
            <span>🛡️ <strong>SESIÓN ACTIVA</strong> · 📍 Geocerca 250m</span>
            <span>⏱️ Válida por ~${minsLeft} min</span>
        </div>
    `;
}

function renderLockScreen(appEl) {
    appEl.innerHTML = `
        <div class="cliente-header-banner">
            <img src="banner.png" alt="Burgame Banner" class="cliente-banner-img">
        </div>

        <div class="cliente-lock-screen">
            <div class="lock-card">
                <div class="lock-icon-badge">🔒</div>
                <div class="lock-title">ACCESO EXCLUSIVO EN EL LOCAL</div>
                <p class="lock-desc">
                    Para realizar un autopedido y evitar pedidos falsos, debes estar dentro de Burgame.
                </p>

                <div style="background: rgba(255, 215, 0, 0.05); border: 1px dashed var(--border-gold); padding: 0.9rem; border-radius: var(--radius-md); width: 100%; text-align: left; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5;">
                    <div style="color: var(--color-primary); font-weight: 700; margin-bottom: 0.3rem;">📱 ¿Cómo desbloquear el menú?</div>
                    <div>1. Escanea el <strong>código QR activo</strong> en la pantalla del mostrador o de tu mesa.</div>
                    <div style="margin-top: 0.2rem;">2. O ingresa el <strong>PIN de 4 dígitos</strong> visible en la pantalla del local.</div>
                </div>

                <form id="form-unlock-pin" class="pin-input-group">
                    <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-main);">
                        Ingresa el PIN de 4 dígitos:
                    </label>
                    <input type="tel" id="input-unlock-pin" class="pin-input-field" maxlength="4" placeholder="• • • •" autocomplete="off" inputmode="numeric">
                    <button type="submit" class="btn btn--primary btn--block" style="margin-top: 0.5rem; padding: 0.85rem; font-weight: 800;">
                        🚀 DESBLOQUEAR MENÚ
                    </button>
                </form>

                <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
                    💡 ¿Tienes dudas? Consulta con el personal de sala o caja.
                </p>
            </div>
        </div>
    `;

    const form = appEl.querySelector('#form-unlock-pin');
    const input = appEl.querySelector('#input-unlock-pin');
    input?.focus();

    // Auto-validar al ingresar 4 números
    input?.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val;
        if (val.length === 4) {
            submitPin(val, appEl);
        }
    });

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const pinVal = input?.value.trim();
        submitPin(pinVal, appEl);
    });
}

function submitPin(pinVal, appEl) {
    if (!pinVal || pinVal.length < 4) {
        showToast({ message: 'Ingresa los 4 dígitos del PIN', type: 'warning' });
        return;
    }

    if (qrAuthService.isValidPin(pinVal)) {
        qrAuthService.startClientSession({ method: 'pin', table: tableNumber });
        showToast({ message: '🎮 ¡Acceso verificado! Menú habilitado.', type: 'success' });
        renderView(appEl);
    } else {
        showToast({ message: 'PIN incorrecto o vencido. Verifica en la pantalla del local.', type: 'error' });
        const input = appEl.querySelector('#input-unlock-pin');
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

