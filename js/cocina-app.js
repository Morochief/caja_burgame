import { orderService } from './services/order-service.js';
import { showToast } from './components/toast.js';

let activeOrders = [];
let allTodayOrders = [];
let cocinaActiveTab = 'active'; // 'active' | 'history'
let hiddenDeliveredIds = new Set(); // IDs de comandas entregadas ocultadas manualmente

document.addEventListener('DOMContentLoaded', async () => {
    await initCocina();
});

async function initCocina() {
    const { getSession } = await import('./services/auth-service.js');
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html#/login';
        return;
    }

    const grid = document.getElementById('cocina-grid');
    if (!grid) return;

    // Listeners de Pestañas
    document.getElementById('tab-cocina-active')?.addEventListener('click', () => {
        cocinaActiveTab = 'active';
        updateTabButtons();
        renderCocinaView();
    });

    document.getElementById('tab-cocina-history')?.addEventListener('click', () => {
        cocinaActiveTab = 'history';
        updateTabButtons();
        renderCocinaView();
    });

    // Listener de Cerrar Sesión
    document.getElementById('btn-kitchen-logout')?.addEventListener('click', async () => {
        const { logout } = await import('./services/auth-service.js');
        logout();
    });

    await loadActiveOrders();
    renderCocinaView();
    setupRealtimeSubscription();

    // Actualizar temporizador en pantalla cada 30 segundos
    setInterval(() => {
        renderCocinaView();
    }, 30000);
}

function updateTabButtons() {
    const btnActive = document.getElementById('tab-cocina-active');
    const btnHistory = document.getElementById('tab-cocina-history');

    if (cocinaActiveTab === 'active') {
        btnActive?.classList.add('active', 'btn--primary');
        btnActive?.classList.remove('btn--secondary');
        btnActive?.style.setProperty('color', 'var(--text-inverse)');

        btnHistory?.classList.remove('active', 'btn--primary');
        btnHistory?.classList.add('btn--secondary');
        btnHistory?.style.setProperty('color', 'var(--text-muted)');
    } else {
        btnHistory?.classList.add('active', 'btn--primary');
        btnHistory?.classList.remove('btn--secondary');
        btnHistory?.style.setProperty('color', 'var(--text-inverse)');

        btnActive?.classList.remove('active', 'btn--primary');
        btnActive?.classList.add('btn--secondary');
        btnActive?.style.setProperty('color', 'var(--text-muted)');
    }
}

async function loadActiveOrders() {
    try {
        const [active, today] = await Promise.all([
            orderService.getActiveOrders(),
            orderService.getTodaysOrders()
        ]);
        activeOrders = active || [];
        allTodayOrders = today || [];
    } catch (err) {
        console.error('Error cargando comandas:', err);
        showToast({ message: 'Error cargando comandas de cocina: ' + err.message, type: 'error' });
    }
}

function renderCocinaView() {
    const grid = document.getElementById('cocina-grid');
    const activeCountEl = document.getElementById('active-count');
    const readyCountEl = document.getElementById('ready-count');
    const totalBurgersCountEl = document.getElementById('total-burgers-count');
    const activeTabCountEl = document.getElementById('active-tab-count');
    const historyTabCountEl = document.getElementById('history-tab-count');

    if (!grid) return;

    // Filtrar comandas según pestaña activa
    const pendingActive = activeOrders.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status));
    const deliveredToday = allTodayOrders.filter(o => ['delivered', 'paid'].includes(o.status) && !hiddenDeliveredIds.has(o.id));

    if (activeTabCountEl) activeTabCountEl.textContent = pendingActive.length;
    if (historyTabCountEl) historyTabCountEl.textContent = deliveredToday.length;

    const ordered = activeOrders.filter(o => o.status === 'ordered');
    const preparing = activeOrders.filter(o => o.status === 'preparing');
    const ready = activeOrders.filter(o => o.status === 'ready');

    if (activeCountEl) activeCountEl.textContent = ordered.length + preparing.length;
    if (readyCountEl) readyCountEl.textContent = ready.length;

    // Calcular desglose de hamburguesas hoy
    const productCounts = {};
    let grandTotalItems = 0;
    allTodayOrders.forEach(o => {
        (o.order_items || []).forEach(item => {
            const name = item.product_name;
            const qty = item.quantity || 1;
            productCounts[name] = (productCounts[name] || 0) + qty;
            grandTotalItems += qty;
        });
    });
    if (totalBurgersCountEl) totalBurgersCountEl.textContent = grandTotalItems;

    // Determinar listado a renderizar en el Grid
    const displayList = cocinaActiveTab === 'active' ? pendingActive : deliveredToday;

    if (displayList.length === 0) {
        grid.innerHTML = `
            <div class="cocina-empty">
                <div class="cocina-empty__icon">${cocinaActiveTab === 'active' ? '🔥' : '📜'}</div>
                <div class="cocina-empty__text">${cocinaActiveTab === 'active' ? 'SIN COMANDAS PENDIENTES' : 'HISTORIAL DE ENTREGADOS LIMPIO'}</div>
                <p class="cocina-empty__subtext">
                    ${cocinaActiveTab === 'active' ? 'Esperando que ingresen nuevos pedidos desde el POS o Clientes...' : 'Las comandas entregadas figurarán aquí de forma organizada.'}
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = displayList.map(order => {
        const minutesElapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        const isLate = minutesElapsed >= 15;
        const statusClass = order.status === 'ordered' ? 'ordered' : order.status === 'preparing' ? 'preparing' : order.status === 'ready' ? 'ready' : 'delivered';
        const customerDisplay = order.customer_name || extractCustomerFromNotes(order.notes) || 'Mesa / Cliente';

        return `
            <div class="kds-card kds-card--${statusClass}">
                <div class="kds-card__header">
                    <div>
                        <span class="kds-card__number">PEDIDO #${order.order_number}</span>
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-primary); margin-top: 0.2rem;">
                            👤 ${customerDisplay}
                        </div>
                    </div>
                    <span class="kds-card__timer ${isLate && order.status !== 'delivered' ? 'kds-card__timer--late' : ''}">
                        ⏱️ ${minutesElapsed}m ${isLate && order.status !== 'delivered' ? '⚠️' : ''}
                    </span>
                </div>

                <div class="kds-card__status-bar">
                    <span class="badge badge--${getStatusBadgeColor(order.status)}">
                        ${getStatusLabel(order.status)}
                    </span>
                </div>

                <div class="kds-card__body">
                    <ul class="kds-items-list">
                        ${(order.order_items || []).map(item => `
                            <li class="kds-item">
                                <span class="kds-item__qty">${item.quantity}x</span>
                                <span class="kds-item__name">
                                    ${item.product_name}
                                    ${item.is_combo ? '<span class="kds-item__tag">(COMBO)</span>' : ''}
                                </span>
                            </li>
                        `).join('')}
                    </ul>

                    ${order.notes ? `
                        <div class="kds-notes">
                            📝 <strong>NOTAS:</strong> ${order.notes}
                        </div>
                    ` : ''}
                </div>

                <div class="kds-card__footer">
                    ${order.status === 'ordered' ? `
                        <button class="btn btn--primary kds-btn-action btn-advance" data-id="${order.id}" data-next="preparing">
                            🔥 INICIAR PREPARACIÓN
                        </button>
                    ` : order.status === 'preparing' ? `
                        <button class="btn btn--primary kds-btn-action kds-btn-ready btn-advance" data-id="${order.id}" data-next="ready">
                            ✅ MARCAR LISTO EN BARRA
                        </button>
                    ` : order.status === 'ready' ? `
                        <button class="btn btn--secondary kds-btn-action btn-advance" data-id="${order.id}" data-next="delivered">
                            🚀 ENTREGADO AL CLIENTE
                        </button>
                    ` : `
                        <button class="btn btn--danger kds-btn-action btn-hide-delivered" data-id="${order.id}" style="padding: 0.6rem; font-size: 0.8rem;">
                            🗑️ ELIMINAR DE PANTALLA
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    attachEvents();
}

function getStatusBadgeColor(status) {
    switch (status) {
        case 'ordered': return 'yellow';
        case 'preparing': return 'orange';
        case 'ready': return 'green';
        default: return 'blue';
    }
}

function getStatusLabel(status) {
    switch (status) {
        case 'ordered': return '⚡ NUEVO PEDIDO';
        case 'preparing': return '🔥 EN PREPARACIÓN';
        case 'ready': return '✅ LISTO PARA ENTREGAR';
        default: return 'ENTREGADO';
    }
}

function attachEvents() {
    document.querySelectorAll('.btn-advance').forEach(btn => {
        btn.addEventListener('click', async () => {
            const orderId = btn.dataset.id;
            const nextStatus = btn.dataset.next;

            try {
                await orderService.updateStatus(orderId, nextStatus);
                showToast({ 
                    message: `Pedido actualizado a ${getStatusLabel(nextStatus)}`, 
                    type: 'success' 
                });
                await loadActiveOrders();
                renderCocinaView();
            } catch (err) {
                showToast({ message: 'Error actualizando comanda: ' + err.message, type: 'error' });
            }
        });
    });

    // Botón eliminar comanda entregada del historial
    document.querySelectorAll('.btn-hide-delivered').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.dataset.id;
            hiddenDeliveredIds.add(orderId);
            showToast({ message: 'Comanda removida de la pantalla', type: 'info' });
            renderCocinaView();
        });
    });
}

function setupRealtimeSubscription() {
    orderService.subscribeToOrders(async (payload) => {
        await loadActiveOrders();
        renderCocinaView();
    });
}

function extractCustomerFromNotes(notes) {
    if (!notes) return null;
    const match = notes.match(/\[Cliente:\s*([^\]]+)\]/i);
    return match ? match[1].trim() : null;
}
