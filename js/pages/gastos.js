import { expenseService } from '../services/expense-service.js';
import { cashService } from '../services/cash-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let expenses = [];
let categories = [];
let currentRegister = null;

export async function renderGastosPage() {
    const container = document.createElement('div');
    container.className = 'gastos-page';

    await loadData();

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
                        <select id="exp-cat" required>
                            ${(categories || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                        </select>
                    </div>
                    <button type="submit" class="btn btn--primary btn--block">Registrar Gasto</button>
                </form>
            </div>

            <div class="card table-card">
                <h3>Historial de Gastos</h3>
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
                        ${renderExpensesRows()}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    setupEvents(container);
    return container;
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

function renderExpensesRows() {
    if (expenses.length === 0) {
        return `<tr><td colspan="5" class="text-center p-4">No hay gastos registrados</td></tr>`;
    }

    return expenses.map(e => `
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

            // Re-renderizado reactivo en tiempo real sin F5
            await loadData();
            container.querySelector('#expenses-table-body').innerHTML = renderExpensesRows();
            attachDeleteEvents(container);
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
                container.querySelector('#expenses-table-body').innerHTML = renderExpensesRows();
                attachDeleteEvents(container);
            } catch (err) {
                showToast({ message: 'Error al eliminar gasto: ' + err.message, type: 'error' });
            }
        });
    });
}
