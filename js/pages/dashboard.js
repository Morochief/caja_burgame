import { reportService } from '../services/report-service.js';
import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { customerService } from '../services/customer-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let activePeriod = '30d'; // 'today' | '7d' | '30d' | 'month' | 'custom'
let chartSalesTrend = null;
let chartIncomeVsExpense = null;
let chartHourly = null;
let chartPayments = null;

let lastSyncTime = null;

export async function renderDashboardPage() {
    const container = document.createElement('div');
    container.className = 'dashboard-page';

    container.innerHTML = `
        <!-- Cabecera Ejecutiva -->
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.5rem;">
            <div class="page-header__info">
                <h1 style="display: flex; align-items: center; gap: 0.6rem;">
                    🎮 BURGAME EXECUTIVE DASHBOARD & COCKPIT
                </h1>
                <p>Centro de mando directivo, arqueo de caja en vivo, tendencias y salud operacional</p>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <div class="dash-sync-info">
                    <span id="dash-sync-clock">🕒 Sincronizando...</span>
                </div>
            </div>
        </header>

        <!-- Barra de Acciones Rápidas (Executive Speed Dial) -->
        <div class="dash-action-bar">
            <div class="dash-action-buttons">
                <a href="#/pos" class="btn btn--primary dash-btn-action" style="box-shadow: 0 0 10px var(--color-primary-glow);">
                    🛒 Nueva Venta (POS)
                </a>
                <a href="#/cocina" class="btn btn--secondary dash-btn-action" id="dash-kds-btn">
                    👨‍🍳 Cocina KDS <span class="badge badge--yellow" id="dash-kds-count" style="margin-left: 0.3rem;">0</span>
                </a>
                <a href="#/caja" class="btn btn--secondary dash-btn-action">
                    💵 Arqueo / Caja
                </a>
                <a href="#/gastos" class="btn btn--secondary dash-btn-action">
                    💸 Registrar Gasto
                </a>
                <a href="#/reportes" class="btn btn--secondary dash-btn-action">
                    📈 Reportes BI
                </a>
            </div>
            <div>
                <button id="btn-dash-refresh" class="btn btn--secondary btn--sm" style="font-weight: 700; font-size: 0.8rem; display: flex; align-items: center; gap: 0.4rem;">
                    🔄 Actualizar Ahora
                </button>
            </div>
        </div>

        <!-- Mando Operacional en Vivo: Turno de Caja Activo (War Room) -->
        <div id="dash-live-shift-container">
            <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
        </div>

        <!-- Barra de Filtros de Período -->
        <div class="period-filter-bar">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary); display: flex; align-items: center; gap: 0.4rem;">
                📅 Período de Análisis:
            </span>
            <button class="period-filter-btn ${activePeriod === 'today' ? 'active' : ''}" data-period="today">Hoy</button>
            <button class="period-filter-btn ${activePeriod === '7d' ? 'active' : ''}" data-period="7d">Últimos 7 Días</button>
            <button class="period-filter-btn ${activePeriod === '30d' ? 'active' : ''}" data-period="30d">Últimos 30 Días</button>
            <button class="period-filter-btn ${activePeriod === 'month' ? 'active' : ''}" data-period="month">Este Mes</button>
            <button class="period-filter-btn ${activePeriod === 'custom' ? 'active' : ''}" data-period="custom">Personalizado</button>

            <div id="dash-custom-range" class="custom-range-inputs" style="display: ${activePeriod === 'custom' ? 'inline-flex' : 'none'};">
                <input type="date" id="dash-date-from">
                <span style="color: var(--text-muted);">a</span>
                <input type="date" id="dash-date-to">
                <button class="btn btn--secondary btn--sm" id="btn-apply-dash-range" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">Filtrar</button>
            </div>
        </div>

        <!-- Tarjetas KPI Principales con Comparativa de Crecimiento (Growth Trends) -->
        <div class="dashboard-grid">
            <div class="stat-card stat-card--neon">
                <div class="stat-card-header-row">
                    <span class="stat-card__title">💰 Facturación del Período</span>
                    <span id="dash-sales-trend-badge" class="trend-badge trend-badge--neutral">...</span>
                </div>
                <span class="stat-card__value" id="dash-sales">⏳</span>
                <span class="stat-card__subtitle" id="dash-orders">Cargando datos...</span>
            </div>

            <div class="stat-card stat-card--red">
                <div class="stat-card-header-row">
                    <span class="stat-card__title">💸 Gastos Totales</span>
                    <span id="dash-expenses-trend-badge" class="trend-badge trend-badge--neutral">...</span>
                </div>
                <span class="stat-card__value" id="dash-expenses">⏳</span>
                <span class="stat-card__subtitle" id="dash-expenses-count">...</span>
            </div>

            <div class="stat-card stat-card--green">
                <div class="stat-card-header-row">
                    <span class="stat-card__title">📈 Margen Neto</span>
                    <span id="dash-net-trend-badge" class="trend-badge trend-badge--neutral">...</span>
                </div>
                <span class="stat-card__value" id="dash-net">⏳</span>
                <span class="stat-card__subtitle" id="dash-margin">Rentabilidad neta</span>
            </div>

            <div class="stat-card stat-card--yellow">
                <div class="stat-card-header-row">
                    <span class="stat-card__title">🍔 Ticket Promedio</span>
                    <span id="dash-ticket-trend-badge" class="trend-badge trend-badge--neutral">...</span>
                </div>
                <span class="stat-card__value" id="dash-avg-ticket">⏳</span>
                <span class="stat-card__subtitle" id="dash-active-turn">Cocina activa</span>
            </div>
        </div>

        <!-- Grilla de Gráficos Analíticos (Chart.js 4) -->
        <div class="charts-grid">
            <!-- 1. Tendencia y Crecimiento de Ventas en el Tiempo -->
            <div class="chart-card" style="grid-column: 1 / -1;">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">📈 Evolución y Crecimiento de Facturación Diaria</h3>
                    <span class="chart-card__subtitle">Tendencia de ingresos en Guaraníes</span>
                </div>
                <div class="chart-container-wrapper" style="height: 280px;">
                    <canvas id="chart-sales-trend"></canvas>
                </div>
            </div>

            <!-- 2. Comparativo Ventas vs Gastos -->
            <div class="chart-card">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">⚖️ Ingresos vs. Gastos</h3>
                    <span class="chart-card__subtitle">Control de egresos y balance neto</span>
                </div>
                <div class="chart-container-wrapper">
                    <canvas id="chart-income-vs-expense"></canvas>
                </div>
            </div>

            <!-- 3. Horas Pico de Ventas -->
            <div class="chart-card">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">🕒 Demanda de Cocina (Horas Pico)</h3>
                    <span class="chart-card__subtitle">Concentración horaria de pedidos (00h a 23h)</span>
                </div>
                <div class="chart-container-wrapper">
                    <canvas id="chart-hourly"></canvas>
                </div>
            </div>

            <!-- 4. Medios de Pago -->
            <div class="chart-card">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">💳 Medios de Pago Utilizados</h3>
                    <span class="chart-card__subtitle">Participación porcentual y volumen en Gs.</span>
                </div>
                <div class="chart-container-wrapper" style="max-height: 250px;">
                    <canvas id="chart-payments"></canvas>
                </div>
            </div>

            <!-- 5. Top Productos Preparados -->
            <div class="chart-card">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">🍔 Ranking de Productos Más Vendidos</h3>
                    <span class="chart-card__subtitle">En el período seleccionado</span>
                </div>
                <div id="dash-top-products" class="stock-list" style="max-height: 260px; overflow-y: auto;">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>
        </div>

        <!-- Secciones Operacionales (Stock Crítico y Club Burgame) -->
        <div class="dashboard-sections" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 1rem;">
            <!-- Radar de Stock Crítico -->
            <div class="card dashboard-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-danger); margin: 0;">
                        ⚠️ Radar de Stock e Inventario
                    </h3>
                    <a href="#/inventario" class="btn btn--secondary btn--sm" style="font-size: 0.75rem; padding: 0.25rem 0.55rem;">
                        Gestionar
                    </a>
                </div>
                <div id="dash-low-stock">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>

            <!-- Radar de Socios del Club Burgame -->
            <div class="card dashboard-card dashboard-card--club">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin: 0;">
                        👑 Club Burgame Radar
                    </h3>
                    <a href="#/club" class="btn btn--secondary btn--sm" style="font-size: 0.75rem; padding: 0.25rem 0.55rem;">
                        Padrón Oficial
                    </a>
                </div>
                <div id="dash-club">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    setupDashboardEvents(container);
    loadDashboardData(container);

    return container;
}

function setupDashboardEvents(container) {
    // Botones de filtro de período
    container.querySelectorAll('.period-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            activePeriod = period;
            container.querySelectorAll('.period-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const customBox = container.querySelector('#dash-custom-range');
            if (period === 'custom') {
                if (customBox) customBox.style.display = 'inline-flex';
            } else {
                if (customBox) customBox.style.display = 'none';
                loadDashboardData(container);
            }
        });
    });

    // Botón aplicar filtro personalizado
    container.querySelector('#btn-apply-dash-range')?.addEventListener('click', () => {
        loadDashboardData(container);
    });

    // Botón de actualización manual
    container.querySelector('#btn-dash-refresh')?.addEventListener('click', () => {
        showToast({ message: '🔄 Actualizando métricas del dashboard...', type: 'info' });
        loadDashboardData(container);
    });
}

// Calcula los rangos de fecha actual y el período equivalente anterior para medir crecimiento
function getComparisonRanges(period, container) {
    let from = new Date();
    let to = new Date();
    let prevFrom = new Date();
    let prevTo = new Date();

    if (period === 'today') {
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);

        // Período anterior: Ayer
        prevFrom.setDate(prevFrom.getDate() - 1);
        prevFrom.setHours(0, 0, 0, 0);
        prevTo.setDate(prevTo.getDate() - 1);
        prevTo.setHours(23, 59, 59, 999);
    } else if (period === '7d') {
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);

        // Período anterior: 7 a 14 días atrás
        prevFrom.setDate(prevFrom.getDate() - 14);
        prevFrom.setHours(0, 0, 0, 0);
        prevTo.setDate(prevTo.getDate() - 7);
        prevTo.setHours(23, 59, 59, 999);
    } else if (period === '30d') {
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);

        // Período anterior: 30 a 60 días atrás
        prevFrom.setDate(prevFrom.getDate() - 60);
        prevFrom.setHours(0, 0, 0, 0);
        prevTo.setDate(prevTo.getDate() - 30);
        prevTo.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
        const now = new Date();
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        from.setHours(0, 0, 0, 0);

        // Período anterior: Mes pasado completo
        prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevFrom.setHours(0, 0, 0, 0);
        prevTo = new Date(now.getFullYear(), now.getMonth(), 0);
        prevTo.setHours(23, 59, 59, 999);
    } else if (period === 'custom') {
        const fromVal = container.querySelector('#dash-date-from')?.value;
        const toVal = container.querySelector('#dash-date-to')?.value;
        if (fromVal) {
            from = new Date(fromVal);
            from.setHours(0, 0, 0, 0);
        } else {
            from.setDate(from.getDate() - 7);
        }
        if (toVal) {
            to = new Date(toVal);
            to.setHours(23, 59, 59, 999);
        }
        const diffMs = to.getTime() - from.getTime();
        prevTo = new Date(from.getTime() - 1);
        prevFrom = new Date(prevTo.getTime() - diffMs);
    }

    return {
        current: { fromIso: from.toISOString(), toIso: to.toISOString() },
        previous: { fromIso: prevFrom.toISOString(), toIso: prevTo.toISOString() }
    };
}

function calcGrowth(currentVal, prevVal) {
    if (!prevVal || prevVal === 0) {
        if (!currentVal || currentVal === 0) return { pct: 0, text: '0%', direction: 'neutral' };
        return { pct: 100, text: '+100% ▲', direction: 'up' };
    }
    const diff = currentVal - prevVal;
    const pct = Math.round((diff / prevVal) * 100);
    if (pct > 0) return { pct, text: `+${pct}% ▲`, direction: 'up' };
    if (pct < 0) return { pct, text: `${pct}% ▼`, direction: 'down' };
    return { pct: 0, text: '0% ~', direction: 'neutral' };
}

function updateTrendBadge(el, growth, invertColors = false) {
    if (!el) return;
    el.textContent = growth.text;
    el.className = 'trend-badge';

    let isPositive = growth.direction === 'up';
    if (invertColors) isPositive = !isPositive; // Para gastos, bajar es positivo

    if (growth.direction === 'neutral') {
        el.classList.add('trend-badge--neutral');
    } else if (isPositive) {
        el.classList.add('trend-badge--up');
    } else {
        el.classList.add('trend-badge--down');
    }
    el.title = `Comparado con el período inmediatamente anterior`;
}

async function loadDashboardData(container) {
    try {
        const { current, previous } = getComparisonRanges(activePeriod, container);

        // Actualizar reloj de sincronización
        const syncClock = container.querySelector('#dash-sync-clock');
        if (syncClock) {
            const now = new Date();
            lastSyncTime = now.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            syncClock.textContent = `Última sincronización: ${lastSyncTime}`;
        }

        // Consultas en paralelo para máximo rendimiento
        const [
            currentRegister,
            currentAnalytics,
            prevAnalytics,
            activeOrders,
            lowStock,
            clubStats
        ] = await Promise.all([
            cashService.getCurrentRegister().catch(() => null),
            reportService.getAnalyticsByRange(current.fromIso, current.toIso),
            reportService.getAnalyticsByRange(previous.fromIso, previous.toIso).catch(() => null),
            orderService.getActiveOrders().catch(() => []),
            productService.getLowStock(10).catch(() => []),
            customerService.getMembershipStats().catch(() => null)
        ]);

        // 1. Renderizar Mando del Turno de Caja en Vivo (War Room)
        await renderLiveShiftPanel(container, currentRegister);

        // 2. Actualizar Contador de KDS Cocina
        const kdsCountEl = container.querySelector('#dash-kds-count');
        const kdsActiveList = (activeOrders || []).filter(o => o.status === 'ordered' || o.status === 'preparing');
        if (kdsCountEl) {
            kdsCountEl.textContent = kdsActiveList.length;
            if (kdsActiveList.length >= 4) {
                kdsCountEl.className = 'badge badge--red';
                kdsCountEl.title = 'Cocina con alta concentración de comandas';
            } else {
                kdsCountEl.className = 'badge badge--yellow';
            }
        }

        // 3. Actualizar KPIs y Badges de Crecimiento
        const setText = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val; };
        setText('#dash-sales', formatGs(currentAnalytics.totalSales || 0));
        setText('#dash-orders', `${currentAnalytics.orderCount || 0} pedidos cobrados`);
        setText('#dash-expenses', formatGs(currentAnalytics.totalExpenses || 0));
        setText('#dash-expenses-count', `${currentAnalytics.expenses.length} egresos auditados`);
        setText('#dash-net', formatGs(currentAnalytics.netProfit || 0));
        setText('#dash-margin', `Margen neto: ${currentAnalytics.profitMargin}% EBITDA`);
        setText('#dash-avg-ticket', formatGs(currentAnalytics.avgTicket || 0));
        setText('#dash-active-turn', `Cocina en marcha: ${kdsActiveList.length} en preparación`);

        if (prevAnalytics) {
            const salesGrowth = calcGrowth(currentAnalytics.totalSales, prevAnalytics.totalSales);
            updateTrendBadge(container.querySelector('#dash-sales-trend-badge'), salesGrowth);

            const expensesGrowth = calcGrowth(currentAnalytics.totalExpenses, prevAnalytics.totalExpenses);
            updateTrendBadge(container.querySelector('#dash-expenses-trend-badge'), expensesGrowth, true);

            const netGrowth = calcGrowth(currentAnalytics.netProfit, prevAnalytics.netProfit);
            updateTrendBadge(container.querySelector('#dash-net-trend-badge'), netGrowth);

            const ticketGrowth = calcGrowth(currentAnalytics.avgTicket, prevAnalytics.avgTicket);
            updateTrendBadge(container.querySelector('#dash-ticket-trend-badge'), ticketGrowth);
        }

        // 4. Ranking de Productos
        const topProdEl = container.querySelector('#dash-top-products');
        if (topProdEl) {
            if (!currentAnalytics.topProducts || currentAnalytics.topProducts.length === 0) {
                topProdEl.innerHTML = `<p class="empty-text">Sin ventas registradas en este período.</p>`;
            } else {
                topProdEl.innerHTML = currentAnalytics.topProducts.slice(0, 8).map((p, idx) => `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle);">
                        <span style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">#${idx + 1} ${p.name}</span>
                        <div style="text-align: right;">
                            <span class="badge badge--yellow" style="font-family: var(--font-mono); font-weight: 700;">${p.qty} un.</span>
                            <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">${formatGs(p.total)}</div>
                        </div>
                    </li>
                `).join('');
            }
        }

        // 5. Radar de Stock Crítico
        const stockEl = container.querySelector('#dash-low-stock');
        if (stockEl) {
            if ((lowStock || []).length === 0) {
                stockEl.innerHTML = `<p class="empty-text">✅ ¡Todo en orden! Todos los insumos cuentan con stock adecuado.</p>`;
            } else {
                stockEl.innerHTML = `
                    <ul class="stock-list">
                        ${lowStock.slice(0, 5).map(p => {
                            const isCritical = p.stock <= 3;
                            return `
                                <li>
                                    <span style="font-weight: 600;">${p.name}</span>
                                    <span class="badge ${isCritical ? 'badge--red' : 'badge--yellow'}" style="font-family: var(--font-mono);">
                                        ${isCritical ? '🔴 Crítico:' : '⚠️ Reponer:'} ${p.stock} un.
                                    </span>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                `;
            }
        }

        // 6. Radar de Socios del Club Burgame con WhatsApp Directo
        const clubEl = container.querySelector('#dash-club');
        if (clubEl) {
            const expiring = (clubStats?.members || []).filter(m => m.status === 'expiring');
            const expired = (clubStats?.members || []).filter(m => m.status === 'expired');
            const items = [];

            if (expiring.length > 0) {
                items.push('<p style="font-size:0.75rem; color:#FFD700; font-weight:800; margin-bottom:0.4rem; text-transform:uppercase;">⚠️ POR VENCER (PRÓXIMOS 5 DÍAS)</p>');
                expiring.slice(0, 4).forEach(m => {
                    const cleanPhone = (m.phone || '').replace(/\D/g, '');
                    const waText = encodeURIComponent(`¡Hola ${m.name}! 🍔 Te escribimos de Burgame. Tu membresía al Club vence en ${m.daysLeft} día(s). ¡Pasa por el local o avísanos para renovarla y no perder tus beneficios gamer!`);
                    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waText}` : null;

                    items.push(`
                        <li style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0; border-bottom:1px solid var(--border-subtle);">
                            <div>
                                <strong style="font-size:0.85rem; color:var(--text-main);">${m.name}</strong>
                                <div style="font-size:0.72rem; color:var(--text-muted);">${m.phone || 'Sin tel'}</div>
                            </div>
                            <div style="display:flex; align-items:center; gap:0.4rem;">
                                <span class="badge badge--yellow" style="font-family:var(--font-mono); font-size:0.72rem;">${m.daysLeft}d</span>
                                ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn-whatsapp-mini" title="Contactar por WhatsApp">📲</a>` : ''}
                            </div>
                        </li>
                    `);
                });
            }

            if (expired.length > 0) {
                items.push('<p style="font-size:0.75rem; color:#FF5252; font-weight:800; margin:0.6rem 0 0.4rem; text-transform:uppercase;">🔴 MEMBRESÍAS VENCIDAS</p>');
                expired.slice(0, 3).forEach(m => {
                    const cleanPhone = (m.phone || '').replace(/\D/g, '');
                    const waText = encodeURIComponent(`¡Hola ${m.name}! 🍔 Te extrañamos en Burgame. Tu membresía al Club ha vencido. ¡Renóvala hoy para seguir disfrutando de descuentos y torneos exclusivos!`);
                    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${waText}` : null;

                    items.push(`
                        <li style="display:flex; justify-content:space-between; align-items:center; padding:0.45rem 0; border-bottom:1px solid var(--border-subtle);">
                            <div>
                                <strong style="font-size:0.85rem; color:var(--text-main);">${m.name}</strong>
                                <div style="font-size:0.72rem; color:var(--text-muted);">${m.phone || 'Sin tel'}</div>
                            </div>
                            <div style="display:flex; align-items:center; gap:0.4rem;">
                                <span class="badge badge--red" style="font-size:0.7rem;">Vencido</span>
                                ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn-whatsapp-mini" title="Contactar por WhatsApp">📲</a>` : ''}
                            </div>
                        </li>
                    `);
                });
            }

            if (items.length === 0) {
                clubEl.innerHTML = `
                    <p class="empty-text">👑 Padrón 100% al día. (${clubStats?.active || 0} socios activos)</p>
                `;
            } else {
                clubEl.innerHTML = `<ul class="stock-list">${items.join('')}</ul>`;
            }
        }

        // 7. Renderizar o actualizar los Gráficos Chart.js
        await renderDashboardCharts(container, currentAnalytics);

    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

// Renderiza el panel War-Room del turno de caja en tiempo real
async function renderLiveShiftPanel(container, currentRegister) {
    const shiftBox = container.querySelector('#dash-live-shift-container');
    if (!shiftBox) return;

    if (!currentRegister) {
        shiftBox.innerHTML = `
            <div class="live-shift-closed">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="font-size: 1.5rem;">🔒</span>
                    <div>
                        <strong style="color: #FF5252; font-size: 0.95rem;">NO HAY NINGÚN TURNO DE CAJA ABIERTO</strong>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                            Abre un turno con fondo de cambio inicial para registrar cobros y habilitar arqueo continuo.
                        </p>
                    </div>
                </div>
                <a href="#/caja" class="btn btn--primary" style="font-weight: 800; font-size: 0.85rem;">
                    💵 Abrir Turno de Caja
                </a>
            </div>
        `;
        return;
    }

    try {
        const summary = await cashService.getRegisterSummary(currentRegister.id);
        const openTime = new Date(currentRegister.opened_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
        const openDate = new Date(currentRegister.opened_at).toLocaleDateString('es-PY');
        const initial = currentRegister.initial_amount || 0;
        const cashSales = summary.payments?.efectivo || 0;
        const digitalSales = (summary.payments?.transferencia || 0) + (summary.payments?.debito || 0) + (summary.payments?.credito || 0);
        const cashExpenses = summary.totalExpenses || 0;
        const expectedInDrawer = summary.expectedInDrawer || (initial + cashSales - cashExpenses);

        shiftBox.innerHTML = `
            <div class="live-shift-panel">
                <div class="live-shift-header">
                    <div class="live-shift-pulse-title">
                        <div class="pulse-dot"></div>
                        <strong style="color: #00E676; font-size: 0.95rem; font-family: var(--font-title); letter-spacing: 0.5px;">
                            TURNO DE CAJA ACTIVO (#${currentRegister.id.slice(0, 6)})
                        </strong>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
                            🕒 Abierto: ${openDate} ${openTime}
                        </span>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <a href="#/caja" class="btn btn--secondary btn--sm" style="font-size: 0.78rem; font-weight: 700;">
                            💵 Arqueo en Vivo
                        </a>
                    </div>
                </div>

                <div class="live-shift-grid">
                    <div class="live-shift-metric">
                        <label>Fondo Inicial</label>
                        <span class="val">${formatGs(initial)}</span>
                    </div>
                    <div class="live-shift-metric">
                        <label>Ventas en Efectivo</label>
                        <span class="val" style="color: #00E676;">+${formatGs(cashSales)}</span>
                    </div>
                    <div class="live-shift-metric">
                        <label>Gastos en Efectivo</label>
                        <span class="val" style="color: #FF5252;">-${formatGs(cashExpenses)}</span>
                    </div>
                    <div class="live-shift-metric" style="background: rgba(255, 215, 0, 0.06); padding: 0.4rem 0.6rem; border-radius: 6px; border: 1px solid rgba(255, 215, 0, 0.2);">
                        <label style="color: var(--color-primary);">🧮 Efectivo Físico en Cajón</label>
                        <span class="val val--highlight">${formatGs(expectedInDrawer)}</span>
                    </div>
                    <div class="live-shift-metric">
                        <label>Ventas Digitales (QR/Tarjetas)</label>
                        <span class="val" style="color: #00F0FF;">${formatGs(digitalSales)}</span>
                    </div>
                    <div class="live-shift-metric">
                        <label>Comandas Turno</label>
                        <span class="val">${summary.orderCount || 0} pedidos</span>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        console.warn('Error cargando resumen del turno de caja en dashboard:', err);
    }
}

async function renderDashboardCharts(container, analytics) {
    try {
        const ChartClass = await reportService.ensureChartJS();
        if (!ChartClass) return;

        const gridColor = 'rgba(255, 255, 255, 0.07)';
        const textColor = '#8E9BAE';

        // 1. Gráfico de Tendencia de Ventas (Línea con Gradiente Neón)
        const ctxTrend = container.querySelector('#chart-sales-trend')?.getContext('2d');
        if (ctxTrend) {
            if (chartSalesTrend) chartSalesTrend.destroy();

            const labels = analytics.timeline.map(t => {
                const parts = t.date.split('-');
                return `${parts[2]}/${parts[1]}`;
            });
            const dataSales = analytics.timeline.map(t => t.sales);

            chartSalesTrend = new ChartClass(ctxTrend, {
                type: 'line',
                data: {
                    labels: labels.length ? labels : ['Sin datos'],
                    datasets: [{
                        label: 'Ventas (Gs.)',
                        data: dataSales.length ? dataSales : [0],
                        borderColor: '#FFD700',
                        backgroundColor: 'rgba(255, 215, 0, 0.12)',
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#FFD700',
                        pointBorderColor: '#000',
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => ` Ventas: ${formatGs(context.raw)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'Inter', size: 11 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: {
                                color: textColor,
                                font: { family: 'JetBrains Mono', size: 11 },
                                callback: (val) => formatGs(val)
                            }
                        }
                    }
                }
            });
        }

        // 2. Gráfico Ventas vs Gastos (Barras Agrupadas Verde vs Rojo)
        const ctxIncomeExpense = container.querySelector('#chart-income-vs-expense')?.getContext('2d');
        if (ctxIncomeExpense) {
            if (chartIncomeVsExpense) chartIncomeVsExpense.destroy();

            const labels = analytics.timeline.map(t => {
                const parts = t.date.split('-');
                return `${parts[2]}/${parts[1]}`;
            });

            chartIncomeVsExpense = new ChartClass(ctxIncomeExpense, {
                type: 'bar',
                data: {
                    labels: labels.length ? labels : ['Sin datos'],
                    datasets: [
                        {
                            label: 'Ingresos (Gs.)',
                            data: analytics.timeline.map(t => t.sales),
                            backgroundColor: '#00E676',
                            borderRadius: 4
                        },
                        {
                            label: 'Gastos (Gs.)',
                            data: analytics.timeline.map(t => t.expenses),
                            backgroundColor: '#FF3D71',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#F0F3F8', font: { family: 'Inter', size: 11 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.dataset.label}: ${formatGs(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        x: { grid: { color: gridColor }, ticks: { color: textColor } },
                        y: {
                            grid: { color: gridColor },
                            ticks: {
                                color: textColor,
                                font: { family: 'JetBrains Mono', size: 10 },
                                callback: (val) => formatGs(val)
                            }
                        }
                    }
                }
            });
        }

        // 3. Horas Pico (Histograma de 00h a 23h)
        const ctxHourly = container.querySelector('#chart-hourly')?.getContext('2d');
        if (ctxHourly) {
            if (chartHourly) chartHourly.destroy();

            const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
            chartHourly = new ChartClass(ctxHourly, {
                type: 'bar',
                data: {
                    labels: hourLabels,
                    datasets: [{
                        label: 'Pedidos',
                        data: analytics.hourlyDistribution,
                        backgroundColor: '#00E5FF',
                        borderRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => ` ${ctx.raw} pedidos ingresados`
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: {
                                color: textColor,
                                maxRotation: 0,
                                callback: (val, index) => (index % 2 === 0 ? hourLabels[index] : '')
                            }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, stepSize: 1 }
                        }
                    }
                }
            });
        }

        // 4. Medios de Pago (Doughnut Chart)
        const ctxPayments = container.querySelector('#chart-payments')?.getContext('2d');
        if (ctxPayments) {
            if (chartPayments) chartPayments.destroy();

            const p = analytics.payments || {};
            const values = [p.efectivo || 0, p.transferencia || 0, p.debito || 0, p.credito || 0];
            const hasData = values.some(v => v > 0);

            chartPayments = new ChartClass(ctxPayments, {
                type: 'doughnut',
                data: {
                    labels: ['Efectivo', 'Transferencia', 'Débito', 'Crédito'],
                    datasets: [{
                        data: hasData ? values : [1],
                        backgroundColor: hasData
                            ? ['#FFD700', '#00E5FF', '#AB47BC', '#FF9100']
                            : ['rgba(255,255,255,0.1)'],
                        borderColor: '#111111',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#F0F3F8', font: { family: 'Inter', size: 11 }, padding: 12 }
                        },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => hasData ? ` ${ctx.label}: ${formatGs(ctx.raw)}` : ' Sin ventas'
                            }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    } catch (err) {
        console.warn('Error renderizando gráficos en Dashboard:', err);
    }
}


