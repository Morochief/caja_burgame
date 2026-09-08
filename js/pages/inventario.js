import { inventoryService } from '../services/inventory-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { loadExcelJS, downloadBurgameExcel, buildBurgameSheet } from '../services/excel-export-service.js';

let allProducts = [];
let allMovements = [];
let currentTab = 'stock'; // 'stock' | 'kardex'
let stockFilter = 'all'; // 'all' | 'healthy' | 'low' | 'out'
let categoryFilter = 'all';
let searchQuery = '';
let kardexSearchQuery = '';
let sortField = 'name';
let sortDir = 'asc';
let page = 1;
const PAGE_SIZE = 12;

export async function renderInventarioPage() {
    const container = document.createElement('div');
    container.className = 'inventario-page';

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>📦 CONTROL DE INVENTARIO Y KARDEX</h1>
                <p>Gestión de existencias, auditoría de movimientos, alertas de stock y valorización</p>
            </div>
            <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
                <button type="button" id="btn-export-inv-excel" class="btn btn--secondary" style="font-size: 0.82rem; padding: 0.45rem 0.85rem;">
                    📥 Exportar Inventario Excel
                </button>
            </div>
        </header>

        <!-- KPI Grid Skeleton -->
        <div id="inv-kpi-container">
            <div class="page-loading" style="padding: 2rem;"><div class="pixel-spinner"></div><p>Calculando salud de stock y valorización...</p></div>
        </div>

        <!-- Pestañas de Vista: Stock vs Kardex -->
        <div class="inventario-nav-tabs">
            <button type="button" class="inventario-tab-btn ${currentTab === 'stock' ? 'active' : ''}" data-tab="stock">
                <span>📦</span> Existencias Actuales
            </button>
            <button type="button" class="inventario-tab-btn ${currentTab === 'kardex' ? 'active' : ''}" data-tab="kardex">
                <span>📜</span> Kardex / Auditoría de Movimientos
            </button>
        </div>

        <!-- Contenedor Principal Dinámico -->
        <div id="inv-main-content"></div>

        <!-- Modal de Ajuste de Stock -->
        <div id="inv-modal-container"></div>
    `;

    loadInventarioData(container);

    return container;
}

async function loadInventarioData(container) {
    await loadData();
    renderKpis(container);
    renderActiveTab(container);
    bindHeaderEvents(container);
}

async function loadData() {
    try {
        const [products, movements] = await Promise.all([
            inventoryService.getInventoryProducts(),
            inventoryService.getMovements(150)
        ]);
        allProducts = products || [];
        allMovements = movements || [];
    } catch (err) {
        showToast({ message: 'Error cargando datos de inventario: ' + err.message, type: 'error' });
    }
}

// --------------------------------------------------------------------------
// KPIs y Métricas
// --------------------------------------------------------------------------
function calculateInventoryMetrics() {
    const total = allProducts.length;
    let healthy = 0;
    let low = 0;
    let out = 0;
    let totalValuation = 0;

    allProducts.forEach(p => {
        const s = Number(p.stock) || 0;
        const min = p.min_stock !== undefined && p.min_stock !== null ? Number(p.min_stock) : 10;
        const unitVal = p.cost_price ? Number(p.cost_price) : (Number(p.price) || 0);

        if (s <= 0) {
            out++;
        } else if (s < min) {
            low++;
        } else {
            healthy++;
        }

        if (s > 0) {
            totalValuation += s * unitVal;
        }
    });

    return { total, healthy, low, out, totalValuation };
}

function renderKpis(container) {
    const wrap = container.querySelector('#inv-kpi-container');
    if (!wrap) return;

    const m = calculateInventoryMetrics();

    wrap.innerHTML = `
        <div class="inventario-kpis-grid">
            <div class="inventario-kpi-card inventario-kpi-card--total">
                <div class="inventario-kpi-header">
                    <span class="inventario-kpi-title">Total Artículos</span>
                    <span class="inventario-kpi-icon">📦</span>
                </div>
                <div class="inventario-kpi-value">${m.total}</div>
                <div class="inventario-kpi-sub">Catálogo completo de productos</div>
            </div>

            <div class="inventario-kpi-card inventario-kpi-card--healthy">
                <div class="inventario-kpi-header">
                    <span class="inventario-kpi-title">Stock Saludable</span>
                    <span class="inventario-kpi-icon">🟢</span>
                </div>
                <div class="inventario-kpi-value">${m.healthy}</div>
                <div class="inventario-kpi-sub">Por encima del umbral mínimo</div>
            </div>

            <div class="inventario-kpi-card inventario-kpi-card--low">
                <div class="inventario-kpi-header">
                    <span class="inventario-kpi-title">Alerta Stock Bajo</span>
                    <span class="inventario-kpi-icon">⚠️</span>
                </div>
                <div class="inventario-kpi-value">${m.low}</div>
                <div class="inventario-kpi-sub">Requieren reposición urgente</div>
            </div>

            <div class="inventario-kpi-card inventario-kpi-card--out">
                <div class="inventario-kpi-header">
                    <span class="inventario-kpi-title">Agotados (Crítico)</span>
                    <span class="inventario-kpi-icon">🔴</span>
                </div>
                <div class="inventario-kpi-value">${m.out}</div>
                <div class="inventario-kpi-sub">Sin existencias disponibles</div>
            </div>

            <div class="inventario-kpi-card inventario-kpi-card--val">
                <div class="inventario-kpi-header">
                    <span class="inventario-kpi-title">Valorización de Stock</span>
                    <span class="inventario-kpi-icon">💰</span>
                </div>
                <div class="inventario-kpi-value" style="font-size: 1.25rem;">${formatGs(m.totalValuation)}</div>
                <div class="inventario-kpi-sub">Valor de existencias activas</div>
            </div>
        </div>
    `;
}

// --------------------------------------------------------------------------
// Pestañas Principales (Stock vs Kardex)
// --------------------------------------------------------------------------
function bindHeaderEvents(container) {
    container.querySelectorAll('.inventario-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTab = btn.dataset.tab;
            page = 1;
            container.querySelectorAll('.inventario-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActiveTab(container);
        });
    });

    container.querySelector('#btn-export-inv-excel')?.addEventListener('click', () => {
        exportInventoryExcel();
    });
}

function renderActiveTab(container) {
    const mainWrap = container.querySelector('#inv-main-content');
    if (!mainWrap) return;

    if (currentTab === 'stock') {
        renderStockTab(container, mainWrap);
    } else {
        renderKardexTab(container, mainWrap);
    }
}

// --------------------------------------------------------------------------
// Pestaña 1: Catálogo de Stock
// --------------------------------------------------------------------------
function renderStockTab(container, mainWrap) {
    // Obtener categorías únicas
    const catMap = new Map();
    allProducts.forEach(p => {
        if (p.categories && p.categories.id) {
            catMap.set(p.categories.id, p.categories.name);
        }
    });

    mainWrap.innerHTML = `
        <div class="card" style="padding: 1.25rem;">
            <!-- Toolbar de Filtros -->
            <div class="inventario-toolbar">
                <input type="text" id="inv-search" placeholder="🔍 Buscar producto..." value="${searchQuery}" style="flex: 1; min-width: 180px;">

                <select id="inv-filter-cat" style="min-width: 150px;">
                    <option value="all">Todas las categorías</option>
                    ${Array.from(catMap.entries()).map(([id, name]) => `
                        <option value="${id}" ${categoryFilter === id ? 'selected' : ''}>${name}</option>
                    `).join('')}
                </select>

                <div class="stock-filter-pills">
                    <button type="button" class="stock-pill ${stockFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>
                    <button type="button" class="stock-pill ${stockFilter === 'healthy' ? 'active' : ''}" data-filter="healthy">🟢 Óptimo</button>
                    <button type="button" class="stock-pill ${stockFilter === 'low' ? 'active' : ''}" data-filter="low">⚠️ Stock Bajo</button>
                    <button type="button" class="stock-pill ${stockFilter === 'out' ? 'active' : ''}" data-filter="out">🔴 Agotados</button>
                </div>

                <select id="inv-sort" style="min-width: 140px;">
                    <option value="name-asc" ${sortField === 'name' && sortDir === 'asc' ? 'selected' : ''}>Nombre A-Z</option>
                    <option value="stock-asc" ${sortField === 'stock' && sortDir === 'asc' ? 'selected' : ''}>Stock: Menor primero</option>
                    <option value="stock-desc" ${sortField === 'stock' && sortDir === 'desc' ? 'selected' : ''}>Stock: Mayor primero</option>
                    <option value="price-desc" ${sortField === 'price' && sortDir === 'desc' ? 'selected' : ''}>Precio Mayor</option>
                </select>
            </div>

            <!-- Tabla de Stock -->
            <div style="overflow-x: auto;">
                <table class="table" id="inv-table">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th style="text-align: center;">Stock Mín.</th>
                            <th style="text-align: center;">Stock Actual</th>
                            <th style="text-align: center;">Estado</th>
                            <th style="text-align: right;">Precio / Val.</th>
                            <th style="text-align: center;">Ajuste Rápido</th>
                            <th style="text-align: center;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="inv-table-body"></tbody>
                </table>
            </div>

            <div id="inv-pagination-container"></div>
        </div>
    `;

    bindStockToolbar(container);
    refreshStockTable(container);
}

function bindStockToolbar(container) {
    let searchTimer = null;
    container.querySelector('#inv-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = e.target.value;
            page = 1;
            refreshStockTable(container);
        }, 200);
    });

    container.querySelector('#inv-filter-cat')?.addEventListener('change', (e) => {
        categoryFilter = e.target.value;
        page = 1;
        refreshStockTable(container);
    });

    container.querySelectorAll('.stock-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            stockFilter = btn.dataset.filter;
            page = 1;
            container.querySelectorAll('.stock-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshStockTable(container);
        });
    });

    container.querySelector('#inv-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        sortField = field;
        sortDir = dir;
        page = 1;
        refreshStockTable(container);
    });
}

function getFilteredProducts() {
    let list = [...allProducts];

    // Búsqueda
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    // Categoría
    if (categoryFilter !== 'all') {
        list = list.filter(p => p.category_id === categoryFilter);
    }

    // Nivel de Stock
    if (stockFilter === 'healthy') {
        list = list.filter(p => {
            const min = p.min_stock !== undefined && p.min_stock !== null ? Number(p.min_stock) : 10;
            return Number(p.stock) >= min;
        });
    } else if (stockFilter === 'low') {
        list = list.filter(p => {
            const min = p.min_stock !== undefined && p.min_stock !== null ? Number(p.min_stock) : 10;
            const s = Number(p.stock) || 0;
            return s > 0 && s < min;
        });
    } else if (stockFilter === 'out') {
        list = list.filter(p => (Number(p.stock) || 0) <= 0);
    }

    // Ordenamiento
    list.sort((a, b) => {
        let va = a[sortField], vb = b[sortField];
        if (sortField === 'name') {
            va = (va || '').toLowerCase();
            vb = (vb || '').toLowerCase();
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        }
        va = Number(va) || 0;
        vb = Number(vb) || 0;
        return sortDir === 'asc' ? va - vb : vb - va;
    });

    return list;
}

function refreshStockTable(container) {
    const tbody = container.querySelector('#inv-table-body');
    const pContainer = container.querySelector('#inv-pagination-container');
    if (!tbody) return;

    const filtered = getFilteredProducts();

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center p-4" style="color: var(--text-muted); padding: 2.5rem 1rem;">
                    <div style="font-size: 2rem; margin-bottom: 0.4rem;">📦</div>
                    <strong style="color: #FFF;">No se encontraron artículos</strong><br>
                    <small>Prueba cambiando los filtros de categoría o nivel de stock.</small>
                </td>
            </tr>
        `;
        if (pContainer) pContainer.innerHTML = '';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = pageItems.map(p => {
        const catName = (p.categories && p.categories.name) || 'General';
        const s = Number(p.stock) || 0;
        const min = p.min_stock !== undefined && p.min_stock !== null ? Number(p.min_stock) : 10;
        const unitVal = p.cost_price ? Number(p.cost_price) : (Number(p.price) || 0);
        const subVal = s * unitVal;

        let statusBadge;
        if (s <= 0) {
            statusBadge = '<span class="stock-level-badge stock-level--out">🔴 AGOTADO</span>';
        } else if (s < min) {
            statusBadge = '<span class="stock-level-badge stock-level--low">⚠️ BAJO</span>';
        } else {
            statusBadge = '<span class="stock-level-badge stock-level--healthy">🟢 ÓPTIMO</span>';
        }

        const isPaused = p.active === false;

        return `
            <tr data-id="${p.id}">
                <td>
                    <div style="font-weight: 700; color: #FFF; display: flex; align-items: center; gap: 0.4rem;">
                        ${p.name}
                        ${isPaused ? '<span class="badge badge--gray" style="font-size: 0.65rem;">PAUSADO</span>' : ''}
                    </div>
                </td>
                <td style="color: var(--text-muted); font-size: 0.82rem;">${catName}</td>
                <td style="text-align: center; font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-muted);">
                    ${min}
                </td>
                <td style="text-align: center;">
                    <strong style="font-family: var(--font-mono); font-size: 1.1rem; color: ${s <= 0 ? 'var(--color-danger)' : s < min ? 'var(--color-warning)' : '#10B981'};">
                        ${s}
                    </strong>
                </td>
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: right; font-size: 0.82rem;">
                    <div style="font-weight: 600; color: #FFF;">${formatGs(p.price)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">Val: ${formatGs(subVal)}</div>
                </td>
                <td style="text-align: center;">
                    <div class="quick-adjust-group">
                        <button type="button" class="btn-quick-step btn-step-sub" data-id="${p.id}" data-delta="-1" title="Restar 1">-1</button>
                        <button type="button" class="btn-quick-step btn-step-add" data-id="${p.id}" data-delta="1" title="Sumar 1">+1</button>
                        <button type="button" class="btn-quick-step btn-step-add" data-id="${p.id}" data-delta="5" title="Sumar 5">+5</button>
                    </div>
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button type="button" class="btn btn--sm btn--primary btn-open-adjust" data-id="${p.id}" style="font-size: 0.76rem; padding: 0.25rem 0.55rem;">
                        📦 Ajustar
                    </button>
                    <button type="button" class="btn btn--sm btn--ghost btn-open-config" data-id="${p.id}" style="font-size: 0.76rem; padding: 0.25rem 0.45rem;" title="Configurar Stock Mínimo y Costo">
                        ⚙️
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Paginación
    if (pContainer) {
        pContainer.innerHTML = `
            <div class="gastos-pagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                <span style="font-size: 0.82rem; color: var(--text-muted);">
                    Mostrando <strong>${filtered.length}</strong> artículo(s) · Página <strong>${page}</strong> de <strong>${totalPages}</strong>
                </span>
                <div style="display: flex; gap: 0.5rem;">
                    <button type="button" class="btn btn--secondary btn--sm" id="btn-inv-prev" ${page <= 1 ? 'disabled style="opacity:0.4"' : ''}>← Anterior</button>
                    <button type="button" class="btn btn--secondary btn--sm" id="btn-inv-next" ${page >= totalPages ? 'disabled style="opacity:0.4"' : ''}>Siguiente →</button>
                </div>
            </div>
        `;

        pContainer.querySelector('#btn-inv-prev')?.addEventListener('click', () => {
            if (page > 1) { page--; refreshStockTable(container); }
        });
        pContainer.querySelector('#btn-inv-next')?.addEventListener('click', () => {
            page++; refreshStockTable(container);
        });
    }

    attachStockRowEvents(container);
}

function attachStockRowEvents(container) {
    // Botones rápidos de ajuste directo (+1, +5, -1)
    container.querySelectorAll('.btn-quick-step').forEach(btn => {
        btn.addEventListener('click', async () => {
            const productId = btn.dataset.id;
            const delta = parseInt(btn.dataset.delta, 10);
            const product = allProducts.find(p => p.id === productId);
            if (!product) return;

            if (delta < 0 && (product.stock || 0) <= 0) {
                showToast({ message: 'El producto ya está agotado', type: 'warning' });
                return;
            }

            btn.disabled = true;
            try {
                const res = await inventoryService.adjustStock({
                    productId,
                    quantity: delta,
                    reason: delta > 0 ? 'Reposición Rápida' : 'Salida Rápida',
                    notes: 'Ajuste express desde tabla'
                });

                product.stock = res.new_stock;
                showToast({ message: `Stock de ${product.name}: ${res.previous_stock} → ${res.new_stock}`, type: 'success' });
                renderKpis(container);
                refreshStockTable(container);
            } catch (err) {
                showToast({ message: 'Error: ' + err.message, type: 'error' });
            } finally {
                btn.disabled = false;
            }
        });
    });

    // Modal de Ajuste Completo
    container.querySelectorAll('.btn-open-adjust').forEach(btn => {
        btn.addEventListener('click', () => {
            const product = allProducts.find(p => p.id === btn.dataset.id);
            if (product) openAdjustStockModal(container, product);
        });
    });

    // Modal de Configuración (Stock Mínimo y Costo)
    container.querySelectorAll('.btn-open-config').forEach(btn => {
        btn.addEventListener('click', () => {
            const product = allProducts.find(p => p.id === btn.dataset.id);
            if (product) openConfigProductModal(container, product);
        });
    });
}

// --------------------------------------------------------------------------
// Pestaña 2: Kardex / Auditoría de Movimientos
// --------------------------------------------------------------------------
function renderKardexTab(container, mainWrap) {
    mainWrap.innerHTML = `
        <div class="card" style="padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
                <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin: 0;">
                    📜 REGISTRO DE AUDITORÍA KARDEX (Últimos Movimientos)
                </h3>
                <input type="text" id="kardex-search" placeholder="🔍 Filtrar por producto o motivo..." value="${kardexSearchQuery}" style="width: 250px; padding: 0.4rem 0.75rem; font-size: 0.82rem; background: var(--bg-elevated); border: 1px solid var(--border-subtle); color: #FFF; border-radius: 6px;">
            </div>

            <div style="overflow-x: auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Fecha / Hora</th>
                            <th>Producto</th>
                            <th style="text-align: center;">Operación</th>
                            <th style="text-align: center;">Cantidad</th>
                            <th style="text-align: center;">Stock Previo → Nuevo</th>
                            <th>Motivo / Auditoría</th>
                        </tr>
                    </thead>
                    <tbody id="kardex-table-body"></tbody>
                </table>
            </div>
        </div>
    `;

    container.querySelector('#kardex-search')?.addEventListener('input', (e) => {
        kardexSearchQuery = e.target.value;
        refreshKardexTable(container);
    });

    refreshKardexTable(container);
}

function refreshKardexTable(container) {
    const tbody = container.querySelector('#kardex-table-body');
    if (!tbody) return;

    let filtered = allMovements;
    if (kardexSearchQuery.trim()) {
        const q = kardexSearchQuery.toLowerCase();
        filtered = filtered.filter(m => {
            const pName = (m.product_name || '').toLowerCase();
            const reason = (m.reason || '').toLowerCase();
            return pName.includes(q) || reason.includes(q);
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center p-4" style="color: var(--text-muted); padding: 2rem;">
                    No se encontraron movimientos registrados en Kardex.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.slice(0, 100).map(m => {
        const d = new Date(m.created_at);
        const dateStr = d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
        const timeStr = d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
        const isEntry = m.quantity > 0;

        return `
            <tr>
                <td style="font-size: 0.82rem; color: var(--text-muted); white-space: nowrap;">
                    <div>${dateStr}</div>
                    <div style="font-size: 0.72rem;">${timeStr}</div>
                </td>
                <td>
                    <strong style="color: #FFF;">${m.product_name}</strong>
                </td>
                <td style="text-align: center;">
                    ${isEntry 
                        ? '<span class="kardex-badge kardex-badge--in">🛒 Entrada / Compra</span>' 
                        : '<span class="kardex-badge kardex-badge--out">📉 Salida / Merma</span>'}
                </td>
                <td style="text-align: center;">
                    <span class="${isEntry ? 'kardex-qty-in' : 'kardex-qty-out'}">
                        ${isEntry ? '+' : ''}${m.quantity}
                    </span>
                </td>
                <td style="text-align: center; font-family: var(--font-mono); font-size: 0.85rem; color: #FFF;">
                    ${m.previous_stock} → <strong>${m.new_stock}</strong>
                </td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">
                    ${m.reason || 'Sin detalle'}
                </td>
            </tr>
        `;
    }).join('');
}

// --------------------------------------------------------------------------
// Modal de Ajuste de Stock (Avanzado & Conteo Real)
// --------------------------------------------------------------------------
function openAdjustStockModal(container, product) {
    const modalWrap = container.querySelector('#inv-modal-container');
    if (!modalWrap) return;

    let operationMode = 'add'; // 'add' | 'sub' | 'set'
    const curStock = Number(product.stock) || 0;

    modalWrap.innerHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;">
            <div class="card" style="max-width: 440px; width: 100%; padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(255, 215, 0, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-family: var(--font-title); color: var(--color-primary); margin: 0; font-size: 0.95rem;">
                        📦 Ajustar Stock de Producto
                    </h3>
                    <button type="button" class="btn btn--ghost btn-close-modal" style="font-size: 1.2rem; padding: 0.2rem 0.5rem;">✕</button>
                </div>

                <!-- Resumen de Producto -->
                <div style="background: rgba(255,215,0,0.06); border: 1px solid rgba(255,215,0,0.25); border-radius: 8px; padding: 0.8rem; margin-bottom: 1rem;">
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Producto Seleccionado</div>
                    <div style="font-weight: 800; font-size: 1.05rem; color: #FFF;">${product.name}</div>
                    <div style="font-size: 0.85rem; margin-top: 0.25rem;">
                        Stock actual en estante: <strong style="font-family: var(--font-mono); color: var(--color-primary);">${curStock} unidades</strong>
                    </div>
                </div>

                <!-- Selector de Tipo de Operación -->
                <div class="inv-operation-tabs">
                    <div class="inv-op-tab selected" data-op="add">➕ Entrada / Compra</div>
                    <div class="inv-op-tab" data-op="sub">➖ Salida / Merma</div>
                    <div class="inv-op-tab" data-op="set">⚖️ Conteo Físico Real</div>
                </div>

                <form id="form-adjust-stock">
                    <div class="form-group" id="group-qty-input">
                        <label for="inv-adjust-qty" id="lbl-adjust-qty">Cantidad a ingresar (+):</label>
                        <input type="number" id="inv-adjust-qty" placeholder="Ej: 10" min="1" required autofocus>
                        
                        <!-- Pills de Ayuda Rápida -->
                        <div class="inv-quick-step-pills" id="quick-step-pills">
                            <span class="inv-step-pill" data-step="1">+1</span>
                            <span class="inv-step-pill" data-step="5">+5</span>
                            <span class="inv-step-pill" data-step="10">+10</span>
                            <span class="inv-step-pill" data-step="24">+24 (Pack)</span>
                        </div>
                    </div>

                    <!-- Vista previa en tiempo real -->
                    <div id="inv-preview-result" style="background: rgba(255,255,255,0.03); border-radius: 6px; padding: 0.6rem 0.8rem; margin-bottom: 1rem; font-size: 0.82rem; display: flex; justify-content: space-between;">
                        <span>Resultado proyectado:</span>
                        <strong id="preview-new-stock" style="font-family: var(--font-mono); color: #10B981;">${curStock}</strong>
                    </div>

                    <div class="form-group">
                        <label for="inv-adjust-reason">Motivo / Tipo de Movimiento:</label>
                        <select id="inv-adjust-reason">
                            <option value="compra">🛒 Compra de insumos / Reposición</option>
                            <option value="conteo_inventario">⚖️ Conteo físico periódico</option>
                            <option value="merma">📉 Merma / Dañado / Vencido</option>
                            <option value="consumo_personal">🍔 Consumo de personal / Staff</option>
                            <option value="correccion">✏️ Corrección de error de carga</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="inv-adjust-notes">Notas u Observaciones (opcional):</label>
                        <input type="text" id="inv-adjust-notes" placeholder="Ej: Proveedor Coca-Cola, Factura #123, etc.">
                    </div>

                    <div style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
                        <button type="button" class="btn btn--ghost btn-close-modal" style="flex: 1;">Cancelar</button>
                        <button type="submit" class="btn btn--primary" style="flex: 1;">✅ Confirmar Ajuste</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const overlay = modalWrap.querySelector('.modal-overlay');
    const close = () => { modalWrap.innerHTML = ''; };
    overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const qtyInput = overlay.querySelector('#inv-adjust-qty');
    const lblQty = overlay.querySelector('#lbl-adjust-qty');
    const previewEl = overlay.querySelector('#preview-new-stock');
    const pillsWrap = overlay.querySelector('#quick-step-pills');

    function updatePreview() {
        const val = parseInt(qtyInput.value, 10) || 0;
        let resulting = curStock;

        if (operationMode === 'add') {
            resulting = curStock + val;
        } else if (operationMode === 'sub') {
            resulting = curStock - val;
        } else if (operationMode === 'set') {
            resulting = val;
        }

        previewEl.textContent = `${resulting} unidades (${resulting - curStock >= 0 ? '+' : ''}${resulting - curStock})`;
        previewEl.style.color = resulting < 0 ? '#EF4444' : (resulting < 10 ? '#F59E0B' : '#10B981');
    }

    qtyInput?.addEventListener('input', updatePreview);

    // Cambiar de operación (add / sub / set)
    overlay.querySelectorAll('.inv-op-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            operationMode = tab.dataset.op;
            overlay.querySelectorAll('.inv-op-tab').forEach(t => t.classList.remove('selected'));
            tab.classList.add('selected');

            if (operationMode === 'add') {
                lblQty.textContent = 'Cantidad a ingresar (+):';
                pillsWrap.style.display = 'flex';
                pillsWrap.innerHTML = `
                    <span class="inv-step-pill" data-step="1">+1</span>
                    <span class="inv-step-pill" data-step="5">+5</span>
                    <span class="inv-step-pill" data-step="10">+10</span>
                    <span class="inv-step-pill" data-step="24">+24 (Pack)</span>
                `;
            } else if (operationMode === 'sub') {
                lblQty.textContent = 'Cantidad a retirar / merma (-):';
                pillsWrap.style.display = 'flex';
                pillsWrap.innerHTML = `
                    <span class="inv-step-pill" data-step="1">-1</span>
                    <span class="inv-step-pill" data-step="5">-5</span>
                    <span class="inv-step-pill" data-step="10">-10</span>
                `;
            } else {
                lblQty.textContent = 'Cantidad total real contada:';
                pillsWrap.style.display = 'none';
                qtyInput.value = curStock;
            }

            attachPillEvents();
            updatePreview();
        });
    });

    function attachPillEvents() {
        overlay.querySelectorAll('.inv-step-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const step = parseInt(pill.dataset.step, 10);
                qtyInput.value = Math.abs(step);
                updatePreview();
            });
        });
    }
    attachPillEvents();

    // Submit del formulario
    overlay.querySelector('#form-adjust-stock')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = overlay.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Procesando...';

        const rawVal = parseInt(qtyInput.value, 10);
        const reason = overlay.querySelector('#inv-adjust-reason').value;
        const notes = overlay.querySelector('#inv-adjust-notes').value.trim();

        try {
            if (operationMode === 'add') {
                if (rawVal <= 0) throw new Error('La cantidad a sumar debe ser mayor a 0');
                await inventoryService.adjustStock({
                    productId: product.id,
                    quantity: rawVal,
                    reason: `[COMPRA] ${reason}`,
                    notes
                });
            } else if (operationMode === 'sub') {
                if (rawVal <= 0) throw new Error('La cantidad a restar debe ser mayor a 0');
                await inventoryService.adjustStock({
                    productId: product.id,
                    quantity: -rawVal,
                    reason: `[SALIDA] ${reason}`,
                    notes
                });
            } else {
                // Set stock directo
                await inventoryService.setDirectStock({
                    productId: product.id,
                    currentStock: curStock,
                    targetStock: rawVal,
                    reason,
                    notes
                });
            }

            showToast({ message: '✅ Stock de producto actualizado correctamente', type: 'success' });
            close();
            await loadData();
            renderKpis(container);
            renderActiveTab(container);
        } catch (err) {
            showToast({ message: 'Error: ' + err.message, type: 'error' });
            submitBtn.disabled = false;
            submitBtn.textContent = '✅ Confirmar Ajuste';
        }
    });
}

// --------------------------------------------------------------------------
// Modal de Configuración de Inventario (Stock Mínimo y Costo)
// --------------------------------------------------------------------------
function openConfigProductModal(container, product) {
    const modalWrap = container.querySelector('#inv-modal-container');
    if (!modalWrap) return;

    modalWrap.innerHTML = `
        <div class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.75); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;">
            <div class="card" style="max-width: 400px; width: 100%; padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px solid rgba(255, 215, 0, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h3 style="font-family: var(--font-title); color: var(--color-primary); margin: 0; font-size: 0.95rem;">
                        ⚙️ Configurar Inventario
                    </h3>
                    <button type="button" class="btn btn--ghost btn-close-modal" style="font-size: 1.2rem; padding: 0.2rem 0.5rem;">✕</button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <strong style="font-size: 1rem; color: #FFF;">${product.name}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Stock actual: ${product.stock} unidades</div>
                </div>

                <form id="form-config-inv">
                    <div class="form-group">
                        <label for="cfg-min-stock">Stock Mínimo de Alerta (Unidades):</label>
                        <input type="number" id="cfg-min-stock" value="${product.min_stock !== undefined ? product.min_stock : 10}" min="0" required>
                        <small style="font-size: 0.72rem; color: var(--text-muted);">Cuando el stock caiga por debajo de este valor, pasará a estado de alerta.</small>
                    </div>

                    <div class="form-group">
                        <label for="cfg-cost-price">Costo Unitario de Compra (Gs.):</label>
                        <input type="number" id="cfg-cost-price" value="${product.cost_price || 0}" min="0" step="500">
                        <small style="font-size: 0.72rem; color: var(--text-muted);">Utilizado para calcular la valorización contable del inventario.</small>
                    </div>

                    <div style="display: flex; gap: 0.75rem; margin-top: 1.25rem;">
                        <button type="button" class="btn btn--ghost btn-close-modal" style="flex: 1;">Cancelar</button>
                        <button type="submit" class="btn btn--primary" style="flex: 1;">💾 Guardar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    const overlay = modalWrap.querySelector('.modal-overlay');
    const close = () => { modalWrap.innerHTML = ''; };
    overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#form-config-inv')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const minStock = parseInt(overlay.querySelector('#cfg-min-stock').value, 10);
        const costPrice = parseInt(overlay.querySelector('#cfg-cost-price').value, 10);

        try {
            await inventoryService.updateInventoryConfig(product.id, {
                min_stock: minStock,
                cost_price: costPrice
            });

            product.min_stock = minStock;
            product.cost_price = costPrice;

            showToast({ message: '✅ Configuración de inventario guardada', type: 'success' });
            close();
            renderKpis(container);
            refreshStockTable(container);
        } catch (err) {
            showToast({ message: 'Error al guardar: ' + err.message, type: 'error' });
        }
    });
}

// --------------------------------------------------------------------------
// Exportación a Excel Profesional
// --------------------------------------------------------------------------
async function exportInventoryExcel() {
    try {
        showToast({ message: '⏳ Generando reporte de inventario...', type: 'info' });
        const ExcelJS = await loadExcelJS();
        const wb = new ExcelJS.Workbook();

        // HOJA 1: Stock Actual y Valorización
        const wsStock = wb.addWorksheet('Inventario Actual');
        const headers = [
            '#', 'PRODUCTO', 'CATEGORÍA', 'STOCK ACTUAL', 'STOCK MÍNIMO', 
            'ESTADO', 'PRECIO VENTA (Gs.)', 'COSTO UNIT. (Gs.)', 'VALOR TOTAL (Gs.)'
        ];
        const rows = [
            [''], [''], [''], [''], [''],
            headers
        ];

        let totalValuation = 0;
        let totalItemsCount = 0;

        allProducts.forEach((p, idx) => {
            const catName = (p.categories && p.categories.name) || 'General';
            const s = Number(p.stock) || 0;
            const min = p.min_stock !== undefined && p.min_stock !== null ? Number(p.min_stock) : 10;
            const cost = Number(p.cost_price) || 0;
            const price = Number(p.price) || 0;
            const subVal = s * (cost || price);

            totalValuation += subVal;
            totalItemsCount += s;

            let estado = 'ÓPTIMO';
            if (s <= 0) estado = 'AGOTADO';
            else if (s < min) estado = 'STOCK BAJO';

            rows.push([
                idx + 1,
                p.name,
                catName,
                s,
                min,
                estado,
                price,
                cost,
                subVal
            ]);
        });

        rows.push([]);
        rows.push(['', '', 'TOTALES', totalItemsCount, '', '', '', '', totalValuation]);
        buildBurgameSheet(wsStock, rows, { imageRows: 5 });

        // HOJA 2: Kardex de Movimientos
        const wsKardex = wb.addWorksheet('Auditoría Kardex');
        const kardexHeaders = [
            '#', 'FECHA', 'HORA', 'PRODUCTO', 'TIPO OPERACIÓN', 
            'CANTIDAD', 'STOCK PREVIO', 'NUEVO STOCK', 'MOTIVO / AUDITORÍA'
        ];
        const kardexRows = [
            [''], [''], [''], [''], [''],
            kardexHeaders
        ];

        allMovements.slice(0, 300).forEach((m, idx) => {
            const d = new Date(m.created_at);
            const dateStr = d.toLocaleDateString('es-PY');
            const timeStr = d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
            const isEntry = m.quantity > 0;

            kardexRows.push([
                idx + 1,
                dateStr,
                timeStr,
                m.product_name,
                isEntry ? 'Entrada / Compra' : 'Salida / Merma',
                m.quantity,
                m.previous_stock,
                m.new_stock,
                m.reason || '—'
            ]);
        });

        buildBurgameSheet(wsKardex, kardexRows, { imageRows: 5 });

        const filename = `Inventario_Burgame_${new Date().toISOString().slice(0, 10)}.xlsx`;
        await downloadBurgameExcel(wb, filename, {
            logoSheets: ['Inventario Actual', 'Auditoría Kardex'],
            bannerSheet: 'Inventario Actual'
        });

        showToast({ message: `✅ Archivo descargado: ${filename}`, type: 'success' });
    } catch (err) {
        showToast({ message: 'Error exportando inventario: ' + err.message, type: 'error' });
    }
}

