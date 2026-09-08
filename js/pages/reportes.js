import { reportService } from '../services/report-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { exportConsolidatedReportExcel } from '../services/excel-export-service.js';

let selectedPeriod = 'today'; // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
let customStartDate = '';
let customEndDate = '';

// Estados de filtro, ordenamiento y paginación del ranking de productos
let reportFilter = { search: '', payment: 'all' };
let reportSort = { field: 'qty', dir: 'desc' };
let reportPage = 1;
const REPORT_PAGE_SIZE = 8;

// Cache analítica completa del período actual
let cachedAnalytics = null;

let currentSubTab = 'overview'; // 'overview' | 'audit'
let auditSearch = '';

export async function renderReportesPage() {
    const container = document.createElement('div');
    container.className = 'reportes-page';

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>📈 REPORTES, AUDITORÍA Y EXPORTACIÓN</h1>
                <p>Análisis de facturación, gastos y descargas retrospectivas de Excel</p>
            </div>
            <div class="period-selectors" style="display: flex; gap: 0.4rem; background: var(--bg-card); padding: 0.35rem; border-radius: 8px; border: 1px solid var(--border-subtle); flex-wrap: wrap;">
                <button class="btn btn--sm period-btn ${selectedPeriod === 'today' ? 'btn--primary' : 'btn--secondary'}" data-period="today">Hoy</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'yesterday' ? 'btn--primary' : 'btn--secondary'}" data-period="yesterday">Ayer</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'week' ? 'btn--primary' : 'btn--secondary'}" data-period="week">7 Días</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'month' ? 'btn--primary' : 'btn--secondary'}" data-period="month">Este Mes</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'custom' ? 'btn--primary' : 'btn--secondary'}" data-period="custom">Fecha / Rango</button>
            </div>
        </header>

        <!-- Barra especial de Descarga Rápida de Excel Retrospectivo -->
        <div class="reportes-export-bar">
            <div class="reportes-export-info">
                <h4>📥 EXPORTAR REPORTE COMPLETO A EXCEL</h4>
                <p>Descarga un libro de 4 hojas (Resumen, Ventas con desglose de artículos, Productos y Gastos) de cualquier día o rango.</p>
            </div>
            <div class="reportes-export-actions">
                <div id="retro-date-container" style="display: inline-flex; align-items: center; gap: 0.5rem;">
                    <label for="retro-target-date" style="font-size: 0.8rem; color: var(--text-muted);">Día específico:</label>
                    <input type="date" id="retro-target-date" class="report-date-input">
                </div>
                <button id="btn-download-excel" class="btn btn--primary" style="font-weight: 800; font-size: 0.85rem; padding: 0.55rem 1.1rem; box-shadow: 0 0 12px var(--color-primary-glow);">
                    📥 Descargar Excel
                </button>
            </div>
        </div>

        <!-- Sub-Tabs de visualización en pantalla -->
        <div class="report-view-tabs">
            <button class="report-view-tab ${currentSubTab === 'overview' ? 'active' : ''}" data-tab="overview">
                📊 RESUMEN Y RANKING DE PRODUCTOS
            </button>
            <button class="report-view-tab ${currentSubTab === 'audit' ? 'active' : ''}" data-tab="audit">
                🧾 AUDITORÍA DE VENTAS (TICKETS Y ARTÍCULOS)
            </button>
        </div>

        <div id="reportes-body" style="margin-top: 1rem;">
            <div class="page-loading">
                <div class="pixel-spinner"></div>
                <p>Cargando datos analíticos...</p>
            </div>
        </div>
    `;

    setupEvents(container);
    loadReportData(container);

    return container;
}

function setupEvents(container) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const retroInput = container.querySelector('#retro-target-date');
    if (retroInput) retroInput.value = todayStr;

    // Selector de Períodos
    container.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedPeriod = btn.dataset.period;
            container.querySelectorAll('.period-btn').forEach(b => {
                b.classList.remove('btn--primary');
                b.classList.add('btn--secondary');
            });
            btn.classList.remove('btn--secondary');
            btn.classList.add('btn--primary');

            // Reset filtros al cambiar de período
            reportFilter = { search: '', payment: 'all' };
            reportSort = { field: 'qty', dir: 'desc' };
            reportPage = 1;

            if (selectedPeriod === 'yesterday') {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                if (retroInput) retroInput.value = y.toISOString().slice(0, 10);
            } else if (selectedPeriod === 'today') {
                if (retroInput) retroInput.value = todayStr;
            }

            loadReportData(container);
        });
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

    // Botón descargar Excel consolidado
    container.querySelector('#btn-download-excel')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-download-excel');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Generando Excel...';

        try {
            const chosenDate = container.querySelector('#retro-target-date')?.value;
            let dataToExport = cachedAnalytics;
            let label = selectedPeriod;

            // Si el usuario especificó una fecha manual distinta al período cargado
            if (chosenDate) {
                dataToExport = await reportService.getDayFullConsolidated(chosenDate);
                label = chosenDate;
            }

            if (!dataToExport || (!dataToExport.paidOrders.length && !dataToExport.expenses.length)) {
                showToast({ message: 'No hay transacciones ni gastos registrados en la fecha elegida', type: 'warning' });
                return;
            }

            await exportConsolidatedReportExcel(dataToExport, label);
            showToast({ message: `✅ Excel descargado con éxito (${label})`, type: 'success' });
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

    try {
        let fromDate = new Date();
        let toDate = new Date();

        if (selectedPeriod === 'today') {
            fromDate.setHours(0, 0, 0, 0);
            toDate.setHours(23, 59, 59, 999);
        } else if (selectedPeriod === 'yesterday') {
            fromDate.setDate(fromDate.getDate() - 1);
            fromDate.setHours(0, 0, 0, 0);
            toDate.setDate(toDate.getDate() - 1);
            toDate.setHours(23, 59, 59, 999);
        } else if (selectedPeriod === 'week') {
            fromDate.setDate(fromDate.getDate() - 7);
            fromDate.setHours(0, 0, 0, 0);
        } else if (selectedPeriod === 'month') {
            fromDate.setDate(1);
            fromDate.setHours(0, 0, 0, 0);
        } else if (selectedPeriod === 'custom') {
            const chosen = container.querySelector('#retro-target-date')?.value || new Date().toISOString().slice(0, 10);
            fromDate = new Date(chosen);
            fromDate.setHours(0, 0, 0, 0);
            toDate = new Date(chosen);
            toDate.setHours(23, 59, 59, 999);
        }

        const analytics = await reportService.getAnalyticsByRange(fromDate.toISOString(), toDate.toISOString());
        cachedAnalytics = analytics;

        renderReport(container);
    } catch (err) {
        body.innerHTML = `
            <div class="card p-4" style="color: #FF5252; text-align: center;">
                <h2>Error cargando reportes</h2>
                <p>${err.message}</p>
            </div>
        `;
    }
}

// ============================================================
// Render del reporte según el Sub-Tab activo
// ============================================================
function renderReport(container) {
    const body = container.querySelector('#reportes-body');
    if (!body || !cachedAnalytics) return;

    const {
        paidOrders,
        expenses,
        totalSales,
        totalExpenses,
        netProfit,
        profitMargin,
        orderCount,
        avgTicket,
        payments
    } = cachedAnalytics;

    const totalIva = Math.round(totalSales / 11);
    const totalSubtotal = totalSales - totalIva;

    // Header común de KPIs Financieros y Fiscales
    const kpiHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card" style="border-left: 4px solid var(--color-primary);">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">💰 Facturación Total</span>
                <h2 style="color: var(--color-primary); margin-top: 0.4rem; font-size: 1.4rem;">${formatGs(totalSales)}</h2>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${orderCount} pedidos cobrados</span>
            </div>
            <div class="card" style="border-left: 4px solid #29B6F6;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📑 Liquidación IVA 10%</span>
                <h2 style="color: #29B6F6; margin-top: 0.4rem; font-size: 1.4rem;">${formatGs(totalIva)}</h2>
                <span style="font-size: 0.72rem; color: var(--text-muted);">Subtotal: ${formatGs(totalSubtotal)}</span>
            </div>
            <div class="card" style="border-left: 4px solid #FF3D71;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">💸 Gastos Totales</span>
                <h2 style="color: #FF3D71; margin-top: 0.4rem; font-size: 1.4rem;">${formatGs(totalExpenses)}</h2>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${expenses.length} egresos</span>
            </div>
            <div class="card" style="border-left: 4px solid #00E676;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📈 Margen Neto</span>
                <h2 style="color: #00E676; margin-top: 0.4rem; font-size: 1.4rem;">${formatGs(netProfit)}</h2>
                <span style="font-size: 0.72rem; color: #00E676; font-weight: 700;">Rentabilidad: ${profitMargin}%</span>
            </div>
        </div>
    `;

    if (currentSubTab === 'audit') {
        renderAuditView(body, kpiHtml, paidOrders);
    } else {
        renderOverviewView(body, kpiHtml, paidOrders, payments);
    }
}

// Vista 1: Resumen General y Ranking de Productos
function renderOverviewView(body, kpiHtml, paidOrders, payments) {
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
            productStats[name].total += (item.price * item.quantity);
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
                    <input type="text" id="report-search" placeholder="🔍 Buscar producto..." value="${reportFilter.search}" style="flex: 1; min-width: 120px;">
                    <select id="report-sort" style="min-width: 130px;">
                        <option value="qty-desc" ${reportSort.field === 'qty' && reportSort.dir === 'desc' ? 'selected' : ''}>Más vendidos ↓</option>
                        <option value="qty-asc" ${reportSort.field === 'qty' && reportSort.dir === 'asc' ? 'selected' : ''}>Menos vendidos ↑</option>
                        <option value="total-desc" ${reportSort.field === 'total' && reportSort.dir === 'desc' ? 'selected' : ''}>Mayor ingreso ↓</option>
                        <option value="total-asc" ${reportSort.field === 'total' && reportSort.dir === 'asc' ? 'selected' : ''}>Menor ingreso ↑</option>
                    </select>
                </div>

                ${sortedProducts.length === 0 ? `
                    <p class="text-muted text-sm" style="padding: 1rem 0; text-align: center;">No hay transacciones registradas en este período</p>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${pageProducts.map((prod, idx) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border-subtle);">
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    <span style="font-weight: 900; color: ${(start + idx) === 0 ? 'var(--color-primary)' : 'var(--text-muted)'}; font-size: 0.9rem;">#${start + idx + 1}</span>
                                    <span style="font-weight: 700; font-size: 0.9rem;">${prod.name}</span>
                                </div>
                                <div style="text-align: right;">
                                    <span class="badge badge--yellow" style="font-weight: 800;">${prod.qty} vendidas</span>
                                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.1rem;">${formatGs(prod.total)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">
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
                    💳 Ingresos por Medio de Pago
                </h3>

                <div style="margin-bottom: 1rem;">
                    <select id="report-filter-payment" style="width: 100%;">
                        <option value="all">Todos los métodos</option>
                        <option value="efectivo" ${reportFilter.payment === 'efectivo' ? 'selected' : ''}>💵 Efectivo</option>
                        <option value="transferencia" ${reportFilter.payment === 'transferencia' ? 'selected' : ''}>📱 Transferencia</option>
                        <option value="debito" ${reportFilter.payment === 'debito' ? 'selected' : ''}>💳 Débito</option>
                        <option value="credito" ${reportFilter.payment === 'credito' ? 'selected' : ''}>💳 Crédito</option>
                    </select>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: ${reportFilter.payment === 'efectivo' || reportFilter.payment === 'all' ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'efectivo' ? 'border: 1px solid var(--color-primary);' : ''}">
                        <span>💵 Efectivo</span>
                        <strong style="color: var(--color-primary); font-size: 1.05rem;">${formatGs(payments.efectivo)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: ${reportFilter.payment === 'transferencia' || reportFilter.payment === 'all' ? 'rgba(41,182,246,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'transferencia' ? 'border: 1px solid #29B6F6;' : ''}">
                        <span>📱 Transferencia</span>
                        <strong style="color: #29B6F6; font-size: 1.05rem;">${formatGs(payments.transferencia)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: ${reportFilter.payment === 'debito' || reportFilter.payment === 'all' ? 'rgba(171,71,188,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'debito' ? 'border: 1px solid #AB47BC;' : ''}">
                        <span>💳 Débito</span>
                        <strong style="color: #AB47BC; font-size: 1.05rem;">${formatGs(payments.debito)}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: ${reportFilter.payment === 'credito' || reportFilter.payment === 'all' ? 'rgba(255,167,38,0.08)' : 'rgba(255,255,255,0.03)'}; border-radius: 6px; ${reportFilter.payment === 'credito' ? 'border: 1px solid #FFA726;' : ''}">
                        <span>💳 Crédito</span>
                        <strong style="color: #FFA726; font-size: 1.05rem;">${formatGs(payments.credito)}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;

    bindReportToolbar(body);
}

// Vista 2: Auditoría de Ventas (Formato Ticket por Ticket con renglones de artículos e IVA)
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
                <div style="width: 260px;">
                    <input type="text" id="audit-search-input" placeholder="🔍 Buscar por Nº pedido, cliente..." value="${auditSearch}" style="width: 100%; padding: 0.4rem 0.75rem; font-size: 0.85rem;">
                </div>
            </div>
        </div>

        <div id="audit-tickets-list">
            ${list.length === 0 ? `
                <div class="card" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <p>No se encontraron comprobantes para el filtro seleccionado.</p>
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
                                <strong style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary);">
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

    // Evento del buscador de auditoría
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
        if (reportPage > 1) { reportPage--; renderReport(body.parentElement); }
    });
    body.querySelector('#btn-report-next')?.addEventListener('click', () => {
        reportPage++;
        renderReport(body.parentElement);
    });
}


