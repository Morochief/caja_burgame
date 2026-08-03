import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let pendingOrders = [];
let todaysPaidOrders = [];
let activeTab = 'pending';
let currentCashRegister = null;

export async function renderOrdenesPage() {
    const container = document.createElement('div');
    container.className = 'ordenes-page';

    await loadData();

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>📋 GESTIÓN DE ÓRDENES</h1>
                <p>Procesa y rectifica los pagos de la caja abierta actual</p>
            </div>
            <div class="tab-selectors">
                <button class="tab-btn ${activeTab === 'pending' ? 'active' : ''}" id="tab-pending">
                    ⚡ Pendientes de Cobro (${pendingOrders.length})
                </button>
                <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" id="tab-history">
                    ✅ Cobradas en Turno (${todaysPaidOrders.length})
                </button>
            </div>
        </header>

        <section class="ordenes-content">
            <div class="orders-grid" id="orders-grid">
                ${renderOrdersList()}
            </div>
        </section>
    `;

    setupEvents(container);
    return container;
}

async function loadData() {
    try {
        currentCashRegister = await cashService.getCurrentRegister();
        const [pending, today] = await Promise.all([
            orderService.getPendingPayment(),
            orderService.getTodaysOrders()
        ]);

        pendingOrders = pending || [];

        // Filtrar cobradas por la caja abierta actual para permitir corrección segura
        if (currentCashRegister) {
            todaysPaidOrders = (today || []).filter(o => o.status === 'paid' && o.cash_register_id === currentCashRegister.id);
        } else {
            todaysPaidOrders = (today || []).filter(o => o.status === 'paid');
        }
    } catch (err) {
        showToast({ message: 'Error al cargar listado de órdenes', type: 'error' });
    }
}

function renderOrdersList() {
    const list = activeTab === 'pending' ? pendingOrders : todaysPaidOrders;

    if (list.length === 0) {
        return `
            <div class="orders-empty">
                <div class="empty-icon">🧾</div>
                <p>${activeTab === 'pending' ? 'No hay pedidos pendientes de cobro' : 'No hay pedidos cobrados en este turno'}</p>
            </div>
        `;
    }

    return list.map(order => `
        <div class="order-card order-card--${order.status}">
            <div class="order-card__header">
                <div>
                    <span class="order-card__number">PEDIDO #${order.order_number}</span>
                    <div style="font-size: 0.82rem; font-weight: 700; color: var(--color-primary); margin-top: 0.15rem;">
                        👤 ${order.customer_name || 'Mesa / Cliente General'}
                    </div>
                </div>
                <span class="order-card__time">${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div class="order-card__badge badge badge--${getStatusBadgeClass(order.status)}">
                ${order.status.toUpperCase()}
            </div>

            <div class="order-card__body">
                <ul class="order-card__items">
                    ${(order.order_items || []).map(item => `
                        <li>
                            <span>${item.quantity}x ${item.product_name} ${item.is_combo ? '(Combo)' : ''}</span>
                            <span>${formatGs(item.price * item.quantity)}</span>
                        </li>
                    `).join('')}
                </ul>

                ${order.notes ? `<div class="order-card__notes">📝 ${order.notes}</div>` : ''}

                <div class="order-card__total">
                    <span>Total:</span>
                    <strong>${formatGs(order.total)}</strong>
                </div>
            </div>

            ${activeTab === 'pending' ? `
                <div class="order-card__payments">
                    <p class="payment-title">Selecciona Método de Pago:</p>
                    <div class="payment-grid">
                        <button class="btn btn--payment btn--cash" data-id="${order.id}" data-method="efectivo">💵 Efectivo</button>
                        <button class="btn btn--payment btn--transfer" data-id="${order.id}" data-method="transferencia">📱 Transferencia</button>
                        <button class="btn btn--payment btn--debit" data-id="${order.id}" data-method="debito">💳 Débito</button>
                        <button class="btn btn--payment btn--credit" data-id="${order.id}" data-method="credito">💳 Crédito</button>
                    </div>
                </div>
            ` : `
                <div class="order-card__paid-info">
                    <div class="paid-method-display">
                        <span>Cobrado con: <strong>${(order.payment_method || '').toUpperCase()}</strong></span>
                    </div>
                    ${currentCashRegister && order.cash_register_id === currentCashRegister.id ? `
                        <div class="change-payment-wrapper">
                            <label class="text-xs text-muted">Corregir medio de pago:</label>
                            <select class="change-payment-select" data-id="${order.id}">
                                <option value="efectivo" ${order.payment_method === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
                                <option value="transferencia" ${order.payment_method === 'transferencia' ? 'selected' : ''}>📱 Transferencia</option>
                                <option value="debito" ${order.payment_method === 'debito' ? 'selected' : ''}>💳 Débito</option>
                                <option value="credito" ${order.payment_method === 'credito' ? 'selected' : ''}>💳 Crédito</option>
                            </select>
                        </div>
                    ` : `
                        <span class="badge badge--dark">🔒 Caja Cerrada</span>
                    `}
                </div>
            `}
        </div>
    `).join('');
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'ordered': return 'yellow';
        case 'preparing': return 'orange';
        case 'ready': return 'green';
        case 'delivered': return 'blue';
        case 'paid': return 'dark';
        default: return 'gray';
    }
}

function setupEvents(container) {
    container.querySelector('#tab-pending')?.addEventListener('click', () => {
        activeTab = 'pending';
        updateView(container);
    });

    container.querySelector('#tab-history')?.addEventListener('click', () => {
        activeTab = 'history';
        updateView(container);
    });

    attachPaymentEvents(container);
}

function updateView(container) {
    const tabPending = container.querySelector('#tab-pending');
    const tabHistory = container.querySelector('#tab-history');

    if (tabPending) {
        tabPending.innerHTML = `⚡ Pendientes de Cobro (${pendingOrders.length})`;
    }
    if (tabHistory) {
        tabHistory.innerHTML = `✅ Cobradas en Turno (${todaysPaidOrders.length})`;
    }

    container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (activeTab === 'pending') {
        tabPending?.classList.add('active');
    } else {
        tabHistory?.classList.add('active');
    }

    const grid = container.querySelector('#orders-grid');
    if (grid) {
        grid.innerHTML = renderOrdersList();
        attachPaymentEvents(container);
    }
}

function attachPaymentEvents(container) {
    // Procesar Pago Inicial
    container.querySelectorAll('.btn--payment').forEach(btn => {
        btn.addEventListener('click', async () => {
            const orderId = btn.dataset.id;
            const method = btn.dataset.method;

            try {
                await orderService.processPayment(orderId, method);
                showToast({ 
                    message: `💰 ¡Pago registrado con éxito (${method.toUpperCase()})!`, 
                    type: 'success' 
                });
                await loadData();
                updateView(container);
            } catch (err) {
                showToast({ message: 'Error al procesar el pago: ' + err.message, type: 'error' });
            }
        });
    });

    // Rectificar Medio de Pago (Caja Abierta)
    container.querySelectorAll('.change-payment-select').forEach(select => {
        select.addEventListener('change', async () => {
            const orderId = select.dataset.id;
            const newMethod = select.value;

            try {
                await orderService.updatePaymentMethod(orderId, newMethod);
                showToast({
                    message: `✏️ Medio de pago corregido a ${newMethod.toUpperCase()}`,
                    type: 'success'
                });
                await loadData();
                updateView(container);
            } catch (err) {
                showToast({ message: 'Error al corregir medio de pago: ' + err.message, type: 'error' });
            }
        });
    });
}
