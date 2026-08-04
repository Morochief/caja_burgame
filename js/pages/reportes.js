import { reportService } from '../services/report-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let selectedPeriod = 'today'; // 'today' | 'week' | 'month'

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

        // Cargar órdenes y los ítems
        const orders = await orderService.getOrdersByDateRange(fromIso, nowIso);
        const paidOrders = (orders || []).filter(o => o.status === 'paid');

        // Cálculo de Métricas Clave
        const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const orderCount = paidOrders.length;
        const avgTicket = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

        // Desglose de Medios de Pago
        const payments = {
            efectivo: 0,
            transferencia: 0,
            debito: 0,
            credito: 0
        };

        paidOrders.forEach(o => {
            const method = (o.payment_method || 'efectivo').toLowerCase();
            if (payments[method] !== undefined) {
                payments[method] += (o.total || 0);
            } else {
                payments.efectivo += (o.total || 0);
            }
        });

        // Conteo de Productos más Vendidos
        const productStats = {};
        paidOrders.forEach(order => {
            (order.order_items || []).forEach(item => {
                const name = item.product_name || 'Producto';
                if (!productStats[name]) {
                    productStats[name] = { qty: 0, total: 0 };
                }
                productStats[name].qty += (item.quantity || 1);
                productStats[name].total += (item.price * item.quantity);
            });
        });

        const sortedProducts = Object.entries(productStats)
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.qty - a.qty);

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
                    ${sortedProducts.length === 0 ? `
                        <p class="text-muted text-sm" style="padding: 1rem 0; text-align: center;">No hay transacciones registradas en este período</p>
                    ` : `
                        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                            ${sortedProducts.slice(0, 8).map((prod, idx) => `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid var(--border-subtle);">
                                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                                        <span style="font-weight: 900; color: ${idx === 0 ? 'var(--color-primary)' : 'var(--text-muted)'}; font-size: 0.9rem;">#${idx + 1}</span>
                                        <span style="font-weight: 700; font-size: 0.9rem;">${prod.name}</span>
                                    </div>
                                    <div style="text-align: right;">
                                        <span class="badge badge--yellow" style="font-weight: 800;">${prod.qty} vendidas</span>
                                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.1rem;">${formatGs(prod.total)}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>

                <!-- Desglose por Medio de Pago -->
                <div class="card">
                    <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-primary); font-size: 1.1rem; margin-bottom: 1rem;">
                        💳 Ingresos por Medio de Pago
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 0.8rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <span>💵 Efectivo</span>
                            <strong style="color: var(--color-primary); font-size: 1.05rem;">${formatGs(payments.efectivo)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <span>📱 Transferencia</span>
                            <strong style="color: #29B6F6; font-size: 1.05rem;">${formatGs(payments.transferencia)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <span>💳 Débito</span>
                            <strong style="color: #AB47BC; font-size: 1.05rem;">${formatGs(payments.debito)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem; background: rgba(255,255,255,0.03); border-radius: 6px;">
                            <span>💳 Crédito</span>
                            <strong style="color: #FFA726; font-size: 1.05rem;">${formatGs(payments.credito)}</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `
            <div class="card p-4" style="color: #FF5252; text-align: center;">
                <h2>Error cargando reportes</h2>
                <p>${err.message}</p>
            </div>
        `;
    }
}
