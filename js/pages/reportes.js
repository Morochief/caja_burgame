import { reportService } from '../services/report-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let selectedPeriod = 'today'; // 'today' | 'week' | 'month'

// Estados de filtro, ordenamiento y paginación del ranking de productos
let reportFilter = { search: '', payment: 'all' };
let reportSort = { field: 'qty', dir: 'desc' };
let reportPage = 1;
const REPORT_PAGE_SIZE = 8;

// Cache de órdenes del período actual (evita re-fetchear al cambiar filtros)
let cachedPaidOrders = [];

export async function renderReportesPage() {
    const container = document.createElement('div');
    container.className = 'reportes-page';

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>📈 REPORTES Y ANALÍTICA DE VENTAS</h1>
                <p>Estadísticas y rendimiento del negocio en tiempo real</p>
            </div>
            <div class="period-selectors" style="display: flex; gap: 0.5rem; background: var(--bg-card); padding: 0.3rem; border-radius: 8px; border: 1px solid var(--border-subtle);">
                <button class="btn btn--sm period-btn ${selectedPeriod === 'today' ? 'btn--primary' : 'btn--secondary'}" data-period="today">Hoy</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'week' ? 'btn--primary' : 'btn--secondary'}" data-period="week">Últimos 7 Días</button>
                <button class="btn btn--sm period-btn ${selectedPeriod === 'month' ? 'btn--primary' : 'btn--secondary'}" data-period="month">Este Mes</button>
            </div>
        </header>

        <div id="reportes-body" style="margin-top: 1.5rem;">
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

            loadReportData(container);
        });
    });
}

async function loadReportData(container) {
    const body = container.querySelector('#reportes-body');
    if (!body) return;

    try {
        let fromDate = new Date();
        fromDate.setHours(0, 0, 0, 0);

        if (selectedPeriod === 'week') {
            fromDate.setDate(fromDate.getDate() - 7);
        } else if (selectedPeriod === 'month') {
            fromDate.setDate(1);
        }

        const nowIso = new Date().toISOString();
        const fromIso = fromDate.toISOString();

        // Cargar órdenes del período (se cachean para filtros sin re-fetch)
        const orders = await orderService.getOrdersByDateRange(fromIso, nowIso);
        cachedPaidOrders = (orders || []).filter(o => o.paid_at);

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
// Render del reporte completo (usa cachedPaidOrders)
// ============================================================
function renderReport(container) {
    const body = container.querySelector('#reportes-body');
    if (!body) return;

    // Aplicar filtro por método de pago
    let filteredOrders = cachedPaidOrders;
    if (reportFilter.payment !== 'all') {
        filteredOrders = cachedPaidOrders.filter(o =>
            (o.payment_method || 'efectivo') === reportFilter.payment
        );
    }

    // Cálculo de Métricas Clave
    const totalSales = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const orderCount = filteredOrders.length;
    const avgTicket = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

    // Desglose de Medios de Pago (siempre sobre todas las órdenes del período)
    const payments = {
        efectivo: 0,
        transferencia: 0,
        debito: 0,
        credito: 0
    };

    cachedPaidOrders.forEach(o => {
        const method = (o.payment_method || 'efectivo').toLowerCase();
        if (payments[method] !== undefined) {
            payments[method] += (o.total || 0);
        } else {
            payments.efectivo += (o.total || 0);
        }
    });

    // Conteo de Productos más Vendidos
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

    // Aplicar búsqueda al ranking
    let sortedProducts = Object.entries(productStats)
        .map(([name, data]) => ({ name, ...data }));

    if (reportFilter.search.trim()) {
        const q = reportFilter.search.toLowerCase();
        sortedProducts = sortedProducts.filter(p => p.name.toLowerCase().includes(q));
    }

    // Ordenamiento
    const { field, dir } = reportSort;
    sortedProducts.sort((a, b) => {
        const va = a[field], vb = b[field];
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    // Paginación del ranking
    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / REPORT_PAGE_SIZE));
    if (reportPage > totalPages) reportPage = totalPages;
    const start = (reportPage - 1) * REPORT_PAGE_SIZE;
    const pageProducts = sortedProducts.slice(start, start + REPORT_PAGE_SIZE);

    // Renderizar Interfaz de Reportes
    body.innerHTML = `
        <!-- Tarjetas KPI -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="card" style="border-left: 4px solid var(--color-primary);">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">💰 Ventas Totales</span>
                <h2 style="color: var(--color-primary); margin-top: 0.4rem; font-size: 1.6rem;">${formatGs(totalSales)}</h2>
            </div>
            <div class="card" style="border-left: 4px solid #00E676;">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">📦 Órdenes Cobradas</span>
                <h2 style="color: #00E676; margin-top: 0.4rem; font-size: 1.6rem;">${orderCount} pedidos</h2>
            </div>
            <div class="card" style="border-left: 4px solid #29B6F6;">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">🍔 Ticket Promedio</span>
                <h2 style="color: #29B6F6; margin-top: 0.4rem; font-size: 1.6rem;">${formatGs(avgTicket)}</h2>
            </div>
        </div>

        <!-- Grilla Principal de Análisis -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
            <!-- Productos Más Vendidos -->
            <div class="card">
                <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-primary); font-size: 1.1rem; margin-bottom: 1rem;">
                    🏆 Ranking Productos Más Vendidos
                </h3>

                <!-- Toolbar del ranking -->
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    <input type="text" id="report-search" placeholder="🔍 Buscar producto..." value="${reportFilter.search}" style="flex: 1; min-width: 120px;">
                    <select id="report-sort" style="min-width: 130px;">
                        <option value="qty-desc">Más vendidos ↓</option>
                        <option value="qty-asc">Menos vendidos ↑</option>
                        <option value="total-desc">Mayor ingreso ↓</option>
                        <option value="total-asc">Menor ingreso ↑</option>
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

                    <!-- Paginación del ranking -->
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
                <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-primary); font-size: 1.1rem; margin-bottom: 1rem;">
                    💳 Ingresos por Medio de Pago
                </h3>

                <!-- Filtro por método de pago -->
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

    bindReportToolbar(container);
}

// ============================================================
// Eventos de los filtros del reporte (sin re-fetch, usa cache)
// ============================================================
function bindReportToolbar(container) {
    let searchTimer = null;
    container.querySelector('#report-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            reportFilter.search = e.target.value;
            reportPage = 1;
            renderReport(container);
        }, 250);
    });

    container.querySelector('#report-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        reportSort = { field, dir };
        reportPage = 1;
        renderReport(container);
    });

    container.querySelector('#report-filter-payment')?.addEventListener('change', (e) => {
        reportFilter.payment = e.target.value;
        reportPage = 1;
        renderReport(container);
    });

    container.querySelector('#btn-report-prev')?.addEventListener('click', () => {
        if (reportPage > 1) { reportPage--; renderReport(container); }
    });
    container.querySelector('#btn-report-next')?.addEventListener('click', () => {
        reportPage++;
        renderReport(container);
    });
}
