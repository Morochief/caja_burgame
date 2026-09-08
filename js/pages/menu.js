import { productService } from '../services/product-service.js';
import { storageService } from '../services/storage-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let productsList = [];
let categoriesList = [];
let deleteTargetId = null;
let deleteCatTargetId = null;

// Estados de filtro, ordenamiento y vista
let menuFilter = { search: '', category: 'all', type: 'all', status: 'all' };
let menuSort = { field: 'name', dir: 'asc' };
let menuPage = 1;
const MENU_PAGE_SIZE = 12; // Cuadrícula balanceada de 2, 3 o 4 columnas
let viewMode = localStorage.getItem('bg_menu_view_mode') || 'grid';

const PRESET_IMAGES = [
    { label: 'Arcade Classic', url: 'productos/burgers/arcade_classic.jpeg' },
    { label: 'Bowser', url: 'productos/burgers/bowser.jpeg' },
    { label: 'Cheat Burger', url: 'productos/burgers/cheat_burger.jpeg' },
    { label: 'Doble Cheat', url: 'productos/burgers/doble_cheat.jpeg' },
    { label: 'Fatality', url: 'productos/burgers/fatality.jpeg' },
    { label: 'Ronin', url: 'productos/burgers/ronin.jpeg' },
    { label: 'Yoshi', url: 'productos/burgers/yoshi.jpeg' },
    { label: 'Papacman', url: 'productos/papas/papacman.jpeg' }
];

const TYPE_CONFIG = {
    standard: { label: 'Standard', color: '#8B949E' },
    burger:   { label: 'Burger', color: '#F59E0B' },
    cheat:    { label: 'Cheat', color: '#EC4899' },
    bowser:   { label: 'Bowser', color: '#EF4444' },
    chopp:    { label: 'Chopp', color: '#3B82F6' }
};

export async function renderMenuPage() {
    const container = document.createElement('div');
    container.className = 'menu-page';

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
            <div class="page-header__info">
                <h1 style="font-family: var(--font-title); font-size: 1.35rem; color: var(--color-primary); display: flex; align-items: center; gap: 0.6rem; margin: 0 0 0.35rem 0;">
                    🍔 GESTIÓN DE MENÚ Y CARTA
                </h1>
                <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0;">
                    Control ejecutivo de productos, precios, disponibilidad en tiempo real y categorías
                </p>
            </div>
            <div style="display: flex; gap: 0.75rem; align-items: center;">
                <button id="btn-manage-categories" class="btn btn--secondary" style="display: flex; align-items: center; gap: 0.4rem;">
                    🏷️ Categorías
                </button>
                <button id="btn-add-product" class="btn btn--primary" style="display: flex; align-items: center; gap: 0.4rem;">
                    ➕ Nuevo Producto
                </button>
            </div>
        </header>

        <!-- KPI Metrics Header -->
        <div id="menu-kpi-container" class="menu-kpi-grid">
            ${renderKpiCards()}
        </div>

        <!-- Toolbar: Filters + Search + View Switcher -->
        <div class="menu-toolbar">
            <div class="menu-search-filter">
                <input type="text" id="menu-search" class="menu-search-input" placeholder="🔍 Buscar por nombre o ingrediente..." value="${menuFilter.search}">
                <select id="menu-filter-category" class="menu-cat-select">
                    <option value="all">Todas las categorías</option>
                </select>
                <select id="menu-filter-type" class="menu-cat-select">
                    <option value="all">Todos los tipos</option>
                    <option value="burger">🍔 Hamburguesas</option>
                    <option value="standard">🍟 Standard / Sides</option>
                    <option value="chopp">🍺 Chopp / Bebidas</option>
                    <option value="cheat">🔥 Cheat Burgers</option>
                    <option value="bowser">🦖 Bowser Specials</option>
                </select>
                <select id="menu-filter-status" class="menu-cat-select">
                    <option value="all">Todos los estados</option>
                    <option value="active">🟢 Activos en Carta</option>
                    <option value="paused">🔴 Pausados (Agotados)</option>
                </select>
            </div>

            <div class="menu-actions-group">
                <select id="menu-sort" class="menu-cat-select">
                    <option value="name-asc">Nombre (A → Z)</option>
                    <option value="name-desc">Nombre (Z → A)</option>
                    <option value="price-asc">Precio menor primero</option>
                    <option value="price-desc">Precio mayor primero</option>
                </select>

                <div class="menu-view-switcher">
                    <button class="view-btn ${viewMode === 'grid' ? 'active' : ''}" id="btn-view-grid" title="Vista Galería">
                        ⊞ Galería
                    </button>
                    <button class="view-btn ${viewMode === 'table' ? 'active' : ''}" id="btn-view-table" title="Vista Tabla">
                        ☰ Tabla
                    </button>
                </div>
            </div>
        </div>

        <!-- Main Product Content Area (Grid or Table) -->
        <div id="menu-main-content">
            <div class="page-loading" style="padding: 2.5rem; text-align: center;">
                <div class="pixel-spinner"></div>
                <p style="color: var(--text-muted); margin-top: 1rem;">Cargando catálogo oficial Burgame...</p>
            </div>
        </div>

        <div id="menu-pagination-container"></div>

        ${renderProductModal()}
        ${renderCategoryModal()}
        ${renderDeleteModals()}
    `;

    bindStaticPageEvents(container);
    loadMenuData(container);

    return container;
}

function renderKpiCards() {
    const total = productsList.length;
    const active = productsList.filter(p => p.active).length;
    const paused = productsList.filter(p => !p.active).length;
    const club = productsList.filter(p => p.club_price && p.active).length;

    return `
        <div class="menu-kpi-card" style="--kpi-accent: #3B82F6;">
            <div class="kpi-icon-box">📦</div>
            <div class="kpi-info">
                <span class="kpi-value">${total}</span>
                <span class="kpi-label">Total Productos</span>
            </div>
        </div>
        <div class="menu-kpi-card" style="--kpi-accent: #10B981;">
            <div class="kpi-icon-box">🟢</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: #10B981;">${active}</span>
                <span class="kpi-label">Activos en Carta</span>
            </div>
        </div>
        <div class="menu-kpi-card" style="--kpi-accent: #EF4444;">
            <div class="kpi-icon-box">⏸️</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: ${paused > 0 ? '#EF4444' : '#8B949E'};">${paused}</span>
                <span class="kpi-label">Pausados / Agotados</span>
            </div>
        </div>
        <div class="menu-kpi-card" style="--kpi-accent: #A855F7;">
            <div class="kpi-icon-box">👑</div>
            <div class="kpi-info">
                <span class="kpi-value" style="color: #D8B4FE;">${club}</span>
                <span class="kpi-label">Precios Club VIP</span>
            </div>
        </div>
    `;
}

function renderProductModal() {
    return `
        <div id="product-modal" class="modal-overlay hidden">
            <div class="modal-card modal-card-lg">
                <div class="modal-header">
                    <h2 id="modal-title">🍔 Crear Producto</h2>
                    <button type="button" id="btn-close-modal" class="btn-close">&times;</button>
                </div>

                <!-- Modal Tabs Navigation -->
                <div class="modal-tabs">
                    <button type="button" class="modal-tab-btn active" data-tab="tab-general">
                        📋 Información General
                    </button>
                    <button type="button" class="modal-tab-btn" data-tab="tab-pricing">
                        💰 Precios & Club
                    </button>
                    <button type="button" class="modal-tab-btn" data-tab="tab-media">
                        📸 Fotografía & Preset
                    </button>
                </div>

                <form id="form-product" class="modal-body">
                    <input type="hidden" id="prod-id">

                    <!-- TAB 1: General Info -->
                    <div id="tab-general" class="tab-pane active">
                        <div class="form-group">
                            <label for="prod-name">Nombre del Producto: <span class="label-hint">Obligatorio</span></label>
                            <input type="text" id="prod-name" class="form-input" placeholder="Ej: Doble Cheat Smash" required>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="prod-category">Categoría:</label>
                                <select id="prod-category" class="form-select" required></select>
                            </div>
                            <div class="form-group">
                                <label for="prod-type">Tipo de Flujo en POS:</label>
                                <select id="prod-type" class="form-select">
                                    <option value="standard">Standard (1 solo botón)</option>
                                    <option value="burger">Hamburguesa (Solo + Combo)</option>
                                    <option value="cheat">Cheat Burger (Solo + Combo + Promo)</option>
                                    <option value="bowser">Bowser (Especial Viernes)</option>
                                    <option value="chopp">Chopp (Variantes 1x, 2x1, Libre)</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="prod-ingredients">
                                Ingredientes / Descripción:
                                <span class="label-hint">Separados por coma</span>
                            </label>
                            <textarea id="prod-ingredients" class="form-textarea" placeholder="Doble medallón 120g, queso cheddar inglés, panceta crocante, salsa arcade..."></textarea>
                        </div>
                    </div>

                    <!-- TAB 2: Pricing & Club Burgame -->
                    <div id="tab-pricing" class="tab-pane">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="prod-price">Precio Base / Solo (Gs.):</label>
                                <input type="number" id="prod-price" class="form-input" placeholder="35000" min="0" required>
                            </div>

                            <div class="form-group">
                                <label for="prod-combo">Precio Combo (Gs.):</label>
                                <div class="price-input-wrap">
                                    <input type="number" id="prod-combo" class="form-input" placeholder="45000" min="0">
                                    <button type="button" id="btn-calc-combo" class="price-quick-btn" title="Suma 10.000 Gs al precio base">
                                        +10.000 Gs
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="prod-promo">Precio Promo Especial (Gs.):</label>
                                <input type="number" id="prod-promo" class="form-input" placeholder="30000" min="0">
                            </div>

                            <div class="form-group">
                                <label for="prod-club" style="color: #D8B4FE;">👑 Precio Club Burgame (VIP):</label>
                                <input type="number" id="prod-club" class="form-input" style="border-color: rgba(168, 85, 247, 0.4);" placeholder="Ej: 200.000" min="0">
                            </div>
                        </div>

                        <!-- Chopp / Drink Variants (Condicional) -->
                        <div id="drink-variants-box" class="chopp-variants-box" style="display: none;">
                            <h4>🍺 Variantes de Chopp Artesanal</h4>
                            <div class="form-row">
                                <div class="form-group" style="margin: 0;">
                                    <label for="prod-v1" style="font-size: 0.75rem;">1 Chopp (Gs.):</label>
                                    <input type="number" id="prod-v1" class="form-input" placeholder="15000" value="15000" min="0">
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label for="prod-v2" style="font-size: 0.75rem;">Promo 2x1 (Gs.):</label>
                                    <input type="number" id="prod-v2" class="form-input" placeholder="25000" value="25000" min="0">
                                </div>
                                <div class="form-group" style="margin: 0;">
                                    <label for="prod-v3" style="font-size: 0.75rem;">LIBRE (Gs.):</label>
                                    <input type="number" id="prod-v3" class="form-input" placeholder="55000" value="55000" min="0">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TAB 3: Media & Presets -->
                    <div id="tab-media" class="tab-pane">
                        <div class="image-preview-box" id="image-preview-box">
                            <img id="img-preview-tag" src="" alt="Vista previa" style="display: none;">
                            <div id="image-preview-empty" class="image-preview-empty">
                                <span style="font-size: 2rem;">📷</span>
                                <span>Sin imagen seleccionada</span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Subir archivo desde tu dispositivo:</label>
                            <input type="file" id="prod-image-file" class="form-input" accept="image/*">
                        </div>

                        <div class="form-group">
                            <label for="prod-image-url">O pega la URL directa de la imagen:</label>
                            <input type="text" id="prod-image-url" class="form-input" placeholder="https://... o ruta local">
                        </div>

                        <div class="form-group" style="margin-top: 1rem;">
                            <label>⚡ O selecciona una foto oficial de Burgame:</label>
                            <div class="presets-grid" id="presets-grid">
                                ${PRESET_IMAGES.map(img => `
                                    <div class="preset-thumb" data-url="${img.url}" title="${img.label}">
                                        <img src="${img.url}" alt="${img.label}" loading="lazy">
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button type="button" id="btn-cancel-modal" class="btn btn--secondary">Cancelar</button>
                        <button type="submit" class="btn btn--primary" id="btn-submit-prod">Guardar Producto</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function renderCategoryModal() {
    return `
        <!-- Modal Gestión de Categorías -->
        <div id="category-modal" class="modal-overlay hidden">
            <div class="modal-card">
                <div class="modal-header">
                    <h2>🏷️ Administración de Categorías</h2>
                    <button type="button" id="btn-close-cat-modal" class="btn-close">&times;</button>
                </div>

                <div class="modal-body">
                    <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Organiza cómo aparecen las secciones en la carta del cliente y en el panel de ventas (POS).
                    </p>

                    <div style="max-height: 240px; overflow-y: auto; margin-bottom: 1.25rem;">
                        <table class="category-manager-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px;">Ícono</th>
                                    <th>Nombre</th>
                                    <th style="width: 80px; text-align: center;">Orden</th>
                                    <th style="width: 60px; text-align: right;">Acción</th>
                                </tr>
                            </thead>
                            <tbody id="category-table-body">
                                <tr><td colspan="4" class="text-center p-3" style="color: var(--text-muted);">Cargando...</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Form Nueva Categoría -->
                    <form id="form-new-cat" class="cat-new-form">
                        <h4>➕ Agregar Nueva Categoría</h4>
                        <div class="form-row" style="margin-bottom: 0.75rem;">
                            <div class="form-group" style="flex: 0 0 70px;">
                                <label for="cat-icon">Ícono</label>
                                <input type="text" id="cat-icon" class="form-input text-center" value="🍔" maxlength="4" required>
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label for="cat-name">Nombre de Categoría</label>
                                <input type="text" id="cat-name" class="form-input" placeholder="Ej: Postres & Shakes" required>
                            </div>
                            <div class="form-group" style="flex: 0 0 80px;">
                                <label for="cat-order">Orden</label>
                                <input type="number" id="cat-order" class="form-input text-center" value="10" min="0">
                            </div>
                        </div>
                        <button type="submit" class="btn btn--primary btn--block" id="btn-save-cat">
                            Crear Categoría
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;
}

function renderDeleteModals() {
    return `
        <!-- Modal Confirmar Eliminación Producto -->
        <div id="prod-delete-modal" class="modal-overlay hidden">
            <div class="modal-card" style="max-width: 420px;">
                <div class="modal-header">
                    <h2 style="color: #EF4444;">🗑️ Eliminar Producto</h2>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem;">
                    ¿Estás seguro de que deseas eliminar permanentemente <strong id="prod-delete-name" style="color: #FFF;"></strong>?<br><br>
                    <span style="color: #EF4444; font-size: 0.82rem;">⚠️ Esta acción no se puede deshacer. Se borrará del catálogo oficial.</span>
                </p>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <button class="btn btn--secondary" id="btn-cancel-delete-prod">Cancelar</button>
                    <button class="btn btn--danger" id="btn-confirm-delete-prod">Sí, Eliminar</button>
                </div>
            </div>
        </div>

        <!-- Modal Confirmar Eliminación Categoría -->
        <div id="cat-delete-modal" class="modal-overlay hidden">
            <div class="modal-card" style="max-width: 420px;">
                <div class="modal-header">
                    <h2 style="color: #EF4444;">🗑️ Eliminar Categoría</h2>
                </div>
                <p style="color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem;">
                    ¿Deseas eliminar la categoría <strong id="cat-delete-name" style="color: #FFF;"></strong>?<br>
                    Solo podrás eliminarla si no contiene productos asignados.
                </p>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                    <button class="btn btn--secondary" id="btn-cancel-delete-cat">Cancelar</button>
                    <button class="btn btn--danger" id="btn-confirm-delete-cat">Eliminar</button>
                </div>
            </div>
        </div>
    `;
}

async function loadMenuData(container) {
    await loadData();
    populateCategoryDropdowns(container);
    renderMainContent(container);
    renderKpiDisplay(container);
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
        showToast({ message: 'Error cargando catálogo oficial', type: 'error' });
    }
}

function populateCategoryDropdowns(container) {
    const catFilter = container.querySelector('#menu-filter-category');
    if (catFilter) {
        catFilter.innerHTML = `<option value="all">Todas las categorías</option>` +
            categoriesList.map(c => `<option value="${c.id}" ${menuFilter.category === c.id ? 'selected' : ''}>${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    }
    const catSelect = container.querySelector('#prod-category');
    if (catSelect) {
        catSelect.innerHTML = categoriesList.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${c.name}</option>`).join('');
    }
}

function renderKpiDisplay(container) {
    const kpiWrap = container.querySelector('#menu-kpi-container');
    if (kpiWrap) {
        kpiWrap.innerHTML = renderKpiCards();
    }
}

function getFilteredSortedProducts() {
    let list = [...productsList];

    // Filtro por búsqueda
    if (menuFilter.search.trim()) {
        const q = menuFilter.search.toLowerCase();
        list = list.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(q);
            const ingMatch = p.ingredients && Array.isArray(p.ingredients) && p.ingredients.some(i => i.toLowerCase().includes(q));
            return nameMatch || ingMatch;
        });
    }

    // Filtro por categoría
    if (menuFilter.category !== 'all') {
        list = list.filter(p => p.category_id === menuFilter.category);
    }

    // Filtro por tipo
    if (menuFilter.type !== 'all') {
        list = list.filter(p => (p.product_type || 'standard') === menuFilter.type);
    }

    // Filtro por estado activo / pausado
    if (menuFilter.status === 'active') {
        list = list.filter(p => p.active);
    } else if (menuFilter.status === 'paused') {
        list = list.filter(p => !p.active);
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

function renderMainContent(container) {
    const filtered = getFilteredSortedProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / MENU_PAGE_SIZE));
    if (menuPage > totalPages) menuPage = totalPages;
    const start = (menuPage - 1) * MENU_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + MENU_PAGE_SIZE);

    const mainContainer = container.querySelector('#menu-main-content');
    if (!mainContainer) return;

    if (pageItems.length === 0) {
        mainContainer.innerHTML = `
            <div style="background: rgba(26,29,41,0.6); border: 1px dashed rgba(255,255,255,0.1); border-radius: 14px; padding: 3.5rem 1.5rem; text-align: center;">
                <span style="font-size: 3rem; display: block; margin-bottom: 0.75rem;">🔍</span>
                <h3 style="color: #FFF; font-size: 1.1rem; margin-bottom: 0.4rem;">No se encontraron productos</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; max-width: 400px; margin: 0 auto 1.25rem;">
                    Ningún producto coincide con los filtros aplicados. Prueba borrando el texto de búsqueda o cambiando los filtros.
                </p>
                <button class="btn btn--secondary" id="btn-reset-filters" style="font-size: 0.82rem;">Limpiar Filtros</button>
            </div>
        `;
        container.querySelector('#btn-reset-filters')?.addEventListener('click', () => {
            menuFilter = { search: '', category: 'all', type: 'all', status: 'all' };
            container.querySelector('#menu-search').value = '';
            container.querySelector('#menu-filter-category').value = 'all';
            container.querySelector('#menu-filter-type').value = 'all';
            container.querySelector('#menu-filter-status').value = 'all';
            menuPage = 1;
            renderMainContent(container);
        });
        container.querySelector('#menu-pagination-container').innerHTML = '';
        return;
    }

    if (viewMode === 'grid') {
        mainContainer.innerHTML = `
            <div class="menu-cards-grid">
                ${pageItems.map(p => renderCardHtml(p)).join('')}
            </div>
        `;
    } else {
        mainContainer.innerHTML = `
            <div class="menu-table-container">
                <table class="menu-table">
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th>Tipo</th>
                            <th>Precio Base</th>
                            <th>Combo</th>
                            <th>👑 Club</th>
                            <th style="text-align: center;">En Carta</th>
                            <th style="text-align: right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pageItems.map(p => renderTableRowHtml(p)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Render pagination
    const pagContainer = container.querySelector('#menu-pagination-container');
    if (pagContainer) {
        pagContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; padding: 0.5rem 0;">
                <span style="font-size: 0.84rem; color: var(--text-muted);">
                    Mostrando <strong>${start + 1}</strong>–<strong>${Math.min(start + MENU_PAGE_SIZE, filtered.length)}</strong> de <strong>${filtered.length}</strong> productos · Página ${menuPage} de ${totalPages}
                </span>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn--secondary btn--sm" id="btn-menu-prev" ${menuPage <= 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
                        ← Anterior
                    </button>
                    <button class="btn btn--secondary btn--sm" id="btn-menu-next" ${menuPage >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''}>
                        Siguiente →
                    </button>
                </div>
            </div>
        `;
        pagContainer.querySelector('#btn-menu-prev')?.addEventListener('click', () => {
            if (menuPage > 1) { menuPage--; renderMainContent(container); }
        });
        pagContainer.querySelector('#btn-menu-next')?.addEventListener('click', () => {
            if (menuPage < totalPages) { menuPage++; renderMainContent(container); }
        });
    }

    bindItemEvents(container);
}

function renderCardHtml(p) {
    const t = TYPE_CONFIG[p.product_type || 'standard'] || TYPE_CONFIG.standard;
    const catName = p.categories ? p.categories.name : 'Sin categoría';
    const catIcon = p.categories?.icon ? p.categories.icon + ' ' : '';
    const imgSrc = p.image_url || 'assets/placeholders/burger-placeholder.svg';
    const ingredientsText = (p.ingredients && p.ingredients.length > 0)
        ? p.ingredients.join(', ')
        : 'Sin lista de ingredientes detallada';

    return `
        <div class="menu-arcade-card ${!p.active ? 'is-paused' : ''}" data-id="${p.id}">
            <div class="card-image-wrap">
                <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.src='assets/placeholders/burger-placeholder.svg'">
                <div class="card-badges-overlay">
                    <span class="card-badge-cat">${catIcon}${catName}</span>
                    <span class="card-badge-status ${p.active ? 'active' : 'paused'}">
                        ${p.active ? 'Activo' : 'Pausado'}
                    </span>
                </div>
            </div>

            <div class="card-body-content">
                <div class="card-header-row">
                    <h3 class="card-title">${p.name}</h3>
                    <span class="card-type-tag" style="color: ${t.color}; border-color: ${t.color}40;">${t.label}</span>
                </div>

                <div class="card-ingredients" title="${ingredientsText}">
                    ${ingredientsText}
                </div>

                <div class="card-prices-grid">
                    <div class="card-price-pill primary-price">
                        <span class="price-pill-label">Base / Solo</span>
                        <span class="price-pill-value">${formatGs(p.price)}</span>
                    </div>
                    <div class="card-price-pill">
                        <span class="price-pill-label">Combo</span>
                        <span class="price-pill-value">${p.combo_price ? formatGs(p.combo_price) : '—'}</span>
                    </div>
                    ${p.promo_price ? `
                    <div class="card-price-pill">
                        <span class="price-pill-label">Promo Especial</span>
                        <span class="price-pill-value">${formatGs(p.promo_price)}</span>
                    </div>` : ''}
                    <div class="card-price-pill club-price">
                        <span class="price-pill-label">👑 Club VIP</span>
                        <span class="price-pill-value">${p.club_price ? formatGs(p.club_price) : '—'}</span>
                    </div>
                </div>

                <div class="card-footer-actions">
                    <div class="card-switch-wrap" title="Cambiar disponibilidad en carta al instante">
                        <label class="switch-toggle">
                            <input type="checkbox" class="toggle-active-switch" data-id="${p.id}" ${p.active ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                        </label>
                        <span>${p.active ? 'Disponible' : 'Agotado'}</span>
                    </div>

                    <div class="card-btns-wrap">
                        <button class="card-btn-action btn-edit-prod" data-id="${p.id}" title="Editar producto">
                            ✏️
                        </button>
                        <button class="card-btn-action delete-btn btn-delete-prod" data-id="${p.id}" data-name="${p.name}" title="Eliminar producto">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderTableRowHtml(p) {
    const t = TYPE_CONFIG[p.product_type || 'standard'] || TYPE_CONFIG.standard;
    const catName = p.categories ? p.categories.name : '-';
    const catIcon = p.categories?.icon ? p.categories.icon + ' ' : '';
    const imgSrc = p.image_url || 'assets/placeholders/burger-placeholder.svg';
    const ingredientsText = (p.ingredients && p.ingredients.length > 0)
        ? p.ingredients.join(', ')
        : '';

    return `
        <tr class="${!p.active ? 'is-paused' : ''}" data-id="${p.id}">
            <td>
                <div class="table-product-cell">
                    <img src="${imgSrc}" alt="${p.name}" loading="lazy" onerror="this.src='assets/placeholders/burger-placeholder.svg'">
                    <div>
                        <span class="table-product-name">${p.name}</span>
                        ${ingredientsText ? `<span class="table-product-desc" title="${ingredientsText}">${ingredientsText}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>${catIcon}${catName}</td>
            <td><span class="card-type-tag" style="color: ${t.color};">${t.label}</span></td>
            <td><strong style="color: var(--color-primary); font-family: var(--font-mono);">${formatGs(p.price)}</strong></td>
            <td style="font-family: var(--font-mono);">${p.combo_price ? formatGs(p.combo_price) : '-'}</td>
            <td style="font-family: var(--font-mono); color: #D8B4FE;">
                ${p.club_price ? `👑 ${formatGs(p.club_price)}` : '-'}
            </td>
            <td style="text-align: center;">
                <label class="switch-toggle" title="Disponibilidad inmediata en carta">
                    <input type="checkbox" class="toggle-active-switch" data-id="${p.id}" ${p.active ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
            </td>
            <td style="text-align: right;">
                <div style="display: inline-flex; gap: 0.4rem;">
                    <button class="card-btn-action btn-edit-prod" data-id="${p.id}" title="Editar">✏️</button>
                    <button class="card-btn-action delete-btn btn-delete-prod" data-id="${p.id}" data-name="${p.name}" title="Eliminar">🗑️</button>
                </div>
            </td>
        </tr>
    `;
}

// Vinculación de eventos interactivos de cards / filas
function bindItemEvents(container) {
    const modal = container.querySelector('#product-modal');
    const form = container.querySelector('#form-product');
    const previewBox = container.querySelector('#image-preview-box');
    const previewTag = container.querySelector('#img-preview-tag');
    const previewEmpty = container.querySelector('#image-preview-empty');
    const drinkVariantsBox = container.querySelector('#drink-variants-box');

    // 1-Click Toggle Switch (Optimistic UI)
    container.querySelectorAll('.toggle-active-switch').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const id = toggle.dataset.id;
            const newActive = toggle.checked;
            const prod = productsList.find(p => p.id === id);
            const prodName = prod ? prod.name : 'Producto';

            // Optimistic update
            if (prod) prod.active = newActive;
            renderKpiDisplay(container);

            // Toggle visual classes
            const cardEl = container.querySelector(`.menu-arcade-card[data-id="${id}"]`);
            if (cardEl) {
                cardEl.classList.toggle('is-paused', !newActive);
                const badgeStatus = cardEl.querySelector('.card-badge-status');
                if (badgeStatus) {
                    badgeStatus.className = `card-badge-status ${newActive ? 'active' : 'paused'}`;
                    badgeStatus.textContent = newActive ? 'Activo' : 'Pausado';
                }
                const labelStatus = cardEl.querySelector('.card-switch-wrap span');
                if (labelStatus) labelStatus.textContent = newActive ? 'Disponible' : 'Agotado';
            }
            const rowEl = container.querySelector(`tr[data-id="${id}"]`);
            if (rowEl) rowEl.classList.toggle('is-paused', !newActive);

            try {
                await productService.toggleActiveStatus(id, newActive);
                showToast({
                    message: newActive ? `✅ "${prodName}" activado en carta` : `⏸️ "${prodName}" pausado (Agotado)`,
                    type: 'success'
                });
            } catch (err) {
                // Rollback if error
                if (prod) prod.active = !newActive;
                toggle.checked = !newActive;
                renderKpiDisplay(container);
                showToast({ message: 'Error al actualizar estado: ' + err.message, type: 'error' });
            }
        });
    });

    // Editar Producto
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

            // Reset tab to first tab
            switchModalTab(container, 'tab-general');

            // Conditional Chopp display
            drinkVariantsBox.style.display = (p.product_type === 'chopp') ? 'block' : 'none';

            // Image preview
            if (p.image_url) {
                previewTag.src = p.image_url;
                previewTag.style.display = 'block';
                previewEmpty.style.display = 'none';
            } else {
                previewTag.src = '';
                previewTag.style.display = 'none';
                previewEmpty.style.display = 'flex';
            }

            // Highlight selected preset if matches
            container.querySelectorAll('.preset-thumb').forEach(thumb => {
                thumb.classList.toggle('selected', thumb.dataset.url === p.image_url);
            });

            modal.classList.remove('hidden');
        });
    });

    // Eliminar Producto
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

// Vinculación estática de eventos que solo se configuran 1 sola vez al montar la página
function bindStaticPageEvents(container) {
    const modal = container.querySelector('#product-modal');
    const form = container.querySelector('#form-product');
    const fileInput = container.querySelector('#prod-image-file');
    const urlInput = container.querySelector('#prod-image-url');
    const previewTag = container.querySelector('#img-preview-tag');
    const previewEmpty = container.querySelector('#image-preview-empty');
    const drinkVariantsBox = container.querySelector('#drink-variants-box');
    const typeSelect = container.querySelector('#prod-type');

    // View Switcher: Grid vs Table
    container.querySelector('#btn-view-grid')?.addEventListener('click', () => {
        viewMode = 'grid';
        localStorage.setItem('bg_menu_view_mode', 'grid');
        container.querySelector('#btn-view-grid').classList.add('active');
        container.querySelector('#btn-view-table').classList.remove('active');
        renderMainContent(container);
    });

    container.querySelector('#btn-view-table')?.addEventListener('click', () => {
        viewMode = 'table';
        localStorage.setItem('bg_menu_view_mode', 'table');
        container.querySelector('#btn-view-table').classList.add('active');
        container.querySelector('#btn-view-grid').classList.remove('active');
        renderMainContent(container);
    });

    // Toolbar: Búsqueda con debounce
    let searchTimer = null;
    container.querySelector('#menu-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            menuFilter.search = e.target.value;
            menuPage = 1;
            renderMainContent(container);
        }, 200);
    });

    // Toolbar: Filtros por Categoría, Tipo y Estado
    container.querySelector('#menu-filter-category')?.addEventListener('change', (e) => {
        menuFilter.category = e.target.value;
        menuPage = 1;
        renderMainContent(container);
    });

    container.querySelector('#menu-filter-type')?.addEventListener('change', (e) => {
        menuFilter.type = e.target.value;
        menuPage = 1;
        renderMainContent(container);
    });

    container.querySelector('#menu-filter-status')?.addEventListener('change', (e) => {
        menuFilter.status = e.target.value;
        menuPage = 1;
        renderMainContent(container);
    });

    // Toolbar: Ordenamiento
    container.querySelector('#menu-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        menuSort = { field, dir };
        menuPage = 1;
        renderMainContent(container);
    });

    // Abrir Modal para Nuevo Producto
    container.querySelector('#btn-add-product')?.addEventListener('click', () => {
        container.querySelector('#modal-title').textContent = '🍔 Crear Nuevo Producto';
        form.reset();
        container.querySelector('#prod-id').value = '';
        previewTag.src = '';
        previewTag.style.display = 'none';
        previewEmpty.style.display = 'flex';
        drinkVariantsBox.style.display = 'none';
        container.querySelectorAll('.preset-thumb').forEach(th => th.classList.remove('selected'));
        switchModalTab(container, 'tab-general');
        modal.classList.remove('hidden');
    });

    // Cerrar Modal Producto
    container.querySelector('#btn-close-modal')?.addEventListener('click', () => modal.classList.add('hidden'));
    container.querySelector('#btn-cancel-modal')?.addEventListener('click', () => modal.classList.add('hidden'));

    // Modal Tabs Navigation
    container.querySelectorAll('.modal-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            const targetTab = tabBtn.dataset.tab;
            switchModalTab(container, targetTab);
        });
    });

    // Mostrar u ocultar variantes de Chopp según el tipo de producto
    typeSelect?.addEventListener('change', (e) => {
        drinkVariantsBox.style.display = (e.target.value === 'chopp') ? 'block' : 'none';
    });

    // Botón rápido para calcular precio Combo (+10.000 Gs.)
    container.querySelector('#btn-calc-combo')?.addEventListener('click', () => {
        const basePrice = parseInt(container.querySelector('#prod-price').value, 10);
        if (!isNaN(basePrice) && basePrice > 0) {
            container.querySelector('#prod-combo').value = basePrice + 10000;
        } else {
            showToast({ message: 'Ingresa primero un precio base', type: 'warning' });
        }
    });

    // Presets de imágenes
    container.querySelectorAll('.preset-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            const url = thumb.dataset.url;
            urlInput.value = url;
            previewTag.src = url;
            previewTag.style.display = 'block';
            previewEmpty.style.display = 'none';
            container.querySelectorAll('.preset-thumb').forEach(th => th.classList.remove('selected'));
            thumb.classList.add('selected');
        });
    });

    // Preview imagen al seleccionar archivo
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            previewTag.src = url;
            previewTag.style.display = 'block';
            previewEmpty.style.display = 'none';
            container.querySelectorAll('.preset-thumb').forEach(th => th.classList.remove('selected'));
        }
    });

    // Preview al escribir URL manual
    urlInput?.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
            previewTag.src = val;
            previewTag.style.display = 'block';
            previewEmpty.style.display = 'none';
        } else {
            previewTag.src = '';
            previewTag.style.display = 'none';
            previewEmpty.style.display = 'flex';
        }
    });

    // Form Submit: Guardar Producto
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = container.querySelector('#btn-submit-prod');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

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

        // Subir archivo a Supabase Storage si se eligió uno
        const file = fileInput.files[0];
        if (file) {
            try {
                showToast({ message: 'Subiendo fotografía...', type: 'info' });
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
                message: id ? '✏️ Producto actualizado correctamente' : '🏆 Producto creado exitosamente',
                type: 'success'
            });

            modal.classList.add('hidden');
            await loadData();
            renderKpiDisplay(container);
            renderMainContent(container);
        } catch (err) {
            showToast({ message: 'Error al guardar producto: ' + err.message, type: 'error' });
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Guardar Producto';
        }
    });

    // Modal Confirmar Eliminación Producto
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
            renderKpiDisplay(container);
            renderMainContent(container);
        } catch (err) {
            showToast({ message: 'Error al eliminar: ' + err.message, type: 'error' });
        }
    });

    // ============================================================
    // Módulo de Gestión de Categorías
    // ============================================================
    const catModal = container.querySelector('#category-modal');
    container.querySelector('#btn-manage-categories')?.addEventListener('click', () => {
        refreshCategoryManager(container);
        catModal.classList.remove('hidden');
    });

    container.querySelector('#btn-close-cat-modal')?.addEventListener('click', () => {
        catModal.classList.add('hidden');
    });

    // Form Nueva Categoría
    container.querySelector('#form-new-cat')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const icon = container.querySelector('#cat-icon').value.trim() || '🍔';
        const name = container.querySelector('#cat-name').value.trim();
        const sort_order = parseInt(container.querySelector('#cat-order').value, 10) || 10;

        if (!name) return;

        const saveBtn = container.querySelector('#btn-save-cat');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';

        try {
            await productService.createCategory({ name, icon, sort_order });
            showToast({ message: `🏷️ Categoría "${name}" creada exitosamente`, type: 'success' });
            container.querySelector('#form-new-cat').reset();
            container.querySelector('#cat-icon').value = '🍔';
            container.querySelector('#cat-order').value = '10';
            await loadData();
            populateCategoryDropdowns(container);
            refreshCategoryManager(container);
        } catch (err) {
            showToast({ message: 'Error al crear categoría: ' + err.message, type: 'error' });
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Crear Categoría';
        }
    });

    // Modal Confirmar Eliminación Categoría
    const catDeleteModal = container.querySelector('#cat-delete-modal');
    container.querySelector('#btn-cancel-delete-cat')?.addEventListener('click', () => {
        catDeleteModal.classList.add('hidden');
        deleteCatTargetId = null;
    });

    container.querySelector('#btn-confirm-delete-cat')?.addEventListener('click', async () => {
        if (!deleteCatTargetId) return;
        try {
            await productService.deleteCategory(deleteCatTargetId);
            showToast({ message: '🗑️ Categoría eliminada', type: 'success' });
            catDeleteModal.classList.add('hidden');
            deleteCatTargetId = null;
            await loadData();
            populateCategoryDropdowns(container);
            refreshCategoryManager(container);
            renderMainContent(container);
        } catch (err) {
            showToast({ message: err.message, type: 'error' });
        }
    });
}

function switchModalTab(container, tabId) {
    container.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    container.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });
}

function refreshCategoryManager(container) {
    const tbody = container.querySelector('#category-table-body');
    if (!tbody) return;

    if (categoriesList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-3" style="color: var(--text-muted);">No hay categorías registradas</td></tr>`;
        return;
    }

    tbody.innerHTML = categoriesList.map(c => `
        <tr>
            <td style="text-align: center;"><span class="cat-emoji-badge">${c.icon || '🍔'}</span></td>
            <td><strong style="color: #FFF;">${c.name}</strong></td>
            <td style="text-align: center; color: var(--text-muted); font-family: var(--font-mono);">${c.sort_order ?? 0}</td>
            <td style="text-align: right;">
                <button class="card-btn-action delete-btn btn-del-cat" data-id="${c.id}" data-name="${c.name}" title="Eliminar categoría">
                    🗑️
                </button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.btn-del-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteCatTargetId = btn.dataset.id;
            const name = btn.dataset.name;
            const nameEl = container.querySelector('#cat-delete-name');
            if (nameEl) nameEl.textContent = name;
            container.querySelector('#cat-delete-modal')?.classList.remove('hidden');
        });
    });
}
