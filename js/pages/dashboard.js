import { reportService } from '../services/report-service.js';
import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { customerService } from '../services/customer-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';

let activePeriod = '30d'; // 'today' | '7d' | '30d' | 'month' | 'custom'
let chartSalesTrend = null;
let chartIncomeVsExpense = null;
let chartHourly = null;
let chartPayments = null;

export async function renderDashboardPage() {
    const container = document.createElement('div');
    container.className = 'dashboard-page';

    // Layout principal
    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>🎮 BURGAME DASHBOARD & ANALÍTICA</h1>
                <p>Métricas operacionales, evolución temporal y tendencias de crecimiento</p>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                <div id="dash-register-status">
                    <span class="badge badge--gray" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">⏳ Verificando caja...</span>
                </div>
            </div>
        </header>

        <!-- Barra de Filtros de Período -->
        <div class="period-filter-bar">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--color-primary); display: flex; align-items: center; gap: 0.4rem;">
                📅 Período:
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

        <!-- Tarjetas KPI Principales -->
        <div class="dashboard-grid">
            <div class="stat-card stat-card--neon">
                <span class="stat-card__title">💰 Ventas del Período</span>
                <span class="stat-card__value" id="dash-sales">⏳</span>
                <span class="stat-card__subtitle" id="dash-orders">Cargando datos...</span>
            </div>
            <div class="stat-card stat-card--red">
                <span class="stat-card__title">💸 Gastos Totales</span>
                <span class="stat-card__value" id="dash-expenses">⏳</span>
                <span class="stat-card__subtitle" id="dash-expenses-count">...</span>
            </div>
            <div class="stat-card stat-card--green">
                <span class="stat-card__title">📈 Margen Neto</span>
                <span class="stat-card__value" id="dash-net">⏳</span>
                <span class="stat-card__subtitle" id="dash-margin">Rentabilidad neta</span>
            </div>
            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">🍔 Ticket Promedio</span>
                <span class="stat-card__value" id="dash-avg-ticket">⏳</span>
                <span class="stat-card__subtitle" id="dash-active-turn">Turno actual: 0 activos</span>
            </div>
        </div>

        <!-- Grilla de Gráficos Analíticos (Chart.js) -->
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
                    <h3 class="chart-card__title">🕒 Horas Pico de Pedidos</h3>
                    <span class="chart-card__subtitle">Concentración horaria de comandas (00h a 23h)</span>
                </div>
                <div class="chart-container-wrapper">
                    <canvas id="chart-hourly"></canvas>
                </div>
            </div>

            <!-- 4. Medios de Pago -->
            <div class="chart-card">
                <div class="chart-card__header">
                    <h3 class="chart-card__title">💳 Medios de Pago Utilizados</h3>
                    <span class="chart-card__subtitle">Participación porcentual</span>
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

        <!-- Secciones Operacionales (Stock bajo y Club) -->
        <div class="dashboard-sections" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 1rem;">
            <div class="card dashboard-card">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-danger); margin-bottom: 1rem;">
                    ⚠️ Productos con Poco Stock
                </h3>
                <div id="dash-low-stock">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>
            <div class="card dashboard-card dashboard-card--club">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin-bottom: 1rem;">
                    👑 Club Burgame
                </h3>
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

    container.querySelector('#btn-apply-dash-range')?.addEventListener('click', () => {
        loadDashboardData(container);
    });
}

function getDateRangeForPeriod(period, container) {
    let from = new Date();
    let to = new Date();

    if (period === 'today') {
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
    } else if (period === '7d') {
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
    } else if (period === '30d') {
        from.setDate(from.getDate() - 30);
        from.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
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
    }

    return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

async function loadDashboardData(container) {
    try {
        const { fromIso, toIso } = getDateRangeForPeriod(activePeriod, container);

        // Status de caja y datos de fondo
        const currentRegister = appState.cashRegister || await cashService.getCurrentRegister();
        const statusEl = container.querySelector('#dash-register-status');
        if (statusEl) {
            statusEl.innerHTML = currentRegister ? `
                <span class="badge badge--green" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                    🟢 CAJA ABIERTA (Turno #${currentRegister.id.slice(0, 6)})
                </span>
            ` : `
                <span class="badge badge--red" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                    🔒 CAJA CERRADA
                </span>
            `;
        }

        // Cargar analítica del período, pedidos de hoy para cocina, stock bajo y club
        const [analytics, lowStock, todaysOrders, clubStats] = await Promise.all([
            reportService.getAnalyticsByRange(fromIso, toIso),
            productService.getLowStock(10),
            orderService.getTodaysOrders(),
            customerService.getMembershipStats().catch(() => null)
        ]);

        const activeOrders = (todaysOrders || []).filter(o => o.status !== 'cancelled');

        // Actualizar KPIs
        const setText = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val; };
        setText('#dash-sales', formatGs(analytics.totalSales || 0));
        setText('#dash-orders', `${analytics.orderCount || 0} pedidos cobrados`);
        setText('#dash-expenses', formatGs(analytics.totalExpenses || 0));
        setText('#dash-expenses-count', `${analytics.expenses.length} gastos registrados`);
        setText('#dash-net', formatGs(analytics.netProfit || 0));
        setText('#dash-margin', `Margen neto: ${analytics.profitMargin}%`);
        setText('#dash-avg-ticket', formatGs(analytics.avgTicket || 0));
        setText('#dash-active-turn', `Cocina activa hoy: ${activeOrders.length} comandas`);

        // Ranking de productos
        const topProdEl = container.querySelector('#dash-top-products');
        if (topProdEl) {
            if (analytics.topProducts.length === 0) {
                topProdEl.innerHTML = `<p class="empty-text">Sin ventas de productos en este período.</p>`;
            } else {
                topProdEl.innerHTML = analytics.topProducts.slice(0, 8).map((p, idx) => `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle);">
                        <span style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">#${idx + 1} ${p.name}</span>
                        <div style="text-align: right;">
                            <span class="badge badge--yellow" style="font-family: var(--font-mono); font-weight: 700;">${p.qty} unid.</span>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${formatGs(p.total)}</div>
                        </div>
                    </li>
                `).join('');
            }
        }

        // Low stock
        const stockEl = container.querySelector('#dash-low-stock');
        if (stockEl) {
            stockEl.innerHTML = (lowStock || []).length === 0 ? `
                <p class="empty-text">¡Todo en orden! El inventario está abastecido.</p>
            ` : `
                <ul class="stock-list">
                    ${lowStock.map(p => `
                        <li>
                            <span>${p.name}</span>
                            <span class="badge badge--red">${p.stock} unidades</span>
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        // Club Burgame
        const clubEl = container.querySelector('#dash-club');
        if (clubEl) {
            const expiring = (clubStats?.members || []).filter(m => m.status === 'expiring');
            const expired = (clubStats?.members || []).filter(m => m.status === 'expired');
            const items = [];

            if (expiring.length > 0) {
                items.push('<p style="font-size:0.78rem; color:#FFC107; font-weight:800; margin-bottom:0.4rem;">⚠️ POR VENCER EN 5 DÍAS</p>');
                expiring.forEach(m => {
                    items.push(`
                        <li style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
                            <span style="font-weight:600;">${m.name}</span>
                            <span class="badge badge--yellow" style="font-family:var(--font-mono); font-size:0.7rem;">${m.daysLeft} día(s)</span>
                        </li>
                    `);
                });
            }
            if (expired.length > 0) {
                items.push(`<p style="font-size:0.78rem; color:#FF5252; font-weight:800; margin:0.6rem 0 0.4rem;">🔴 VENCIDOS</p>`);
                expired.forEach(m => {
                    items.push(`
                        <li style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
                            <span style="font-weight:600;">${m.name}</span>
                            <span class="badge badge--red" style="font-size:0.7rem;">Vencido</span>
                        </li>
                    `);
                });
            }

            if (items.length === 0) {
                clubEl.innerHTML = `
                    <p class="empty-text">👑 Todos los socios están al día. (${clubStats?.active || 0} activos)</p>
                    <a href="#/club" class="btn btn--secondary btn--block" style="margin-top:0.8rem; font-size:0.85rem;">Ir al Club Burgame</a>
                `;
            } else {
                clubEl.innerHTML = `
                    <ul class="stock-list">${items.join('')}</ul>
                    <a href="#/club" class="btn btn--secondary btn--block" style="margin-top:0.8rem; font-size:0.85rem;">👑 Gestionar en Club Burgame</a>
                `;
            }
        }

        // Renderizar o actualizar los Gráficos Interactivos
        await renderDashboardCharts(container, analytics);

    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

async function renderDashboardCharts(container, analytics) {
    try {
        const Chart = await reportService.ensureChartJS();
        if (!Chart) return;

        // Configuración estética común Burgame Dark/Arcade
        const gridColor = 'rgba(255, 255, 255, 0.07)';
        const textColor = '#8E9BAE';

        // 1. Gráfico de Tendencia de Ventas (Línea con Gradiente Amarillo)
        const ctxTrend = container.querySelector('#chart-sales-trend')?.getContext('2d');
        if (ctxTrend) {
            if (chartSalesTrend) chartSalesTrend.destroy();

            const labels = analytics.timeline.map(t => {
                const parts = t.date.split('-');
                return `${parts[2]}/${parts[1]}`;
            });
            const dataSales = analytics.timeline.map(t => t.sales);

            chartSalesTrend = new Chart(ctxTrend, {
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

            chartIncomeVsExpense = new Chart(ctxIncomeExpense, {
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

        // 3. Horas Pico (Histograma de 11h a 24h)
        const ctxHourly = container.querySelector('#chart-hourly')?.getContext('2d');
        if (ctxHourly) {
            if (chartHourly) chartHourly.destroy();

            const hourLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
            chartHourly = new Chart(ctxHourly, {
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

            const p = analytics.payments;
            const values = [p.efectivo || 0, p.transferencia || 0, p.debito || 0, p.credito || 0];

            chartPayments = new Chart(ctxPayments, {
                type: 'doughnut',
                data: {
                    labels: ['Efectivo', 'Transferencia', 'Débito', 'Crédito'],
                    datasets: [{
                        data: values,
                        backgroundColor: ['#FFD700', '#00E5FF', '#AB47BC', '#FF9100'],
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
                                label: (ctx) => ` ${ctx.label}: ${formatGs(ctx.raw)}`
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

