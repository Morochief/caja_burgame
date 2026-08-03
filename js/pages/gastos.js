import { expenseService } from '../services/expense-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

export async function renderGastosPage() {
    const container = document.createElement('div');
    container.className = 'gastos-page';

    const [expenses, categories, currentRegister] = await Promise.all([
        expenseService.getAll(),
        expenseService.getCategories(),
        cashService.getCurrentRegister()
    ]);

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
                        </tr>
                    </thead>
                    <tbody>
                        ${(expenses || []).map(e => `
                            <tr>
                                <td>${new Date(e.created_at).toLocaleDateString()}</td>
                                <td>${e.description}</td>
                                <td>${e.expense_categories ? e.expense_categories.name : '-'}</td>
                                <td><strong class="text-red">${formatGs(e.amount)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    container.querySelector('#form-expense')?.addEventListener('submit', async (ev) => {
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
            showToast({ message: 'Gasto registrado correctamente', type: 'success' });
            window.location.reload();
        } catch (err) {
            showToast({ message: 'Error al guardar gasto: ' + err.message, type: 'error' });
        }
    });

    return container;
}
