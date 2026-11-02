import { orderService } from '../services/order-service.js';
import { calculateKitchenPerformance, ensureChartJS } from '../services/report-service.js';
import { exportKitchenTimesExcel } from '../services/excel-export-service.js';
import { showToast } from '../components/toast.js';
import {
    getParaguayToday,
    getParaguayIsoRange,
    getParaguayPresetRange,
    formatParaguayDate,
    formatParaguayTime
} from '../utils/date-utils.js';

// ============================================================
// Estado Local del Monitor de Cocina
// ============================================================
let activeViewTab = 'live'; // 'live' | 'audit'
let selectedPeriod = 'today'; // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
let customStartDate = '';
let customEndDate = '';

let liveOrders = [];
let liveSubFilter = 'all'; // 'all' | 'ordered' | 'preparing' | 'ready' | 'late'

let auditOrders = [];
let auditKitchenData = null;
let auditFilterDelay = 'all'; // 'all' | 'optimal' | 'normal' | 'delayed' | 'critical'
let auditSearch = '';
let auditPage = 1;
const AUDIT_PAGE_SIZE = 15;

let hourlyChartInstance = null;
let liveTimerInterval = null;
let realtimeDebounceTimer = null;

// ============================================================
// Función Principal de Renderizado
// ============================================================
export async function renderCocinaMonitorPage() {
    const container = document.createElement('div');
    container.className = 'cocina-monitor-page';

    // Inicializar fechas predeterminadas
    const todayStr = getParaguayToday();
    if (!customStartDate) customStartDate = todayStr;
    if (!customEndDate) customEndDate = todayStr;

    // Render inicial del esqueleto HTML
    container.innerHTML = `
        <!-- Header Superior -->
        <header class="monitor-header">
            <div class="monitor-header__info">
                <h1>
                    <span>🔥</span> MONITOR DE COCINA EN TIEMPO REAL
                </h1>
                <p>Supervisión en vivo de comandas, control de tiempos de espera (SLA), detección de cuellos de botella y exportación a Excel</p>
            </div>
            <div class="monitor-header__actions">
                <span class="monitor-live-badge" id="monitor-live-indicator">
                    <span class="monitor-live-dot"></span> EN VIVO
                </span>
                <button id="btn-monitor-export-excel" class="btn btn--primary" style="font-size: 0.8rem; padding: 0.55rem 0.95rem; display: flex; align-items: center; gap: 0.45rem;">
                    📥 Exportar Excel
                </button>
                <button id="btn-monitor-refresh" class="btn btn--secondary" title="Refrescar datos" style="padding: 0.55rem 0.85rem; font-size: 0.8rem;">
                    🔄 Refrescar
                </button>
            </div>
        </header>

        <!-- Barra de Filtros y Rango de Fechas -->
        <section class="monitor-toolbar">
            <div class="monitor-period-selectors">
                <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-right: 0.25rem;">PERÍODO:</span>
                <button class="monitor-period-btn ${selectedPeriod === 'today' ? 'active' : ''}" data-period="today">🔴 Hoy (En Vivo)</button>
                <button class="monitor-period-btn ${selectedPeriod === 'yesterday' ? 'active' : ''}" data-period="yesterday">Ayer</button>
                <button class="monitor-period-btn ${selectedPeriod === 'week' ? 'active' : ''}" data-period="week">Últimos 7 Días</button>
                <button class="monitor-period-btn ${selectedPeriod === 'month' ? 'active' : ''}" data-period="month">Este Mes</button>
                <button class="monitor-period-btn ${selectedPeriod === 'custom' ? 'active' : ''}" data-period="custom">📅 Personalizado</button>
            </div>

            <div class="monitor-custom-dates" id="monitor-custom-dates-box" style="display: ${selectedPeriod === 'custom' ? 'flex' : 'none'};">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Desde:</span>
                <input type="date" id="monitor-date-from" class="monitor-date-input" value="${customStartDate}">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Hasta:</span>
                <input type="date" id="monitor-date-to" class="monitor-date-input" value="${customEndDate}">
                <button id="btn-apply-custom-dates" class="btn btn--sm btn--secondary" style="padding: 0.35rem 0.65rem; font-size: 0.75rem;">Aplicar</button>
            </div>
        </section>

        <!-- Grid de KPIs Dinámicos -->
        <section id="monitor-kpi-container" class="monitor-kpi-grid">
            <div class="card p-3 text-center" style="grid-column: 1 / -1; color: var(--text-muted);">
                ⏳ Calculando métricas de cocina...
            </div>
        </section>

        <!-- Pestañas de Vista: En Vivo vs Auditoría Histórica -->
        <div class="monitor-tabs">
            <button class="monitor-tab-btn ${activeViewTab === 'live' ? 'active' : ''}" id="tab-monitor-live" data-view="live">
                🔥 COMANDAS EN VIVO <span class="monitor-tab-count" id="badge-live-count">0</span>
            </button>
            <button class="monitor-tab-btn ${activeViewTab === 'audit' ? 'active' : ''}" id="tab-monitor-audit" data-view="audit">
                📊 AUDITORÍA HISTÓRICA & GRÁFICOS <span class="monitor-tab-count" id="badge-audit-count">0</span>
            </button>
        </div>

        <!-- Contenedor del Cuerpo según Pestaña -->
        <main id="monitor-main-content">
            <!-- Se inyecta dinámicamente -->
        </main>
    `;

    // Cargar datos y renderizar
    await loadMonitorData(container);

    // Iniciar temporizador cada 15 segundos para refrescar los relojes en pantalla
    if (liveTimerInterval) clearInterval(liveTimerInterval);
    liveTimerInterval = setInterval(() => {
        updateTickingTimers(container);
    }, 15000);

    // Suscribirse a cambios Realtime de Supabase
    setupRealtimeSubscription(container);

    // Eventos de barra de períodos y acciones
    setupEventListeners(container);

    return container;
}

// ============================================================
// Carga de Datos (En Vivo e Histórico)
// ============================================================
async function loadMonitorData(container) {
    try {
        let fromIso, toIso;
        if (selectedPeriod === 'custom') {
            const range = getParaguayIsoRange(customStartDate, customEndDate);
            fromIso = range.fromIso;
            toIso = range.toIso;
        } else {
            const preset = getParaguayPresetRange(selectedPeriod);
            fromIso = preset.fromIso;
            toIso = preset.toIso;
        }

        // Siempre cargamos las comandas activas para la mesa de control en vivo
        const [activeList, rangeList] = await Promise.all([
            orderService.getActiveKitchenOrders().catch(() => []),
            orderService.getOrdersByDateRange(fromIso, toIso).catch(() => [])
        ]);

        liveOrders = activeList || [];
        auditOrders = rangeList || [];
        auditKitchenData = calculateKitchenPerformance(auditOrders);

        // Actualizar badges de conteo en tabs
        const badgeLive = container.querySelector('#badge-live-count');
        if (badgeLive) badgeLive.textContent = liveOrders.length;
        const badgeAudit = container.querySelector('#badge-audit-count');
        if (badgeAudit) badgeAudit.textContent = auditOrders.length;

        // Renderizar KPIs y la vista actual
        renderKpis(container);
        renderCurrentView(container);
    } catch (err) {
        console.error('Error cargando monitor de cocina:', err);
        showToast({ message: 'Error cargando datos de cocina: ' + err.message, type: 'error' });
    }
}

// ============================================================
// Renderizado de KPIs de Cocina
// ============================================================
function renderKpis(container) {
    const kpiBox = container.querySelector('#monitor-kpi-container');
    if (!kpiBox) return;

    // Métricas en vivo
    const countOrdered = liveOrders.filter(o => o.status === 'ordered').length;
    const countPreparing = liveOrders.filter(o => o.status === 'preparing').length;
    const countReady = liveOrders.filter(o => o.status === 'ready').length;
    const countTotalActive = liveOrders.length;

    // Calcular comandas demoradas activas (>15 min transcurridos)
    const now = Date.now();
    let liveLateCount = 0;
    let liveCriticalCount = 0;
    let liveTotalWaitMin = 0;

    liveOrders.forEach(o => {
        if (!o.created_at) return;
        const mins = Math.max(0, (now - new Date(o.created_at).getTime()) / 60000);
        liveTotalWaitMin += mins;
        if (mins >= 25) liveCriticalCount++;
        else if (mins >= 15) liveLateCount++;
    });

    const liveAvgWait = countTotalActive > 0 ? (liveTotalWaitMin / countTotalActive).toFixed(1) : '0';

    // Métricas históricas del período seleccionado
    const {
        avgTotalMinutes = 0,
        avgQueueMinutes = 0,
        avgCookingMinutes = 0,
        onTimePct = 100,
        delayedPct = 0,
        criticalCount = 0,
        delayedCount = 0,
        totalRealisticOrders = 0
    } = auditKitchenData || {};

    let statusText = '🟢 Ritmo Óptimo';
    let statusClass = 'monitor-kpi-card__value--success';
    if (liveCriticalCount > 0 || (countTotalActive > 8 && countPreparing > 4)) {
        statusText = '🔴 Cuello de Botella';
        statusClass = 'monitor-kpi-card__value--danger';
    } else if (liveLateCount > 0 || countTotalActive > 5) {
        statusText = '🟠 Con Demoras';
        statusClass = 'monitor-kpi-card__value--warning';
    }

    kpiBox.innerHTML = `
        <div class="monitor-kpi-card">
            <div class="monitor-kpi-card__header">
                <span>Comandas en Cocina</span>
                <span>🍳 EN VIVO</span>
            </div>
            <div class="monitor-kpi-card__value monitor-kpi-card__value--gold">
                ${countTotalActive} <span style="font-size: 0.95rem; font-weight: 600; color: var(--text-muted);">activas</span>
            </div>
            <div class="monitor-kpi-card__subtext">
                ⚡ ${countOrdered} en cola | 🔥 ${countPreparing} en plancha | ✅ ${countReady} listas
            </div>
        </div>

        <div class="monitor-kpi-card">
            <div class="monitor-kpi-card__header">
                <span>Espera Promedio Actual</span>
                <span>⏱️ TIEMPO REAL</span>
            </div>
            <div class="monitor-kpi-card__value ${Number(liveAvgWait) >= 25 ? 'monitor-kpi-card__value--danger' : (Number(liveAvgWait) >= 15 ? 'monitor-kpi-card__value--warning' : 'monitor-kpi-card__value--success')}">
                ${liveAvgWait} <span style="font-size: 0.95rem; font-weight: 600;">min</span>
            </div>
            <div class="monitor-kpi-card__subtext">
                Meta estándar: &lt; 15 min por comanda
            </div>
        </div>

        <div class="monitor-kpi-card">
            <div class="monitor-kpi-card__header">
                <span>Comandas Demoradas</span>
                <span>⚠️ ALERTA SLA</span>
            </div>
            <div class="monitor-kpi-card__value ${liveLateCount + liveCriticalCount > 0 ? 'monitor-kpi-card__value--danger' : 'monitor-kpi-card__value--success'}">
                ${liveLateCount + liveCriticalCount} <span style="font-size: 0.95rem; font-weight: 600;">pedidos</span>
            </div>
            <div class="monitor-kpi-card__subtext">
                🚨 ${liveCriticalCount} críticas (&gt;25m) | ⚠️ ${liveLateCount} advertencia (15-25m)
            </div>
        </div>

        <div class="monitor-kpi-card">
            <div class="monitor-kpi-card__header">
                <span>Estado de Cocina</span>
                <span>⚡ FLUJO</span>
            </div>
            <div class="monitor-kpi-card__value ${statusClass}" style="font-size: 1.25rem; font-family: var(--font-title); letter-spacing: 0.5px;">
                ${statusText}
            </div>
            <div class="monitor-kpi-card__subtext">
                Histórico período: ${avgTotalMinutes}m prom. (${onTimePct}% dentro de meta)
            </div>
        </div>
    `;
}

// ============================================================
// Renderizado del Contenido Principal (Tabs)
// ============================================================
function renderCurrentView(container) {
    const main = container.querySelector('#monitor-main-content');
    if (!main) return;

    if (activeViewTab === 'live') {
        renderLiveView(main, container);
    } else {
        renderAuditView(main, container);
    }
}

// ============================================================
// VISTA 1: COMANDAS EN VIVO (Mesa de Control en Tiempo Real)
// ============================================================
function renderLiveView(main, container) {
    const now = Date.now();

    // Filtrar comandas según subfiltro
    let filtered = [...liveOrders];
    if (liveSubFilter === 'ordered') {
        filtered = filtered.filter(o => o.status === 'ordered');
    } else if (liveSubFilter === 'preparing') {
        filtered = filtered.filter(o => o.status === 'preparing');
    } else if (liveSubFilter === 'ready') {
        filtered = filtered.filter(o => o.status === 'ready');
    } else if (liveSubFilter === 'late') {
        filtered = filtered.filter(o => {
            const mins = (now - new Date(o.created_at).getTime()) / 60000;
            return mins >= 15 && o.status !== 'delivered';
        });
    }

    // Contadores para los botones de subfiltro
    const countAll = liveOrders.length;
    const countOrdered = liveOrders.filter(o => o.status === 'ordered').length;
    const countPreparing = liveOrders.filter(o => o.status === 'preparing').length;
    const countReady = liveOrders.filter(o => o.status === 'ready').length;
    const countLate = liveOrders.filter(o => {
        const mins = (now - new Date(o.created_at).getTime()) / 60000;
        return mins >= 15 && o.status !== 'delivered';
    }).length;

    main.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.25rem;">
            <div class="monitor-live-subfilters">
                <button class="monitor-subfilter-btn ${liveSubFilter === 'all' ? 'active' : ''}" data-subfilter="all">
                    Todas (${countAll})
                </button>
                <button class="monitor-subfilter-btn ${liveSubFilter === 'ordered' ? 'active' : ''}" data-subfilter="ordered">
                    ⚡ En Cola (${countOrdered})
                </button>
                <button class="monitor-subfilter-btn ${liveSubFilter === 'preparing' ? 'active' : ''}" data-subfilter="preparing">
                    🔥 En Plancha (${countPreparing})
                </button>
                <button class="monitor-subfilter-btn ${liveSubFilter === 'ready' ? 'active' : ''}" data-subfilter="ready">
                    ✅ Listas para Despacho (${countReady})
                </button>
                <button class="monitor-subfilter-btn ${liveSubFilter === 'late' ? 'active' : ''}" data-subfilter="late" style="${countLate > 0 ? 'color: var(--color-danger); border-color: var(--color-danger);' : ''}">
                    ⚠️ Demoradas &gt;15m (${countLate})
                </button>
            </div>
            <div style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
                🔄 Actualización continua en tiempo real
            </div>
        </div>

        <div class="monitor-orders-grid">
            ${filtered.length === 0 ? renderEmptyLiveState() : filtered.map(order => renderTicketCard(order)).join('')}
        </div>
    `;

    // Adjuntar eventos a las acciones de los tickets
    attachTicketActions(main, container);

    // Eventos de subfiltros
    main.querySelectorAll('.monitor-subfilter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            liveSubFilter = e.currentTarget.dataset.subfilter;
            renderLiveView(main, container);
        });
    });
}

function renderEmptyLiveState() {
    return `
        <div class="monitor-empty-state">
            <div class="monitor-empty-icon">🎉</div>
            <h3 class="monitor-empty-title">¡COCINA AL DÍA!</h3>
            <p class="monitor-empty-desc">
                No hay comandas activas pendientes en este momento. Las nuevas órdenes del salón, delivery o autoservicio aparecerán aquí automáticamente en tiempo real.
            </p>
        </div>
    `;
}

function renderTicketCard(order) {
    const now = Date.now();
    const createdAt = new Date(order.created_at);
    const minsElapsed = Math.max(0, Math.floor((now - createdAt.getTime()) / 60000));

    const isWarning = minsElapsed >= 15 && minsElapsed < 25;
    const isCritical = minsElapsed >= 25;
    const isLate = minsElapsed >= 15;

    let slaClass = 'monitor-sla-badge--optimal';
    let slaLabel = `⏱️ ${minsElapsed}m`;
    if (minsElapsed >= 180) {
        slaClass = 'monitor-sla-badge--late';
        slaLabel = '🚨 +3h (Turno previo)';
    } else if (isCritical) {
        slaClass = 'monitor-sla-badge--late';
        slaLabel = `🚨 ${minsElapsed}m CRÍTICO`;
    } else if (isWarning) {
        slaClass = 'monitor-sla-badge--warning';
        slaLabel = `⚠️ ${minsElapsed}m LENTO`;
    }

    const customerDisplay = cleanCustomerName(order);
    const modality = extractModality(order.notes);
    const orderTimeStr = formatParaguayTime(createdAt);
    const orderNumber = order.id ? String(order.id).slice(-4).toUpperCase() : '---';

    // Desglose de espera
    let timelineHtml = '';
    if (order.preparing_at) {
        const queueMins = Math.max(0, Math.round((new Date(order.preparing_at).getTime() - createdAt.getTime()) / 60000));
        const cookingMins = Math.max(0, Math.round((now - new Date(order.preparing_at).getTime()) / 60000));
        timelineHtml = `
            <div class="monitor-ticket-timeline-split">
                <span class="monitor-timeline-step">⏳ Cola: <strong>${queueMins}m</strong></span>
                <span>•</span>
                <span class="monitor-timeline-step">🔥 Plancha: <strong>${cookingMins}m</strong></span>
            </div>
        `;
    } else {
        timelineHtml = `
            <div class="monitor-ticket-timeline-split">
                <span class="monitor-timeline-step" style="color: var(--color-warning);">⏳ En espera de inicio de plancha (${minsElapsed}m)</span>
            </div>
        `;
    }

    // Botones de acción según estado
    let actionButtonsHtml = '';
    if (order.status === 'ordered') {
        actionButtonsHtml = `
            <button class="monitor-btn-action monitor-btn-action--start btn-advance-order" data-id="${order.id}" data-next="preparing">
                🔥 Iniciar Plancha
            </button>
        `;
    } else if (order.status === 'preparing') {
        actionButtonsHtml = `
            <button class="monitor-btn-action monitor-btn-action--ready btn-advance-order" data-id="${order.id}" data-next="ready">
                ✅ Marcar Listo
            </button>
        `;
    } else if (order.status === 'ready') {
        actionButtonsHtml = `
            <button class="monitor-btn-action monitor-btn-action--deliver btn-advance-order" data-id="${order.id}" data-next="delivered">
                🚀 Despachar / Entregar
            </button>
        `;
    }

    const items = order.order_items || [];

    return `
        <div class="monitor-ticket-card monitor-ticket-card--${order.status} ${isLate ? 'monitor-ticket-card--late' : ''}" id="monitor-ticket-${order.id}">
            <!-- Encabezado -->
            <div class="monitor-ticket-header">
                <div>
                    <div class="monitor-ticket-id">#${orderNumber}</div>
                    <div class="monitor-ticket-customer">${customerDisplay}</div>
                    <span class="monitor-ticket-modality">${modality}</span>
                </div>
                <div class="monitor-ticket-timer">
                    <span class="monitor-sla-badge ${slaClass}" data-created="${order.created_at}">
                        ${slaLabel}
                    </span>
                    <span class="monitor-ticket-order-time">🕐 ${orderTimeStr}</span>
                </div>
            </div>

            <!-- Cuerpo del Ticket -->
            <div class="monitor-ticket-body">
                ${timelineHtml}

                <ul class="monitor-ticket-items-list">
                    ${items.map(item => {
                        const noteMatch = item.product_name.match(/\[📌\s*([^\]]+)\]/);
                        const itemNote = noteMatch ? noteMatch[1] : '';
                        const cleanName = item.product_name.replace(/\s*\[📌\s*[^\]]+\]/, '').trim();

                        return `
                            <li class="monitor-ticket-item">
                                <span class="monitor-item-qty">x${item.quantity}</span>
                                <div class="monitor-item-details">
                                    <span class="monitor-item-name">${cleanName}</span>
                                    ${itemNote ? `<span class="monitor-item-note">📝 ${itemNote}</span>` : ''}
                                </div>
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>

            <!-- Acciones Operativas -->
            <div class="monitor-ticket-footer">
                ${actionButtonsHtml}
            </div>
        </div>
    `;
}

function attachTicketActions(main, container) {
    main.querySelectorAll('.btn-advance-order').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const orderId = btn.dataset.id;
            const nextStatus = btn.dataset.next;
            const origText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ Guardando...';

            try {
                await orderService.updateStatus(orderId, nextStatus);
                showToast({
                    message: nextStatus === 'preparing' ? '🔥 Comanda pasada a Plancha' : (nextStatus === 'ready' ? '✅ Comanda marcada como Lista en Barra' : '🚀 Comanda entregada exitosamente'),
                    type: 'success'
                });
                await loadMonitorData(container);
            } catch (err) {
                console.error('Error actualizando estado:', err);
                showToast({ message: 'Error al cambiar estado: ' + err.message, type: 'error' });
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        });
    });
}

// ============================================================
// VISTA 2: AUDITORÍA HISTÓRICA & GRÁFICOS (Tiempos de Cocina)
// ============================================================
async function renderAuditView(main, container) {
    if (!auditKitchenData) {
        main.innerHTML = `
            <div class="card p-4 text-center">
                <p>No se encontraron datos de cocina para el período seleccionado.</p>
            </div>
        `;
        return;
    }

    const {
        avgTotalMinutes = 0,
        avgQueueMinutes = 0,
        avgCookingMinutes = 0,
        totalRealisticOrders = 0,
        onTimeCount = 0,
        onTimePct = 0,
        delayedCount = 0,
        criticalCount = 0,
        delayedPct = 0,
        topBottleneckProducts = [],
        diagnosis = [],
        orderTimes = []
    } = auditKitchenData;

    // Filtrar auditoría por nivel de demora y búsqueda
    let filteredOrders = orderTimes.filter(o => {
        if (auditFilterDelay !== 'all' && o.delayCategory !== auditFilterDelay) return false;
        if (auditSearch) {
            const q = auditSearch.toLowerCase();
            const num = String(o.id || '').toLowerCase();
            const cust = String(o.customer_name || '').toLowerCase();
            const prods = String(o.productsSummary || o.itemsSummary || '').toLowerCase();
            if (!num.includes(q) && !cust.includes(q) && !prods.includes(q)) return false;
        }
        return true;
    });

    // Paginación
    const totalAuditOrders = filteredOrders.length;
    const totalPages = Math.max(1, Math.ceil(totalAuditOrders / AUDIT_PAGE_SIZE));
    if (auditPage > totalPages) auditPage = totalPages;
    if (auditPage < 1) auditPage = 1;
    const startIdx = (auditPage - 1) * AUDIT_PAGE_SIZE;
    const pageOrders = filteredOrders.slice(startIdx, startIdx + AUDIT_PAGE_SIZE);

    // Formatear Diagnóstico de forma ultra-robusta sin 'undefined'
    const diagHtml = (diagnosis && diagnosis.length > 0) ? diagnosis.map(diag => {
        let icon = '💡';
        let type = 'warning';
        let title = 'Diagnóstico Operativo';
        let desc = '';

        if (typeof diag === 'object' && diag !== null) {
            icon = diag.icon || icon;
            type = diag.type || type;
            title = diag.title || title;
            desc = diag.description || '';
        } else if (typeof diag === 'string') {
            desc = diag;
            if (diag.includes('🚨') || diag.includes('CRÍTICO')) {
                icon = '🚨'; type = 'danger'; title = 'Alerta Crítica de Demora';
            } else if (diag.includes('⚠️') || diag.includes('ATENCIÓN')) {
                icon = '⚠️'; type = 'warning'; title = 'Atención Requerida';
            } else if (diag.includes('✅') || diag.includes('ÓPTIMO')) {
                icon = '✅'; type = 'success'; title = 'Ritmo Operativo Óptimo';
            } else if (diag.includes('⏳') || diag.includes('Cuello de botella')) {
                icon = '⏳'; type = 'warning'; title = 'Demora en Cola Previa';
            } else if (diag.includes('🔥') || diag.includes('saturación')) {
                icon = '🔥'; type = 'danger'; title = 'Franja Horaria de Saturación';
            } else if (diag.includes('🍔')) {
                icon = '🍔'; type = 'warning'; title = 'Plato Crítico en Cocina';
            }
            desc = desc.replace(/^[^\w\s\u00C0-\u017F]+/u, '').trim();
        }

        return `
            <div class="monitor-diagnosis-item monitor-diagnosis-item--${type}">
                <span style="font-size: 1.25rem;">${icon}</span>
                <div>
                    <strong style="display: block; margin-bottom: 0.15rem;">${title}</strong>
                    <span>${desc}</span>
                </div>
            </div>
        `;
    }).join('') : `
        <div class="monitor-diagnosis-item monitor-diagnosis-item--success">
            <span style="font-size: 1.25rem;">✅</span>
            <div>
                <strong>Operación Fluida</strong>
                <span>No se detectaron anomalías severas de demora en la cocina para el período consultado.</span>
            </div>
        </div>
    `;

    // Filtrar para mostrar platos de cocina (excluyendo gaseosas / bebidas)
    const kitchenBottlenecks = (topBottleneckProducts || []).filter(p => !/^(coca|sprite|fanta|agua|cerveza|gaseosa|jugo|bebida|schweppes|heineken|pilsen|budweiser)/i.test(p.name));
    const bottleneckList = kitchenBottlenecks.length > 0 ? kitchenBottlenecks : (topBottleneckProducts || []);

    main.innerHTML = `
        <div class="monitor-audit-section">
            <!-- Barra Superior de la Auditoría con Exportar a Excel -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; background: var(--bg-card); padding: 0.9rem 1.15rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <div>
                    <h3 style="margin: 0 0 0.25rem 0; font-size: 0.95rem; color: var(--color-primary); font-family: var(--font-title);">
                        📊 REPORTE DE TIEMPOS DE COCINA (${selectedPeriod.toUpperCase()})
                    </h3>
                    <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">
                        Total auditado: <strong>${orderTimes.length}</strong> comandas procesadas • <strong>${totalRealisticOrders}</strong> con tiempos cronometrados
                    </p>
                </div>
                <button id="btn-export-audit-table-excel" class="btn btn--primary" style="font-size: 0.8rem; padding: 0.55rem 1rem; display: flex; align-items: center; gap: 0.45rem;">
                    📥 Descargar Reporte Completo en Excel
                </button>
            </div>

            <!-- Gráfico de Horas y Diagnóstico -->
            <div class="monitor-charts-grid">
                <div class="monitor-card">
                    <div class="monitor-card-header">
                        <h4 class="monitor-card-title">
                            <span>⏱️</span> Demora Promedio por Franja Horaria (Cuellos de Botella)
                        </h4>
                        <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">Minutos por pedido</span>
                    </div>
                    <div class="monitor-chart-wrapper">
                        <canvas id="chart-monitor-hourly"></canvas>
                    </div>
                </div>

                <div class="monitor-card">
                    <div class="monitor-card-header">
                        <h4 class="monitor-card-title">
                            <span>💡</span> Diagnóstico Operativo
                        </h4>
                    </div>
                    <div class="monitor-diagnosis-list">
                        ${diagHtml}
                    </div>

                    <!-- Top 4 Hamburguesas / Platos Lentos -->
                    <div style="margin-top: 0.75rem; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">
                            🍔 Platos que más demoran en cocina:
                        </span>
                        <div style="display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.45rem;">
                            ${bottleneckList.slice(0, 4).map((p, idx) => {
                                const avgMin = Math.round(p.avgDelayMinutes || p.avgWaitWhenDelayed || 0);
                                return `
                                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; background: rgba(255,255,255,0.02); padding: 0.35rem 0.55rem; border-radius: 4px; align-items: center;">
                                        <span style="font-weight: 600;">${idx + 1}. ${p.name}</span>
                                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                                            <span style="font-size: 0.7rem; color: var(--text-muted);">(${p.delayedOrders} demoras)</span>
                                            <strong style="color: ${avgMin >= 20 ? 'var(--color-danger)' : 'var(--color-warning)'}; font-family: var(--font-mono);">
                                                ~${avgMin} min
                                            </strong>
                                        </div>
                                    </div>
                                `;
                            }).join('') || '<span style="font-size: 0.75rem; color: var(--text-muted);">Sin platos demorados registrados</span>'}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Filtros de la Tabla de Auditoría -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    <button class="monitor-subfilter-btn btn-audit-filter ${auditFilterDelay === 'all' ? 'active' : ''}" data-delay="all">
                        Todos (${orderTimes.length})
                    </button>
                    <button class="monitor-subfilter-btn btn-audit-filter ${auditFilterDelay === 'optimal' ? 'active' : ''}" data-delay="optimal">
                        🟢 Óptimo &lt;12m
                    </button>
                    <button class="monitor-subfilter-btn btn-audit-filter ${auditFilterDelay === 'normal' ? 'active' : ''}" data-delay="normal">
                        🔵 Normal 12-15m
                    </button>
                    <button class="monitor-subfilter-btn btn-audit-filter ${auditFilterDelay === 'delayed' ? 'active' : ''}" data-delay="delayed" style="color: var(--color-warning);">
                        🟠 Demorado 15-25m (${delayedCount})
                    </button>
                    <button class="monitor-subfilter-btn btn-audit-filter ${auditFilterDelay === 'critical' ? 'active' : ''}" data-delay="critical" style="color: var(--color-danger);">
                        🔴 Crítico &gt;25m (${criticalCount})
                    </button>
                </div>
                <input type="text" id="input-audit-search" placeholder="🔍 Buscar por # comanda, cliente o producto..." value="${auditSearch}" style="background: #000; border: 1px solid var(--border-subtle); color: #fff; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.8rem; width: 280px; max-width: 100%;">
            </div>

            <!-- Tabla de Detalle Comanda por Comanda -->
            <div class="monitor-table-wrapper">
                <table class="monitor-audit-table">
                    <thead>
                        <tr>
                            <th># Comanda</th>
                            <th>Cliente</th>
                            <th>Modalidad</th>
                            <th>Hora Pedido</th>
                            <th>Inicio Plancha</th>
                            <th>Listo en Barra</th>
                            <th style="text-align: center;">Espera Total</th>
                            <th style="text-align: center;">En Cola</th>
                            <th style="text-align: center;">En Plancha</th>
                            <th>Nivel SLA</th>
                            <th>Productos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageOrders.length === 0 ? `
                            <tr>
                                <td colspan="11" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                                    No se encontraron pedidos con los filtros aplicados.
                                </td>
                            </tr>
                        ` : pageOrders.map(row => {
                            const badgeSla = row.delayCategory === 'optimal'
                                ? '<span class="monitor-badge-sla monitor-badge-sla--optimal">🟢 Óptimo (&lt;12m)</span>'
                                : (row.delayCategory === 'normal'
                                    ? '<span class="monitor-badge-sla monitor-badge-sla--normal">🔵 Normal (12-15m)</span>'
                                    : (row.delayCategory === 'delayed'
                                        ? '<span class="monitor-badge-sla monitor-badge-sla--delayed">🟠 Demorado (15-25m)</span>'
                                        : '<span class="monitor-badge-sla monitor-badge-sla--critical">🔴 Crítico (&gt;25m)</span>'));

                            const numStr = row.id ? String(row.id).slice(-4).toUpperCase() : '---';
                            const horaPedido = row.createdAtFormatted || (row.created_at ? formatParaguayTime(row.created_at) : '—');
                            const horaPlancha = row.preparingAtFormatted || (row.preparing_at ? formatParaguayTime(row.preparing_at) : '—');
                            const horaListo = row.readyAtFormatted || (row.ready_at ? formatParaguayTime(row.ready_at) : (row.delivered_at ? formatParaguayTime(row.delivered_at) : '—'));
                            const prods = row.productsSummary || row.itemsSummary || '—';

                            return `
                                <tr>
                                    <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">#${numStr}</strong></td>
                                    <td><strong>${row.customer_name || 'Mesa / Mostrador'}</strong></td>
                                    <td><span style="font-size: 0.72rem; padding: 0.15rem 0.45rem; background: rgba(255,255,255,0.06); border-radius: 3px;">${row.modalityLabel || 'General'}</span></td>
                                    <td style="font-family: var(--font-mono); font-size: 0.78rem;">${horaPedido}</td>
                                    <td style="font-family: var(--font-mono); font-size: 0.78rem; color: ${horaPlancha !== '—' ? '#FFB74D' : 'var(--text-muted)'};">${horaPlancha}</td>
                                    <td style="font-family: var(--font-mono); font-size: 0.78rem; color: ${horaListo !== '—' ? '#00E676' : 'var(--text-muted)'};">${horaListo}</td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-weight: 800; font-size: 0.85rem; color: ${row.totalMinutes >= 25 ? 'var(--color-danger)' : (row.totalMinutes >= 15 ? 'var(--color-warning)' : 'var(--color-success)')};">
                                        ${row.totalMinutes !== null ? `${row.totalMinutes} min` : 'Sin cerrar'}
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">
                                        ${row.queueMinutes !== null ? `${row.queueMinutes}m` : '—'}
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">
                                        ${row.cookingMinutes !== null ? `${row.cookingMinutes}m` : '—'}
                                    </td>
                                    <td>${badgeSla}</td>
                                    <td style="max-width: 250px; font-size: 0.76rem; color: var(--text-dim);" title="${prods}">
                                        ${prods}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <!-- Barra de Paginación -->
                <div class="monitor-pagination" style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: #111; border-top: 1px solid var(--border-subtle); flex-wrap: wrap; gap: 0.75rem;">
                    <span style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
                        Mostrando <strong>${totalAuditOrders > 0 ? startIdx + 1 : 0} - ${Math.min(startIdx + AUDIT_PAGE_SIZE, totalAuditOrders)}</strong> de <strong>${totalAuditOrders}</strong> pedidos · Página <strong>${auditPage}</strong> de <strong>${totalPages}</strong>
                    </span>
                    <div style="display: flex; gap: 0.4rem; align-items: center;">
                        <button class="btn btn--secondary btn--sm" id="btn-audit-prev" ${auditPage <= 1 ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
                            ◀ Anterior
                        </button>
                        <span style="padding: 0.25rem 0.65rem; font-family: var(--font-mono); font-size: 0.8rem; background: #000; border-radius: 4px; border: 1px solid var(--border-subtle); color: var(--color-primary); font-weight: 800;">
                            ${auditPage} / ${totalPages}
                        </span>
                        <button class="btn btn--secondary btn--sm" id="btn-audit-next" ${auditPage >= totalPages ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>
                            Siguiente ▶
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Botón de exportación dentro de la auditoría
    main.querySelector('#btn-export-audit-table-excel')?.addEventListener('click', async () => {
        await executeExcelExport(container);
    });

    // Paginación anterior / siguiente
    main.querySelector('#btn-audit-prev')?.addEventListener('click', () => {
        if (auditPage > 1) {
            auditPage--;
            renderAuditView(main, container);
        }
    });

    main.querySelector('#btn-audit-next')?.addEventListener('click', () => {
        if (auditPage < totalPages) {
            auditPage++;
            renderAuditView(main, container);
        }
    });

    // Filtros de nivel de demora
    main.querySelectorAll('.btn-audit-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            auditFilterDelay = e.currentTarget.dataset.delay;
            auditPage = 1;
            renderAuditView(main, container);
        });
    });

    // Buscador interactivo
    let searchDebounce = null;
    main.querySelector('#input-audit-search')?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            auditSearch = e.target.value;
            auditPage = 1;
            renderAuditView(main, container);
        }, 200);
    });

    // Renderizar gráfico interactivo de barras
    await initHourlyChart(auditKitchenData);
}

async function initHourlyChart(kitchenData) {
    try {
        const ChartClass = await ensureChartJS();
        if (!ChartClass) return;

        const canvas = document.getElementById('chart-monitor-hourly');
        if (!canvas) return;

        if (hourlyChartInstance) {
            hourlyChartInstance.destroy();
            hourlyChartInstance = null;
        }

        const hourlyMap = kitchenData.hourlyMap || [];
        // Filtrar franjas horarias con pedidos o turno noche (18:00 a 00:00)
        const activeHours = hourlyMap.filter(h => h.count > 0 || (h.hour >= 18 && h.hour <= 23));
        const labels = activeHours.map(h => h.label);
        const avgData = activeHours.map(h => h.avgMinutes);

        hourlyChartInstance = new ChartClass(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Tiempo Promedio (Minutos)',
                        data: avgData,
                        backgroundColor: avgData.map(v => v >= 25 ? 'rgba(255, 61, 113, 0.85)' : (v >= 15 ? 'rgba(255, 145, 0, 0.85)' : 'rgba(0, 230, 118, 0.85)')),
                        borderColor: avgData.map(v => v >= 25 ? '#FF3D71' : (v >= 15 ? '#FF9100' : '#00E676')),
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#8E9BAE', font: { family: 'JetBrains Mono', size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Demora promedio: ${ctx.parsed.y} minutos`,
                            afterLabel: (ctx) => {
                                const h = activeHours[ctx.dataIndex];
                                return `Comandas preparadas: ${h.count}\nDemoradas (>15m): ${h.delayedCount + h.criticalCount}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8E9BAE', font: { family: 'JetBrains Mono', size: 10 } },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    },
                    y: {
                        ticks: {
                            color: '#8E9BAE',
                            font: { family: 'JetBrains Mono', size: 10 },
                            callback: (v) => `${v}m`
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (err) {
        console.warn('Error inicializando gráfico de cocina:', err);
    }
}

// ============================================================
// Exportación a Excel
// ============================================================
async function executeExcelExport(container) {
    if (!auditKitchenData) {
        showToast({ message: 'No hay datos de cocina cargados para exportar', type: 'warning' });
        return;
    }

    const btn1 = container.querySelector('#btn-monitor-export-excel');
    const btn2 = container.querySelector('#btn-export-audit-table-excel');
    const orig1 = btn1 ? btn1.innerHTML : '';
    const orig2 = btn2 ? btn2.innerHTML : '';

    if (btn1) { btn1.disabled = true; btn1.innerHTML = '⏳ Exportando Excel...'; }
    if (btn2) { btn2.disabled = true; btn2.innerHTML = '⏳ Exportando Excel...'; }

    try {
        let periodLabel = selectedPeriod;
        if (selectedPeriod === 'custom') {
            periodLabel = `${customStartDate}_al_${customEndDate}`;
        }
        await exportKitchenTimesExcel(auditKitchenData, periodLabel);
        showToast({ message: '✅ Auditoría de Tiempos de Cocina exportada a Excel', type: 'success' });
    } catch (err) {
        console.error('Error exportando Excel:', err);
        showToast({ message: 'Error al exportar Excel: ' + err.message, type: 'error' });
    } finally {
        if (btn1) { btn1.disabled = false; btn1.innerHTML = orig1; }
        if (btn2) { btn2.disabled = false; btn2.innerHTML = orig2; }
    }
}

// ============================================================
// Actualización Continua de Relojes SLA (sin recargar DB)
// ============================================================
function updateTickingTimers(container) {
    const now = Date.now();
    const badges = container.querySelectorAll('.monitor-sla-badge');
    badges.forEach(badge => {
        const createdStr = badge.dataset.created;
        if (!createdStr) return;
        const mins = Math.max(0, Math.floor((now - new Date(createdStr).getTime()) / 60000));

        const isWarning = mins >= 15 && mins < 25;
        const isCritical = mins >= 25;

        badge.className = 'monitor-sla-badge ' + (isCritical ? 'monitor-sla-badge--late' : (isWarning ? 'monitor-sla-badge--warning' : 'monitor-sla-badge--optimal'));
        if (mins >= 180) {
            badge.textContent = '🚨 +3h (Turno previo)';
        } else {
            badge.textContent = isCritical ? `🚨 ${mins}m CRÍTICO` : (isWarning ? `⚠️ ${mins}m LENTO` : `⏱️ ${mins}m`);
        }
    });
}

// ============================================================
// Suscripción Realtime con Supabase
// ============================================================
function setupRealtimeSubscription(container) {
    orderService.subscribeToOrders(() => {
        if (realtimeDebounceTimer) clearTimeout(realtimeDebounceTimer);
        realtimeDebounceTimer = setTimeout(async () => {
            realtimeDebounceTimer = null;
            await loadMonitorData(container);
        }, 400);
    });
}

// ============================================================
// Manejadores de Eventos
// ============================================================
function setupEventListeners(container) {
    // Exportar Excel
    container.querySelector('#btn-monitor-export-excel')?.addEventListener('click', async () => {
        await executeExcelExport(container);
    });

    // Refrescar
    container.querySelector('#btn-monitor-refresh')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-monitor-refresh');
        if (btn) btn.innerHTML = '⏳ Refrescando...';
        await loadMonitorData(container);
        if (btn) btn.innerHTML = '🔄 Refrescar';
        showToast({ message: 'Datos de cocina actualizados', type: 'info' });
    });

    // Selector de Pestañas de Vista (En Vivo vs Auditoría)
    container.querySelector('#tab-monitor-live')?.addEventListener('click', () => {
        activeViewTab = 'live';
        container.querySelector('#tab-monitor-live')?.classList.add('active');
        container.querySelector('#tab-monitor-audit')?.classList.remove('active');
        renderCurrentView(container);
    });

    container.querySelector('#tab-monitor-audit')?.addEventListener('click', () => {
        activeViewTab = 'audit';
        container.querySelector('#tab-monitor-audit')?.classList.add('active');
        container.querySelector('#tab-monitor-live')?.classList.remove('active');
        renderCurrentView(container);
    });

    // Selectores de Período
    container.querySelectorAll('.monitor-period-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const period = e.currentTarget.dataset.period;
            selectedPeriod = period;
auditPage = 1;

            container.querySelectorAll('.monitor-period-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const customBox = container.querySelector('#monitor-custom-dates-box');
            if (customBox) {
                customBox.style.display = period === 'custom' ? 'flex' : 'none';
            }

            if (period !== 'custom') {
                await loadMonitorData(container);
            }
        });
    });

    // Aplicar Rango Personalizado
    container.querySelector('#btn-apply-custom-dates')?.addEventListener('click', async () => {
        const fromVal = container.querySelector('#monitor-date-from')?.value;
        const toVal = container.querySelector('#monitor-date-to')?.value;
        if (!fromVal || !toVal) {
            showToast({ message: 'Seleccione fecha desde y hasta', type: 'warning' });
            return;
        }
        customStartDate = fromVal;
        customEndDate = toVal;
auditPage = 1;
        await loadMonitorData(container);
        showToast({ message: `Rango aplicado: ${customStartDate} al ${customEndDate}`, type: 'info' });
    });
}

// ============================================================
// Utilidades de Limpieza
// ============================================================
function cleanCustomerName(order) {
    if (order.customer_name && order.customer_name.trim()) {
        return order.customer_name.trim();
    }
    if (order.notes) {
        const match = order.notes.match(/\[Cliente:\s*([^\]]+)\]/i);
        if (match) return match[1].trim();
    }
    return 'Mesa / Mostrador';
}

function extractModality(notes) {
    if (!notes) return '🍽️ Salón';
    const n = notes.toUpperCase();
    if (n.includes('LLEVAR') || n.includes('RETIR')) return '🛍️ Llevar';
    if (n.includes('DELIVERY')) return '🛵 Delivery';
    return '🍽️ Salón';
}
