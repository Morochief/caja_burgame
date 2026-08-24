import { expenseService } from '../services/expense-service.js';
import { cashService } from '../services/cash-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let expenses = [];
let categories = [];
let currentRegister = null;

// Estados de filtro, ordenamiento y paginación
let gastosFilter = { search: '', category: 'all' };
let gastosSort = { field: 'created_at', dir: 'desc' };
let gastosPage = 1;
const GASTOS_PAGE_SIZE = 10;

export async function renderGastosPage() {
    const container = document.createElement('div');
    container.className = 'gastos-page';

    // Skeleton inicial
    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>💸 REGISTRO DE GASTOS</h1>
                <p>Gestiona los egresos operativos del local</p>
            </div>
        </header>
        <div class="gastos-layout">
            <div class="card form-card">
                <h3>Nuevo Gasto</h3>
                <form id="form-expense">
                    <div class="form-group">
                        <label for="exp-desc">Descripción:</label>
                        <input type="text" id="exp-desc" placeholder="Ej: Compra de hielo" required>
                    </div>
                    <div class="form-group">
                        <label for="exp-amount">Monto (Gs.):</label>
                        <input type="number" id="exp-amount" placeholder="Ej: 15000" min="0" required>
                    </div>
                    <div class="form-group">
                        <label for="exp-cat">Categoría:</label>
                        <select id="exp-cat" required></select>
                    </div>
                    <button type="submit" class="btn btn--primary btn--block">Registrar Gasto</button>
                </form>
            </div>
            <div class="card table-card">
                <h3>Historial de Gastos</h3>
                <div class="gastos-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center;">
                    <input type="text" id="gastos-search" placeholder="🔍 Buscar gasto..." value="${gastosFilter.search}" style="flex: 1; min-width: 150px;">
                    <select id="gastos-filter-cat" style="min-width: 140px;">
                        <option value="all">Todas las categorías</option>
                    </select>
                    <select id="gastos-sort" style="min-width: 140px;">
                        <option value="created_at-desc">Fecha ↓</option>
                        <option value="created_at-asc">Fecha ↑</option>
                        <option value="amount-desc">Monto ↓</option>
                        <option value="amount-asc">Monto ↑</option>
                        <option value="description-asc">Descripción A-Z</option>
                    </select>
                </div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Categoría</th>
                            <th>Monto</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="expenses-table-body">
                        <tr><td colspan="5" class="text-center p-4">
                            <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando gastos...</p></div>
                        </td></tr>
                    </tbody>
                </table>
                <div id="gastos-pagination-container"></div>
            </div>
        </div>
    `;

    // Cargar data en background
    loadGastosData(container);

    return container;
}

async function loadGastosData(container) {
    await loadData();

    // Llenar selects de categorías
    const expCat = container.querySelector('#exp-cat');
    if (expCat) {
        expCat.innerHTML = (categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    const filterCat = container.querySelector('#gastos-filter-cat');
    if (filterCat) {
        filterCat.innerHTML = `<option value="all">Todas las categorías</option>` +
            (categories || []).map(c => `<option value="${c.id}" ${gastosFilter.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    }

    // Render tabla
    refreshTable(container);
    setupEvents(container);
    bindToolbarEvents(container);
}

async function loadData() {
    try {
        const [exp, cat] = await Promise.all([
            expenseService.getAll(),
            expenseService.getCategories()
        ]);
        expenses = exp || [];
        categories = cat || [];
        currentRegister = appState.cashRegister || await cashService.getCurrentRegister();
    } catch (err) {
        showToast({ message: 'Error cargando historial de gastos', type: 'error' });
    }
}

function getFilteredSortedExpenses() {
    let list = [...expenses];

    if (gastosFilter.search.trim()) {
        const q = gastosFilter.search.toLowerCase();
        list = list.filter(e => e.description.toLowerCase().includes(q));
    }

    if (gastosFilter.category !== 'all') {
        list = list.filter(e => e.category_id === gastosFilter.category);
    }

    const { field, dir } = gastosSort;
    list.sort((a, b) => {
        let va = a[field], vb = b[field];
        if (field === 'created_at') {
            va = new Date(va).getTime();
            vb = new Date(vb).getTime();
        }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    return list;
}

function renderExpensesRows() {
    const filtered = getFilteredSortedExpenses();
    const totalPages = Math.max(1, Math.ceil(filtered.length / GASTOS_PAGE_SIZE));
    if (gastosPage > totalPages) gastosPage = totalPages;
    const start = (gastosPage - 1) * GASTOS_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + GASTOS_PAGE_SIZE);

    if (filtered.length === 0) {
        return `<tr><td colspan="5" class="text-center p-4">No se encontraron gastos con los filtros aplicados</td></tr>`;
    }

    return pageItems.map(e => `
        <tr>
            <td>${new Date(e.created_at).toLocaleDateString()} ${new Date(e.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
            <td><strong>${e.description}</strong></td>
            <td>${e.expense_categories ? e.expense_categories.name : '-'}</td>
            <td><strong class="text-red">${formatGs(e.amount)}</strong></td>
            <td>
                <button class="btn btn--ghost btn-delete-exp" data-id="${e.id}" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                    🗑️ Borrar
                </button>
            </td>
        </tr>
    `).join('');
}

function renderPagination() {
    const filtered = getFilteredSortedExpenses();
    const totalPages = Math.max(1, Math.ceil(filtered.length / GASTOS_PAGE_SIZE));
    if (gastosPage > totalPages) gastosPage = totalPages;

    return `
        <div class="gastos-pagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${filtered.length} gasto(s) · Página ${gastosPage} de ${totalPages}
            </span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn--secondary btn--sm" id="btn-gastos-prev" ${gastosPage <= 1 ? 'disabled style="opacity:0.4"' : ''}>← Anterior</button>
                <button class="btn btn--secondary btn--sm" id="btn-gastos-next" ${gastosPage >= totalPages ? 'disabled style="opacity:0.4"' : ''}>Siguiente →</button>
            </div>
        </div>
    `;
}

function refreshTable(container) {
    container.querySelector('#expenses-table-body').innerHTML = renderExpensesRows();
    container.querySelector('#gastos-pagination-container').innerHTML = renderPagination();
    attachDeleteEvents(container);
    bindToolbarEvents(container);
}

function bindToolbarEvents(container) {
    let searchTimer = null;
    container.querySelector('#gastos-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            gastosFilter.search = e.target.value;
            gastosPage = 1;
            refreshTable(container);
        }, 250);
    });

    container.querySelector('#gastos-filter-cat')?.addEventListener('change', (e) => {
        gastosFilter.category = e.target.value;
        gastosPage = 1;
        refreshTable(container);
    });

    container.querySelector('#gastos-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        gastosSort = { field, dir };
        gastosPage = 1;
        refreshTable(container);
    });

    container.querySelector('#btn-gastos-prev')?.addEventListener('click', () => {
        if (gastosPage > 1) { gastosPage--; refreshTable(container); }
    });
    container.querySelector('#btn-gastos-next')?.addEventListener('click', () => {
        gastosPage++;
        refreshTable(container);
    });
}

function setupEvents(container) {
    const form = container.querySelector('#form-expense');

    form?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!currentRegister) {
            showToast({ message: 'Abre caja antes de registrar gastos', type: 'error' });
            return;
        }

        const desc = container.querySelector('#exp-desc').value;
        const amount = parseInt(container.querySelector('#exp-amount').value, 10);
        const categoryId = container.querySelector('#exp-cat').value;

        try {
            await expenseService.create({
                description: desc,
                amount: amount,
                categoryId: categoryId,
                cashRegisterId: currentRegister.id
            });
            showToast({ message: '💸 Gasto registrado correctamente', type: 'success' });
            form.reset();

            await loadData();
            refreshTable(container);
        } catch (err) {
            showToast({ message: 'Error al guardar gasto: ' + err.message, type: 'error' });
        }
    });

    attachDeleteEvents(container);
}

function attachDeleteEvents(container) {
    container.querySelectorAll('.btn-delete-exp').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm('¿Estás seguro de eliminar este gasto?')) return;

            try {
                await expenseService.deleteExpense(id);
                showToast({ message: 'Gasto eliminado', type: 'success' });
                await loadData();
                refreshTable(container);
            } catch (err) {
                showToast({ message: 'Error al eliminar gasto: ' + err.message, type: 'error' });
            }
        });
    });
}
