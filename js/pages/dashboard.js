import { reportService } from '../services/report-service.js';
import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { customerService } from '../services/customer-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';

export async function renderDashboardPage() {
    const container = document.createElement('div');
    container.className = 'dashboard-page';

    // Mostrar layout inmediatamente con skeletons
    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>🎮 BURGAME DASHBOARD</h1>
                <p>Resumen operacional y métricas del turno actual</p>
            </div>
            <div id="dash-register-status">
                <span class="badge badge--gray" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">⏳ Cargando...</span>
            </div>
        </header>

        <div class="dashboard-grid">
            <div class="stat-card stat-card--neon">
                <span class="stat-card__title">Ventas del Turno</span>
                <span class="stat-card__value" id="dash-sales">⏳</span>
                <span class="stat-card__subtitle" id="dash-orders">Cargando...</span>
            </div>
            <div class="stat-card stat-card--red">
                <span class="stat-card__title">Gastos del Turno</span>
                <span class="stat-card__value" id="dash-expenses">⏳</span>
            </div>
            <div class="stat-card stat-card--green">
                <span class="stat-card__title">Balance Neto Turno</span>
                <span class="stat-card__value" id="dash-net">⏳</span>
            </div>
            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">Pedidos Activos en Cocina</span>
                <span class="stat-card__value" id="dash-active">⏳</span>
            </div>
        </div>

        <div class="dashboard-sections" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-top: 1.5rem;">
            <div class="card dashboard-card">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin-bottom: 1rem;">
                    🍔 Productos Preparados Hoy
                </h3>
                <div id="dashboard-product-breakdown" class="stock-list">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>
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

    // Cargar data en background
    loadDashboardData(container);

    return container;
}

async function loadDashboardData(container) {
    try {
        const currentRegister = appState.cashRegister || await cashService.getCurrentRegister();

        // Status de caja
        const statusEl = container.querySelector('#dash-register-status');
        if (statusEl) {
            statusEl.innerHTML = currentRegister ? `
                <span class="badge badge--green" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                    🟢 CAJA ABIERTA (Turno #${currentRegister.id.slice(0, 6)})
                </span>
            ` : `
                <span class="badge badge--red" style="font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                    🔒 CAJA CERRADA (Abre turno en Caja)
                </span>
            `;
        }

        // Cargar queries en paralelo
        const [shiftSummary, lowStock, todaysOrders, clubStats] = await Promise.all([
            reportService.getCurrentShiftSummary(currentRegister ? currentRegister.id : null),
            productService.getLowStock(10),
            orderService.getTodaysOrders(),
            customerService.getMembershipStats().catch(() => null)
        ]);

        const activeOrders = (todaysOrders || []).filter(o => o.status !== 'cancelled');

        // Llenar stats
        const setText = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val; };
        setText('#dash-sales', formatGs(shiftSummary.totalSales || 0));
        setText('#dash-orders', `${shiftSummary.orderCount || 0} pedidos cobrados`);
        setText('#dash-expenses', formatGs(shiftSummary.totalExpenses || 0));
        setText('#dash-net', formatGs(shiftSummary.net || 0));
        setText('#dash-active', (activeOrders || []).length);

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

        // Productos preparados en el turno
        const breakdownEl = container.querySelector('#dashboard-product-breakdown');
        if (breakdownEl) {
            const shiftOrders = currentRegister ? (todaysOrders || []).filter(o => o.cash_register_id === currentRegister.id && o.paid_at) : [];
            const counts = {};
            shiftOrders.forEach(o => {
                (o.order_items || []).forEach(item => {
                    counts[item.product_name] = (counts[item.product_name] || 0) + (item.quantity || 1);
                });
            });
            const items = Object.entries(counts);
            breakdownEl.innerHTML = items.length === 0 ? `
                <p class="empty-text">${currentRegister ? 'No hay ventas cobradas en este turno.' : 'Abre la caja para iniciar la contabilización del turno.'}</p>
            ` : `
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

        // Sección Club Burgame: alertas de por vencer / vencidos
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
    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}
