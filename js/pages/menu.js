import { productService } from '../services/product-service.js';
import { storageService } from '../services/storage-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let productsList = [];
let categoriesList = [];

export async function renderMenuPage() {
    const container = document.createElement('div');
    container.className = 'menu-page';

    await loadData();

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
            <table class="table">
                <thead>
                    <tr>
                        <th>Imagen</th>
                        <th>Nombre</th>
                        <th>Categoría</th>
                        <th>Precio Base</th>
                        <th>Precio Combo</th>
                        <th>Stock</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="menu-table-body">
                    ${renderTableRows()}
                </tbody>
            </table>
        </div>

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
                        <label for="prod-category">Categoría:</label>
                        <select id="prod-category" required>
                            ${categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
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

                    <div class="form-row" style="display: flex; gap: 1rem;">
                        <div class="form-group" style="flex: 1;">
                            <label for="prod-stock">Stock Disponible:</label>
                            <input type="number" id="prod-stock" value="50" min="0" required>
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
    `;

    setupEvents(container);
    return container;
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

function renderTableRows() {
    if (productsList.length === 0) {
        return `<tr><td colspan="8" class="text-center p-4">No hay productos registrados</td></tr>`;
    }

    return productsList.map(p => `
        <tr class="${!p.active ? 'opacity-50' : ''}">
            <td>
                <img src="${p.image_url || 'assets/placeholders/burger-placeholder.svg'}" class="table-thumb" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px;">
            </td>
            <td><strong>${p.name}</strong></td>
            <td>${p.categories ? p.categories.name : '-'}</td>
            <td>${formatGs(p.price)}</td>
            <td>${p.combo_price ? formatGs(p.combo_price) : '-'}</td>
            <td>${p.stock}</td>
            <td>
                <span class="badge badge--${p.active ? 'green' : 'red'}">
                    ${p.active ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="action-buttons" style="display: flex; gap: 0.5rem;">
                    <button class="btn btn--secondary btn-edit-prod" data-id="${p.id}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        ✏️ Editar
                    </button>
                    <button class="btn btn--ghost btn-toggle-prod" data-id="${p.id}" data-active="${p.active}" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        ${p.active ? '🚫 Desactivar' : '✅ Activar'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

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

    // Editar Producto existente
    container.querySelectorAll('.btn-edit-prod').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const p = productsList.find(item => item.id === id);
            if (!p) return;

            container.querySelector('#modal-title').textContent = `✏️ Editar: ${p.name}`;
            container.querySelector('#prod-id').value = p.id;
            container.querySelector('#prod-name').value = p.name;
            container.querySelector('#prod-category').value = p.category_id;
            container.querySelector('#prod-price').value = p.price;
            container.querySelector('#prod-combo').value = p.combo_price || '';
            container.querySelector('#prod-stock').value = p.stock || 0;
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
                setupEvents(container);
            } catch (err) {
                showToast({ message: 'Error al cambiar estado: ' + err.message, type: 'error' });
            }
        });
    });

    // Guardar Producto (Form Submit)
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = container.querySelector('#prod-id').value;
        const name = container.querySelector('#prod-name').value;
        const category_id = container.querySelector('#prod-category').value;
        const price = parseInt(container.querySelector('#prod-price').value, 10);
        const combo_price = container.querySelector('#prod-combo').value ? parseInt(container.querySelector('#prod-combo').value, 10) : null;
        const stock = parseInt(container.querySelector('#prod-stock').value, 10);
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
                category_id,
                price,
                combo_price,
                price_1x,
                price_2x1,
                price_libre,
                stock,
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
            setupEvents(container);
        } catch (err) {
            showToast({ message: 'Error al guardar producto: ' + err.message, type: 'error' });
        }
    });
}
