import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allTodaysOrders = [];
let activeTab = 'pending'; // 'pending' | 'kitchen' | 'paid' | 'delivered' | 'cancelled' | 'all'
let currentCashRegister = null;
let realtimeChannel = null;
let slaInterval = null;

let filterState = {
    search: '',
    paymentMethod: 'all',
    sort: 'time-desc'
};

let selectedOrderForTicket = null;
let selectedOrderForCancel = null;

export async function renderOrdenesPage() {
    const container = document.createElement('div');
    container.className = 'ordenes-page';

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
            <div class="page-header__info">
                <h1 style="font-family: var(--font-title); font-size: 1.35rem; color: var(--color-primary); display: flex; align-items: center; gap: 0.6rem; margin: 0 0 0.35rem 0;">
                    📋 GESTIÓN DE ÓRDENES & CAJA
                </h1>
                <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0;">
                    Supervisión operativa, cobros en vivo, control de cocina y emisión de comandas
                </p>
            </div>
            <div style="display: flex; gap: 0.6rem; align-items: center;">
                <button id="btn-refresh-orders" class="btn btn--secondary" title="Recargar órdenes manualmente" style="display: flex; align-items: center; gap: 0.4rem; padding: 0.55rem 0.9rem;">
                    🔄 Refrescar
                </button>
            </div>
        </header>

        <!-- KPI Metrics Header -->
        <div id="ordenes-kpi-container" class="ordenes-kpi-grid">
            ${renderKpiCards()}
        </div>

        <!-- Tab Selectors Bar -->
        <div class="tab-selectors" id="tab-selectors">
            <button class="tab-btn ${activeTab === 'pending' ? 'active' : ''}" data-tab="pending">
                ⚡ Pendientes de Cobro <span class="tab-badge" id="badge-pending">0</span>
            </button>
            <button class="tab-btn ${activeTab === 'kitchen' ? 'active' : ''}" data-tab="kitchen">
                🍳 En Cocina <span class="tab-badge" id="badge-kitchen">0</span>
            </button>
            <button class="tab-btn ${activeTab === 'paid' ? 'active' : ''}" data-tab="paid">
                ✅ Cobradas en Turno <span class="tab-badge" id="badge-paid">0</span>
            </button>
            <button class="tab-btn ${activeTab === 'delivered' ? 'active' : ''}" data-tab="delivered">
                🏁 Entregadas <span class="tab-badge" id="badge-delivered">0</span>
            </button>
            <button class="tab-btn ${activeTab === 'cancelled' ? 'active' : ''}" data-tab="cancelled">
                ❌ Canceladas <span class="tab-badge" id="badge-cancelled">0</span>
            </button>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="ordenes-toolbar">
            <div style="display: flex; gap: 0.6rem; flex: 1; min-width: 260px; flex-wrap: wrap;">
                <input type="text" id="ordenes-search" class="ordenes-search-input" placeholder="🔍 Buscar por Nº pedido, cliente, nota o item..." value="${filterState.search}">
                
                <select id="ordenes-filter-payment" class="ordenes-select">
                    <option value="all">Todos los medios de pago</option>
                    <option value="efectivo">💵 Efectivo</option>
                    <option value="transferencia">📱 Transferencia</option>
                    <option value="debito">💳 Débito</option>
                    <option value="credito">💳 Crédito</option>
                </select>
            </div>

            <div style="display: flex; gap: 0.6rem; align-items: center;">
                <select id="ordenes-sort" class="ordenes-select">
                    <option value="time-desc">Más recientes primero</option>
                    <option value="time-asc">Más antiguos primero (SLA)</option>
                    <option value="total-desc">Mayor importe (Gs.)</option>
                    <option value="total-asc">Menor importe (Gs.)</option>
                </select>
            </div>
        </div>

        <!-- Main Orders Grid -->
        <section class="ordenes-content">
            <div class="orders-grid" id="orders-grid">
                <div class="page-loading" style="padding: 2.5rem; text-align: center; grid-column: 1 / -1;">
                    <div class="pixel-spinner"></div>
                    <p style="color: var(--text-muted); margin-top: 1rem;">Cargando comandas en vivo...</p>
                </div>
            </div>
        </section>

        <!-- Thermal Ticket Modal -->
        ${renderTicketModal()}

        <!-- Cancellation Modal with Reason -->
        ${renderCancelModal()}
    `;

    bindStaticEvents(container);
    loadOrdenesData(container);

    // Actualizar cronómetros de espera (SLA) cada 30 segundos
    if (slaInterval) clearInterval(slaInterval);
    slaInterval = setInterval(() => {
        updateSlaTimers(container);
    }, 30000);

    return container;
}

function renderKpiCards() {
    const pending = allTodaysOrders.filter(o => o.status !== 'cancelled' && !o.paid_at);
    const pendingAmount = pending.reduce((sum, o) => sum + (o.total || 0), 0);

    const inKitchen = allTodaysOrders.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status));

    const paidInShift = allTodaysOrders.filter(o => 
        o.paid_at && currentCashRegister && o.cash_register_id === currentCashRegister.id
    );
    const shiftTotal = paidInShift.reduce((sum, o) => sum + (o.total || 0), 0);

    const totalOrders = allTodaysOrders.length;

    return `
        <div class="ordenes-kpi-card" style="--kpi-accent: #EAB308;">
            <div class="kpi-icon-box">⚡</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: #FACC15;">${pending.length} <small style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(${formatGs(pendingAmount)})</small></span>
                <span class="kpi-label">Por Cobrar en Caja</span>
            </div>
        </div>
        <div class="ordenes-kpi-card" style="--kpi-accent: #3B82F6;">
            <div class="kpi-icon-box">🍳</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: #60A5FA;">${inKitchen.length}</span>
                <span class="kpi-label">En Cocina / Marcha</span>
            </div>
        </div>
        <div class="ordenes-kpi-card" style="--kpi-accent: #10B981;">
            <div class="kpi-icon-box">💰</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: #34D399;">${formatGs(shiftTotal)}</span>
                <span class="kpi-label">Cobrado Turno Actual (${paidInShift.length})</span>
            </div>
        </div>
        <div class="ordenes-kpi-card" style="--kpi-accent: #A855F7;">
            <div class="kpi-icon-box">📦</div>
            <div class="kpi-info">
                <span class="kpi-value">${totalOrders}</span>
                <span class="kpi-label">Total Comandas Hoy</span>
            </div>
        </div>
    `;
}

function renderTicketModal() {
    return `
        <div id="ticket-modal" class="modal-overlay hidden">
            <div class="modal-card" style="max-width: 440px;">
                <div class="modal-header">
                    <h2>🧾 Comanda / Ticket Fiscal</h2>
                    <button type="button" id="btn-close-ticket" class="btn-close">&times;</button>
                </div>

                <div class="modal-body" id="print-ticket-area">
                    <div class="ticket-paper" id="ticket-paper-content">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center;">
                    <button type="button" class="btn btn--secondary" id="btn-cancel-ticket">Cerrar</button>
                    <button type="button" class="btn btn--primary" id="btn-do-print" style="display: flex; align-items: center; gap: 0.4rem;">
                        🖨️ Imprimir Ticket (Ctrl + P)
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderCancelModal() {
    return `
        <div id="cancel-modal" class="modal-overlay hidden">
            <div class="modal-card" style="max-width: 440px;">
                <div class="modal-header">
                    <h2 style="color: #EF4444;">❌ Anular Comanda</h2>
                    <button type="button" id="btn-close-cancel" class="btn-close">&times;</button>
                </div>

                <div class="modal-body">
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1rem;">
                        ¿Deseas cancelar el <strong id="cancel-order-title" style="color: #FFF;"></strong>?
                    </p>

                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label style="font-size: 0.82rem; font-weight: 600; color: #CBD5E1; margin-bottom: 0.35rem; display: block;">
                            Motivo de la Anulación:
                        </label>
                        <select id="cancel-reason-select" class="form-select" style="width: 100%;">
                            <option value="Cliente desistió / demora">Cliente desistió / demora</option>
                            <option value="No abonó en caja">No abonó en caja</option>
                            <option value="Pedido duplicado o error de comanda">Pedido duplicado o error de comanda</option>
                            <option value="Falta de insumos / producto agotado">Falta de insumos / producto agotado</option>
                            <option value="Error de digitación del cajero">Error de digitación del cajero</option>
                            <option value="Otro motivo">Otro motivo (especificar)</option>
                        </select>
                    </div>

                    <div class="form-group" id="custom-reason-wrap" style="display: none; margin-bottom: 1rem;">
                        <input type="text" id="cancel-custom-reason" class="form-input" placeholder="Escribe el motivo detallado..." style="width: 100%;">
                    </div>
                </div>

                <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <button type="button" class="btn btn--secondary" id="btn-cancel-abort">Volver</button>
                    <button type="button" class="btn btn--danger" id="btn-confirm-cancel">Confirmar Anulación</button>
                </div>
            </div>
        </div>
    `;
}

async function loadOrdenesData(container) {
    await loadData();
    updateView(container);

    // Suscripción Realtime con Debounce
    let debounceTimer = null;
    if (realtimeChannel) {
        try { orderService.unsubscribeAllOrders(); } catch { /* */ }
    }

    realtimeChannel = orderService.subscribeToOrders(async () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            debounceTimer = null;
            await loadData();
            updateView(container);
        }, 300);
    });
}

async function loadData() {
    try {
        if (appState.cashRegister) {
            currentCashRegister = appState.cashRegister;
        } else {
            currentCashRegister = await cashService.getCurrentRegister();
        }

        const today = await orderService.getTodaysOrders();
        allTodaysOrders = today || [];
    } catch (err) {
        showToast({ message: 'Error cargando comandas de hoy', type: 'error' });
    }
}

function getFilteredSortedOrders() {
    let list = [...allTodaysOrders];

    // 1. Filtro por Pestaña
    if (activeTab === 'pending') {
        list = list.filter(o => o.status !== 'cancelled' && !o.paid_at);
    } else if (activeTab === 'kitchen') {
        list = list.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status));
    } else if (activeTab === 'paid') {
        if (currentCashRegister) {
            list = list.filter(o => o.paid_at && o.cash_register_id === currentCashRegister.id);
        } else {
            list = list.filter(o => o.paid_at);
        }
    } else if (activeTab === 'delivered') {
        list = list.filter(o => o.status === 'delivered');
    } else if (activeTab === 'cancelled') {
        list = list.filter(o => o.status === 'cancelled');
    }

    // 2. Filtro por Búsqueda (Nº comanda, cliente, notas, items)
    if (filterState.search.trim()) {
        const q = filterState.search.toLowerCase();
        list = list.filter(o => {
            const numMatch = String(o.order_number || '').includes(q);
            const clientMatch = (o.customer_name || '').toLowerCase().includes(q);
            const notesMatch = (o.notes || '').toLowerCase().includes(q);
            const itemMatch = (o.order_items || []).some(i => (i.product_name || '').toLowerCase().includes(q));
            return numMatch || clientMatch || notesMatch || itemMatch;
        });
    }

    // 3. Filtro por Método de Pago
    if (filterState.paymentMethod !== 'all') {
        list = list.filter(o => o.payment_method === filterState.paymentMethod);
    }

    // 4. Ordenamiento
    list.sort((a, b) => {
        if (filterState.sort === 'time-desc') {
            return new Date(b.created_at) - new Date(a.created_at);
        }
        if (filterState.sort === 'time-asc') {
            return new Date(a.created_at) - new Date(b.created_at);
        }
        if (filterState.sort === 'total-desc') {
            return (b.total || 0) - (a.total || 0);
        }
        if (filterState.sort === 'total-asc') {
            return (a.total || 0) - (b.total || 0);
        }
        return 0;
    });

    return list;
}

function updateView(container) {
    // 1. Actualizar KPIs superiores
    const kpiWrap = container.querySelector('#ordenes-kpi-container');
    if (kpiWrap) kpiWrap.innerHTML = renderKpiCards();

    // 2. Actualizar Contadores en Pestañas
    const pendingCount = allTodaysOrders.filter(o => o.status !== 'cancelled' && !o.paid_at).length;
    const kitchenCount = allTodaysOrders.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status)).length;
    const paidCount = allTodaysOrders.filter(o => o.paid_at && currentCashRegister && o.cash_register_id === currentCashRegister.id).length;
    const deliveredCount = allTodaysOrders.filter(o => o.status === 'delivered').length;
    const cancelledCount = allTodaysOrders.filter(o => o.status === 'cancelled').length;

    setText(container, '#badge-pending', pendingCount);
    setText(container, '#badge-kitchen', kitchenCount);
    setText(container, '#badge-paid', paidCount);
    setText(container, '#badge-delivered', deliveredCount);
    setText(container, '#badge-cancelled', cancelledCount);

    // 3. Pestaña activa
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });

    // 4. Renderizar Grilla de Pedidos
    const grid = container.querySelector('#orders-grid');
    if (grid) {
        grid.innerHTML = renderOrdersList();
        attachCardEvents(container);
    }
}

function renderOrdersList() {
    const list = getFilteredSortedOrders();

    if (list.length === 0) {
        const emptyLabels = {
            pending: 'No hay pedidos pendientes de cobro en este momento.',
            kitchen: 'No hay pedidos en preparación en la cocina.',
            paid: 'No hay pedidos cobrados en la caja actual.',
            delivered: 'No hay pedidos marcados como entregados hoy.',
            cancelled: 'No se registran pedidos cancelados hoy.',
            all: 'No se encontraron pedidos con los filtros seleccionados.'
        };

        return `
            <div class="orders-empty">
                <div class="empty-icon">🧾</div>
                <h3 style="color: #FFF; font-size: 1.1rem; margin-bottom: 0.35rem;">Bandeja Vacía</h3>
                <p>${emptyLabels[activeTab] || 'No se encontraron comandas.'}</p>
            </div>
        `;
    }

    return list.map(order => renderOrderCard(order)).join('');
}

function renderOrderCard(order) {
    const isAutopedido = (order.notes && order.notes.includes('[AUTOPEDIDO]')) || order.status === 'pending_payment';
    const isPaid = !!order.paid_at;
    const formattedTime = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sla = calculateSla(order.created_at, order.status);

    return `
        <div class="order-card order-card--${order.status}" data-id="${order.id}">
            <div class="order-card__header">
                <div>
                    <span class="order-card__number">PEDIDO #${order.order_number}</span>
                    <div class="order-card__customer">
                        👤 ${order.customer_name || 'Mesa / Mostrador'}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem;">
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono);">${formattedTime}</span>
                    <span class="sla-timer ${sla.cssClass}" title="Tiempo transcurrido desde la creación">
                        ${sla.text}
                    </span>
                </div>
            </div>

            <div class="order-badges-row">
                <span class="badge-source">
                    ${isAutopedido ? '📱 Autopedido QR' : '🖥️ Salón / POS'}
                </span>
                <span class="badge badge--${getStatusBadgeClass(order.status, isPaid)}">
                    ${getStatusLabel(order.status, isPaid)}
                </span>
                ${order.payment_method ? `
                    <span class="badge badge--dark" style="font-size: 0.68rem; text-transform: uppercase;">
                        ${getPaymentMethodIcon(order.payment_method)} ${order.payment_method}
                    </span>
                ` : ''}
            </div>

            <ul class="order-card__items">
                ${(order.order_items || []).map(item => `
                    <li>
                        <span class="item-name">
                            <strong>${item.quantity}x</strong> ${item.product_name} ${item.is_combo ? '<small style="color: var(--color-primary); font-weight: 700;">(Combo)</small>' : ''}
                        </span>
                        <span class="item-price">${formatGs(item.price * item.quantity)}</span>
                    </li>
                `).join('')}
            </ul>

            ${order.notes ? `
                <div class="order-card__notes">
                    📝 ${order.notes}
                </div>
            ` : ''}

            <div class="order-card__total">
                <span>Total a Cobrar</span>
                <strong>${formatGs(order.total)}</strong>
            </div>

            <!-- Acciones de Pago (Si no está pagado) -->
            ${!isPaid && order.status !== 'cancelled' ? `
                <div class="order-card__payments">
                    <p class="payment-title">
                        ${order.status === 'pending_payment' ? '💰 Cobrar y Enviar a Cocina:' : '💳 Registrar Medio de Pago:'}
                    </p>
                    <div class="payment-grid">
                        <button class="btn btn--payment btn--cash" data-id="${order.id}" data-method="efectivo">
                            💵 Efectivo
                        </button>
                        <button class="btn btn--payment btn--transfer" data-id="${order.id}" data-method="transferencia">
                            📱 Transferencia
                        </button>
                        <button class="btn btn--payment btn--debit" data-id="${order.id}" data-method="debito">
                            💳 Débito
                        </button>
                        <button class="btn btn--payment btn--credit" data-id="${order.id}" data-method="credito">
                            💳 Crédito
                        </button>
                    </div>

                    ${order.status === 'pending_payment' ? `
                        <div style="display: flex; gap: 0.5rem; margin-top: 0.6rem;">
                            <button class="btn btn--secondary btn--sm btn--approve-kitchen" data-id="${order.id}" style="flex: 1; border-color: var(--border-gold); font-size: 0.78rem;">
                                ⚡ Enviar a Cocina (Cobrar luego)
                            </button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <!-- Rectificación de medio de pago (Si ya está pagado en caja abierta) -->
            ${isPaid && currentCashRegister && order.cash_register_id === currentCashRegister.id && order.status !== 'cancelled' ? `
                <div style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 0.6rem 0.75rem; border: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Rectificar pago:</span>
                        <select class="change-payment-select ordenes-select" data-id="${order.id}" style="padding: 0.25rem 0.5rem; font-size: 0.78rem;">
                            <option value="efectivo" ${order.payment_method === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
                            <option value="transferencia" ${order.payment_method === 'transferencia' ? 'selected' : ''}>📱 Transferencia</option>
                            <option value="debito" ${order.payment_method === 'debito' ? 'selected' : ''}>💳 Débito</option>
                            <option value="credito" ${order.payment_method === 'credito' ? 'selected' : ''}>💳 Crédito</option>
                        </select>
                    </div>
                </div>
            ` : ''}

            <!-- Barra inferior de herramientas (Ticket + Anulación) -->
            <div class="order-secondary-actions">
                <button class="btn-ticket-print btn-view-ticket" data-id="${order.id}">
                    🧾 Ver / Imprimir Ticket
                </button>

                ${order.status !== 'cancelled' ? `
                    <button class="btn-ticket-print btn-open-cancel" data-id="${order.id}" data-number="${order.order_number}" style="color: #F87171; border-color: rgba(239,68,68,0.3);">
                        ❌ Anular
                    </button>
                ` : `
                    <span style="font-size: 0.75rem; color: #EF4444; font-weight: 700;">CANCELADA</span>
                `}
            </div>
        </div>
    `;
}

function calculateSla(createdAt, status) {
    if (status === 'delivered' || status === 'cancelled') {
        return { text: '🏁 Fin', cssClass: 'sla--green' };
    }
    const diffMins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));

    if (diffMins < 10) {
        return { text: `⏱️ ${diffMins}m`, cssClass: 'sla--green' };
    } else if (diffMins < 20) {
        return { text: `⏱️ ${diffMins}m`, cssClass: 'sla--yellow' };
    } else {
        return { text: `⚠️ ${diffMins}m`, cssClass: 'sla--red' };
    }
}

function updateSlaTimers(container) {
    container.querySelectorAll('.order-card').forEach(card => {
        const id = card.dataset.id;
        const o = allTodaysOrders.find(item => item.id === id);
        if (o) {
            const timerEl = card.querySelector('.sla-timer');
            if (timerEl) {
                const sla = calculateSla(o.created_at, o.status);
                timerEl.className = `sla-timer ${sla.cssClass}`;
                timerEl.textContent = sla.text;
            }
        }
    });
}

function getStatusBadgeClass(status, isPaid) {
    if (status === 'cancelled') return 'red';
    if (status === 'delivered') return 'green';
    if (status === 'ready') return 'blue';
    if (status === 'preparing') return 'orange';
    if (status === 'pending_payment') return 'yellow';
    return isPaid ? 'green' : 'yellow';
}

function getStatusLabel(status, isPaid) {
    if (status === 'cancelled') return 'CANCELADO';
    if (status === 'pending_payment') return '📱 EN ESPERA DE COBRO';
    const dict = {
        ordered: 'NUEVO',
        preparing: 'PREPARANDO',
        ready: 'LISTO EN BARRA',
        delivered: 'ENTREGADO'
    };
    const label = dict[status] || status.toUpperCase();
    return isPaid ? `✓ COBRADO · ${label}` : label;
}

function getPaymentMethodIcon(m) {
    switch (m) {
        case 'efectivo': return '💵';
        case 'transferencia': return '📱';
        case 'debito': case 'credito': return '💳';
        default: return '💰';
    }
}

function attachCardEvents(container) {
    // 1. Procesar Cobro Directo
    container.querySelectorAll('.btn--payment').forEach(btn => {
        btn.addEventListener('click', async () => {
            const orderId = btn.dataset.id;
            const method = btn.dataset.method;
            btn.disabled = true;

            try {
                await orderService.processPayment(orderId, method);
                showToast({ 
                    message: `💰 ¡Cobro registrado con éxito (${method.toUpperCase()}) y comanda enviada a cocina!`, 
                    type: 'success' 
                });
                await loadData();
                updateView(container);
            } catch (err) {
                showToast({ message: 'Error al procesar cobro: ' + err.message, type: 'error' });
                btn.disabled = false;
            }
        });
    });

    // 2. Enviar a Cocina sin cobrar (Aprobación rápida de autopedido)
    container.querySelectorAll('.btn--approve-kitchen').forEach(btn => {
        btn.addEventListener('click', async () => {
            const orderId = btn.dataset.id;
            try {
                await orderService.approveOrder(orderId);
                showToast({ message: '⚡ ¡Comanda enviada a cocina para preparar!', type: 'success' });
                await loadData();
                updateView(container);
            } catch (err) {
                showToast({ message: 'Error enviando a cocina: ' + err.message, type: 'error' });
            }
        });
    });

    // 3. Rectificar Método de Pago
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

    // 4. Abrir Ticket Térmico / Modal
    container.querySelectorAll('.btn-view-ticket').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.dataset.id;
            const order = allTodaysOrders.find(o => o.id === orderId);
            if (!order) return;
            selectedOrderForTicket = order;
            populateAndOpenTicket(container, order);
        });
    });

    // 5. Abrir Modal de Cancelación con Motivo
    container.querySelectorAll('.btn-open-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.dataset.id;
            const order = allTodaysOrders.find(o => o.id === orderId);
            if (!order) return;
            selectedOrderForCancel = order;

            const modal = container.querySelector('#cancel-modal');
            container.querySelector('#cancel-order-title').textContent = `Pedido #${order.order_number} (${order.customer_name || 'Cliente'})`;
            container.querySelector('#cancel-reason-select').value = 'Cliente desistió / demora';
            container.querySelector('#custom-reason-wrap').style.display = 'none';
            container.querySelector('#cancel-custom-reason').value = '';
            modal?.classList.remove('hidden');
        });
    });
}

function bindStaticEvents(container) {
    // 1. Selector de Pestañas
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            updateView(container);
        });
    });

    // 2. Toolbar: Búsqueda con debounce
    let searchTimer = null;
    container.querySelector('#ordenes-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            filterState.search = e.target.value;
            updateView(container);
        }, 200);
    });

    // 3. Toolbar: Filtro por medio de pago
    container.querySelector('#ordenes-filter-payment')?.addEventListener('change', (e) => {
        filterState.paymentMethod = e.target.value;
        updateView(container);
    });

    // 4. Toolbar: Ordenamiento
    container.querySelector('#ordenes-sort')?.addEventListener('change', (e) => {
        filterState.sort = e.target.value;
        updateView(container);
    });

    // 5. Botón Refrescar Manual
    container.querySelector('#btn-refresh-orders')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-refresh-orders');
        btn.disabled = true;
        btn.textContent = '⏳ Actualizando...';
        await loadData();
        updateView(container);
        showToast({ message: 'Comandas sincronizadas', type: 'info' });
        btn.disabled = false;
        btn.innerHTML = '🔄 Refrescar';
    });

    // 6. Modal Ticket Térmico: Cerrar e Imprimir
    const ticketModal = container.querySelector('#ticket-modal');
    container.querySelector('#btn-close-ticket')?.addEventListener('click', () => ticketModal?.classList.add('hidden'));
    container.querySelector('#btn-cancel-ticket')?.addEventListener('click', () => ticketModal?.classList.add('hidden'));
    container.querySelector('#btn-do-print')?.addEventListener('click', () => {
        window.print();
    });

    // 7. Modal Cancelar: Manejo de motivo personalizado y confirmación
    const cancelModal = container.querySelector('#cancel-modal');
    container.querySelector('#btn-close-cancel')?.addEventListener('click', () => cancelModal?.classList.add('hidden'));
    container.querySelector('#btn-cancel-abort')?.addEventListener('click', () => cancelModal?.classList.add('hidden'));

    const reasonSelect = container.querySelector('#cancel-reason-select');
    const customWrap = container.querySelector('#custom-reason-wrap');
    reasonSelect?.addEventListener('change', (e) => {
        customWrap.style.display = (e.target.value === 'Otro motivo') ? 'block' : 'none';
    });

    container.querySelector('#btn-confirm-cancel')?.addEventListener('click', async () => {
        if (!selectedOrderForCancel) return;
        const confirmBtn = container.querySelector('#btn-confirm-cancel');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Anulando...';

        let reason = reasonSelect.value;
        if (reason === 'Otro motivo') {
            const custom = container.querySelector('#cancel-custom-reason').value.trim();
            reason = custom ? `Otro: ${custom}` : 'Otro motivo';
        }

        try {
            await orderService.cancelOrder(selectedOrderForCancel.id, reason);
            showToast({ message: `❌ Comanda #${selectedOrderForCancel.order_number} anulada correctamente`, type: 'info' });
            cancelModal.classList.add('hidden');
            selectedOrderForCancel = null;
            await loadData();
            updateView(container);
        } catch (err) {
            showToast({ message: 'Error al anular orden: ' + err.message, type: 'error' });
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirmar Anulación';
        }
    });
}

function populateAndOpenTicket(container, order) {
    const modal = container.querySelector('#ticket-modal');
    const paper = container.querySelector('#ticket-paper-content');
    if (!paper || !modal) return;

    const dateStr = new Date(order.created_at).toLocaleString([], {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const subtotal = order.total || 0;
    const iva10 = Math.round(subtotal / 11);

    paper.innerHTML = `
        <div class="ticket-header-logo">🍔 BURGAME 🍔</div>
        <div style="text-align: center; font-size: 0.72rem; margin-bottom: 0.5rem;">
            Asunción, Paraguay · Experiencia Arcade<br>
            Tel: (0981) BURGAME
        </div>

        <div class="ticket-divider-dashed"></div>

        <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
            <span><strong>Nº PEDIDO:</strong></span>
            <span><strong>#${order.order_number}</strong></span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
            <span>FECHA:</span>
            <span>${dateStr}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
            <span>CLIENTE:</span>
            <span>${order.customer_name || 'Consumidor Final'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem;">
            <span>ORIGEN:</span>
            <span>${order.notes && order.notes.includes('[AUTOPEDIDO]') ? 'AUTOPEDIDO QR' : 'CAJA / SALÓN'}</span>
        </div>

        <div class="ticket-divider-dashed"></div>

        <table class="ticket-table">
            <thead>
                <tr style="border-bottom: 1px dashed #000; font-weight: bold;">
                    <td style="width: 30px;">CANT</td>
                    <td>ARTÍCULO</td>
                    <td style="text-align: right;">TOTAL</td>
                </tr>
            </thead>
            <tbody>
                ${(order.order_items || []).map(item => `
                    <tr>
                        <td style="vertical-align: top;">${item.quantity}</td>
                        <td style="vertical-align: top;">
                            ${item.product_name}
                            ${item.is_combo ? '<br><small>+ Papas & Bebida (Combo)</small>' : ''}
                        </td>
                        <td style="text-align: right; vertical-align: top; white-space: nowrap;">
                            ${formatGs(item.price * item.quantity)}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        ${order.notes ? `
            <div class="ticket-divider-dashed"></div>
            <div style="font-size: 0.75rem;">
                <strong>OBSERVACIONES:</strong><br>
                ${order.notes}
            </div>
        ` : ''}

        <div class="ticket-divider-double"></div>

        <div style="display: flex; justify-content: space-between; font-size: 0.88rem; font-weight: bold; margin-bottom: 0.2rem;">
            <span>TOTAL A PAGAR:</span>
            <span>${formatGs(order.total)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #333;">
            <span>LIQUIDACIÓN IVA (10%):</span>
            <span>${formatGs(iva10)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: #333;">
            <span>MEDIO DE PAGO:</span>
            <span>${(order.payment_method || 'PENDIENTE').toUpperCase()}</span>
        </div>

        <div class="ticket-divider-dashed"></div>

        <div style="text-align: center; font-size: 0.72rem; margin-top: 0.6rem;">
            ¡Gracias por jugar en Burgame!<br>
            ⭐⭐⭐⭐⭐<br>
            www.burgame.com.py
        </div>
    `;

    modal.classList.remove('hidden');
}

function setText(container, selector, value) {
    const el = container.querySelector(selector);
    if (el) el.textContent = value;
}
