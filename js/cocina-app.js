import { orderService } from './services/order-service.js';
import { showToast } from './components/toast.js';

let activeOrders = [];

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

async function loadActiveOrders() {
    try {
        const orders = await orderService.getActiveOrders();
        activeOrders = orders || [];
    } catch (err) {
        showToast({ message: 'Error cargando comandas de cocina', type: 'error' });
    }
}

function renderCocinaView() {
    const grid = document.getElementById('cocina-grid');
    const activeCountEl = document.getElementById('active-count');
    const readyCountEl = document.getElementById('ready-count');

    if (!grid) return;

    const ordered = activeOrders.filter(o => o.status === 'ordered');
    const preparing = activeOrders.filter(o => o.status === 'preparing');
    const ready = activeOrders.filter(o => o.status === 'ready');

    if (activeCountEl) activeCountEl.textContent = ordered.length + preparing.length;
    if (readyCountEl) readyCountEl.textContent = ready.length;

    if (activeOrders.length === 0) {
        grid.innerHTML = `
            <div class="cocina-empty">
                <div class="cocina-empty__icon">🔥</div>
                <div class="cocina-empty__text">COCINA AL DÍA</div>
                <p class="cocina-empty__subtext">Esperando que ingresen nuevos pedidos desde el POS...</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = activeOrders.map(order => {
        const minutesElapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        const isLate = minutesElapsed >= 15;
        const statusClass = order.status === 'ordered' ? 'ordered' : order.status === 'preparing' ? 'preparing' : 'ready';

        return `
            <div class="kds-card kds-card--${statusClass}">
                <div class="kds-card__header">
                    <span class="kds-card__number">PEDIDO #${order.order_number}</span>
                    <span class="kds-card__timer ${isLate ? 'kds-card__timer--late' : ''}">
                        ⏱️ ${minutesElapsed}m ${isLate ? '⚠️' : ''}
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
                    ` : `
                        <button class="btn btn--secondary kds-btn-action btn-advance" data-id="${order.id}" data-next="delivered">
                            🚀 ENTREGADO AL CLIENTE
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
}

function setupRealtimeSubscription() {
    orderService.subscribeToOrders(async (payload) => {
        await loadActiveOrders();
        renderCocinaView();
    });
}
