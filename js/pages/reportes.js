import { reportService } from '../services/report-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { exportConsolidatedReportExcel } from '../services/excel-export-service.js';

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

export async function renderReportesPage() {
    const container = document.createElement('div');
    container.className = 'reportes-page';

    const todayStr = new Date().toISOString().slice(0, 10);
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
    const todayStr = new Date().toISOString().slice(0, 10);
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

            const now = new Date();
            if (selectedPeriod === 'today') {
                fromInput.value = todayStr;
                toInput.value = todayStr;
            } else if (selectedPeriod === 'yesterday') {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                const yStr = y.toISOString().slice(0, 10);
                fromInput.value = yStr;
                toInput.value = yStr;
            } else if (selectedPeriod === 'week') {
                const w = new Date();
                w.setDate(w.getDate() - 7);
                fromInput.value = w.toISOString().slice(0, 10);
                toInput.value = todayStr;
            } else if (selectedPeriod === 'month') {
                const m = new Date(now.getFullYear(), now.getMonth(), 1);
                fromInput.value = m.toISOString().slice(0, 10);
                toInput.value = todayStr;
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

        const fromDate = new Date(startStr);
        fromDate.setHours(0, 0, 0, 0);

        const toDate = new Date(endStr);
        toDate.setHours(23, 59, 59, 999);

        // Actualizar etiqueta del período
        const statusLabel = container.querySelector('#period-status-label');
        if (statusLabel) {
            const fPretty = fromDate.toLocaleDateString('es-PY');
            const tPretty = toDate.toLocaleDateString('es-PY');
            statusLabel.textContent = `Período activo: ${fPretty} - ${tPretty} (${selectedPeriod.toUpperCase()})`;
        }

        const analytics = await reportService.getAnalyticsByRange(fromDate.toISOString(), toDate.toISOString());
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



