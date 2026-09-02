import { productService } from '../services/product-service.js';
import { storageService } from '../services/storage-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let productsList = [];
let categoriesList = [];
let deleteTargetId = null;

// Estados de paginación, filtro y ordenamiento
let menuFilter = { search: '', category: 'all', type: 'all' };
let menuSort = { field: 'name', dir: 'asc' };
let menuPage = 1;
const MENU_PAGE_SIZE = 10;

export async function renderMenuPage() {
    const container = document.createElement('div');
    container.className = 'menu-page';

    // Mostrar layout inmediatamente con skeletons
    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>📝 GESTIÓN DE MENÚ Y PRODUCTOS</h1>
                <p>Crea, edita y administra el catálogo oficial de Burgame</p>
            </div>
            <button id="btn-add-product" class="btn btn--primary">
                ➕ Nuevo Producto
            </button>
        </header>

        <div class="menu-table-container card">
            <div class="menu-toolbar" style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: center;">
                <input type="text" id="menu-search" placeholder="🔍 Buscar producto..." value="${menuFilter.search}" style="flex: 1; min-width: 180px;">
                <select id="menu-filter-category" style="min-width: 140px;">
                    <option value="all">Todas las categorías</option>
                </select>
                <select id="menu-filter-type" style="min-width: 120px;">
                    <option value="all">Todos los tipos</option>
                    <option value="standard">Standard</option>
                    <option value="burger">Burger</option>
                    <option value="cheat">Cheat</option>
                    <option value="bowser">Bowser</option>
                    <option value="chopp">Chopp</option>
                </select>
                <select id="menu-sort" style="min-width: 140px;">
                    <option value="name-asc">Nombre ↑</option>
                    <option value="name-desc">Nombre ↓</option>
                    <option value="price-asc">Precio ↑</option>
                    <option value="price-desc">Precio ↓</option>
                </select>
            </div>
            <table class="table">
                <thead>
                    <tr>
                        <th>Imagen</th>
                        <th>Nombre</th>
                        <th>Tipo</th>
                        <th>Categoría</th>
                        <th>Precio Base</th>
                        <th>Precio Combo</th>
                        <th>👑 Club</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="menu-table-body">
                    <tr><td colspan="9" class="text-center p-4">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando productos...</p></div>
                    </td></tr>
                </tbody>
            </table>
            <div id="menu-pagination-container"></div>
        </div>

        ${renderProductModal()}
    `;

    setupEvents(container);
    bindToolbarEvents(container);
    loadMenuData(container);

    return container;
}

function renderProductModal() {
    return `
        <!-- Modal Formulario de Producto -->
        <div id="product-modal" class="modal-overlay hidden">
            <div class="modal-card card">
                <div class="modal-header">
                    <h2 id="modal-title">🍔 Crear Producto</h2>
                    <button id="btn-close-modal" class="btn-close">&times;</button>
                </div>
                <form id="form-product">
                    <input type="hidden" id="prod-id">
                    
                    <div class="form-group">
                        <label for="prod-name">Nombre del Producto:</label>
                        <input type="text" id="prod-name" placeholder="Ej: Mega Hadouken" required>
                    </div>

                    <div class="form-group">
                        <label for="prod-type">Tipo de Producto (define botones en POS):</label>
                        <select id="prod-type">
                            <option value="standard">Standard (un solo botón)</option>
                            <option value="burger">Hamburguesa (Solo + Combo)</option>
                            <option value="cheat">Cheat Burger (Solo + Combo + Promo 3x)</option>
                            <option value="bowser">Bowser (Solo + Combo + Promo Viernes)</option>
                            <option value="chopp">Chopp (3 variantes: 1x, 2x1, Libre)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="prod-category">Categoría:</label>
                        <select id="prod-category" required>
                        </select>
                    </div>

                    <div class="form-row" style="display: flex; gap: 1rem;">
                        <div class="form-group" style="flex: 1;">
                            <label for="prod-price">Precio Base / Solo (Gs.):</label>
                            <input type="number" id="prod-price" placeholder="40000" min="0" required>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label for="prod-combo">Precio Combo (Gs. opcional):</label>
                            <input type="number" id="prod-combo" placeholder="55000" min="0">
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label for="prod-promo">Precio Promo Especial (Gs.):</label>
                            <input type="number" id="prod-promo" placeholder="35000 / 50000" min="0">
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label for="prod-club">👑 Precio Club Burgame (Gs.):</label>
                            <input type="number" id="prod-club" placeholder="Ej: 200000" min="0">
                        </div>
                    </div>

                    <!-- Campos de Variantes de Bebida (Promos Chopp) -->
                    <div id="drink-variants-box" class="card" style="padding: 0.8rem; background: rgba(255,215,0,0.05); border: 1px dashed var(--color-primary); margin-bottom: 1rem;">
                        <h4 style="font-size: 0.82rem; color: var(--color-primary); margin-bottom: 0.5rem;">🍺 Promociones / Variantes de Bebida (Chopp)</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem;">
                            <div class="form-group" style="margin: 0;">
                                <label for="prod-v1" style="font-size: 0.75rem;">1x (Gs.):</label>
                                <input type="number" id="prod-v1" placeholder="15000" value="15000" min="0">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label for="prod-v2" style="font-size: 0.75rem;">Promo 2x1 (Gs.):</label>
                                <input type="number" id="prod-v2" placeholder="25000" value="25000" min="0">
                            </div>
                            <div class="form-group" style="margin: 0;">
                                <label for="prod-v3" style="font-size: 0.75rem;">LIBRE (Gs.):</label>
                                <input type="number" id="prod-v3" placeholder="55000" value="55000" min="0">
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="prod-ingredients">Ingredientes (separados por coma):</label>
                        <input type="text" id="prod-ingredients" placeholder="Carne, Cheddar, Salsa Especial...">
                    </div>

                    <div class="form-group">
                        <label for="prod-image-file">Fotografía del Producto:</label>
                        <input type="file" id="prod-image-file" accept="image/*">
                        <input type="text" id="prod-image-url" placeholder="O pega una URL de imagen..." style="margin-top: 0.5rem;">
                        <div id="image-preview" class="image-preview-box" style="margin-top: 0.5rem; display: none;">
                            <img id="img-preview-tag" src="" style="height: 80px; object-fit: contain;">
                        </div>
                    </div>

                    <div class="modal-actions" style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button type="button" id="btn-cancel-modal" class="btn btn--secondary btn--block">Cancelar</button>
                        <button type="submit" class="btn btn--primary btn--block">Guardar Producto</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal Confirmar Eliminación -->
        <div id="prod-delete-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>🗑️ Eliminar Producto</h2>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                    ¿Seguro que querés eliminar <strong id="prod-delete-name" style="color: var(--text-main);"></strong>?<br>
                    Esta acción <strong style="color: var(--color-danger);">borra el producto de forma permanente</strong> y no se puede deshacer.
                </p>
                <div style="display:flex; gap:0.75rem;">
                    <button class="btn btn--danger btn--block" id="btn-confirm-delete-prod">Sí, Eliminar</button>
                    <button class="btn btn--secondary" id="btn-cancel-delete-prod">Cancelar</button>
                </div>
            </div>
        </div>
    `;
}

async function loadMenuData(container) {
    await loadData();

    // Render categorías en los selects
    const catFilter = container.querySelector('#menu-filter-category');
    if (catFilter) {
        catFilter.innerHTML = `<option value="all">Todas las categorías</option>` +
            categoriesList.map(c => `<option value="${c.id}" ${menuFilter.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
    }
    const catSelect = container.querySelector('#prod-category');
    if (catSelect) {
        catSelect.innerHTML = categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Render tabla y paginación
    refreshTable(container);
}

async function loadData() {
    try {
        const [prods, cats] = await Promise.all([
            productService.getAllAdmin(),
            productService.getCategories()
        ]);
        productsList = prods || [];
        categoriesList = cats || [];
    } catch (err) {
        showToast({ message: 'Error cargando catálogo', type: 'error' });
    }
}

function getFilteredSortedProducts() {
    let list = [...productsList];

    // Filtro por búsqueda
    if (menuFilter.search.trim()) {
        const q = menuFilter.search.toLowerCase();
        list = list.filter(p => p.name.toLowerCase().includes(q));
    }

    // Filtro por categoría
    if (menuFilter.category !== 'all') {
        list = list.filter(p => p.category_id === menuFilter.category);
    }

    // Filtro por tipo
    if (menuFilter.type !== 'all') {
        list = list.filter(p => (p.product_type || 'standard') === menuFilter.type);
    }

    // Ordenamiento
    const { field, dir } = menuSort;
    list.sort((a, b) => {
        let va = a[field], vb = b[field];
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    return list;
}

function renderTableRows() {
    const filtered = getFilteredSortedProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / MENU_PAGE_SIZE));
    if (menuPage > totalPages) menuPage = totalPages;
    const start = (menuPage - 1) * MENU_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + MENU_PAGE_SIZE);

    if (filtered.length === 0) {
        return `<tr><td colspan="9" class="text-center p-4">No se encontraron productos con los filtros aplicados</td></tr>`;
    }

    const typeLabels = {
        standard: { label: 'Standard', cls: 'gray' },
        burger:   { label: 'Burger', cls: 'yellow' },
        cheat:    { label: 'Cheat', cls: 'orange' },
        bowser:   { label: 'Bowser', cls: 'red' },
        chopp:    { label: 'Chopp', cls: 'blue' }
    };

    return pageItems.map(p => {
        const t = typeLabels[p.product_type || 'standard'] || typeLabels.standard;
        return `
        <tr class="${!p.active ? 'opacity-50' : ''}">
            <td>
                <img src="${p.image_url || 'assets/placeholders/burger-placeholder.svg'}" class="table-thumb" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px;">
            </td>
            <td><strong>${p.name}</strong></td>
            <td><span class="badge badge--${t.cls}">${t.label}</span></td>
            <td>${p.categories ? p.categories.name : '-'}</td>
            <td>${formatGs(p.price)}</td>
            <td>${p.combo_price ? formatGs(p.combo_price) : '-'}</td>
            <td>${p.club_price ? `<span style="color: var(--color-primary); font-weight: 800;">👑 ${formatGs(p.club_price)}</span>` : '-'}</td>
            <td>
                <span class="badge badge--${p.active ? 'green' : 'red'}">
                    ${p.active ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="action-buttons" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button class="btn btn--secondary btn-edit-prod" data-id="${p.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        ✏️ Editar
                    </button>
                    <button class="btn btn--ghost btn-toggle-prod" data-id="${p.id}" data-active="${p.active}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        ${p.active ? '🚫 Desactivar' : '✅ Activar'}
                    </button>
                    <button class="btn btn--danger btn-delete-prod" data-id="${p.id}" data-name="${p.name}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        🗑️ Eliminar
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

function renderPagination() {
    const filtered = getFilteredSortedProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / MENU_PAGE_SIZE));
    if (menuPage > totalPages) menuPage = totalPages;

    return `
        <div class="menu-pagination" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.85rem; color: var(--text-muted);">
                ${filtered.length} producto(s) · Página ${menuPage} de ${totalPages}
            </span>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn--secondary btn--sm" id="btn-menu-prev" ${menuPage <= 1 ? 'disabled style="opacity:0.4"' : ''}>← Anterior</button>
                <button class="btn btn--secondary btn--sm" id="btn-menu-next" ${menuPage >= totalPages ? 'disabled style="opacity:0.4"' : ''}>Siguiente →</button>
            </div>
        </div>
    `;
}

// Eventos estáticos del modal y formulario: se vinculan UNA sola vez.
// Re-llamarlos acumularía listeners de submit y causaría inserciones duplicadas.
function setupEvents(container) {
    const modal = container.querySelector('#product-modal');
    const form = container.querySelector('#form-product');
    const fileInput = container.querySelector('#prod-image-file');
    const urlInput = container.querySelector('#prod-image-url');
    const previewBox = container.querySelector('#image-preview');
    const previewTag = container.querySelector('#img-preview-tag');

    // Abrir Modal para Nuevo Producto
    container.querySelector('#btn-add-product')?.addEventListener('click', () => {
        container.querySelector('#modal-title').textContent = '🍔 Crear Nuevo Producto';
        form.reset();
        container.querySelector('#prod-id').value = '';
        previewBox.style.display = 'none';
        modal.classList.remove('hidden');
    });

    // Cerrar Modal
    container.querySelector('#btn-close-modal')?.addEventListener('click', () => modal.classList.add('hidden'));
    container.querySelector('#btn-cancel-modal')?.addEventListener('click', () => modal.classList.add('hidden'));

    // Preview de Imagen al seleccionar archivo
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            previewTag.src = url;
            previewBox.style.display = 'block';
        }
    });

    // Preview al pegar URL
    urlInput?.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
            previewTag.src = e.target.value;
            previewBox.style.display = 'block';
        }
    });

    // Guardar Producto (Form Submit) — listener único, no se re-vincula
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = container.querySelector('#prod-id').value;
        const name = container.querySelector('#prod-name').value;
        const product_type = container.querySelector('#prod-type').value;
        const category_id = container.querySelector('#prod-category').value;
        const price = parseInt(container.querySelector('#prod-price').value, 10);
        const combo_price = container.querySelector('#prod-combo').value ? parseInt(container.querySelector('#prod-combo').value, 10) : null;
        const promo_price = container.querySelector('#prod-promo').value ? parseInt(container.querySelector('#prod-promo').value, 10) : null;
        const club_price = container.querySelector('#prod-club').value ? parseInt(container.querySelector('#prod-club').value, 10) : null;
        const price_1x = container.querySelector('#prod-v1').value ? parseInt(container.querySelector('#prod-v1').value, 10) : 15000;
        const price_2x1 = container.querySelector('#prod-v2').value ? parseInt(container.querySelector('#prod-v2').value, 10) : 25000;
        const price_libre = container.querySelector('#prod-v3').value ? parseInt(container.querySelector('#prod-v3').value, 10) : 55000;
        const rawIngredients = container.querySelector('#prod-ingredients').value;
        const ingredients = rawIngredients.split(',').map(s => s.trim()).filter(Boolean);

        let image_url = container.querySelector('#prod-image-url').value;

        // Subir archivo a Supabase Storage si seleccionó uno
        const file = fileInput.files[0];
        if (file) {
            try {
                showToast({ message: 'Subiendo imagen...', type: 'info' });
                image_url = await storageService.uploadProductImage(file);
            } catch (uploadErr) {
                console.error('Error subiendo imagen:', uploadErr);
            }
        }

        try {
            await productService.saveProduct({
                id: id || undefined,
                name,
                product_type,
                category_id,
                price,
                combo_price,
                promo_price,
                club_price,
                price_1x,
                price_2x1,
                price_libre,
                ingredients,
                image_url
            });

            showToast({
                message: id ? '✏️ Producto actualizado' : '🏆 Producto creado exitosamente',
                type: 'success'
            });

            modal.classList.add('hidden');
            await loadData();
            container.querySelector('#menu-table-body').innerHTML = renderTableRows();
            container.querySelector('#menu-pagination-container').innerHTML = renderPagination();
            bindRowEvents(container);
            bindToolbarEvents(container);
        } catch (err) {
            showToast({ message: 'Error al guardar producto: ' + err.message, type: 'error' });
        }
    });

    // === Modal Confirmar Eliminación (hard delete) ===
    const deleteModal = container.querySelector('#prod-delete-modal');
    container.querySelector('#btn-cancel-delete-prod')?.addEventListener('click', () => {
        deleteModal?.classList.add('hidden');
        deleteTargetId = null;
    });
    container.querySelector('#btn-confirm-delete-prod')?.addEventListener('click', async () => {
        if (!deleteTargetId) return;
        try {
            await productService.hardDeleteProduct(deleteTargetId);
            showToast({ message: '🗑️ Producto eliminado permanentemente', type: 'success' });
            deleteModal?.classList.add('hidden');
            deleteTargetId = null;
            await loadData();
            container.querySelector('#menu-table-body').innerHTML = renderTableRows();
            container.querySelector('#menu-pagination-container').innerHTML = renderPagination();
            bindRowEvents(container);
            bindToolbarEvents(container);
        } catch (err) {
            showToast({ message: 'Error al eliminar: ' + err.message, type: 'error' });
        }
    });
}

// Eventos de las filas de la tabla (editar/toggle): se re-vinculan tras refrescar
// las filas con innerHTML. Los nodos viejos se destruyen, por lo que no acumulan.
function bindRowEvents(container) {
    const modal = container.querySelector('#product-modal');
    const form = container.querySelector('#form-product');
    const previewBox = container.querySelector('#image-preview');
    const previewTag = container.querySelector('#img-preview-tag');

    // Editar Producto existente
    container.querySelectorAll('.btn-edit-prod').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const p = productsList.find(item => item.id === id);
            if (!p) return;

            container.querySelector('#modal-title').textContent = `✏️ Editar: ${p.name}`;
            container.querySelector('#prod-id').value = p.id;
            container.querySelector('#prod-name').value = p.name;
            container.querySelector('#prod-type').value = p.product_type || 'standard';
            container.querySelector('#prod-category').value = p.category_id;
            container.querySelector('#prod-price').value = p.price;
            container.querySelector('#prod-combo').value = p.combo_price || '';
            container.querySelector('#prod-promo').value = p.promo_price || '';
            container.querySelector('#prod-club').value = p.club_price || '';
            container.querySelector('#prod-ingredients').value = (p.ingredients || []).join(', ');
            container.querySelector('#prod-image-url').value = p.image_url || '';
            container.querySelector('#prod-v1').value = p.price_1x || 15000;
            container.querySelector('#prod-v2').value = p.price_2x1 || 25000;
            container.querySelector('#prod-v3').value = p.price_libre || 55000;

            if (p.image_url) {
                previewTag.src = p.image_url;
                previewBox.style.display = 'block';
            } else {
                previewBox.style.display = 'none';
            }

            modal.classList.remove('hidden');
        });
    });

    // Soft Delete / Activar-Desactivar (active = false)
    container.querySelectorAll('.btn-toggle-prod').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const currentActive = btn.dataset.active === 'true';
            const nextState = !currentActive;

            try {
                await productService.toggleActiveStatus(id, nextState);
                showToast({
                    message: nextState ? '✅ Producto activado' : '🚫 Producto marcado como inactivo (Soft-delete)',
                    type: 'success'
                });
                await loadData();
                container.querySelector('#menu-table-body').innerHTML = renderTableRows();
                container.querySelector('#menu-pagination-container').innerHTML = renderPagination();
                bindRowEvents(container);
                bindToolbarEvents(container);
            } catch (err) {
                showToast({ message: 'Error al cambiar estado: ' + err.message, type: 'error' });
            }
        });
    });

    // Eliminar producto (hard delete) — abre modal de confirmación
    container.querySelectorAll('.btn-delete-prod').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteTargetId = btn.dataset.id;
            const name = btn.dataset.name || 'este producto';
            const nameEl = container.querySelector('#prod-delete-name');
            if (nameEl) nameEl.textContent = name;
            container.querySelector('#prod-delete-modal')?.classList.remove('hidden');
        });
    });
}

// ============================================================
// Eventos de filtros, ordenamiento y paginación
// ============================================================
function bindToolbarEvents(container) {
    // Búsqueda con debounce
    let searchTimer = null;
    container.querySelector('#menu-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            menuFilter.search = e.target.value;
            menuPage = 1;
            refreshTable(container);
        }, 250);
    });

    // Filtro por categoría
    container.querySelector('#menu-filter-category')?.addEventListener('change', (e) => {
        menuFilter.category = e.target.value;
        menuPage = 1;
        refreshTable(container);
    });

    // Filtro por tipo
    container.querySelector('#menu-filter-type')?.addEventListener('change', (e) => {
        menuFilter.type = e.target.value;
        menuPage = 1;
        refreshTable(container);
    });

    // Ordenamiento
    container.querySelector('#menu-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        menuSort = { field, dir };
        menuPage = 1;
        refreshTable(container);
    });

    // Paginación
    container.querySelector('#btn-menu-prev')?.addEventListener('click', () => {
        if (menuPage > 1) { menuPage--; refreshTable(container); }
    });
    container.querySelector('#btn-menu-next')?.addEventListener('click', () => {
        menuPage++;
        refreshTable(container);
    });
}

function refreshTable(container) {
    container.querySelector('#menu-table-body').innerHTML = renderTableRows();
    container.querySelector('#menu-pagination-container').innerHTML = renderPagination();
    bindRowEvents(container);
    bindToolbarEvents(container);
}
