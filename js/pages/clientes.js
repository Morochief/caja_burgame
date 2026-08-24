import { supabase } from '../supabase-client.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allCustomers = [];
let searchQuery = '';
let sortField = 'total_spent';
let sortDir = 'desc';

export async function renderClientesPage() {
    const container = document.createElement('div');
    container.className = 'clientes-page';

    // Layout inmediato
    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>👥 MÓDULO DE CLIENTES</h1>
                <p>Historial de compras y preferencias de tus clientes</p>
            </div>
        </header>

        <div class="clientes-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; align-items: center;">
            <input type="text" id="cli-search" placeholder="🔍 Buscar por nombre..." style="flex: 1; min-width: 180px;">
            <select id="cli-sort" style="min-width: 160px;">
                <option value="total_spent-desc">Mayor Gasto ↓</option>
                <option value="total_spent-asc">Menor Gasto ↑</option>
                <option value="order_count-desc">Más Pedidos ↓</option>
                <option value="order_count-asc">Menos Pedidos ↑</option>
                <option value="last_order-desc">Última Visita ↓</option>
                <option value="name-asc">Nombre A-Z</option>
            </select>
        </div>

        <div class="card">
            <table class="table" id="cli-table">
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Pedidos</th>
                        <th>Total Gastado</th>
                        <th>Ticket Promedio</th>
                        <th>Última Visita</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="cli-table-body">
                    <tr><td colspan="6" class="text-center p-4">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando clientes...</p></div>
                    </td></tr>
                </tbody>
            </table>
        </div>

        <!-- Modal de historial del cliente -->
        <div id="cli-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 640px;">
                <div class="modal-header">
                    <h2 id="cli-modal-title">📋 Historial del Cliente</h2>
                    <button id="cli-btn-close-modal" class="btn-close">&times;</button>
                </div>
                <div id="cli-modal-body" style="max-height: 60vh; overflow-y: auto;"></div>
            </div>
        </div>
    `;

    loadClientesData(container);

    return container;
}

async function loadClientesData(container) {
    try {
        // Traer todas las órdenes con customer_name para calcular stats
        const { data, error } = await supabase
            .from('orders')
            .select('id, order_number, customer_name, total, status, created_at, payment_method')
            .not('customer_name', 'eq', '')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Agrupar por customer_name
        const customerMap = {};
        (data || []).forEach(order => {
            const name = (order.customer_name || '').trim();
            if (!name) return;
            if (!customerMap[name]) {
                customerMap[name] = {
                    name,
                    orders: [],
                    total_spent: 0,
                    order_count: 0,
                    last_order: null
                };
            }
            customerMap[name].orders.push(order);
            if (order.status === 'paid') {
                customerMap[name].total_spent += order.total || 0;
            }
            customerMap[name].order_count++;
            if (!customerMap[name].last_order || new Date(order.created_at) > new Date(customerMap[name].last_order)) {
                customerMap[name].last_order = order.created_at;
            }
        });

        allCustomers = Object.values(customerMap);
    } catch (err) {
        showToast({ message: 'Error al cargar clientes: ' + err.message, type: 'error' });
        return;
    }

    refreshTable(container);

    // Eventos
    container.querySelector('#cli-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshTable(container);
    });

    container.querySelector('#cli-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        sortField = field;
        sortDir = dir;
        refreshTable(container);
    });

    container.querySelector('#cli-btn-close-modal')?.addEventListener('click', () => {
        container.querySelector('#cli-modal')?.classList.add('hidden');
    });
}

function refreshTable(container) {
    let filtered = [...allCustomers];

    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
    }

    // Sort
    filtered.sort((a, b) => {
        let valA, valB;
        if (sortField === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortField === 'last_order') {
            valA = new Date(a.last_order || 0).getTime();
            valB = new Date(b.last_order || 0).getTime();
        } else {
            valA = a[sortField] || 0;
            valB = b[sortField] || 0;
        }
        return sortDir === 'desc' ? valB - valA : valA - valB;
    });

    if (filtered.length === 0) {
        container.querySelector('#cli-table-body').innerHTML = `
            <tr><td colspan="6" class="text-center p-4">
                <p class="empty-text">No hay clientes registrados todavía. Aparecerán cuando se hagan pedidos con nombre de cliente.</p>
            </td></tr>
        `;
        return;
    }

    container.querySelector('#cli-table-body').innerHTML = filtered.map(c => {
        const avgTicket = c.order_count > 0 ? Math.round(c.total_spent / c.order_count) : 0;
        const lastVisit = c.last_order ? new Date(c.last_order).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

        return `
            <tr>
                <td style="font-weight: 600;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="width: 32px; height: 32px; background: rgba(255,215,0,0.15); border: 1px solid var(--border-gold); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; color: var(--color-primary);">${c.name.charAt(0).toUpperCase()}</span>
                        ${c.name}
                    </div>
                </td>
                <td style="font-family: var(--font-mono); font-weight: 700;">${c.order_count}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-success);">${formatGs(c.total_spent)}</td>
                <td style="font-family: var(--font-mono); color: var(--text-muted);">${formatGs(avgTicket)}</td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${lastVisit}</td>
                <td>
                    <button class="btn btn--sm btn--secondary btn-cli-history" data-name="${c.name}">
                        📋 Ver Historial
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    container.querySelectorAll('.btn-cli-history').forEach(btn => {
        btn.addEventListener('click', () => {
            const customer = allCustomers.find(c => c.name === btn.dataset.name);
            if (customer) openHistoryModal(container, customer);
        });
    });
}

function openHistoryModal(container, customer) {
    const modal = container.querySelector('#cli-modal');
    if (!modal) return;

    container.querySelector('#cli-modal-title').textContent = `📋 ${customer.name}`;
    const body = container.querySelector('#cli-modal-body');

    const orders = customer.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem;">
            <div class="stat-card" style="padding: 0.8rem;">
                <span class="stat-card__title" style="font-size: 0.75rem;">Pedidos</span>
                <span class="stat-card__value" style="font-size: 1.2rem;">${customer.order_count}</span>
            </div>
            <div class="stat-card stat-card--green" style="padding: 0.8rem;">
                <span class="stat-card__title" style="font-size: 0.75rem;">Gastado</span>
                <span class="stat-card__value" style="font-size: 1.2rem;">${formatGs(customer.total_spent)}</span>
            </div>
            <div class="stat-card stat-card--yellow" style="padding: 0.8rem;">
                <span class="stat-card__title" style="font-size: 0.75rem;">Ticket Prom.</span>
                <span class="stat-card__value" style="font-size: 1.2rem;">${formatGs(customer.order_count > 0 ? Math.round(customer.total_spent / customer.order_count) : 0)}</span>
            </div>
        </div>

        <h3 style="font-size: 0.85rem; color: var(--color-primary); margin-bottom: 0.5rem;">📅 Últimos Pedidos</h3>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${orders.slice(0, 20).map(o => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0.8rem; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                    <div>
                        <span style="font-weight: 700; font-family: var(--font-mono);">#${o.order_number || '—'}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">${new Date(o.created_at).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span class="badge badge--${o.status === 'paid' ? 'green' : o.status === 'cancelled' ? 'red' : 'yellow'}" style="font-size: 0.72rem;">${o.status.toUpperCase()}</span>
                        <span style="font-family: var(--font-mono); font-weight: 700;">${formatGs(o.total)}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    modal.classList.remove('hidden');
}
