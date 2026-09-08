import { expenseService } from '../services/expense-service.js';
import { cashService } from '../services/cash-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { loadExcelJS, downloadBurgameExcel, buildBurgameSheet } from '../services/excel-export-service.js';

let allExpenses = [];
let categories = [];
let currentRegister = null;

// Estados de filtro, ordenamiento, período y paginación
let activePeriod = 'today'; // 'shift' | 'today' | 'month' | 'all'
let gastosFilter = { search: '', category: 'all', paymentMethod: 'all' };
let gastosSort = { field: 'created_at', dir: 'desc' };
let gastosPage = 1;
const GASTOS_PAGE_SIZE = 10;

// Presets de gastos frecuentes gastronómicos
const GASTO_PRESETS = [
    { label: '🧊 Hielo', desc: 'Compra de Hielo para Barra', amount: 15000, catName: 'Insumos', method: 'efectivo' },
    { label: '🥖 Panes Extra', desc: 'Panes de Hamburguesa (Urgencia)', amount: 35000, catName: 'Insumos', method: 'efectivo' },
    { label: '🛵 Delivery / Flete', desc: 'Pago de Flete / Moto Reparto', amount: 25000, catName: 'Logística & Delivery', method: 'efectivo' },
    { label: '🧹 Limpieza', desc: 'Artículos de Limpieza y Desinfección', amount: 20000, catName: 'Mantenimiento & Limpieza', method: 'efectivo' },
    { label: '🥩 Carnicería', desc: 'Reposición Insumos Carne / Molida', amount: 150000, catName: 'Insumos', method: 'efectivo' },
    { label: '🥤 Bebidas', desc: 'Bebidas y Gaseosas Emergencia', amount: 50000, catName: 'Insumos', method: 'efectivo' }
];

export async function renderGastosPage() {
    const container = document.createElement('div');
    container.className = 'gastos-page';

    // Skeleton inicial
    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>💸 GESTIÓN Y CONTROL DE GASTOS</h1>
                <p>Egresos operativos, compras de insumos, comprobantes y rendición de caja</p>
            </div>
            <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
                <button type="button" id="btn-manage-categories" class="btn btn--secondary" style="font-size: 0.82rem; padding: 0.45rem 0.85rem;">
                    ⚙️ Categorías
                </button>
                <button type="button" id="btn-export-gastos-excel" class="btn btn--secondary" style="font-size: 0.82rem; padding: 0.45rem 0.85rem;">
                    📥 Exportar Excel
                </button>
            </div>
        </header>

        <!-- KPI Grid Skeleton -->
        <div id="gastos-kpi-container">
            <div class="page-loading" style="padding: 2rem;"><div class="pixel-spinner"></div><p>Cargando analítica de gastos...</p></div>
        </div>

        <div id="gastos-main-content"></div>
    `;

    loadGastosData(container);

    return container;
}

async function loadGastosData(container) {
    await loadData();

    // Si hay caja abierta, por defecto mostrar 'shift' (turno) o 'today'
    if (currentRegister && activePeriod === 'today') {
        activePeriod = 'shift';
    }

    renderKpis(container);
    renderLayout(container);
}

async function loadData() {
    try {
        const [exp, cat] = await Promise.all([
            expenseService.getAll(),
            expenseService.getCategories()
        ]);
        allExpenses = exp || [];
        categories = cat || [];
        currentRegister = appState.cashRegister || await cashService.getCurrentRegister();
    } catch (err) {
        showToast({ message: 'Error cargando historial de gastos: ' + err.message, type: 'error' });
    }
}

// --------------------------------------------------------------------------
// KPIs y Métricas
// --------------------------------------------------------------------------
function calculateMetrics() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    let shiftTotal = 0;
    let shiftCount = 0;
    let todayTotal = 0;
    let todayCount = 0;
    let monthTotal = 0;
    let monthCount = 0;

    const catMonthTotals = {};

    allExpenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        const d = new Date(e.created_at);

        // Turno actual (caja abierta)
        if (currentRegister && e.cash_register_id === currentRegister.id) {
            shiftTotal += amt;
            shiftCount++;
        }

        // Hoy
        const isToday = (e.expense_date && e.expense_date === todayStr) || d.toISOString().slice(0, 10) === todayStr;
        if (isToday) {
            todayTotal += amt;
            todayCount++;
        }

        // Este mes
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
            monthTotal += amt;
            monthCount++;

            const catName = e.expense_categories ? e.expense_categories.name : 'Otros';
            catMonthTotals[catName] = (catMonthTotals[catName] || 0) + amt;
        }
    });

    // Categoría mayoritaria del mes
    let topCatName = 'N/A';
    let topCatAmount = 0;
    Object.entries(catMonthTotals).forEach(([name, total]) => {
        if (total > topCatAmount) {
            topCatAmount = total;
            topCatName = name;
        }
    });
    const topCatPct = monthTotal > 0 ? Math.round((topCatAmount / monthTotal) * 100) : 0;

    return {
        shiftTotal,
        shiftCount,
        todayTotal,
        todayCount,
        monthTotal,
        monthCount,
        topCatName,
        topCatAmount,
        topCatPct
    };
}

function renderKpis(container) {
    const kpiWrap = container.querySelector('#gastos-kpi-container');
    if (!kpiWrap) return;

    const m = calculateMetrics();

    kpiWrap.innerHTML = `
        <div class="gastos-kpis-grid">
            <div class="gastos-kpi-card gastos-kpi-card--shift">
                <div class="gastos-kpi-header">
                    <span class="gastos-kpi-title">Turno Caja Actual</span>
                    <span class="gastos-kpi-icon">⚡</span>
                </div>
                <div class="gastos-kpi-value">${formatGs(m.shiftTotal)}</div>
                <div class="gastos-kpi-sub">${m.shiftCount} gasto(s) deducen de gaveta</div>
            </div>

            <div class="gastos-kpi-card gastos-kpi-card--today">
                <div class="gastos-kpi-header">
                    <span class="gastos-kpi-title">Egresos de Hoy</span>
                    <span class="gastos-kpi-icon">📅</span>
                </div>
                <div class="gastos-kpi-value">${formatGs(m.todayTotal)}</div>
                <div class="gastos-kpi-sub">${m.todayCount} gasto(s) registrados hoy</div>
            </div>

            <div class="gastos-kpi-card gastos-kpi-card--month">
                <div class="gastos-kpi-header">
                    <span class="gastos-kpi-title">Acumulado Mes</span>
                    <span class="gastos-kpi-icon">🗓️</span>
                </div>
                <div class="gastos-kpi-value">${formatGs(m.monthTotal)}</div>
                <div class="gastos-kpi-sub">${m.monthCount} egresos este mes</div>
            </div>

            <div class="gastos-kpi-card gastos-kpi-card--topcat">
                <div class="gastos-kpi-header">
                    <span class="gastos-kpi-title">Mayor Rubro (Mes)</span>
                    <span class="gastos-kpi-icon">📊</span>
                </div>
                <div class="gastos-kpi-value" style="font-size: 1.15rem; color: #B388FF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.topCatName}">
                    ${m.topCatName}
                </div>
                <div class="gastos-kpi-sub">${formatGs(m.topCatAmount)} (${m.topCatPct}% del mes)</div>
            </div>
        </div>
    `;
}

// --------------------------------------------------------------------------
// Layout Principal
// --------------------------------------------------------------------------
function renderLayout(container) {
    const mainWrap = container.querySelector('#gastos-main-content');
    if (!mainWrap) return;

    mainWrap.innerHTML = `
        <!-- Pestañas de Período -->
        <div class="gastos-period-tabs">
            <button type="button" class="gastos-tab-btn ${activePeriod === 'shift' ? 'active' : ''}" data-period="shift">
                <span>⚡</span> Turno de Caja (${currentRegister ? 'Abierta' : 'Cerrada'})
            </button>
            <button type="button" class="gastos-tab-btn ${activePeriod === 'today' ? 'active' : ''}" data-period="today">
                <span>📅</span> Hoy
            </button>
            <button type="button" class="gastos-tab-btn ${activePeriod === 'month' ? 'active' : ''}" data-period="month">
                <span>🗓️</span> Este Mes
            </button>
            <button type="button" class="gastos-tab-btn ${activePeriod === 'all' ? 'active' : ''}" data-period="all">
                <span>📚</span> Histórico Completo
            </button>
        </div>

        <div class="gastos-layout">
            <!-- Columna Izquierda: Formulario de Carga -->
            <div class="gastos-form-card">
                <h3>
                    <span>➕ Registrar Nuevo Gasto</span>
                </h3>

                <!-- Presets de 1 Clic -->
                <div class="gastos-presets-section">
                    <span class="gastos-presets-label">⚡ Gastos Frecuentes (1-Clic):</span>
                    <div class="gastos-presets-row">
                        ${GASTO_PRESETS.map(p => `
                            <button type="button" class="gastos-preset-btn" data-desc="${p.desc}" data-amount="${p.amount}" data-cat="${p.catName}">
                                ${p.label} <small style="color: var(--color-primary); font-weight: bold;">${formatGs(p.amount)}</small>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <form id="form-expense">
                    <div class="form-group">
                        <label for="exp-desc">Concepto / Descripción:</label>
                        <input type="text" id="exp-desc" placeholder="Ej: Compra de hielo para barra" required autofocus>
                    </div>

                    <div class="form-group">
                        <label for="exp-amount">Monto en Efectivo / Banco (Gs.):</label>
                        <input type="number" id="exp-amount" placeholder="Ej: 15000" min="500" step="500" required>
                    </div>

                    <div class="form-group">
                        <label for="exp-cat">Rubro / Categoría:</label>
                        <select id="exp-cat" required>
                            ${categories.map(c => `<option value="${c.id}">${c.icon || '📌'} ${c.name}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Medio de Pago -->
                    <div class="form-group">
                        <label style="display: block; margin-bottom: 0.35rem; font-size: 0.8rem; font-weight: 600;">Medio de Pago:</label>
                        <div class="payment-selector">
                            <label class="payment-radio-label selected" id="lbl-payment-cash">
                                <input type="radio" name="exp-payment" value="efectivo" checked>
                                <span>💵 <strong>Efectivo Caja</strong><br><small style="color: var(--text-muted);">Deduce de gaveta</small></span>
                            </label>
                            <label class="payment-radio-label" id="lbl-payment-bank">
                                <input type="radio" name="exp-payment" value="transferencia">
                                <span>📱 <strong>Transferencia</strong><br><small style="color: var(--text-muted);">Cuenta empresa</small></span>
                            </label>
                        </div>
                    </div>

                    <!-- Datos del Comprobante (Opcional) -->
                    <div class="voucher-details-box">
                        <div class="voucher-details-title">
                            <span>🧾</span> Datos del Comprobante Fiscal (Opcional)
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <div>
                                <label for="exp-voucher-type" style="font-size: 0.72rem; color: var(--text-muted);">Tipo:</label>
                                <select id="exp-voucher-type" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                                    <option value="sin_comprobante">Sin Comprobante</option>
                                    <option value="factura">Factura Legal (IVA)</option>
                                    <option value="recibo">Recibo / Boleta Simple</option>
                                    <option value="ticket">Ticket Fiscal</option>
                                </select>
                            </div>
                            <div>
                                <label for="exp-voucher-number" style="font-size: 0.72rem; color: var(--text-muted);">Nº Comprobante:</label>
                                <input type="text" id="exp-voucher-number" placeholder="Ej: 001-001-1234" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                            </div>
                        </div>
                        <div>
                            <label for="exp-supplier" style="font-size: 0.72rem; color: var(--text-muted);">Proveedor / Beneficiario:</label>
                            <input type="text" id="exp-supplier" placeholder="Ej: Distribuidora Central, ANDE, Frigorífico" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                        </div>
                    </div>

                    <button type="submit" class="btn btn--primary btn--block" style="font-weight: 800; padding: 0.75rem;">
                        💾 REGISTRAR GASTO
                    </button>
                </form>
            </div>

            <!-- Columna Derecha: Analítica de Categorías & Tabla de Gastos -->
            <div class="gastos-right-col">
                <!-- Mini Widget Analítico por Categoría -->
                <div class="gastos-analytics-card" id="gastos-analytics-widget"></div>

                <!-- Tabla de Historial -->
                <div class="gastos-table-card">
                    <h3>
                        <span>📋 Historial de Egresos</span>
                        <span id="gastos-filter-sum" style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--color-primary);"></span>
                    </h3>

                    <div class="gastos-toolbar">
                        <input type="text" id="gastos-search" placeholder="🔍 Buscar gasto, proveedor o comprobante..." value="${gastosFilter.search}" style="flex: 1; min-width: 180px;">
                        
                        <select id="gastos-filter-cat" style="min-width: 140px;">
                            <option value="all">Todas las categorías</option>
                            ${categories.map(c => `<option value="${c.id}" ${gastosFilter.category === c.id ? 'selected' : ''}>${c.icon || '📌'} ${c.name}</option>`).join('')}
                        </select>

                        <select id="gastos-filter-method" style="min-width: 130px;">
                            <option value="all" ${gastosFilter.paymentMethod === 'all' ? 'selected' : ''}>Todos los medios</option>
                            <option value="efectivo" ${gastosFilter.paymentMethod === 'efectivo' ? 'selected' : ''}>💵 Efectivo Caja</option>
                            <option value="transferencia" ${gastosFilter.paymentMethod === 'transferencia' ? 'selected' : ''}>📱 Transferencia</option>
                        </select>

                        <select id="gastos-sort" style="min-width: 130px;">
                            <option value="created_at-desc" ${gastosSort.field === 'created_at' && gastosSort.dir === 'desc' ? 'selected' : ''}>Fecha ↓</option>
                            <option value="created_at-asc" ${gastosSort.field === 'created_at' && gastosSort.dir === 'asc' ? 'selected' : ''}>Fecha ↑</option>
                            <option value="amount-desc" ${gastosSort.field === 'amount' && gastosSort.dir === 'desc' ? 'selected' : ''}>Monto ↓</option>
                            <option value="amount-asc" ${gastosSort.field === 'amount' && gastosSort.dir === 'asc' ? 'selected' : ''}>Monto ↑</option>
                            <option value="description-asc" ${gastosSort.field === 'description' && gastosSort.dir === 'asc' ? 'selected' : ''}>Descripción A-Z</option>
                        </select>
                    </div>

                    <div style="overflow-x: auto;">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Fecha / Hora</th>
                                    <th>Concepto & Proveedor</th>
                                    <th>Categoría</th>
                                    <th>Medio</th>
                                    <th style="text-align: right;">Monto</th>
                                    <th style="text-align: center;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="expenses-table-body"></tbody>
                        </table>
                    </div>

                    <div id="gastos-pagination-container"></div>
                </div>
            </div>
        </div>
    `;

    bindFormAndPresets(container);
    bindPeriodTabs(container);
    bindToolbar(container);
    refreshTableView(container);

    // Header buttons
    container.querySelector('#btn-manage-categories')?.addEventListener('click', () => {
        openCategoriesModal(container);
    });

    container.querySelector('#btn-export-gastos-excel')?.addEventListener('click', () => {
        const filtered = getFilteredExpenses();
        const periodLabels = {
            shift: 'Turno_Caja',
            today: 'Hoy',
            month: 'Este_Mes',
            all: 'Historico_Completo'
        };
        exportGastosToExcel(filtered, periodLabels[activePeriod] || 'Gastos');
    });
}

// --------------------------------------------------------------------------
// Manejo de Formulario y Presets
// --------------------------------------------------------------------------
function bindFormAndPresets(container) {
    const form = container.querySelector('#form-expense');
    const descInput = container.querySelector('#exp-desc');
    const amountInput = container.querySelector('#exp-amount');
    const catSelect = container.querySelector('#exp-cat');
    const lblCash = container.querySelector('#lbl-payment-cash');
    const lblBank = container.querySelector('#lbl-payment-bank');

    // Toggle visual de selector de medio de pago
    container.querySelectorAll('input[name="exp-payment"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'efectivo') {
                lblCash?.classList.add('selected');
                lblBank?.classList.remove('selected');
            } else {
                lblBank?.classList.add('selected');
                lblCash?.classList.remove('selected');
            }
        });
    });

    // 1-Click Presets
    container.querySelectorAll('.gastos-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (descInput) descInput.value = btn.dataset.desc || '';
            if (amountInput) amountInput.value = btn.dataset.amount || '';

            // Encontrar categoría
            const targetCat = categories.find(c => c.name.toLowerCase().includes(btn.dataset.cat.toLowerCase()));
            if (targetCat && catSelect) {
                catSelect.value = targetCat.id;
            }

            // Seleccionar efectivo por defecto en presets
            const cashRadio = container.querySelector('input[name="exp-payment"][value="efectivo"]');
            if (cashRadio) {
                cashRadio.checked = true;
                lblCash?.classList.add('selected');
                lblBank?.classList.remove('selected');
            }

            amountInput?.focus();
            showToast({ message: `Preset cargado: ${btn.dataset.desc}`, type: 'info' });
        });
    });

    // Submit del Formulario
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Guardando...';

        const desc = descInput.value.trim();
        const amount = parseInt(amountInput.value, 10) || 0;
        const categoryId = catSelect.value;
        const paymentMethod = container.querySelector('input[name="exp-payment"]:checked')?.value || 'efectivo';
        const voucherType = container.querySelector('#exp-voucher-type')?.value || 'sin_comprobante';
        const voucherNumber = container.querySelector('#exp-voucher-number')?.value.trim() || null;
        const supplier = container.querySelector('#exp-supplier')?.value.trim() || null;

        // Advertencia si elige efectivo pero no hay caja abierta
        if (paymentMethod === 'efectivo' && !currentRegister) {
            showToast({
                message: '⚠️ La caja no está abierta. El gasto se guardará sin imputar a una gaveta física.',
                type: 'warning'
            });
        }

        try {
            await expenseService.create({
                description: desc,
                amount,
                categoryId,
                cashRegisterId: currentRegister ? currentRegister.id : null,
                voucherType,
                voucherNumber,
                supplier,
                paymentMethod
            });

            showToast({ message: '✅ Gasto registrado correctamente', type: 'success' });
            form.reset();

            // Reset visual medio de pago a efectivo
            const cashRadio = container.querySelector('input[name="exp-payment"][value="efectivo"]');
            if (cashRadio) cashRadio.checked = true;
            lblCash?.classList.add('selected');
            lblBank?.classList.remove('selected');

            // Refrescar data y UI
            await loadData();
            renderKpis(container);
            refreshTableView(container);
        } catch (err) {
            showToast({ message: 'Error al registrar gasto: ' + err.message, type: 'error' });
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '💾 REGISTRAR GASTO';
        }
    });
}

// --------------------------------------------------------------------------
// Manejo de Pestañas de Período
// --------------------------------------------------------------------------
function bindPeriodTabs(container) {
    container.querySelectorAll('.gastos-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activePeriod = btn.dataset.period;
            gastosPage = 1;
            container.querySelectorAll('.gastos-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshTableView(container);
        });
    });
}

// --------------------------------------------------------------------------
// Toolbar de Búsqueda y Filtros
// --------------------------------------------------------------------------
function bindToolbar(container) {
    let searchTimer = null;
    container.querySelector('#gastos-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            gastosFilter.search = e.target.value;
            gastosPage = 1;
            refreshTableView(container);
        }, 200);
    });

    container.querySelector('#gastos-filter-cat')?.addEventListener('change', (e) => {
        gastosFilter.category = e.target.value;
        gastosPage = 1;
        refreshTableView(container);
    });

    container.querySelector('#gastos-filter-method')?.addEventListener('change', (e) => {
        gastosFilter.paymentMethod = e.target.value;
        gastosPage = 1;
        refreshTableView(container);
    });

    container.querySelector('#gastos-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        gastosSort = { field, dir };
        gastosPage = 1;
        refreshTableView(container);
    });
}

// --------------------------------------------------------------------------
// Filtrado y Ordenamiento de Gastos
// --------------------------------------------------------------------------
function getFilteredExpenses() {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    // 1. Filtro por Período
    let list = allExpenses.filter(e => {
        const d = new Date(e.created_at);
        if (activePeriod === 'shift') {
            return currentRegister ? e.cash_register_id === currentRegister.id : false;
        }
        if (activePeriod === 'today') {
            return (e.expense_date && e.expense_date === todayStr) || d.toISOString().slice(0, 10) === todayStr;
        }
        if (activePeriod === 'month') {
            return d.getFullYear() === curYear && d.getMonth() === curMonth;
        }
        return true; // 'all'
    });

    // 2. Filtro por Búsqueda (descripción, proveedor, nro comprobante)
    if (gastosFilter.search.trim()) {
        const q = gastosFilter.search.toLowerCase();
        list = list.filter(e => {
            const desc = (e.description || '').toLowerCase();
            const supp = (e.supplier || '').toLowerCase();
            const vnum = (e.voucher_number || '').toLowerCase();
            return desc.includes(q) || supp.includes(q) || vnum.includes(q);
        });
    }

    // 3. Filtro por Categoría
    if (gastosFilter.category !== 'all') {
        list = list.filter(e => e.category_id === gastosFilter.category);
    }

    // 4. Filtro por Medio de Pago
    if (gastosFilter.paymentMethod !== 'all') {
        list = list.filter(e => (e.payment_method || 'efectivo') === gastosFilter.paymentMethod);
    }

    // 5. Ordenamiento
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

// --------------------------------------------------------------------------
// Refresco de Tabla y Analítica
// --------------------------------------------------------------------------
function refreshTableView(container) {
    const filtered = getFilteredExpenses();

    // Actualizar suma total del filtro
    const sumEl = container.querySelector('#gastos-filter-sum');
    const totalSum = filtered.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    if (sumEl) {
        sumEl.textContent = `Total: ${formatGs(totalSum)} (${filtered.length} gastos)`;
    }

    // Render Widget Analítico de Categorías para el período filtrado
    renderCategoryAnalytics(container, filtered, totalSum);

    // Render Filas de la Tabla
    renderTableRows(container, filtered);

    // Render Paginación
    renderPagination(container, filtered);
}

function renderCategoryAnalytics(container, list, totalSum) {
    const widget = container.querySelector('#gastos-analytics-widget');
    if (!widget) return;

    if (list.length === 0 || totalSum === 0) {
        widget.style.display = 'none';
        return;
    }

    widget.style.display = 'block';

    const catTotals = {};
    list.forEach(e => {
        const cat = e.expense_categories || { name: 'Otros', icon: '📌' };
        const key = cat.name;
        if (!catTotals[key]) catTotals[key] = { amount: 0, icon: cat.icon || '📌' };
        catTotals[key].amount += (Number(e.amount) || 0);
    });

    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1].amount - a[1].amount).slice(0, 4);
    const colors = ['#FFD700', '#00E5FF', '#FF9100', '#B388FF'];

    widget.innerHTML = `
        <div class="gastos-analytics-header">
            <h4><span>📊</span> Desglose por Categoría (${list.length} registros en período)</h4>
            <span style="font-size: 0.78rem; font-family: var(--font-mono); color: var(--text-muted);">${formatGs(totalSum)}</span>
        </div>
        <div class="gastos-cat-bars">
            ${sortedCats.map(([name, data], idx) => {
                const pct = totalSum > 0 ? Math.round((data.amount / totalSum) * 100) : 0;
                const col = colors[idx % colors.length];
                return `
                    <div class="gastos-cat-item">
                        <div class="gastos-cat-item-top">
                            <span>${data.icon} <strong>${name}</strong></span>
                            <span style="font-family: var(--font-mono); color: ${col}; font-weight: bold;">${pct}% · ${formatGs(data.amount)}</span>
                        </div>
                        <div class="gastos-cat-progress-track">
                            <div class="gastos-cat-progress-bar" style="width: ${pct}%; --cat-color: ${col};"></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderTableRows(container, filtered) {
    const tbody = container.querySelector('#expenses-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center p-4" style="color: var(--text-muted); padding: 2.5rem 1rem;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🧾</div>
                    <strong style="color: #FFF;">No se encontraron gastos</strong><br>
                    <small>Prueba ajustando el período seleccionado o los filtros de búsqueda.</small>
                </td>
            </tr>
        `;
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / GASTOS_PAGE_SIZE));
    if (gastosPage > totalPages) gastosPage = totalPages;
    const start = (gastosPage - 1) * GASTOS_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + GASTOS_PAGE_SIZE);

    tbody.innerHTML = pageItems.map(e => {
        const d = new Date(e.created_at);
        const dateStr = d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
        const timeStr = d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

        const cat = e.expense_categories || { name: 'Sin categoría', icon: '📌' };
        const isCash = (e.payment_method || 'efectivo') === 'efectivo';
        const hasVoucher = e.voucher_type && e.voucher_type !== 'sin_comprobante';
        const voucherLabel = e.voucher_type === 'factura' ? 'FAC' : (e.voucher_type === 'recibo' ? 'REC' : 'TKT');

        return `
            <tr data-id="${e.id}">
                <td style="white-space: nowrap; font-size: 0.82rem; color: var(--text-muted);">
                    <div>${dateStr}</div>
                    <div style="font-size: 0.72rem;">${timeStr}</div>
                </td>
                <td>
                    <div style="font-weight: 700; color: #FFF; display: flex; align-items: center; flex-wrap: wrap;">
                        ${e.description}
                        ${hasVoucher ? `<span class="badge-voucher" title="${e.voucher_number || 'Comprobante'}">${voucherLabel} ${e.voucher_number ? '#' + e.voucher_number : ''}</span>` : ''}
                    </div>
                    ${e.supplier ? `<span class="supplier-text">👤 Prov: ${e.supplier}</span>` : ''}
                </td>
                <td>
                    <span class="badge-cat">${cat.icon || '📌'} ${cat.name}</span>
                </td>
                <td>
                    ${isCash 
                        ? '<span class="badge-payment badge-payment--cash">💵 Caja</span>' 
                        : '<span class="badge-payment badge-payment--bank">📱 Banco</span>'}
                </td>
                <td style="text-align: right;">
                    <span class="text-red">- ${formatGs(e.amount)}</span>
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button type="button" class="gastos-action-btn gastos-action-btn--edit btn-edit-exp" data-id="${e.id}" title="Editar Gasto">
                        ✏️
                    </button>
                    <button type="button" class="gastos-action-btn gastos-action-btn--del btn-delete-exp" data-id="${e.id}" title="Eliminar Gasto">
                        🗑️
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    attachRowActions(container);
}

function renderPagination(container, filtered) {
    const pContainer = container.querySelector('#gastos-pagination-container');
    if (!pContainer) return;

    const totalPages = Math.max(1, Math.ceil(filtered.length / GASTOS_PAGE_SIZE));
    if (gastosPage > totalPages) gastosPage = totalPages;

    pContainer.innerHTML = `
        <div class="gastos-pagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.82rem; color: var(--text-muted);">
                Mostrando <strong>${filtered.length}</strong> gasto(s) · Página <strong>${gastosPage}</strong> de <strong>${totalPages}</strong>
            </span>
            <div style="display: flex; gap: 0.5rem;">
                <button type="button" class="btn btn--secondary btn--sm" id="btn-gastos-prev" ${gastosPage <= 1 ? 'disabled style="opacity:0.4"' : ''}>
                    ← Anterior
                </button>
                <button type="button" class="btn btn--secondary btn--sm" id="btn-gastos-next" ${gastosPage >= totalPages ? 'disabled style="opacity:0.4"' : ''}>
                    Siguiente →
                </button>
            </div>
        </div>
    `;

    pContainer.querySelector('#btn-gastos-prev')?.addEventListener('click', () => {
        if (gastosPage > 1) {
            gastosPage--;
            refreshTableView(container);
        }
    });

    pContainer.querySelector('#btn-gastos-next')?.addEventListener('click', () => {
        gastosPage++;
        refreshTableView(container);
    });
}

function attachRowActions(container) {
    // Editar
    container.querySelectorAll('.btn-edit-exp').forEach(btn => {
        btn.addEventListener('click', () => {
            const exp = allExpenses.find(e => e.id === btn.dataset.id);
            if (exp) openEditExpenseModal(container, exp);
        });
    });

    // Eliminar
    container.querySelectorAll('.btn-delete-exp').forEach(btn => {
        btn.addEventListener('click', () => {
            const exp = allExpenses.find(e => e.id === btn.dataset.id);
            if (exp) confirmDeleteExpense(container, exp);
        });
    });
}

// --------------------------------------------------------------------------
// Modal de Edición de Gasto
// --------------------------------------------------------------------------
function openEditExpenseModal(container, expense) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    const isCash = (expense.payment_method || 'efectivo') === 'efectivo';

    overlay.innerHTML = `
        <div class="card" style="max-width: 480px; width: 100%; padding: 1.75rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(255, 215, 0, 0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                <h3 style="font-family: var(--font-title); color: var(--color-primary); margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem;">
                    <span>✏️</span> Editar Registro de Gasto
                </h3>
                <button type="button" class="btn btn--ghost btn-close-modal" style="font-size: 1.2rem; padding: 0.2rem 0.5rem;">✕</button>
            </div>

            <form id="form-edit-expense">
                <div class="form-group">
                    <label for="edit-exp-desc">Concepto / Descripción:</label>
                    <input type="text" id="edit-exp-desc" value="${expense.description || ''}" required>
                </div>

                <div class="form-group">
                    <label for="edit-exp-amount">Monto (Gs.):</label>
                    <input type="number" id="edit-exp-amount" value="${expense.amount || 0}" min="500" step="500" required>
                </div>

                <div class="form-group">
                    <label for="edit-exp-cat">Rubro / Categoría:</label>
                    <select id="edit-exp-cat" required>
                        ${categories.map(c => `<option value="${c.id}" ${expense.category_id === c.id ? 'selected' : ''}>${c.icon || '📌'} ${c.name}</option>`).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label style="display: block; margin-bottom: 0.35rem; font-size: 0.8rem; font-weight: 600;">Medio de Pago:</label>
                    <div class="payment-selector">
                        <label class="payment-radio-label ${isCash ? 'selected' : ''}" id="edit-lbl-cash">
                            <input type="radio" name="edit-exp-payment" value="efectivo" ${isCash ? 'checked' : ''}>
                            <span>💵 <strong>Efectivo Caja</strong><br><small style="color: var(--text-muted);">Afecta arqueo</small></span>
                        </label>
                        <label class="payment-radio-label ${!isCash ? 'selected' : ''}" id="edit-lbl-bank">
                            <input type="radio" name="edit-exp-payment" value="transferencia" ${!isCash ? 'checked' : ''}>
                            <span>📱 <strong>Transferencia</strong><br><small style="color: var(--text-muted);">Cuenta banco</small></span>
                        </label>
                    </div>
                </div>

                <div class="voucher-details-box">
                    <div class="voucher-details-title">
                        <span>🧾</span> Datos del Comprobante
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <div>
                            <label style="font-size: 0.72rem; color: var(--text-muted);">Tipo:</label>
                            <select id="edit-exp-voucher-type" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                                <option value="sin_comprobante" ${expense.voucher_type === 'sin_comprobante' ? 'selected' : ''}>Sin Comprobante</option>
                                <option value="factura" ${expense.voucher_type === 'factura' ? 'selected' : ''}>Factura Legal (IVA)</option>
                                <option value="recibo" ${expense.voucher_type === 'recibo' ? 'selected' : ''}>Recibo Simple</option>
                                <option value="ticket" ${expense.voucher_type === 'ticket' ? 'selected' : ''}>Ticket Fiscal</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 0.72rem; color: var(--text-muted);">Nº Comprobante:</label>
                            <input type="text" id="edit-exp-voucher-number" value="${expense.voucher_number || ''}" placeholder="001-001-1234" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 0.72rem; color: var(--text-muted);">Proveedor / Beneficiario:</label>
                        <input type="text" id="edit-exp-supplier" value="${expense.supplier || ''}" placeholder="Ej: Frigorífico Guaraní" style="width: 100%; font-size: 0.76rem; padding: 0.35rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 4px;">
                    </div>
                </div>

                <div style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
                    <button type="button" class="btn btn--ghost btn-close-modal" style="flex: 1;">Cancelar</button>
                    <button type="submit" class="btn btn--primary" style="flex: 1;">💾 Guardar Cambios</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    // Toggle visual medio pago
    overlay.querySelectorAll('input[name="edit-exp-payment"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const lblC = overlay.querySelector('#edit-lbl-cash');
            const lblB = overlay.querySelector('#edit-lbl-bank');
            if (e.target.value === 'efectivo') {
                lblC?.classList.add('selected');
                lblB?.classList.remove('selected');
            } else {
                lblB?.classList.add('selected');
                lblC?.classList.remove('selected');
            }
        });
    });

    overlay.querySelector('#form-edit-expense')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = overlay.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Guardando...';

        const updates = {
            description: overlay.querySelector('#edit-exp-desc').value.trim(),
            amount: parseInt(overlay.querySelector('#edit-exp-amount').value, 10) || 0,
            category_id: overlay.querySelector('#edit-exp-cat').value,
            payment_method: overlay.querySelector('input[name="edit-exp-payment"]:checked')?.value || 'efectivo',
            voucher_type: overlay.querySelector('#edit-exp-voucher-type').value,
            voucher_number: overlay.querySelector('#edit-exp-voucher-number').value.trim() || null,
            supplier: overlay.querySelector('#edit-exp-supplier').value.trim() || null
        };

        try {
            await expenseService.update(expense.id, updates);
            showToast({ message: '✅ Gasto actualizado con éxito', type: 'success' });
            close();
            await loadData();
            renderKpis(container);
            refreshTableView(container);
        } catch (err) {
            showToast({ message: 'Error al actualizar: ' + err.message, type: 'error' });
            submitBtn.disabled = false;
            submitBtn.textContent = '💾 Guardar Cambios';
        }
    });
}

// --------------------------------------------------------------------------
// Modal de Confirmación de Borrado
// --------------------------------------------------------------------------
function confirmDeleteExpense(container, expense) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    overlay.innerHTML = `
        <div class="card" style="max-width: 420px; width: 100%; padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-md); text-align: center; border: 1px solid rgba(255, 82, 82, 0.4);">
            <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🗑️</div>
            <h3 style="font-family: var(--font-title); color: #FF5252; margin: 0 0 0.75rem; font-size: 0.95rem;">
                ¿Eliminar este gasto?
            </h3>
            <div style="background: rgba(255,255,255,0.03); padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.85rem; text-align: left;">
                <div>Concepto: <strong>${expense.description}</strong></div>
                <div>Monto: <strong class="text-red">${formatGs(expense.amount)}</strong></div>
                <div>Medio: <strong>${(expense.payment_method || 'efectivo').toUpperCase()}</strong></div>
            </div>
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                Si este gasto fue pagado en efectivo de la caja activa, el efectivo esperado de la caja se recalculará automáticamente.
            </p>
            <div style="display: flex; gap: 0.75rem;">
                <button type="button" class="btn btn--ghost btn-cancel" style="flex: 1;">Cancelar</button>
                <button type="button" class="btn btn--danger btn-confirm-del" style="flex: 1;">🗑️ Sí, eliminar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.btn-cancel')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('.btn-confirm-del')?.addEventListener('click', async () => {
        const btn = overlay.querySelector('.btn-confirm-del');
        btn.disabled = true;
        btn.textContent = 'Eliminando...';

        try {
            await expenseService.deleteExpense(expense.id);
            showToast({ message: 'Gasto eliminado', type: 'success' });
            close();
            await loadData();
            renderKpis(container);
            refreshTableView(container);
        } catch (err) {
            showToast({ message: 'Error al eliminar: ' + err.message, type: 'error' });
            btn.disabled = false;
            btn.textContent = '🗑️ Sí, eliminar';
        }
    });
}

// --------------------------------------------------------------------------
// Modal de Gestión de Categorías
// --------------------------------------------------------------------------
function openCategoriesModal(container) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    const EMOJI_OPTIONS = ['📦', '⚡', '🛵', '🛠️', '👥', '💸', '🥤', '🥩', '🥖', '🧹', '❄️', '🧾', '📌'];

    function renderModalContent() {
        overlay.innerHTML = `
            <div class="card" style="max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(255, 215, 0, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <h3 style="font-family: var(--font-title); color: var(--color-primary); margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 0.4rem;">
                        <span>⚙️</span> Categorías de Gastos
                    </h3>
                    <button type="button" class="btn btn--ghost btn-close-modal" style="font-size: 1.2rem; padding: 0.2rem 0.5rem;">✕</button>
                </div>

                <!-- Formulario Nueva Categoría -->
                <form id="form-new-cat" style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,215,0,0.25); border-radius: 8px; padding: 1rem; margin-bottom: 1.25rem;">
                    <strong style="font-size: 0.82rem; color: #FFF; display: block; margin-bottom: 0.6rem;">➕ Crear Nueva Categoría:</strong>
                    <div style="display: flex; gap: 0.5rem; margin-bottom: 0.6rem;">
                        <select id="new-cat-icon" style="width: 60px; font-size: 1.1rem; background: var(--bg-elevated); color: #FFF; border: 1px solid var(--border-subtle); border-radius: 6px; text-align: center;">
                            ${EMOJI_OPTIONS.map(em => `<option value="${em}">${em}</option>`).join('')}
                        </select>
                        <input type="text" id="new-cat-name" placeholder="Nombre de categoría (ej: Alquiler, Frutería...)" required style="flex: 1;">
                    </div>
                    <button type="submit" class="btn btn--primary btn--sm" style="width: 100%;">
                        💾 Agregar Categoría
                    </button>
                </form>

                <!-- Lista de Categorías Existentes -->
                <strong style="font-size: 0.8rem; color: var(--text-muted); display: block; margin-bottom: 0.5rem; text-transform: uppercase;">Categorías Actuales:</strong>
                <div style="display: flex; flex-direction: column; gap: 0.45rem;">
                    ${categories.map(c => {
                        const count = allExpenses.filter(e => e.category_id === c.id).length;
                        const isProtected = c.name === 'Retiros / Sangría';
                        return `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 0.6rem 0.75rem; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 0.5rem;">
                                    <span style="font-size: 1.2rem;">${c.icon || '📌'}</span>
                                    <div>
                                        <strong style="font-size: 0.85rem; color: #FFF;">${c.name}</strong>
                                        <span style="font-size: 0.72rem; color: var(--text-muted); display: block;">${count} gasto(s) registrados</span>
                                    </div>
                                </div>
                                ${!isProtected ? `
                                    <button type="button" class="btn btn--ghost btn-del-cat" data-id="${c.id}" data-name="${c.name}" data-count="${count}" style="color: #FF5252; padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                                        🗑️
                                    </button>
                                ` : '<span style="font-size: 0.7rem; color: var(--color-primary); font-weight: bold;">Sistema</span>'}
                            </div>
                        `;
                    }).join('')}
                </div>

                <div style="margin-top: 1.25rem; text-align: right;">
                    <button type="button" class="btn btn--secondary btn-close-modal" style="width: 100%;">Listo / Cerrar</button>
                </div>
            </div>
        `;

        overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', () => overlay.remove()));

        // Form nueva categoría
        overlay.querySelector('#form-new-cat')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const icon = overlay.querySelector('#new-cat-icon').value;
            const name = overlay.querySelector('#new-cat-name').value.trim();
            if (!name) return;

            try {
                await expenseService.createCategory({ name, icon });
                showToast({ message: `Categoría "${name}" agregada`, type: 'success' });
                await loadData();
                renderModalContent();
                // Actualizar select en página principal
                const catSel = container.querySelector('#exp-cat');
                if (catSel) catSel.innerHTML = categories.map(c => `<option value="${c.id}">${c.icon || '📌'} ${c.name}</option>`).join('');
                const filterCat = container.querySelector('#gastos-filter-cat');
                if (filterCat) filterCat.innerHTML = `<option value="all">Todas las categorías</option>` + categories.map(c => `<option value="${c.id}">${c.icon || '📌'} ${c.name}</option>`).join('');
            } catch (err) {
                showToast({ message: 'Error creando categoría: ' + err.message, type: 'error' });
            }
        });

        // Borrar categoría
        overlay.querySelectorAll('.btn-del-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const count = parseInt(btn.dataset.count, 10) || 0;
                if (count > 0) {
                    showToast({
                        message: `No se puede eliminar la categoría "${btn.dataset.name}" porque tiene ${count} gasto(s) vinculados.`,
                        type: 'warning'
                    });
                    return;
                }

                if (!confirm(`¿Eliminar la categoría "${btn.dataset.name}"?`)) return;

                try {
                    await expenseService.deleteCategory(btn.dataset.id);
                    showToast({ message: 'Categoría eliminada', type: 'success' });
                    await loadData();
                    renderModalContent();
                } catch (err) {
                    showToast({ message: 'Error eliminando categoría: ' + err.message, type: 'error' });
                }
            });
        });
    }

    renderModalContent();
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// --------------------------------------------------------------------------
// Exportación a Excel Profesional Burgame
// --------------------------------------------------------------------------
async function exportGastosToExcel(list, periodLabel) {
    if (!list || list.length === 0) {
        showToast({ message: 'No hay gastos para exportar en este período', type: 'warning' });
        return;
    }

    try {
        showToast({ message: '⏳ Generando Excel corporativo...', type: 'info' });
        const ExcelJS = await loadExcelJS();
        const wb = new ExcelJS.Workbook();

        const totalAmount = list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const fmtDate = (d) => new Date(d).toLocaleDateString('es-PY');
        const fmtTime = (d) => new Date(d).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

        // HOJA 1: Detalle de Gastos
        const wsDetalle = wb.addWorksheet('Detalle de Gastos');
        const headers = [
            '#', 'FECHA', 'HORA', 'CONCEPTO / DESCRIPCIÓN', 'CATEGORÍA', 
            'PROVEEDOR / BENEFICIARIO', 'TIPO COMPROBANTE', 'Nº COMPROBANTE', 'MEDIO DE PAGO', 'MONTO (Gs.)'
        ];
        const rows = [
            [''], [''], [''], [''], [''],
            headers
        ];

        list.forEach((e, idx) => {
            const d = new Date(e.created_at);
            const catName = e.expense_categories ? e.expense_categories.name : 'Sin categoría';
            const methodStr = e.payment_method === 'transferencia' ? 'Transferencia Bancaria' : 'Efectivo Caja';
            const voucherStr = e.voucher_type === 'factura' 
                ? 'Factura Legal' 
                : (e.voucher_type === 'recibo' 
                    ? 'Recibo Simple' 
                    : (e.voucher_type === 'ticket' ? 'Ticket Fiscal' : 'Sin Comprobante'));

            rows.push([
                idx + 1,
                fmtDate(d),
                fmtTime(d),
                e.description || '—',
                catName,
                e.supplier || '—',
                voucherStr,
                e.voucher_number || '—',
                methodStr,
                Number(e.amount) || 0
            ]);
        });

        rows.push([]);
        rows.push(['', '', '', '', '', '', '', '', 'TOTAL GASTOS', totalAmount]);

        buildBurgameSheet(wsDetalle, rows, { imageRows: 5 });

        // HOJA 2: Resumen por Categoría
        const wsCat = wb.addWorksheet('Por Categoría');
        const catTotals = {};
        list.forEach(e => {
            const catName = e.expense_categories ? e.expense_categories.name : 'Sin categoría';
            catTotals[catName] = (catTotals[catName] || 0) + (Number(e.amount) || 0);
        });

        const catRows = [
            [''], [''], [''], [''], [''],
            ['CATEGORÍA', 'MONTO TOTAL (Gs.)', '% DEL TOTAL']
        ];

        Object.entries(catTotals)
            .sort((a, b) => b[1] - a[1])
            .forEach(([name, amt]) => {
                const pct = totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) + '%' : '0%';
                catRows.push([name, amt, pct]);
            });

        catRows.push([]);
        catRows.push(['TOTAL', totalAmount, '100%']);

        buildBurgameSheet(wsCat, catRows, { imageRows: 5 });

        const filename = `Gastos_Burgame_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        await downloadBurgameExcel(wb, filename, {
            logoSheets: ['Detalle de Gastos', 'Por Categoría'],
            bannerSheet: 'Detalle de Gastos'
        });

        showToast({ message: `✅ Archivo descargado: ${filename}`, type: 'success' });
    } catch (err) {
        showToast({ message: 'Error exportando Excel: ' + err.message, type: 'error' });
    }
}

