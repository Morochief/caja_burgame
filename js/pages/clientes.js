import { customerService } from '../services/customer-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allCustomers = [];      // datos de tabla customers
let statsMap = {};           // stats de compras por nombre (desde orders)
let searchQuery = '';
let sortField = 'name';
let sortDir = 'asc';
let currentPage = 1;
const PAGE_SIZE = 10;

const COLUMNS = [
    { key: 'name', label: 'Cliente', sortable: true },
    { key: 'phone', label: 'Teléfono', sortable: true },
    { key: 'order_count', label: 'Pedidos', sortable: true },
    { key: 'total_spent', label: 'Gastado', sortable: true },
    { key: 'last_order', label: 'Última Visita', sortable: true },
    { key: 'actions', label: 'Acciones', sortable: false }
];

export async function renderClientesPage() {
    const container = document.createElement('div');
    container.className = 'clientes-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>👥 MÓDULO DE CLIENTES</h1>
                <p>Administra tus clientes registrados y su historial de compras</p>
            </div>
            <button id="cli-btn-new" class="btn btn--primary">
                <i data-lucide="user-plus"></i> Nuevo Cliente
            </button>
        </header>

        <div class="clientes-toolbar">
            <input type="text" id="cli-search" placeholder="🔍 Buscar por nombre o teléfono...">
        </div>

        <div class="card">
            <table class="clientes-table" id="cli-table">
                <thead>
                    <tr>
                        ${COLUMNS.map(c => `
                            <th class="${c.sortable ? 'sortable' : 'no-sort'}" data-col="${c.key}">
                                ${c.label}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody id="cli-table-body">
                    <tr><td colspan="${COLUMNS.length}" class="clientes-empty">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando clientes...</p></div>
                    </td></tr>
                </tbody>
            </table>
            <div class="clientes-pagination" id="cli-pagination"></div>
        </div>

        <!-- Modal CRUD -->
        <div id="cli-modal" class="modal-overlay hidden">
            <div class="modal-card card">
                <div class="modal-header">
                    <h2 id="cli-modal-title">➕ Nuevo Cliente</h2>
                    <button id="cli-btn-close-modal" class="btn-close">&times;</button>
                </div>
                <form id="cli-form">
                    <input type="hidden" id="cli-id">
                    <div class="form-group">
                        <label>Nombre / Mesa *</label>
                        <input type="text" id="cli-name" required maxlength="100" placeholder="Ej: Juan, Mesa 4...">
                    </div>
                    <div class="form-group">
                        <label>Teléfono</label>
                        <input type="text" id="cli-phone" maxlength="30" placeholder="Ej: 0981 234 567">
                    </div>
                    <div class="form-group">
                        <label>Notas</label>
                        <textarea id="cli-notes" maxlength="500" placeholder="Preferencias, alergias, observaciones..."></textarea>
                    </div>
                    <div style="display:flex; gap:0.75rem; margin-top:1rem;">
                        <button type="submit" class="btn btn--primary btn--block" id="cli-btn-save">💾 Guardar</button>
                        <button type="button" class="btn btn--secondary" id="cli-btn-cancel">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal Historial -->
        <div id="cli-history-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 640px;">
                <div class="modal-header">
                    <h2 id="cli-history-title">📋 Historial</h2>
                    <button id="cli-btn-close-history" class="btn-close">&times;</button>
                </div>
                <div id="cli-history-body" style="max-height: 60vh; overflow-y: auto;"></div>
            </div>
        </div>

        <!-- Modal Confirmar Eliminar -->
        <div id="cli-delete-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>🗑️ Eliminar Cliente</h2>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                    ¿Seguro que querés eliminar a <strong id="cli-delete-name" style="color: var(--text-main);"></strong>?<br>
                    Esta acción no se puede deshacer.
                </p>
                <div style="display:flex; gap:0.75rem;">
                    <button class="btn btn--danger btn--block" id="cli-btn-confirm-delete">Sí, Eliminar</button>
                    <button class="btn btn--secondary" id="cli-btn-cancel-delete">Cancelar</button>
                </div>
            </div>
        </div>

        <!-- Modal Fusionar Duplicado -->
        <div id="cli-merge-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 480px;">
                <div class="modal-header">
                    <h2>🔀 Cliente Existente</h2>
                </div>
                <div id="cli-merge-body" style="margin-bottom: 1.5rem;"></div>
                <div style="display:flex; gap:0.75rem;">
                    <button type="button" class="btn btn--primary btn--block" id="cli-btn-confirm-merge">✅ Sí, Fusionar</button>
                    <button type="button" class="btn btn--secondary" id="cli-btn-cancel-merge">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    loadClientesData(container);
    return container;
}

// ============================================================
// Carga de datos
// ============================================================
async function loadClientesData(container) {
    try {
        const [customersData, statsData] = await Promise.all([
            customerService.getAll(),
            customerService.getStatsByName().catch(() => ({}))
        ]);
        allCustomers = customersData || [];
        statsMap = statsData || {};
    } catch (err) {
        showToast({ message: 'Error al cargar clientes: ' + err.message, type: 'error' });
        return;
    }

    refreshTable(container);
    setupEvents(container);
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
// Eventos
// ============================================================
function setupEvents(container) {
    // Búsqueda
    container.querySelector('#cli-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        currentPage = 1;
        refreshTable(container);
    });

    // Ordenar columnas
    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortField === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = col;
                sortDir = 'asc';
            }
            refreshTable(container);
        });
    });

    // Nuevo cliente
    container.querySelector('#cli-btn-new')?.addEventListener('click', () => openFormModal(container, null));

    // Modal CRUD
    container.querySelector('#cli-btn-close-modal')?.addEventListener('click', () => closeFormModal(container));
    container.querySelector('#cli-btn-cancel')?.addEventListener('click', () => closeFormModal(container));
    container.querySelector('#cli-form')?.addEventListener('submit', (e) => handleSubmitForm(e, container));

    // Modal Historial
    container.querySelector('#cli-btn-close-history')?.addEventListener('click', () => {
        container.querySelector('#cli-history-modal')?.classList.add('hidden');
    });

    // Modal Eliminar
    container.querySelector('#cli-btn-cancel-delete')?.addEventListener('click', () => {
        container.querySelector('#cli-delete-modal')?.classList.add('hidden');
    });
    container.querySelector('#cli-btn-confirm-delete')?.addEventListener('click', () => handleDelete(container));

    // Modal Fusionar
    container.querySelector('#cli-btn-cancel-merge')?.addEventListener('click', () => {
        container.querySelector('#cli-merge-modal')?.classList.add('hidden');
    });
    container.querySelector('#cli-btn-confirm-merge')?.addEventListener('click', () => handleMerge(container));

    // Cerrar modales clickeando el overlay
    container.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });
}

// ============================================================
// Filtrado, ordenamiento y paginación
// ============================================================
function getFiltered() {
    let filtered = [...allCustomers];

    // Buscar
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q)
        );
    }

    // Combinar con stats
    filtered = filtered.map(c => {
        const stats = statsMap[c.name] || {};
        return {
            ...c,
            total_spent: stats.total_spent || 0,
            order_count: stats.order_count || 0,
            last_order: stats.last_order || c.last_order_at || null,
            orders: stats.orders || []
        };
    });

    // Ordenar
    filtered.sort((a, b) => {
        let valA, valB;
        if (sortField === 'name') {
            valA = (a.name || '').toLowerCase();
            valB = (b.name || '').toLowerCase();
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortField === 'phone') {
            valA = (a.phone || '').toLowerCase();
            valB = (b.phone || '').toLowerCase();
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

    return filtered;
}

function refreshTable(container) {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    // Actualizar indicadores de orden en headers
    container.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.col === sortField) {
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    const tbody = container.querySelector('#cli-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="${COLUMNS.length}" class="clientes-empty">
                <div class="empty-icon">👥</div>
                <p>${searchQuery ? 'No se encontraron clientes con ese filtro.' : 'No hay clientes registrados todavía.'}</p>
            </td></tr>
        `;
        renderPagination(container, 0, 0, 0);
        return;
    }

    tbody.innerHTML = pageItems.map(c => {
        const avgTicket = c.order_count > 0 ? Math.round(c.total_spent / c.order_count) : 0;
        const lastVisit = c.last_order
            ? new Date(c.last_order).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        const phone = c.phone ? `<span class="cliente-phone">${c.phone}</span>` : '<span style="color: var(--text-dim);">—</span>';

        return `
            <tr>
                <td>
                    <div class="cliente-name-cell">
                        <span class="cliente-avatar">${(c.name || '?').charAt(0).toUpperCase()}</span>
                        ${c.name}
                    </div>
                </td>
                <td>${phone}</td>
                <td style="font-family: var(--font-mono); font-weight: 700;">${c.order_count}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-success);">${formatGs(c.total_spent)}</td>
                <td style="color: var(--text-muted); font-size: 0.82rem;">${lastVisit}</td>
                <td>
                    <div class="cliente-actions">
                        ${c.order_count > 0 ? `<button class="btn btn--secondary btn-cli-history" data-id="${c.id}" title="Ver historial">📋</button>` : ''}
                        <button class="btn btn--secondary btn-cli-edit" data-id="${c.id}" title="Editar">✏️</button>
                        <button class="btn btn--ghost btn-cli-delete" data-id="${c.id}" data-name="${c.name}" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bind botones de acciones
    tbody.querySelectorAll('.btn-cli-history').forEach(btn => {
        btn.addEventListener('click', () => {
            const customer = allCustomers.find(c => c.id === btn.dataset.id);
            if (customer) openHistoryModal(container, customer);
        });
    });

    tbody.querySelectorAll('.btn-cli-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const customer = allCustomers.find(c => c.id === btn.dataset.id);
            if (customer) openFormModal(container, customer);
        });
    });

    tbody.querySelectorAll('.btn-cli-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            openDeleteModal(container, btn.dataset.id, btn.dataset.name);
        });
    });

    renderPagination(container, currentPage, totalPages, filtered.length);

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
// Paginación
// ============================================================
function renderPagination(container, page, totalPages, totalItems) {
    const pag = container.querySelector('#cli-pagination');
    if (!pag) return;

    if (totalItems === 0) {
        pag.innerHTML = '';
        return;
    }

    const startItem = (page - 1) * PAGE_SIZE + 1;
    const endItem = Math.min(page * PAGE_SIZE, totalItems);

    let buttons = '';
    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) startPage = Math.max(1, endPage - maxButtons + 1);

    buttons += `<button class="btn btn--secondary" data-page="1" ${page === 1 ? 'disabled' : ''}>⏮</button>`;
    buttons += `<button class="btn btn--secondary" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>◀</button>`;

    for (let p = startPage; p <= endPage; p++) {
        buttons += `<button class="btn ${p === page ? 'btn--primary active' : 'btn--secondary'}" data-page="${p}">${p}</button>`;
    }

    buttons += `<button class="btn btn--secondary" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>▶</button>`;
    buttons += `<button class="btn btn--secondary" data-page="${totalPages}" ${page === totalPages ? 'disabled' : ''}>⏭</button>`;

    pag.innerHTML = `
        <span class="clientes-pagination__info">
            Mostrando ${startItem}-${endItem} de ${totalItems} clientes
        </span>
        <div class="clientes-pagination__controls">${buttons}</div>
    `;

    pag.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.page, 10);
            if (!isNaN(p) && p >= 1 && p <= totalPages && p !== page) {
                currentPage = p;
                refreshTable(container);
            }
        });
    });
}

// ============================================================
// Modal CRUD: Crear / Editar
// ============================================================
function openFormModal(container, customer) {
    const modal = container.querySelector('#cli-modal');
    if (!modal) return;

    const isEdit = !!customer;
    container.querySelector('#cli-modal-title').textContent = isEdit ? '✏️ Editar Cliente' : '➕ Nuevo Cliente';
    container.querySelector('#cli-id').value = isEdit ? customer.id : '';
    container.querySelector('#cli-name').value = isEdit ? customer.name : '';
    container.querySelector('#cli-phone').value = isEdit ? (customer.phone || '') : '';
    container.querySelector('#cli-notes').value = isEdit ? (customer.notes || '') : '';

    modal.classList.remove('hidden');
    setTimeout(() => container.querySelector('#cli-name')?.focus(), 100);
}

function closeFormModal(container) {
    container.querySelector('#cli-modal')?.classList.add('hidden');
    container.querySelector('#cli-form')?.reset();
}

async function handleSubmitForm(e, container) {
    e.preventDefault();
    const id = container.querySelector('#cli-id').value;
    const name = container.querySelector('#cli-name').value.trim();
    const phone = container.querySelector('#cli-phone').value.trim();
    const notes = container.querySelector('#cli-notes').value.trim();

    if (!name) {
        showToast({ message: 'El nombre es obligatorio', type: 'error' });
        return;
    }

    const saveBtn = container.querySelector('#cli-btn-save');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Guardando...';

    try {
        if (id) {
            // --- EDITAR ---
            // Si cambió el nombre, verificar que el nuevo nombre no exista ya en OTRO cliente
            if (name !== allCustomers.find(c => c.id === id)?.name) {
                const existing = await customerService.findByName(name);
                if (existing && existing.id !== id) {
                    pendingMerge = { mode: 'edit-rename', existingId: existing.id, currentId: id, name, phone, notes };
                    closeFormModal(container);
                    openMergeModal(container, existing, name, phone, notes);
                    return;
                }
            }
            await customerService.update(id, { name, phone, notes });
            showToast({ message: `✅ Cliente "${name}" actualizado`, type: 'success' });
        } else {
            // --- CREAR ---
            const existing = await customerService.findByName(name);
            if (existing) {
                // Ya existe → abrir modal de fusión
                pendingMerge = { mode: 'create', existingId: existing.id, name, phone, notes };
                closeFormModal(container);
                openMergeModal(container, existing, name, phone, notes);
                return;
            }
            await customerService.create({ name, phone, notes });
            showToast({ message: `✅ Cliente "${name}" creado`, type: 'success' });
        }
        closeFormModal(container);
        await reload(container);
    } catch (err) {
        showToast({ message: 'Error: ' + err.message, type: 'error' });
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// ============================================================
// Modal Eliminar
// ============================================================
let deleteTargetId = null;

function openDeleteModal(container, id, name) {
    deleteTargetId = id;
    container.querySelector('#cli-delete-name').textContent = name;
    container.querySelector('#cli-delete-modal')?.classList.remove('hidden');
}

async function handleDelete(container) {
    if (!deleteTargetId) return;
    try {
        await customerService.remove(deleteTargetId);
        showToast({ message: '✅ Cliente eliminado', type: 'success' });
        container.querySelector('#cli-delete-modal')?.classList.add('hidden');
        deleteTargetId = null;
        await reload(container);
    } catch (err) {
        showToast({ message: 'Error: ' + err.message, type: 'error' });
    }
}

// ============================================================
// Modal Fusionar Duplicado
// ============================================================
let pendingMerge = null; // { mode, existingId, name, phone, notes, currentId? }

function openMergeModal(container, existing, name, phone, notes) {
    const modal = container.querySelector('#cli-merge-modal');
    if (!modal) return;

    const existingPhone = existing.phone ? `📞 ${existing.phone}` : '<span style="color: var(--text-dim);">Sin teléfono</span>';
    const existingNotes = existing.notes ? `<br>📝 ${existing.notes}` : '';
    const newPhone = phone ? `📞 ${phone}` : '<span style="color: var(--text-dim);">Sin teléfono</span>';
    const newNotes = notes ? `<br>📝 ${notes}` : '';

    container.querySelector('#cli-merge-body').innerHTML = `
        <p style="color: var(--text-main); margin-bottom: 1rem;">
            Ya existe un cliente con el nombre <strong style="color: var(--color-primary);">${existing.name}</strong>.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
            <div style="padding: 0.8rem; background: var(--bg-elevated); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted);">Existente</span>
                <p style="font-weight: 700; margin-top: 0.3rem;">${existing.name}</p>
                <p style="font-size: 0.82rem; color: var(--text-muted);">${existingPhone}${existingNotes}</p>
            </div>
            <div style="padding: 0.8rem; background: var(--bg-elevated); border-radius: var(--radius-sm); border: 1px solid var(--color-primary); border-color: var(--color-primary);">
                <span style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: var(--color-primary);">Nuevo</span>
                <p style="font-weight: 700; margin-top: 0.3rem;">${name}</p>
                <p style="font-size: 0.82rem; color: var(--text-muted);">${newPhone}${newNotes}</p>
            </div>
        </div>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
            Al fusionar, se <strong>combinarán los datos</strong> (teléfono y notas) en el cliente existente
            ${pendingMerge.mode === 'edit-rename' ? ', los pedidos del cliente actual se reasignarán al existente y <strong>el cliente actual será eliminado</strong>' : ''}.
            El historial de pedidos y el total gastado se suman automáticamente.
        </p>
    `;

    modal.classList.remove('hidden');
}

async function handleMerge(container) {
    if (!pendingMerge) return;

    const mergeBtn = container.querySelector('#cli-btn-confirm-merge');
    if (!mergeBtn) return;

    const originalText = mergeBtn.innerHTML;
    mergeBtn.disabled = true;
    mergeBtn.innerHTML = '⏳ Fusionando...';

    try {
        const { mode, existingId, name, phone, notes, currentId } = pendingMerge;

        // Buscar el cliente existente para saber el nombre REAL (casing exacto en DB)
        // antes de intentar cualquier update o reasignacion de pedidos.
        const existingCustomer = allCustomers.find(c => c.id === existingId);
        if (!existingCustomer) {
            throw new Error('No se encontró el cliente existente para fusionar');
        }
        const targetName = existingCustomer.name; // nombre con casing real en la DB

        // Combinar datos: no pisar los del existente. Preferir el telefono del
        // existente si ya tiene; si no, usar el nuevo. Combinar notas si ambas existen.
        const mergedPhone = (existingCustomer.phone || '').trim() || (phone || '').trim();
        const existingNotesTrim = (existingCustomer.notes || '').trim();
        const newNotesTrim = (notes || '').trim();
        let mergedNotes = existingNotesTrim;
        if (newNotesTrim && !existingNotesTrim.includes(newNotesTrim)) {
            mergedNotes = existingNotesTrim
                ? `${existingNotesTrim} | ${newNotesTrim}`
                : newNotesTrim;
        }

        if (mode === 'create') {
            // Fusionar: actualizar el existente con los datos combinados.
            // No cambiamos el nombre del existente (targetName) para evitar UNIQUE violation.
            await customerService.update(existingId, {
                name: targetName,
                phone: mergedPhone,
                notes: mergedNotes
            });

            // Reasignar pedidos que tengan customer_name = name (lo que el usuario escribio)
            // al nombre real del cliente existente (targetName), si difieren (ej: distinto casing).
            if (name !== targetName) {
                await customerService.reassignOrders(name, targetName);
            }

            showToast({ message: `✅ Datos fusionados con "${targetName}"`, type: 'success' });
        } else if (mode === 'edit-rename') {
            // El usuario renombró un cliente a un nombre que ya existe.
            // 1) Actualizar el existente con los datos combinados.
            await customerService.update(existingId, {
                name: targetName,
                phone: mergedPhone,
                notes: mergedNotes
            });

            // 2) Reasignar los pedidos del cliente actual al existente.
            const currentCustomer = allCustomers.find(c => c.id === currentId);
            if (currentCustomer && currentCustomer.name !== targetName) {
                await customerService.reassignOrders(currentCustomer.name, targetName);
            }

            // 3) Eliminar el cliente actual (ya reasignamos sus pedidos).
            await customerService.remove(currentId);
            showToast({ message: `✅ Clientes fusionados en "${targetName}"`, type: 'success' });
        }

        container.querySelector('#cli-merge-modal')?.classList.add('hidden');
        pendingMerge = null;
        await reload(container);
    } catch (err) {
        console.error('[clientes] Error al fusionar:', err);
        showToast({ message: 'Error al fusionar: ' + (err.message || 'desconocido'), type: 'error' });
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.innerHTML = originalText;
    }
}

// ============================================================
// Modal Historial
// ============================================================
function openHistoryModal(container, customer) {
    const modal = container.querySelector('#cli-history-modal');
    if (!modal) return;

    const stats = statsMap[customer.name] || {};
    const orders = (stats.orders || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const avgTicket = stats.order_count > 0 ? Math.round(stats.total_spent / stats.order_count) : 0;

    container.querySelector('#cli-history-title').textContent = `📋 ${customer.name}`;
    container.querySelector('#cli-history-body').innerHTML = `
        <div class="clientes-stat-grid">
            <div class="stat-card">
                <span class="stat-card__title">Pedidos</span>
                <span class="stat-card__value">${stats.order_count || 0}</span>
            </div>
            <div class="stat-card stat-card--green">
                <span class="stat-card__title">Gastado</span>
                <span class="stat-card__value">${formatGs(stats.total_spent || 0)}</span>
            </div>
            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">Ticket Prom.</span>
                <span class="stat-card__value">${formatGs(avgTicket)}</span>
            </div>
        </div>

        ${customer.phone ? `<p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;">📞 ${customer.phone}</p>` : ''}
        ${customer.notes ? `<p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:0.5rem;">📝 ${customer.notes}</p>` : ''}

        <h3 style="font-size: 0.8rem; color: var(--color-primary); margin: 1rem 0 0.5rem; font-family: var(--font-title);">📅 Últimos Pedidos</h3>
        <div class="clientes-orders-list">
            ${orders.length === 0
                ? '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">Sin pedidos registrados</p>'
                : orders.slice(0, 20).map(o => `
                    <div class="clientes-order-row">
                        <div>
                            <span style="font-weight: 700; font-family: var(--font-mono);">#${o.order_number || '—'}</span>
                            <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">
                                ${new Date(o.created_at).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <span class="badge badge--${o.paid_at ? 'green' : o.status === 'cancelled' ? 'red' : 'yellow'}" style="font-size: 0.72rem;">${o.paid_at ? 'COBRADO' : o.status.toUpperCase()}</span>
                            <span style="font-family: var(--font-mono); font-weight: 700;">${formatGs(o.total)}</span>
                        </div>
                    </div>
                `).join('')
            }
        </div>
    `;

    modal.classList.remove('hidden');
}

// ============================================================
// Recargar datos y tabla
// ============================================================
async function reload(container) {
    try {
        const [customersData, statsData] = await Promise.all([
            customerService.getAll(),
            customerService.getStatsByName().catch(() => ({}))
        ]);
        allCustomers = customersData || [];
        statsMap = statsData || {};
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al recargar: ' + err.message, type: 'error' });
    }
}
