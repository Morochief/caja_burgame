import { reportService } from '../services/report-service.js';
import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';

export async function renderDashboardPage() {
    const container = document.createElement('div');
    container.className = 'dashboard-page';

    // Usar cashRegister cacheado de appState (evita fetch innecesario)
    const currentRegister = appState.cashRegister || await cashService.getCurrentRegister();

    // OPTIMIZACIÓN: getTodaysOrders ya incluye las activas.
    // No necesitamos getActiveOrders por separado (solo se usa para .length).
    const [shiftSummary, lowStock, todaysOrders] = await Promise.all([
        reportService.getCurrentShiftSummary(currentRegister ? currentRegister.id : null),
        productService.getLowStock(10),
        orderService.getTodaysOrders()
    ]);

    // Contar pedidos activos de las órdenes de hoy (sin fetch extra)
    const activeOrders = (todaysOrders || []).filter(o => !['paid', 'cancelled'].includes(o.status));

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>🎮 BURGAME DASHBOARD</h1>
                <p>Resumen operacional y métricas del turno actual</p>
            </div>
            <div>
                ${currentRegister ? `
                    <span class="badge badge--green" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                        🟢 CAJA ABIERTA (Turno #${currentRegister.id.slice(0, 6)})
                    </span>
                ` : `
                    <span class="badge badge--red" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                        🔒 CAJA CERRADA (Abre turno en Caja)
                    </span>
                `}
            </div>
        </header>

        <div class="dashboard-grid">
            <!-- Stats Row -->
            <div class="stat-card stat-card--neon">
                <span class="stat-card__title">Ventas del Turno</span>
                <span class="stat-card__value">${formatGs(shiftSummary.totalSales || 0)}</span>
                <span class="stat-card__subtitle">${shiftSummary.orderCount || 0} pedidos cobrados</span>
            </div>

            <div class="stat-card stat-card--red">
                <span class="stat-card__title">Gastos del Turno</span>
                <span class="stat-card__value">${formatGs(shiftSummary.totalExpenses || 0)}</span>
            </div>

            <div class="stat-card stat-card--green">
                <span class="stat-card__title">Balance Neto Turno</span>
                <span class="stat-card__value">${formatGs(shiftSummary.net || 0)}</span>
            </div>

            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">Pedidos Activos en Cocina</span>
                <span class="stat-card__value">${(activeOrders || []).length}</span>
            </div>
        </div>

        <div class="dashboard-sections" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
            <!-- Desglose de Productos Preparados Hoy -->
            <div class="card dashboard-card">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin-bottom: 1rem;">
                    🍔 Productos Preparados Hoy
                </h3>
                <div id="dashboard-product-breakdown" class="stock-list">
                    <!-- Dinámico -->
                </div>
            </div>

            <!-- Alertas de Stock Bajo -->
            <div class="card dashboard-card">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-danger); margin-bottom: 1rem;">
                    ⚠️ Productos con Poco Stock
                </h3>
                ${(lowStock || []).length === 0 ? `
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
                `}
            </div>
        </div>
    `;

    // Cargar y calcular productos vendidos en el turno actual
    // OPTIMIZACIÓN: reutilizar todaysOrders ya fetched arriba (antes era un segundo fetch secuencial)
    try {
        const shiftOrders = currentRegister ? (todaysOrders || []).filter(o => o.cash_register_id === currentRegister.id && o.status === 'paid') : [];

        const counts = {};
        shiftOrders.forEach(o => {
            (o.order_items || []).forEach(item => {
                counts[item.product_name] = (counts[item.product_name] || 0) + (item.quantity || 1);
            });
        });

        const breakdownEl = container.querySelector('#dashboard-product-breakdown');
        if (breakdownEl) {
            const items = Object.entries(counts);
            if (items.length === 0) {
                breakdownEl.innerHTML = `<p class="empty-text">${currentRegister ? 'No hay ventas cobradas en este turno.' : 'Abre la caja para iniciar la contabilización del turno.'}</p>`;
            } else {
                breakdownEl.innerHTML = `
                    <ul class="stock-list">
                        ${items.map(([name, qty]) => `
                            <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle);">
                                <span style="font-weight: 600; color: var(--text-main);">${name}</span>
                                <span class="badge badge--yellow" style="font-family: var(--font-mono); font-weight: 700;">${qty} unid.</span>
                            </li>
                        `).join('')}
                    </ul>
                `;
            }
        }
    } catch (e) {
        console.error(e);
    }

    return container;
}
