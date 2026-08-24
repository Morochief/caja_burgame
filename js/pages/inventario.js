import { supabase } from '../supabase-client.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';
import { productService } from '../services/product-service.js';

let allProducts = [];
let inventoryFilter = 'all'; // 'all' | 'low' | 'out'
let searchQuery = '';

export async function renderInventarioPage() {
    const container = document.createElement('div');
    container.className = 'inventario-page';

    // Layout inmediato con skeleton
    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div class="page-header__info">
                <h1>📦 CONTROL DE INVENTARIO</h1>
                <p>Gestiona el stock de productos y registra movimientos</p>
            </div>
            <div id="inv-summary-stats" style="display: flex; gap: 1rem;">
                <span class="badge badge--gray" style="font-size: 0.8rem;">⏳ Cargando...</span>
            </div>
        </header>

        <div class="inventario-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1rem 0; align-items: center;">
            <input type="text" id="inv-search" placeholder="🔍 Buscar producto..." style="flex: 1; min-width: 180px;">
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn--sm ${inventoryFilter === 'all' ? 'btn--primary' : 'btn--secondary'}" data-filter="all">Todos</button>
                <button class="btn btn--sm ${inventoryFilter === 'low' ? 'btn--primary' : 'btn--secondary'}" data-filter="low">⚠️ Bajo</button>
                <button class="btn btn--sm ${inventoryFilter === 'out' ? 'btn--primary' : 'btn--secondary'}" data-filter="out">🔴 Agotado</button>
            </div>
        </div>

        <div class="card">
            <table class="table" id="inv-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Stock Actual</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="inv-table-body">
                    <tr><td colspan="5" class="text-center p-4">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando inventario...</p></div>
                    </td></tr>
                </tbody>
            </table>
        </div>

        <!-- Modal de ajuste de stock -->
        <div id="inv-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 420px;">
                <div class="modal-header">
                    <h2 id="inv-modal-title">📦 Ajustar Stock</h2>
                    <button id="inv-btn-close-modal" class="btn-close">&times;</button>
                </div>
                <form id="inv-form">
                    <input type="hidden" id="inv-product-id">
                    <div style="background: rgba(255,215,0,0.06); border: 1px solid var(--border-gold); border-radius: var(--radius-md); padding: 0.8rem; margin-bottom: 1rem;">
                        <div style="font-size: 0.8rem; color: var(--text-muted);">Producto</div>
                        <div id="inv-modal-product-name" style="font-weight: 700; font-size: 1rem; color: var(--text-main);"></div>
                        <div style="font-size: 0.85rem; margin-top: 0.3rem;">Stock actual: <strong id="inv-modal-current-stock" style="color: var(--color-primary);"></strong></div>
                    </div>
                    <div class="form-group">
                        <label for="inv-quantity">Cantidad (positivo = entrada, negativo = salida):</label>
                        <input type="number" id="inv-quantity" placeholder="Ej: 10 o -5" required>
                    </div>
                    <div class="form-group">
                        <label for="inv-reason">Motivo:</label>
                        <select id="inv-reason">
                            <option value="compra">🛒 Compra / Reposición</option>
                            <option value="ajuste">⚖️ Ajuste de inventario</option>
                            <option value="merma">📉 Merma / Pérdida</option>
                            <option value="correccion">✏️ Corrección</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="inv-notes">Notas (opcional):</label>
                        <input type="text" id="inv-notes" placeholder="Detalle del movimiento...">
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                        <button type="button" id="inv-btn-cancel" class="btn btn--secondary btn--block">Cancelar</button>
                        <button type="submit" class="btn btn--primary btn--block">✅ Confirmar</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    loadInventarioData(container);

    return container;
}

async function loadInventarioData(container) {
    try {
        allProducts = await productService.getAllAdmin();
    } catch (err) {
        showToast({ message: 'Error al cargar inventario', type: 'error' });
        return;
    }

    // Summary stats
    const total = allProducts.length;
    const lowStock = allProducts.filter(p => p.stock > 0 && p.stock < 10).length;
    const outStock = allProducts.filter(p => p.stock <= 0).length;
    const statsEl = container.querySelector('#inv-summary-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <span class="badge badge--green" style="font-size: 0.8rem; padding: 0.4rem 0.7rem;">📦 ${total} productos</span>
            <span class="badge badge--yellow" style="font-size: 0.8rem; padding: 0.4rem 0.7rem;">⚠️ ${lowStock} stock bajo</span>
            <span class="badge badge--red" style="font-size: 0.8rem; padding: 0.4rem 0.7rem;">🔴 ${outStock} agotados</span>
        `;
    }

    refreshTable(container);

    // Eventos de toolbar
    container.querySelector('#inv-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshTable(container);
    });

    container.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            inventoryFilter = btn.dataset.filter;
            container.querySelectorAll('[data-filter]').forEach(b => {
                b.classList.remove('btn--primary');
                b.classList.add('btn--secondary');
            });
            btn.classList.remove('btn--secondary');
            btn.classList.add('btn--primary');
            refreshTable(container);
        });
    });

    // Modal events
    container.querySelector('#inv-btn-close-modal')?.addEventListener('click', () => {
        container.querySelector('#inv-modal')?.classList.add('hidden');
    });
    container.querySelector('#inv-btn-cancel')?.addEventListener('click', () => {
        container.querySelector('#inv-modal')?.classList.add('hidden');
    });
    container.querySelector('#inv-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleStockAdjust(container);
    });
}

function refreshTable(container) {
    let filtered = allProducts;

    if (inventoryFilter === 'low') {
        filtered = filtered.filter(p => p.stock > 0 && p.stock < 10);
    } else if (inventoryFilter === 'out') {
        filtered = filtered.filter(p => p.stock <= 0);
    }

    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
        container.querySelector('#inv-table-body').innerHTML = `
            <tr><td colspan="5" class="text-center p-4">
                <p class="empty-text">No hay productos que coincidan con el filtro.</p>
            </td></tr>
        `;
        return;
    }

    container.querySelector('#inv-table-body').innerHTML = filtered.map(p => {
        const catName = (p.categories && p.categories.name) || 'Sin categoría';
        let statusBadge;
        if (p.stock <= 0) {
            statusBadge = '<span class="badge badge--red">🔴 AGOTADO</span>';
        } else if (p.stock < 10) {
            statusBadge = '<span class="badge badge--yellow">⚠️ STOCK BAJO</span>';
        } else {
            statusBadge = '<span class="badge badge--green">✅ EN STOCK</span>';
        }

        return `
            <tr>
                <td style="font-weight: 600;">${p.name}</td>
                <td style="color: var(--text-muted);">${catName}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; font-size: 1rem; color: ${p.stock <= 0 ? 'var(--color-danger)' : p.stock < 10 ? 'var(--color-primary)' : 'var(--text-main)'};">${p.stock}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn--sm btn--primary btn-inv-adjust" data-id="${p.id}">
                        📦 Ajustar
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    // Attach adjust events
    container.querySelectorAll('.btn-inv-adjust').forEach(btn => {
        btn.addEventListener('click', () => {
            const product = allProducts.find(p => p.id === btn.dataset.id);
            if (!product) return;
            openAdjustModal(container, product);
        });
    });
}

function openAdjustModal(container, product) {
    const modal = container.querySelector('#inv-modal');
    if (!modal) return;

    container.querySelector('#inv-product-id').value = product.id;
    container.querySelector('#inv-modal-product-name').textContent = product.name;
    container.querySelector('#inv-modal-current-stock').textContent = product.stock;
    container.querySelector('#inv-quantity').value = '';
    container.querySelector('#inv-reason').value = 'compra';
    container.querySelector('#inv-notes').value = '';

    modal.classList.remove('hidden');
}

async function handleStockAdjust(container) {
    const productId = container.querySelector('#inv-product-id').value;
    const quantity = parseInt(container.querySelector('#inv-quantity').value, 10);
    const reason = container.querySelector('#inv-reason').value;
    const notes = container.querySelector('#inv-notes').value;

    if (!quantity || quantity === 0) {
        showToast({ message: 'La cantidad no puede ser 0', type: 'warning' });
        return;
    }

    try {
        const { data, error } = await supabase.rpc('adjust_stock', {
            p_product_id: productId,
            p_quantity: quantity,
            p_reason: notes ? `${reason}: ${notes}` : reason
        });

        if (error) throw error;

        // Actualizar array local
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            product.stock = data.new_stock;
        }

        // Invalidar cache de productos
        productService.invalidateProductCache();

        showToast({
            message: `✅ Stock actualizado: ${data.previous_stock} → ${data.new_stock}`,
            type: 'success'
        });

        container.querySelector('#inv-modal')?.classList.add('hidden');
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al ajustar stock: ' + err.message, type: 'error' });
    }
}
