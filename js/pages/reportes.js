import { reportService } from '../services/report-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { exportConsolidatedReportExcel, exportKitchenTimesExcel } from '../services/excel-export-service.js';
import {
    getParaguayToday,
    getParaguayIsoRange,
    getParaguayPresetRange
} from '../utils/date-utils.js';

let selectedPeriod = 'today'; // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
let customStartDate = '';
let customEndDate = '';

// Subtabs: 'overview' | 'ranking' | 'audit'
let currentSubTab = 'overview';

// Estados de filtro, ordenamiento y paginación del ranking de productos
let reportFilter = { search: '', payment: 'all' };
let reportSort = { field: 'qty', dir: 'desc' };
let reportPage = 1;
const REPORT_PAGE_SIZE = 8;

// Cache analítica completa del período actual
let cachedAnalytics = null;
let auditSearch = '';

// Referencias a instancias de Chart.js para evitar memory leaks o canvas collision
let salesChartInstance = null;
let paymentsChartInstance = null;
let kitchenChartInstance = null;
let kitchenFilterDelay = 'all';
let kitchenSearch = '';

export async function renderReportesPage() {
    const container = document.createElement('div');
    container.className = 'reportes-page';

    const todayStr = getParaguayToday();
    if (!customStartDate) customStartDate = todayStr;
    if (!customEndDate) customEndDate = todayStr;

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
            <div class="page-header__info">
                <h1 style="display: flex; align-items: center; gap: 0.6rem;">
                    📈 REPORTES, AUDITORÍA & BI
                </h1>
                <p>Inteligencia de negocios, análisis de rentabilidad, horas pico y auditoría fiscal</p>
            </div>
            <div class="period-selectors" style="display: flex; gap: 0.4rem; background: var(--bg-card); padding: 0.35rem; border-radius: 8px; border: 1px solid var(--border-subtle); flex-wrap: wrap;">
                <button class="btn btn--sm period-btn ${selectedPeriod === 'today' ? 'btn--primary' : 'btn--secondary'}" data-period="today">Hoy</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'yesterday' ? 'btn--primary' : 'btn--secondary'}" data-period="yesterday">Ayer</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'week' ? 'btn--primary' : 'btn--secondary'}" data-period="week">7 Días</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'month' ? 'btn--primary' : 'btn--secondary'}" data-period="month">Este Mes</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'custom' ? 'btn--primary' : 'btn--secondary'}" data-period="custom">Personalizado</button>
            </div>
        </header>

        <!-- Barra de Rango de Fechas Dual y Acciones Ejecutivas -->
        <div class="reportes-export-bar">
            <div class="reportes-export-info">
                <h4>🗓️ RANGO DE AUDITORÍA Y CONTROL FINANCIERO</h4>
                <p id="period-status-label">Mostrando datos calculados en tiempo real</p>
            </div>
            <div class="reportes-export-actions">
                <div id="custom-range-controls" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                    <label for="date-range-from" style="font-size: 0.8rem; color: var(--text-muted);">Desde:</label>
                    <input type="date" id="date-range-from" class="report-date-input" value="${customStartDate}">
                    <label for="date-range-to" style="font-size: 0.8rem; color: var(--text-muted);">Hasta:</label>
                    <input type="date" id="date-range-to" class="report-date-input" value="${customEndDate}">
                    <button id="btn-apply-range" class="btn btn--secondary btn--sm" style="font-weight: 700;">
                        🔍 Aplicar
                    </button>
                </div>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button id="btn-print-thermal" class="btn btn--secondary" style="font-size: 0.85rem; padding: 0.5rem 0.9rem;" title="Imprimir ticket de resumen en impresora térmica de 80mm">
                        🖨️ Resumen Térmico
                    </button>
                    <button id="btn-download-excel" class="btn btn--primary" style="font-weight: 800; font-size: 0.85rem; padding: 0.5rem 1rem; box-shadow: 0 0 12px var(--color-primary-glow);">
                        📥 Exportar Excel (4 Hojas)
                    </button>
                </div>
            </div>
        </div>

        <!-- Sub-Tabs de navegación interna de Reportes -->
        <div class="report-view-tabs">
            <button class="report-view-tab ${currentSubTab === 'overview' ? 'active' : ''}" data-tab="overview">
                📊 ANALÍTICA & GRÁFICOS BI
            </button>
            <button class="report-view-tab ${currentSubTab === 'ranking' ? 'active' : ''}" data-tab="ranking">
                🏆 RANKING DE PRODUCTOS & VENTAS
            </button>
            <button class="report-view-tab ${currentSubTab === 'audit' ? 'active' : ''}" data-tab="audit">
                🧾 AUDITORÍA DE COMPROBANTES TICKET POR TICKET
            </button>
        </div>

        <div id="reportes-body" style="margin-top: 1rem;">
            <div class="page-loading">
                <div class="pixel-spinner"></div>
                <p>Cargando analítica empresarial...</p>
            </div>
        </div>
    `;

    setupEvents(container);
    loadReportData(container);

    return container;
}

function setupEvents(container) {
    const todayStr = getParaguayToday();
    const fromInput = container.querySelector('#date-range-from');
    const toInput = container.querySelector('#date-range-to');

    // Botones de presets
    container.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedPeriod = btn.dataset.period;
            container.querySelectorAll('.period-btn').forEach(b => {
                b.classList.remove('btn--primary');
                b.classList.add('btn--secondary');
            });
            btn.classList.remove('btn--secondary');
            btn.classList.add('btn--primary');

            if (selectedPeriod !== 'custom') {
                const preset = getParaguayPresetRange(selectedPeriod);
                fromInput.value = preset.startYmd;
                toInput.value = preset.endYmd;
            }

            customStartDate = fromInput.value;
            customEndDate = toInput.value;

            // Reset filtros de ranking
            reportFilter = { search: '', payment: 'all' };
            reportSort = { field: 'qty', dir: 'desc' };
            reportPage = 1;

            loadReportData(container);
        });
    });

    // Botón Aplicar Rango Personalizado
    container.querySelector('#btn-apply-range')?.addEventListener('click', () => {
        selectedPeriod = 'custom';
        customStartDate = fromInput.value || todayStr;
        customEndDate = toInput.value || todayStr;

        container.querySelectorAll('.period-btn').forEach(b => {
            b.classList.toggle('btn--primary', b.dataset.period === 'custom');
            b.classList.toggle('btn--secondary', b.dataset.period !== 'custom');
        });

        loadReportData(container);
    });

    // Sub-Tabs
    container.querySelectorAll('.report-view-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            currentSubTab = tabBtn.dataset.tab;
            container.querySelectorAll('.report-view-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            renderReport(container);
        });
    });

    // Botón Imprimir Resumen Térmico
    container.querySelector('#btn-print-thermal')?.addEventListener('click', () => {
        if (!cachedAnalytics || (cachedAnalytics.totalSales === 0 && cachedAnalytics.totalExpenses === 0)) {
            showToast({ message: 'No hay transacciones ni gastos para imprimir en este período', type: 'warning' });
            return;
        }
        let periodLabel = selectedPeriod.toUpperCase();
        if (selectedPeriod === 'custom') {
            periodLabel = `${customStartDate} al ${customEndDate}`;
        }
        reportService.printThermalReport(cachedAnalytics, periodLabel);
        showToast({ message: '🖨️ Generando ticket térmico de 80mm...', type: 'info' });
    });

    // Botón Descargar Excel Consolidado
    container.querySelector('#btn-download-excel')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-download-excel');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Generando Excel...';

        try {
            if (!cachedAnalytics || (!cachedAnalytics.paidOrders.length && !cachedAnalytics.expenses.length)) {
                showToast({ message: 'No hay transacciones registradas en el período seleccionado', type: 'warning' });
                return;
            }

            let periodLabel = selectedPeriod;
            if (selectedPeriod === 'custom') {
                periodLabel = `${customStartDate}_al_${customEndDate}`;
            }

            await exportConsolidatedReportExcel(cachedAnalytics, periodLabel);
            showToast({ message: `✅ Excel exportado exitosamente (${periodLabel})`, type: 'success' });
        } catch (err) {
            console.error('Error exportando reporte Excel:', err);
            showToast({ message: 'Error al exportar Excel: ' + err.message, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });
}

async function loadReportData(container) {
    const body = container.querySelector('#reportes-body');
    if (!body) return;

    // Destruir gráficos anteriores si existían
    destroyCharts();

    body.innerHTML = `
        <div class="page-loading">
            <div class="pixel-spinner"></div>
            <p>Calculando métricas y estados financieros...</p>
        </div>
    `;

    try {
        const fromInput = container.querySelector('#date-range-from');
        const toInput = container.querySelector('#date-range-to');
        const startStr = fromInput ? fromInput.value : customStartDate;
        const endStr = toInput ? toInput.value : customEndDate;

        const { fromIso, toIso } = getParaguayIsoRange(startStr, endStr);

        // Actualizar etiqueta del período
        const statusLabel = container.querySelector('#period-status-label');
        if (statusLabel) {
            const [sy, sm, sd] = (startStr || '').split('-');
            const [ey, em, ed] = (endStr || '').split('-');
            const fPretty = sd && sm && sy ? `${sd}/${sm}/${sy}` : startStr;
            const tPretty = ed && em && ey ? `${ed}/${em}/${ey}` : endStr;
            statusLabel.textContent = `Período activo: ${fPretty} - ${tPretty} (${selectedPeriod.toUpperCase()})`;
        }

        const analytics = await reportService.getAnalyticsByRange(fromIso, toIso);
        cachedAnalytics = analytics;

        renderReport(container);
    } catch (err) {
        console.error('Error en loadReportData:', err);
        body.innerHTML = `
            <div class="card p-4" style="color: #FF5252; text-align: center;">
                <h2>⚠️ Error al procesar reportes</h2>
                <p>${err.message || 'Error de conexión o cálculo'}</p>
                <button class="btn btn--primary btn--sm" onclick="location.reload()" style="margin-top: 1rem;">Reintentar</button>
            </div>
        `;
    }
}

function destroyCharts() {
    if (salesChartInstance) {
        salesChartInstance.destroy();
        salesChartInstance = null;
    }
    if (paymentsChartInstance) {
        paymentsChartInstance.destroy();
        paymentsChartInstance = null;
    }
    if (kitchenChartInstance) {
        kitchenChartInstance.destroy();
        kitchenChartInstance = null;
    }
}

// ============================================================
// Render Principal según el Sub-Tab Activo
// ============================================================
function renderReport(container) {
    const body = container.querySelector('#reportes-body');
    if (!body || !cachedAnalytics) return;

    // Destruir instancias previas antes de renderizar nuevo HTML
    destroyCharts();

    const {
        paidOrders,
        expenses,
        totalSales,
        totalExpenses,
        netProfit,
        profitMargin,
        orderCount,
        payments
    } = cachedAnalytics;

    const totalIva = Math.round(totalSales / 11);
    const totalSubtotal = totalSales - totalIva;

    // Header común de KPIs Financieros y Fiscales
    const kpiHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card" style="border-left: 4px solid var(--color-primary); box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">💰 Facturación Total</span>
                <h2 style="color: var(--color-primary); margin-top: 0.4rem; font-size: 1.45rem; font-family: var(--font-mono);">${formatGs(totalSales)}</h2>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${orderCount} pedidos pagados</span>
            </div>
            <div class="card" style="border-left: 4px solid #29B6F6; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📑 Liquidación IVA 10%</span>
                <h2 style="color: #29B6F6; margin-top: 0.4rem; font-size: 1.45rem; font-family: var(--font-mono);">${formatGs(totalIva)}</h2>
                <span style="font-size: 0.75rem; color: var(--text-muted);">Base Imponible: ${formatGs(totalSubtotal)}</span>
            </div>
            <div class="card" style="border-left: 4px solid #FF3D71; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">💸 Gastos Totales</span>
                <h2 style="color: #FF3D71; margin-top: 0.4rem; font-size: 1.45rem; font-family: var(--font-mono);">${formatGs(totalExpenses)}</h2>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${expenses.length} egresos auditados</span>
            </div>
            <div class="card" style="border-left: 4px solid #00E676; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📈 Margen Operativo Neto</span>
                <h2 style="color: ${netProfit >= 0 ? '#00E676' : '#FF5252'}; margin-top: 0.4rem; font-size: 1.45rem; font-family: var(--font-mono);">${formatGs(netProfit)}</h2>
                <span style="font-size: 0.75rem; color: ${netProfit >= 0 ? '#00E676' : '#FF5252'}; font-weight: 800;">EBITDA Margen: ${profitMargin}%</span>
            </div>
        </div>
    `;

    if (currentSubTab === 'overview') {
        renderOverviewView(body, kpiHtml, cachedAnalytics);
    } else if (currentSubTab === 'ranking') {
        renderRankingView(body, kpiHtml, paidOrders, payments);
    } else if (currentSubTab === 'audit') {
        renderAuditView(body, kpiHtml, paidOrders);
    }
}

// ============================================================
// Vista 1: Analítica y Gráficos BI (Chart.js, Horas Pico, P&L)
// ============================================================
async function renderOverviewView(body, kpiHtml, analytics) {
    const { peakHour, maxHourlyCount, expenseCategories, totalSales, totalExpenses } = analytics;

    // Rango horario pico (ej: 21:00 - 22:00)
    const peakStart = String(peakHour).padStart(2, '0') + ':00';
    const peakEnd = String((peakHour + 1) % 24).padStart(2, '0') + ':00';

    body.innerHTML = `
        ${kpiHtml}

        <!-- Tarjeta de Horas Pico de Cocina -->
        <div class="peak-hours-card">
            <div class="peak-hours-info">
                <h3>🕒 Demanda Máxima de Cocina (Hora Pico Detectada)</h3>
                <p>Franja con mayor concentración de comandas y despacho durante el período analizado.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <div class="peak-hours-badge">
                    🔥 ${peakStart} - ${peakEnd}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted);">
                    <strong style="color: var(--color-primary); font-size: 1.1rem; font-family: var(--font-mono);">${maxHourlyCount}</strong> pedidos despachados
                </div>
            </div>
        </div>

        <!-- Gráficos Interactivos Chart.js -->
        <div class="report-charts-grid">
            <!-- Gráfico de Tendencia Ventas vs Gastos -->
            <div class="report-chart-card">
                <div class="report-chart-header">
                    <h3>📈 Tendencia: Ventas vs Gastos</h3>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">Evolución Diaria</span>
                </div>
                <div class="report-chart-container">
                    <canvas id="chart-sales-vs-expenses"></canvas>
                </div>
            </div>

            <!-- Gráfico Donut de Métodos de Pago -->
            <div class="report-chart-card">
                <div class="report-chart-header">
                    <h3>🥧 Desglose por Medio de Pago</h3>
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">Participación %</span>
                </div>
                <div class="report-chart-container">
                    <canvas id="chart-payment-methods"></canvas>
                </div>
            </div>
        </div>

        <!-- Desglose de Gastos Operativos y P&L -->
        <div class="card" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
                <h3 style="color: var(--color-primary); font-size: 1.05rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    ⚖️ Desglose de Gastos Operativos (P&L por Categoría)
                </h3>
                <span style="font-size: 0.8rem; color: var(--text-muted);">
                    Total Gastos: <strong style="color: #FF3D71; font-family: var(--font-mono);">${formatGs(totalExpenses)}</strong>
                </span>
            </div>
            <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">
                Impacto porcentual sobre la estructura de costos y ratio de absorción sobre la facturación bruta.
            </p>

            ${(!expenseCategories || expenseCategories.length === 0) ? `
                <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.88rem;">
                    No se registraron gastos operativos en este período.
                </div>
            ` : `
                <div class="pnl-categories-list">
                    ${expenseCategories.map(cat => `
                        <div class="pnl-category-item">
                            <div class="pnl-category-header">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <strong style="color: var(--text-main);">${cat.name}</strong>
                                    <span class="badge badge--dark" style="font-size: 0.7rem;">${cat.count} reg.</span>
                                </div>
                                <div style="display: flex; gap: 1rem; align-items: baseline;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">
                                        ${cat.pctOfSales}% de las ventas
                                    </span>
                                    <strong style="color: #FF5252; font-family: var(--font-mono); font-size: 0.95rem;">
                                        ${formatGs(cat.total)}
                                    </strong>
                                </div>
                            </div>
                            <div class="pnl-category-bar-bg">
                                <div class="pnl-category-bar-fill" style="width: ${Math.min(100, Math.max(2, parseFloat(cat.pctOfExpenses)))}%;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    `;

    // Inicializar los dos gráficos con Chart.js
    await initAnalyticsCharts(analytics);
}

// Creación y configuración de Chart.js
async function initAnalyticsCharts(analytics) {
    try {
        const ChartClass = await reportService.ensureChartJS();
        if (!ChartClass) {
            console.warn('Chart.js no disponible.');
            return;
        }

        const salesCanvas = document.getElementById('chart-sales-vs-expenses');
        const paymentsCanvas = document.getElementById('chart-payment-methods');

        // 1. Gráfico de Ventas vs Gastos
        if (salesCanvas) {
            const timeline = analytics.timeline || [];
            const labels = timeline.length > 0
                ? timeline.map(t => {
                    const parts = t.date.split('-');
                    return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : t.date;
                })
                : ['Sin datos'];

            const salesData = timeline.length > 0 ? timeline.map(t => t.sales) : [0];
            const expensesData = timeline.length > 0 ? timeline.map(t => t.expenses) : [0];

            salesChartInstance = new ChartClass(salesCanvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Ventas (Gs.)',
                            data: salesData,
                            backgroundColor: 'rgba(255, 215, 0, 0.8)',
                            borderColor: '#FFD700',
                            borderWidth: 1,
                            borderRadius: 4
                        },
                        {
                            label: 'Gastos (Gs.)',
                            data: expensesData,
                            backgroundColor: 'rgba(255, 61, 113, 0.8)',
                            borderColor: '#FF3D71',
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
                            labels: {
                                color: '#A0A5B5',
                                font: { family: "'Inter', sans-serif", size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => ` ${context.dataset.label}: ${formatGs(context.raw)}`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#888', font: { size: 10 } },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        },
                        y: {
                            ticks: {
                                color: '#888',
                                font: { size: 10 },
                                callback: (v) => formatGs(v)
                            },
                            grid: { color: 'rgba(255, 255, 255, 0.05)' }
                        }
                    }
                }
            });
        }

        // 2. Gráfico Donut de Medios de Pago
        if (paymentsCanvas) {
            const p = analytics.payments || { efectivo: 0, transferencia: 0, debito: 0, credito: 0 };
            const labels = ['Efectivo', 'Transferencia', 'Débito', 'Crédito'];
            const data = [p.efectivo || 0, p.transferencia || 0, p.debito || 0, p.credito || 0];
            const hasData = data.some(v => v > 0);

            paymentsChartInstance = new ChartClass(paymentsCanvas, {
                type: 'doughnut',
                data: {
                    labels: hasData ? labels : ['Sin ventas'],
                    datasets: [
                        {
                            data: hasData ? data : [1],
                            backgroundColor: hasData
                                ? ['#FFD700', '#00F0FF', '#AB47BC', '#FFA726']
                                : ['rgba(255,255,255,0.1)'],
                            borderColor: '#12141A',
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#A0A5B5',
                                font: { family: "'Inter', sans-serif", size: 11 },
                                boxWidth: 12
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => hasData
                                    ? ` ${context.label}: ${formatGs(context.raw)}`
                                    : ' Sin transacciones'
                            }
                        }
                    }
                }
            });
        }
    } catch (chartErr) {
        console.error('Error renderizando Chart.js:', chartErr);
    }
}

// ============================================================
// Vista 2: Ranking de Productos Más Vendidos y Rentabilidad
// ============================================================
function renderRankingView(body, kpiHtml, paidOrders, payments) {
    let filteredOrders = paidOrders;
    if (reportFilter.payment !== 'all') {
        filteredOrders = paidOrders.filter(o =>
            (o.payment_method || 'efectivo') === reportFilter.payment
        );
    }

    const productStats = {};
    filteredOrders.forEach(order => {
        (order.order_items || []).forEach(item => {
            const name = item.product_name || 'Producto';
            if (!productStats[name]) {
                productStats[name] = { qty: 0, total: 0 };
            }
            productStats[name].qty += (item.quantity || 1);
            productStats[name].total += ((item.price || 0) * (item.quantity || 1));
        });
    });

    let sortedProducts = Object.entries(productStats)
        .map(([name, data]) => ({ name, ...data }));

    if (reportFilter.search.trim()) {
        const q = reportFilter.search.toLowerCase();
        sortedProducts = sortedProducts.filter(p => p.name.toLowerCase().includes(q));
    }

    const { field, dir } = reportSort;
    sortedProducts.sort((a, b) => {
        const va = a[field], vb = b[field];
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / REPORT_PAGE_SIZE));
    if (reportPage > totalPages) reportPage = totalPages;
    const start = (reportPage - 1) * REPORT_PAGE_SIZE;
    const pageProducts = sortedProducts.slice(start, start + REPORT_PAGE_SIZE);

    body.innerHTML = `
        ${kpiHtml}

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
            <!-- Ranking de Productos Más Vendidos -->
            <div class="card">
                <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-primary); font-size: 1.05rem; margin-bottom: 1rem;">
                    🏆 Ranking Productos Más Vendidos
                </h3>

                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    <input type="text" id="report-search" placeholder="🔍 Buscar producto..." value="${reportFilter.search}" style="flex: 1; min-width: 130px; padding: 0.4rem 0.75rem; font-size: 0.85rem;">
                    <select id="report-sort" style="min-width: 140px; font-size: 0.85rem;">
                        <option value="qty-desc" ${reportSort.field === 'qty' && reportSort.dir === 'desc' ? 'selected' : ''}>Más vendidos ↓</option>
                        <option value="qty-asc" ${reportSort.field === 'qty' && reportSort.dir === 'asc' ? 'selected' : ''}>Menos vendidos ↑</option>
                        <option value="total-desc" ${reportSort.field === 'total' && reportSort.dir === 'desc' ? 'selected' : ''}>Mayor ingreso ↓</option>
                        <option value="total-asc" ${reportSort.field === 'total' && reportSort.dir === 'asc' ? 'selected' : ''}>Menor ingreso ↑</option>
                    </select>
                </div>

                ${sortedProducts.length === 0 ? `
                    <p class="text-muted text-sm" style="padding: 2rem 0; text-align: center;">No hay productos vendidos para los filtros aplicados</p>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${pageProducts.map((prod, idx) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.85rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border-subtle);">
                                <div style="display: flex; align-items: center; gap: 0.65rem;">
                                    <span style="font-weight: 900; color: ${(start + idx) === 0 ? 'var(--color-primary)' : 'var(--text-muted)'}; font-size: 0.95rem; font-family: var(--font-mono);">
                                        #${start + idx + 1}
                                    </span>
                                    <span style="font-weight: 700; font-size: 0.9rem;">${prod.name}</span>
                                </div>
                                <div style="text-align: right;">
                                    <span class="badge badge--yellow" style="font-weight: 800;">${prod.qty} un.</span>
                                    <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem; font-family: var(--font-mono);">${formatGs(prod.total)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
                        <span style="font-size: 0.82rem; color: var(--text-muted);">
                            ${sortedProducts.length} producto(s) · Página ${reportPage} de ${totalPages}
                        </span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn--secondary btn--sm" id="btn-report-prev" ${reportPage <= 1 ? 'disabled style="opacity:0.4"' : ''}>← Anterior</button>
                            <button class="btn btn--secondary btn--sm" id="btn-report-next" ${reportPage >= totalPages ? 'disabled style="opacity:0.4"' : ''}>Siguiente →</button>
                        </div>
                    </div>
                `}
            </div>

            <!-- Desglose por Medio de Pago -->
            <div class="card">
                <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-primary); font-size: 1.05rem; margin-bottom: 1rem;">
                    💳 Filtrar por Medio de Pago
                </h3>

                <div style="margin-bottom: 1.25rem;">
                    <select id="report-filter-payment" style="width: 100%; font-size: 0.85rem;">
                        <option value="all">Todos los métodos de pago</option>
                        <option value="efectivo" ${reportFilter.payment === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
                        <option value="transferencia" ${reportFilter.payment === 'transferencia' ? 'selected' : ''}>📱 Transferencia</option>
                        <option value="debito" ${reportFilter.payment === 'debito' ? 'selected' : ''}>💳 Débito</option>
                        <option value="credito" ${reportFilter.payment === 'credito' ? 'selected' : ''}>💳 Crédito</option>
                    </select>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.85rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem; background: ${reportFilter.payment === 'efectivo' || reportFilter.payment === 'all' ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'efectivo' ? 'border: 1px solid var(--color-primary);' : 'border: 1px solid var(--border-subtle);'}">
                        <span>💵 Efectivo</span>
                        <strong style="color: var(--color-primary); font-size: 1.05rem; font-family: var(--font-mono);">${formatGs(payments.efectivo)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem; background: ${reportFilter.payment === 'transferencia' || reportFilter.payment === 'all' ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'transferencia' ? 'border: 1px solid #00F0FF;' : 'border: 1px solid var(--border-subtle);'}">
                        <span>📱 Transferencia</span>
                        <strong style="color: #00F0FF; font-size: 1.05rem; font-family: var(--font-mono);">${formatGs(payments.transferencia)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem; background: ${reportFilter.payment === 'debito' || reportFilter.payment === 'all' ? 'rgba(171,71,188,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'debito' ? 'border: 1px solid #AB47BC;' : 'border: 1px solid var(--border-subtle);'}">
                        <span>💳 Débito</span>
                        <strong style="color: #AB47BC; font-size: 1.05rem; font-family: var(--font-mono);">${formatGs(payments.debito)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.85rem; background: ${reportFilter.payment === 'credito' || reportFilter.payment === 'all' ? 'rgba(255,167,38,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'credito' ? 'border: 1px solid #FFA726;' : 'border: 1px solid var(--border-subtle);'}">
                        <span>💳 Crédito</span>
                        <strong style="color: #FFA726; font-size: 1.05rem; font-family: var(--font-mono);">${formatGs(payments.credito)}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    bindReportToolbar(body);
}

// ============================================================
// Vista 3: Auditoría de Ventas Ticket por Ticket con IVA
// ============================================================
function renderAuditView(body, kpiHtml, paidOrders) {
    const paymentBadges = {
        efectivo: '<span class="badge badge--yellow">💵 EFECTIVO</span>',
        transferencia: '<span class="badge badge--blue">📱 TRANSFERENCIA</span>',
        debito: '<span class="badge badge--purple">💳 DÉBITO</span>',
        credito: '<span class="badge badge--orange">💳 CRÉDITO</span>'
    };

    let list = paidOrders;
    if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        list = list.filter(o =>
            (o.order_number && String(o.order_number).toLowerCase().includes(q)) ||
            (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
            (o.notes && o.notes.toLowerCase().includes(q))
        );
    }

    body.innerHTML = `
        ${kpiHtml}

        <div class="card" style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                <h3 style="color: var(--color-primary); font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                    🧾 COMPROBANTES DE VENTAS AUDITABLES (${list.length} órdenes)
                </h3>
                <div style="width: 280px;">
                    <input type="text" id="audit-search-input" placeholder="🔍 Buscar por Nº pedido, cliente..." value="${auditSearch}" style="width: 100%; padding: 0.4rem 0.75rem; font-size: 0.85rem;">
                </div>
            </div>
        </div>

        <div id="audit-tickets-list">
            ${list.length === 0 ? `
                <div class="card" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                    <p>No se encontraron comprobantes para el criterio de búsqueda seleccionado.</p>
                </div>
            ` : list.map(order => {
                const total = order.total || 0;
                const iva = Math.round(total / 11);
                const subtotal = total - iva;
                const items = order.order_items || [];
                const methodKey = (order.payment_method || 'efectivo').toLowerCase();
                const badge = paymentBadges[methodKey] || `<span class="badge badge--yellow">${order.payment_method}</span>`;

                return `
                    <div class="audit-ticket-card">
                        <!-- Cabecera del Comprobante -->
                        <div class="audit-ticket-header">
                            <div>
                                <strong style="font-family: var(--font-title); font-size: 0.95rem; color: var(--color-primary);">
                                    PEDIDO #${order.order_number}
                                </strong>
                                <span style="font-size: 0.75rem; color: var(--text-dim); margin-left: 0.5rem; font-family: var(--font-mono);">
                                    [ID: ${(order.id || '').slice(0, 8)}]
                                </span>
                                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); margin-top: 0.2rem;">
                                    👤 ${order.customer_name || 'Consumidor Final'}
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem;">
                                <div>${badge}</div>
                                <span style="font-size: 0.78rem; color: var(--text-muted); font-family: var(--font-mono);">
                                    🕒 ${new Date(order.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })} • ${new Date(order.created_at).toLocaleDateString('es-PY')}
                                </span>
                            </div>
                        </div>

                        <!-- Renglones de Artículos -->
                        <div class="audit-ticket-body">
                            <table class="audit-items-table">
                                <thead>
                                    <tr>
                                        <th style="width: 70px;">CANTIDAD</th>
                                        <th>ARTÍCULO / PRODUCTO</th>
                                        <th style="text-align: right; width: 120px;">PRECIO UNIT.</th>
                                        <th style="text-align: right; width: 130px;">SUBTOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${items.map(it => {
                                        const qty = it.quantity || 1;
                                        const price = it.price || 0;
                                        const sub = price * qty;
                                        const cleanName = (it.product_name || 'Item').replace(/\s*\[📝\s*[^\]]+\]/, '').trim();
                                        return `
                                            <tr>
                                                <td style="font-family: var(--font-mono); font-weight: 800; color: var(--color-primary);">${qty}x</td>
                                                <td>
                                                    <strong>${cleanName}</strong>
                                                    ${it.is_combo ? '<span class="badge badge--yellow" style="font-size: 0.65rem; margin-left: 0.4rem;">COMBO</span>' : ''}
                                                </td>
                                                <td style="text-align: right; font-family: var(--font-mono); color: var(--text-muted);">${formatGs(price)}</td>
                                                <td style="text-align: right; font-family: var(--font-mono); font-weight: 700; color: var(--text-main);">${formatGs(sub)}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>

                            <!-- Pie de Comprobante: Subtotal, IVA 10% y Total -->
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); margin-top: 0.75rem; padding-top: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
                                <div style="font-size: 0.8rem; color: var(--text-muted);">
                                    ${order.notes ? `📝 <em>Notas: ${order.notes}</em>` : 'Sin observaciones adicionales'}
                                </div>
                                <div style="display: flex; gap: 1.5rem; align-items: baseline;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                                        Subtotal: <strong style="font-family: var(--font-mono);">${formatGs(subtotal)}</strong>
                                    </div>
                                    <div style="font-size: 0.8rem; color: #29B6F6;">
                                        IVA 10%: <strong style="font-family: var(--font-mono);">${formatGs(iva)}</strong>
                                    </div>
                                    <div style="font-size: 1.05rem; font-weight: 900; color: var(--color-primary);">
                                        TOTAL: <span style="font-family: var(--font-mono);">${formatGs(total)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Buscador interactivo de auditoría con debounce
    let auditTimer = null;
    body.querySelector('#audit-search-input')?.addEventListener('input', (e) => {
        clearTimeout(auditTimer);
        auditTimer = setTimeout(() => {
            auditSearch = e.target.value;
            renderReport(body.parentElement);
        }, 250);
    });
}

function bindReportToolbar(body) {
    let searchTimer = null;
    body.querySelector('#report-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            reportFilter.search = e.target.value;
            reportPage = 1;
            renderReport(body.parentElement);
        }, 250);
    });

    body.querySelector('#report-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        reportSort = { field, dir };
        reportPage = 1;
        renderReport(body.parentElement);
    });

    body.querySelector('#report-filter-payment')?.addEventListener('change', (e) => {
        reportFilter.payment = e.target.value;
        reportPage = 1;
        renderReport(body.parentElement);
    });

    body.querySelector('#btn-report-prev')?.addEventListener('click', () => {
        if (reportPage > 1) {
            reportPage--;
            renderReport(body.parentElement);
        }
    });

    body.querySelector('#btn-report-next')?.addEventListener('click', () => {
        reportPage++;
        renderReport(body.parentElement);
    });
}


// ============================================================
// Vista 4: Tiempos y Rendimiento de Cocina (KDS Analytics)
// ============================================================
async function renderKitchenView(body, kpiHtml, kitchenData, container) {
    if (!kitchenData) {
        body.innerHTML = `
            <div class="card p-4 text-center">
                <p>No se encontraron datos de tiempos para el período seleccionado.</p>
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
        modalityMap = {},
        diagnosis = [],
        orderTimes = []
    } = kitchenData;

    let generalBadge = '';
    if (avgTotalMinutes >= 25) {
        generalBadge = '<span class="badge badge--danger" style="font-size: 0.85rem; padding: 0.35rem 0.8rem; font-weight: 800;">🔴 ESTADO CRÍTICO (>25m)</span>';
    } else if (avgTotalMinutes >= 15) {
        generalBadge = '<span class="badge badge--warning" style="font-size: 0.85rem; padding: 0.35rem 0.8rem; font-weight: 800; color: #000; background: #FF9100;">🟠 DEMORAS FRECUENTES (15-25m)</span>';
    } else {
        generalBadge = '<span class="badge badge--success" style="font-size: 0.85rem; padding: 0.35rem 0.8rem; font-weight: 800;">🟢 RITMO ÓPTIMO (<15m)</span>';
    }

    // Filtrar comandas según buscador y filtro de retraso
    let filteredOrders = orderTimes.filter(o => {
        if (kitchenFilterDelay === 'delayed') return o.delayCategory === 'delayed' || o.delayCategory === 'critical';
        if (kitchenFilterDelay === 'critical') return o.delayCategory === 'critical';
        if (kitchenFilterDelay === 'ontime') return o.delayCategory === 'optimal' || o.delayCategory === 'normal';
        return true;
    });

    if (kitchenSearch.trim()) {
        const q = kitchenSearch.toLowerCase().trim();
        filteredOrders = filteredOrders.filter(o =>
            String(o.order_number).includes(q) ||
            (o.customer_name || '').toLowerCase().includes(q) ||
            (o.itemsSummary || '').toLowerCase().includes(q) ||
            (o.notes || '').toLowerCase().includes(q)
        );
    }

    body.innerHTML = `
        <!-- KPI Cards KDS -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card" style="border-left: 4px solid ${avgTotalMinutes >= 20 ? '#FF3D71' : (avgTotalMinutes >= 15 ? '#FF9100' : '#00E676')};">
                <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">⏱️ Tiempo Promedio Despacho</span>
                <h2 style="color: ${avgTotalMinutes >= 20 ? '#FF3D71' : (avgTotalMinutes >= 15 ? '#FF9100' : '#00E676')}; margin-top: 0.35rem; font-size: 1.7rem; font-family: var(--font-mono);">
                    ${avgTotalMinutes} <span style="font-size: 0.9rem;">min</span>
                </h2>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.2rem;">
                    <span style="font-size: 0.72rem; color: var(--text-muted);">Meta óptima: &lt; 15 min</span>
                    ${generalBadge}
                </div>
            </div>

            <div class="card" style="border-left: 4px solid #FF3D71;">
                <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">🚨 Pedidos Demorados (>15m)</span>
                <h2 style="color: #FF3D71; margin-top: 0.35rem; font-size: 1.7rem; font-family: var(--font-mono);">
                    ${delayedPct}% <span style="font-size: 0.85rem; color: var(--text-muted);">(${delayedCount + criticalCount}/${totalRealisticOrders})</span>
                </h2>
                <span style="font-size: 0.72rem; color: #FF5252; font-weight: 700;">
                    Críticos (>25m): ${criticalCount} pedidos
                </span>
            </div>

            <div class="card" style="border-left: 4px solid #00E5FF;">
                <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">⏳ Espera en Cola vs Plancha</span>
                <div style="display: flex; gap: 1rem; align-items: baseline; margin-top: 0.35rem;">
                    <div>
                        <div style="font-family: var(--font-mono); font-size: 1.25rem; color: #00E5FF; font-weight: 800;">
                            ${avgQueueMinutes}m
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">Cola (Antes de plancha)</div>
                    </div>
                    <div style="color: var(--text-muted); font-size: 1.2rem;">/</div>
                    <div>
                        <div style="font-family: var(--font-mono); font-size: 1.25rem; color: var(--color-primary); font-weight: 800;">
                            ${avgCookingMinutes}m
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-muted);">Cocción (En fuego)</div>
                    </div>
                </div>
                <span style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; display: block;">
                    ${avgQueueMinutes > avgCookingMinutes ? '⚠️ Se pierde más tiempo en espera que cocinando' : '🔥 Ritmo de plancha sincronizado'}
                </span>
            </div>

            <div class="card" style="border-left: 4px solid var(--color-primary);">
                <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📦 Comandas y Efectividad</span>
                <h2 style="color: var(--color-primary); margin-top: 0.35rem; font-size: 1.7rem; font-family: var(--font-mono);">
                    ${onTimePct}% <span style="font-size: 0.85rem; color: #00E676;">a tiempo</span>
                </h2>
                <span style="font-size: 0.72rem; color: var(--text-muted);">
                    ${onTimeCount} pedidos dentro del rango óptimo
                </span>
            </div>
        </div>

        <!-- Diagnóstico Operativo Automático & Botón Exportar -->
        <div style="background: radial-gradient(circle at 10% 50%, rgba(255, 215, 0, 0.08) 0%, rgba(10, 11, 14, 0.95) 100%); border: 1.5px solid var(--border-gold); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
            <div style="flex: 1; min-width: 280px;">
                <h3 style="font-family: var(--font-title); font-size: 0.85rem; color: var(--color-primary); margin: 0 0 0.5rem 0; display: flex; align-items: center; gap: 0.4rem;">
                    💡 DIAGNÓSTICO INTELIGENTE DE CUELLOS DE BOTELLA
                </h3>
                <div style="display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.84rem; color: var(--text-main);">
                    ${diagnosis.map(d => `<div style="display: flex; align-items: flex-start; gap: 0.4rem;"><span>•</span> <span>${d}</span></div>`).join('')}
                </div>
            </div>
            <button id="btn-export-kitchen-times" class="btn btn--primary" style="font-weight: 800; font-size: 0.85rem; padding: 0.65rem 1.2rem; box-shadow: 0 0 16px var(--color-primary-glow); white-space: nowrap;">
                📥 Exportar Auditoría KDS a Excel
            </button>
        </div>

        <!-- Gráfico de Tiempos por Franja Horaria -->
        <div class="card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                <div>
                    <h3 style="color: var(--color-primary); font-size: 0.95rem; margin: 0; display: flex; align-items: center; gap: 0.5rem;">
                        📊 Tiempo Promedio de Espera por Hora del Día
                    </h3>
                    <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0.2rem 0 0 0;">
                        Visualiza qué horas saturan la plancha y superan la meta de 15 minutos (horas en rojo/naranja).
                    </p>
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">
                    Zona Horaria: Paraguay (America/Asuncion)
                </span>
            </div>
            <div style="position: relative; height: 260px; width: 100%;">
                <canvas id="chart-kitchen-hourly"></canvas>
            </div>
        </div>

        <!-- Dos Columnas: Cuellos de Botella por Producto y Desglose por Modalidad -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
            <!-- Cuellos de Botella por Producto -->
            <div class="card" style="padding: 1.25rem;">
                <h3 style="color: var(--color-primary); font-size: 0.92rem; margin: 0 0 0.4rem 0; display: flex; align-items: center; gap: 0.4rem;">
                    🍔 Productos con Mayor Incidencia en Demoras
                </h3>
                <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.85rem;">
                    Artículos que estuvieron presentes más veces en órdenes con &gt;15 min de retraso.
                </p>
                ${topBottleneckProducts.length === 0 ? `
                    <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1.5rem 0;">
                        ✨ No se registraron productos demorados en este período
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                        ${topBottleneckProducts.slice(0, 6).map(p => `
                            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 0.55rem 0.8rem; display: flex; justify-content: space-between; align-items: center;">
                                <div style="min-width: 0; flex: 1;">
                                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${p.name}
                                    </div>
                                    <div style="font-size: 0.72rem; color: var(--text-muted);">
                                        Preparados: ${p.totalPrepared} · En demoras: <strong style="color: #FF3D71;">${p.delayedOrders} veces</strong> (${p.pctDelayed}%)
                                    </div>
                                </div>
                                <span style="font-family: var(--font-mono); font-size: 0.82rem; color: #FF9100; font-weight: 800; margin-left: 0.5rem;">
                                    ~${p.avgWaitWhenDelayed}m
                                </span>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>

            <!-- Desglose por Modalidad (Salón vs Llevar vs Delivery) -->
            <div class="card" style="padding: 1.25rem;">
                <h3 style="color: var(--color-primary); font-size: 0.92rem; margin: 0 0 0.4rem 0; display: flex; align-items: center; gap: 0.4rem;">
                    🍽️ Comparativa por Modalidad de Pedido
                </h3>
                <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.85rem;">
                    Tiempo promedio y porcentaje de pedidos retrasados según servicio.
                </p>
                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                    ${['salon', 'llevar', 'delivery', 'other'].map(k => {
                        const m = modalityMap[k] || { count: 0, totalWait: 0, delayed: 0, label: k };
                        const avg = m.count > 0 ? Math.round((m.totalWait / m.count) * 10) / 10 : 0;
                        const pctDel = m.count > 0 ? Math.round((m.delayed / m.count) * 100) : 0;
                        return `
                            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 0.65rem 0.85rem;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                    <strong style="color: var(--text-main); font-size: 0.85rem;">${m.label}</strong>
                                    <span style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: 800; color: ${avg >= 20 ? '#FF3D71' : (avg >= 15 ? '#FF9100' : '#00E676')};">
                                        ${avg} min
                                    </span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted);">
                                    <span>Total: ${m.count} pedidos</span>
                                    <span style="color: ${pctDel >= 40 ? '#FF3D71' : 'var(--text-muted)'}; font-weight: 600;">Demorados: ${m.delayed} (${pctDel}%)</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- Tabla Completa de Auditoría Comanda x Comanda -->
        <div class="card" style="padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <h3 style="color: var(--color-primary); font-size: 0.95rem; margin: 0; display: flex; align-items: center; gap: 0.4rem;">
                        🧾 Auditoría Detallada de Tiempos Comanda por Comanda
                    </h3>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">
                        Mostrando ${filteredOrders.length} de ${orderTimes.length} comandas
                    </span>
                </div>

                <!-- Filtros y Buscador -->
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn btn--sm ${kitchenFilterDelay === 'all' ? 'btn--primary' : 'btn--secondary'} btn-kds-filter" data-filter="all" style="font-size: 0.74rem;">
                            Todas
                        </button>
                        <button class="btn btn--sm ${kitchenFilterDelay === 'delayed' ? 'btn--primary' : 'btn--secondary'} btn-kds-filter" data-filter="delayed" style="font-size: 0.74rem;">
                            Demoradas (&gt;15m)
                        </button>
                        <button class="btn btn--sm ${kitchenFilterDelay === 'critical' ? 'btn--primary' : 'btn--secondary'} btn-kds-filter" data-filter="critical" style="font-size: 0.74rem;">
                            Críticas (&gt;25m)
                        </button>
                    </div>
                    <input type="text" id="input-kds-search" placeholder="🔍 Buscar #pedido o cliente..." value="${kitchenSearch}" style="background: #0E1017; border: 1px solid var(--border-subtle); color: #FFF; padding: 0.35rem 0.65rem; border-radius: 4px; font-size: 0.78rem; width: 180px;">
                </div>
            </div>

            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-gold); text-align: left; color: var(--color-primary); font-size: 0.74rem; text-transform: uppercase;">
                            <th style="padding: 0.5rem 0.6rem;"># Comanda</th>
                            <th style="padding: 0.5rem 0.6rem;">Cliente / Mesa</th>
                            <th style="padding: 0.5rem 0.6rem;">Modalidad</th>
                            <th style="padding: 0.5rem 0.6rem;">Hora Pedido</th>
                            <th style="padding: 0.5rem 0.6rem;">Inicio Plancha</th>
                            <th style="padding: 0.5rem 0.6rem;">Listo en Barra</th>
                            <th style="padding: 0.5rem 0.6rem; text-align: center;">Espera Total</th>
                            <th style="padding: 0.5rem 0.6rem; text-align: center;">En Cola</th>
                            <th style="padding: 0.5rem 0.6rem; text-align: center;">Plancha</th>
                            <th style="padding: 0.5rem 0.6rem;">Nivel Demora</th>
                            <th style="padding: 0.5rem 0.6rem;">Productos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredOrders.length === 0 ? `
                            <tr>
                                <td colspan="11" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                                    No se encontraron comandas con el filtro aplicado.
                                </td>
                            </tr>
                        ` : filteredOrders.slice(0, 100).map(o => {
                            const timeOrder = o.created_at ? new Date(o.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';
                            const timePrep = o.preparing_at ? new Date(o.preparing_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';
                            const timeReady = (o.ready_at || o.delivered_at) ? new Date(o.ready_at || o.delivered_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';

                            return `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${o.delayCategory === 'critical' ? 'background: rgba(255, 61, 113, 0.05);' : ''}">
                                    <td style="padding: 0.55rem 0.6rem; font-weight: 800; font-family: var(--font-mono); color: var(--color-primary);">
                                        #${o.order_number}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; font-weight: 700; color: var(--text-main);">
                                        ${o.customer_name}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; color: var(--text-muted); font-size: 0.75rem;">
                                        ${o.modalityLabel}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; font-family: var(--font-mono); color: var(--text-muted);">
                                        ${timeOrder}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; font-family: var(--font-mono); color: var(--text-muted);">
                                        ${timePrep}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; font-family: var(--font-mono); color: var(--text-muted);">
                                        ${timeReady}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; text-align: center; font-family: var(--font-mono); font-weight: 800; color: ${o.delayColor}; font-size: 0.9rem;">
                                        ${o.totalMinutes !== null ? o.totalMinutes + 'm' : 'En marcha'}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; text-align: center; font-family: var(--font-mono); color: var(--text-muted);">
                                        ${o.queueMinutes !== null ? o.queueMinutes + 'm' : '—'}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; text-align: center; font-family: var(--font-mono); color: var(--text-muted);">
                                        ${o.cookingMinutes !== null ? o.cookingMinutes + 'm' : '—'}
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem;">
                                        <span style="background: ${o.delayColor}22; border: 1px solid ${o.delayColor}; color: ${o.delayColor}; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; white-space: nowrap;">
                                            ${o.delayBadge}
                                        </span>
                                    </td>
                                    <td style="padding: 0.55rem 0.6rem; color: var(--text-muted); font-size: 0.75rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${o.itemsSummary}">
                                        ${o.itemsSummary}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ${filteredOrders.length > 100 ? `
                <div style="font-size: 0.75rem; color: var(--text-muted); text-align: center; margin-top: 0.8rem;">
                    💡 Mostrando las primeras 100 comandas. Para el análisis completo descarga el archivo Excel.
                </div>
            ` : ''}
        </div>
    `;

    // Eventos de la vista
    body.querySelector('#btn-export-kitchen-times')?.addEventListener('click', async () => {
        const btn = body.querySelector('#btn-export-kitchen-times');
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Exportando Excel...';

        try {
            let periodLabel = selectedPeriod;
            if (selectedPeriod === 'custom') {
                periodLabel = `${customStartDate}_al_${customEndDate}`;
            }
            await exportKitchenTimesExcel(kitchenData, periodLabel);
            showToast({ message: '✅ Auditoría de Tiempos de Cocina exportada a Excel', type: 'success' });
        } catch (err) {
            console.error('Error exportando tiempos a Excel:', err);
            showToast({ message: 'Error exportando Excel: ' + err.message, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    });

    // Filtros de nivel de demora
    body.querySelectorAll('.btn-kds-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            kitchenFilterDelay = e.currentTarget.dataset.filter;
            renderKitchenView(body, kpiHtml, kitchenData, container);
        });
    });

    // Buscador interactivo
    let searchDebounce = null;
    body.querySelector('#input-kds-search')?.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            kitchenSearch = e.target.value;
            renderKitchenView(body, kpiHtml, kitchenData, container);
        }, 200);
    });

    // Renderizar gráfico interactivo de barras de horas con Chart.js
    await initKitchenChart(kitchenData);
}

async function initKitchenChart(kitchenData) {
    try {
        const ChartClass = await reportService.ensureChartJS();
        if (!ChartClass) return;

        const canvas = document.getElementById('chart-kitchen-hourly');
        if (!canvas) return;

        const hourlyMap = kitchenData.hourlyMap || [];
        // Filtrar para mostrar horas con actividad o franja vespertina/nocturna
        const activeHours = hourlyMap.filter(h => h.count > 0 || (h.hour >= 18 && h.hour <= 23));
        const labels = activeHours.map(h => h.label);
        const avgData = activeHours.map(h => h.avgMinutes);

        kitchenChartInstance = new ChartClass(canvas, {
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
                        labels: {
                            color: '#A0A5B5',
                            font: { family: "'Inter', sans-serif", size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` Tiempo promedio: ${ctx.raw} min`
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Minutos Promedio', color: '#A0A5B5' },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#A0A5B5' },
                        suggestedMax: 30
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#A0A5B5' }
                    }
                }
            }
        });
    } catch (err) {
        console.warn('Error inicializando gráfico de cocina:', err);
    }
}

