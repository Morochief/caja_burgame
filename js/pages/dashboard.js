import { reportService } from '../services/report-service.js';
import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { formatGs } from '../components/currency.js';

export async function renderDashboardPage() {
    const container = document.createElement('div');
    container.className = 'dashboard-page';

    const [dailySummary, lowStock, activeOrders] = await Promise.all([
        reportService.getDailySummary(),
        productService.getLowStock(10),
        orderService.getActiveOrders()
    ]);

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>🎮 BURGAME DASHBOARD</h1>
                <p>Resumen operacional y métricas clave en tiempo real</p>
            </div>
        </header>

        <div class="dashboard-grid">
            <!-- Stats Row -->
            <div class="stat-card stat-card--neon">
                <span class="stat-card__title">Ventas de Hoy</span>
                <span class="stat-card__value">${formatGs(dailySummary.totalSales || 0)}</span>
                <span class="stat-card__subtitle">${dailySummary.orderCount || 0} pedidos procesados</span>
            </div>

            <div class="stat-card stat-card--red">
                <span class="stat-card__title">Gastos del Día</span>
                <span class="stat-card__value">${formatGs(dailySummary.totalExpenses || 0)}</span>
            </div>

            <div class="stat-card stat-card--green">
                <span class="stat-card__title">Balance Neto</span>
                <span class="stat-card__value">${formatGs(dailySummary.net || 0)}</span>
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

    // Cargar y calcular productos vendidos en el día
    try {
        const todayOrders = await orderService.getTodayOrders();
        const counts = {};
        (todayOrders || []).forEach(o => {
            (o.order_items || []).forEach(item => {
                counts[item.product_name] = (counts[item.product_name] || 0) + (item.quantity || 1);
            });
        });

        const breakdownEl = container.querySelector('#dashboard-product-breakdown');
        if (breakdownEl) {
            const items = Object.entries(counts);
            if (items.length === 0) {
                breakdownEl.innerHTML = `<p class="empty-text">No hay ventas registradas en la jornada.</p>`;
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
