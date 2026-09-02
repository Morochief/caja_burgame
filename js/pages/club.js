import { customerService } from '../services/customer-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allStats = null;
let membersCache = [];
let searchQuery = '';
let currentCustomer = null; // socio seleccionado para renovar / ver historial

export async function renderClubPage() {
    const container = document.createElement('div');
    container.className = 'club-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>👑 CLUB BURGAME</h1>
                <p>Socios, membresías y renovaciones mensuales (70.000 Gs. / 30 días)</p>
            </div>
            <button id="club-btn-new" class="btn btn--primary">
                <i data-lucide="crown"></i> Nuevo Socio / Renovar
            </button>
        </header>

        <div class="club-stats-grid">
            <div class="stat-card stat-card--green">
                <span class="stat-card__title">Socios Activos</span>
                <span class="stat-card__value" id="club-stat-active">⏳</span>
            </div>
            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">⚠️ Por Vencer (5 días)</span>
                <span class="stat-card__value" id="club-stat-expiring">⏳</span>
            </div>
            <div class="stat-card stat-card--red">
                <span class="stat-card__title">🔴 Vencidos</span>
                <span class="stat-card__value" id="club-stat-expired">⏳</span>
            </div>
            <div class="stat-card stat-card--yellow">
                <span class="stat-card__title">Renovaron Este Mes</span>
                <span class="stat-card__value" id="club-stat-renewed">⏳</span>
            </div>
            <div class="stat-card stat-card--neon">
                <span class="stat-card__title">💰 Ingresos del Mes</span>
                <span class="stat-card__value" id="club-stat-revenue">⏳</span>
            </div>
        </div>

        <div class="club-toolbar">
            <input type="text" id="club-search" placeholder="🔍 Buscar socio por nombre o teléfono...">
        </div>

        <div class="card">
            <div class="club-table-wrap">
                <table class="club-table" id="club-table">
                    <thead>
                        <tr>
                            <th>Socio</th>
                            <th>Estado</th>
                            <th>Vence</th>
                            <th>Último Pago</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="club-table-body">
                        <tr><td colspan="5" class="club-empty">
                            <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando socios...</p></div>
                        </td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Modal Alta / Renovación -->
        <div id="club-form-modal" class="modal-overlay hidden">
            <div class="modal-card card">
                <div class="modal-header">
                    <h2 id="club-modal-title">👑 Nuevo Socio</h2>
                    <button class="btn-close club-close-modal">&times;</button>
                </div>
                <form id="club-form">
                    <div class="form-group">
                        <label>Nombre / Apodo *</label>
                        <input type="text" id="club-name" required maxlength="100" placeholder="Ej: Juan, Mateo...">
                    </div>
                    <div class="form-group">
                        <label>Teléfono</label>
                        <input type="text" id="club-phone" maxlength="30" placeholder="Ej: 0981 234 567">
                    </div>
                    <div class="form-group">
                        <label>Monto (Gs.)</label>
                        <input type="number" id="club-amount" value="70000" min="0">
                    </div>
                    <div id="club-member-status" class="club-member-status" style="display:none;"></div>
                    <div style="display:flex; gap:0.75rem; margin-top:1rem;">
                        <button type="submit" class="btn btn--primary btn--block" id="club-btn-save">💾 Guardar y Registrar</button>
                        <button type="button" class="btn btn--secondary club-close-modal" id="club-btn-cancel">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal Historial -->
        <div id="club-history-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 640px;">
                <div class="modal-header">
                    <h2 id="club-history-title">📋 Historial de Membresías</h2>
                    <button class="btn-close club-close-history">&times;</button>
                </div>
                <div id="club-history-body" style="max-height: 60vh; overflow-y: auto;"></div>
            </div>
        </div>
    `;

    loadClubData(container);

    return container;
}

// ============================================================
// Carga de datos
// ============================================================
async function loadClubData(container) {
    try {
        allStats = await customerService.getMembershipStats();
        membersCache = allStats.members || [];
        updateStatsUI(container);
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al cargar el Club: ' + err.message, type: 'error' });
        const tbody = container.querySelector('#club-table-body');
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="club-empty">No se pudieron cargar los socios.</td></tr>`;
        return;
    }
    setupEvents(container);
    if (window.lucide) window.lucide.createIcons();
}

function updateStatsUI(container) {
    const setText = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val; };
    setText('#club-stat-active', allStats.active || 0);
    setText('#club-stat-expiring', allStats.expiring || 0);
    setText('#club-stat-expired', allStats.expired || 0);
    setText('#club-stat-renewed', allStats.renewedThisMonth || 0);
    setText('#club-stat-revenue', formatGs(allStats.revenueThisMonth || 0));
}

// ============================================================
// Tabla
// ============================================================
function refreshTable(container) {
    const tbody = container.querySelector('#club-table-body');
    if (!tbody) return;

    let filtered = membersCache;
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="5" class="club-empty">
                <div class="empty-icon">👑</div>
                <p>${searchQuery ? 'No se encontraron socios con ese filtro.' : 'Aún no hay socios registrados. ¡Sumá el primero!'}</p>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const { status, daysLeft, membership } = c;
        const badge = getStatusBadge(status, daysLeft);
        const vence = membership
            ? new Date(membership.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';
        const lastPaid = membership
            ? new Date(membership.paid_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
            : '—';
        const amount = membership ? formatGs(membership.amount) : '';

        return `
            <tr>
                <td>
                    <div class="cliente-name-cell">
                        <span class="cliente-avatar" style="background: var(--color-primary); color:#0A0B0E;">👑</span>
                        <div>
                            <strong>${c.name}</strong>
                            ${c.phone ? `<div style="font-size:0.75rem; color:var(--text-muted);">${c.phone}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${badge}</td>
                <td style="font-family: var(--font-mono); font-weight: 700; font-size:0.85rem;">${vence}</td>
                <td style="color:var(--text-muted); font-size:0.82rem;">${lastPaid} · <strong style="font-family:var(--font-mono);">${amount}</strong></td>
                <td>
                    <div class="cliente-actions">
                        <button class="btn btn--primary btn-club-renew" data-id="${c.id}" data-name="${c.name}" style="padding:0.35rem 0.7rem; font-size:0.78rem;">🔄 Renovar</button>
                        <button class="btn btn--secondary btn-club-history" data-id="${c.id}" title="Ver historial" style="padding:0.35rem 0.7rem;">📋</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.btn-club-renew').forEach(btn => {
        btn.addEventListener('click', () => openRenewModal(container, btn.dataset.id, btn.dataset.name));
    });
    tbody.querySelectorAll('.btn-club-history').forEach(btn => {
        btn.addEventListener('click', () => openHistoryModal(container, btn.dataset.id));
    });
}

function getStatusBadge(status, daysLeft) {
    if (status === 'active') {
        return `<span class="badge badge--green">🟢 Activo</span>`;
    }
    if (status === 'expiring') {
        return `<span class="badge badge--yellow">🟡 Por vencer · ${daysLeft} día(s)</span>`;
    }
    if (status === 'expired') {
        return `<span class="badge badge--red">🔴 Vencido</span>`;
    }
    return `<span class="badge badge--gray">Sin membresía</span>`;
}

// ============================================================
// Eventos
// ============================================================
function setupEvents(container) {
    container.querySelector('#club-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshTable(container);
    });

    container.querySelector('#club-btn-new')?.addEventListener('click', () => {
        openNewModal(container);
    });

    container.querySelectorAll('.club-close-modal').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#club-form-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.club-close-history').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#club-history-modal')?.classList.add('hidden'));
    });

    container.querySelector('#club-form')?.addEventListener('submit', (e) => handleSubmit(e, container));

    container.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });
}

// ============================================================
// Modal Nuevo / Renovar
// ============================================================
function openNewModal(container) {
    currentCustomer = null;
    container.querySelector('#club-modal-title').textContent = '👑 Nuevo Socio';
    container.querySelector('#club-name').value = '';
    container.querySelector('#club-phone').value = '';
    container.querySelector('#club-amount').value = '70000';
    const statusEl = container.querySelector('#club-member-status');
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';
    container.querySelector('#club-form-modal')?.classList.remove('hidden');
    setTimeout(() => container.querySelector('#club-name')?.focus(), 100);
}

async function openRenewModal(container, customerId, name) {
    const member = membersCache.find(m => m.id === customerId);
    if (!member) {
        showToast({ message: 'No se encontró el socio', type: 'error' });
        return;
    }
    currentCustomer = member;
    container.querySelector('#club-modal-title').textContent = `🔄 Renovar: ${member.name}`;
    container.querySelector('#club-name').value = member.name;
    container.querySelector('#club-phone').value = member.phone || '';
    container.querySelector('#club-amount').value = member.membership ? (member.membership.amount || 70000) : 70000;

    const statusEl = container.querySelector('#club-member-status');
    statusEl.style.display = 'block';
    if (member.status === 'expired') {
        statusEl.innerHTML = `<span style="color:#FF5252; font-weight:700;">🔴 Membresía vencida. La nueva vigencia arranca desde HOY + 30 días.</span>`;
    } else if (member.status === 'active' || member.status === 'expiring') {
        const vence = member.membership ? new Date(member.membership.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }) : '';
        statusEl.innerHTML = `<span style="color:#FFC107; font-weight:700;">⚠️ Socio activo hasta el ${vence}. Si renovás ahora, se extiende ${customerService.MEMBERSHIP_DAYS} días desde ese vencimiento.</span>`;
    } else {
        statusEl.innerHTML = '';
    }
    container.querySelector('#club-form-modal')?.classList.remove('hidden');
}

async function handleSubmit(e, container) {
    e.preventDefault();
    const name = container.querySelector('#club-name').value.trim();
    const phone = container.querySelector('#club-phone').value.trim();
    const amount = parseInt(container.querySelector('#club-amount').value, 10) || 70000;

    if (!name) {
        showToast({ message: 'El nombre es obligatorio', type: 'error' });
        return;
    }

    const saveBtn = container.querySelector('#club-btn-save');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Guardando...';

    try {
        // Si no es el socio ya cargado en el modal (alta), buscar por nombre
        let customer = currentCustomer;
        if (!customer || customer.name.toLowerCase() !== name.toLowerCase()) {
            const found = await customerService.findByName(name);
            if (found) {
                customer = found;
            } else {
                customer = await customerService.create({ name, phone });
            }
        }

        // Determinar si tiene membresía vigente para extender desde ahí
        const active = await customerService.getActiveMembership(customer.id);

        if (active) {
            // Socio activo: extender desde su vencimiento actual
            await customerService.renewMembership({
                customerId: customer.id,
                amount,
                previousExpiry: active.expires_at
            });
        } else {
            // Alta o vencido: arranca desde hoy
            await customerService.registerMembership({ customerId: customer.id, amount });
        }

        showToast({ message: `✅ Membresía registrada para ${customer.name}`, type: 'success' });
        container.querySelector('#club-form-modal')?.classList.add('hidden');
        await reload(container);
    } catch (err) {
        showToast({ message: 'Error al registrar membresía: ' + err.message, type: 'error' });
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// ============================================================
// Historial
// ============================================================
async function openHistoryModal(container, customerId) {
    const member = membersCache.find(m => m.id === customerId);
    if (!member) return;

    container.querySelector('#club-history-title').textContent = `📋 ${member.name} — Historial`;

    const body = container.querySelector('#club-history-body');
    body.innerHTML = `<div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>`;
    container.querySelector('#club-history-modal')?.classList.remove('hidden');

    try {
        const history = await customerService.getMembershipHistory(customerId);
        const totalPaid = history.reduce((sum, m) => sum + (m.amount || 0), 0);

        body.innerHTML = history.length === 0 ? `
            <p class="empty-text">Sin pagos registrados.</p>
        ` : `
            <div class="clientes-stat-grid">
                <div class="stat-card stat-card--green">
                    <span class="stat-card__title">Pagos</span>
                    <span class="stat-card__value">${history.length}</span>
                </div>
                <div class="stat-card stat-card--yellow">
                    <span class="stat-card__title">Total Pagado</span>
                    <span class="stat-card__value">${formatGs(totalPaid)}</span>
                </div>
            </div>
            <h3 style="font-size:0.8rem; color:var(--color-primary); margin:1rem 0 0.5rem; font-family:var(--font-title);">📅 Pagos y Vencimientos</h3>
            <div class="clientes-orders-list">
                ${history.map(m => `
                    <div class="clientes-order-row">
                        <div>
                            <span style="font-weight:700;">${formatGs(m.amount)}</span>
                            <div style="font-size:0.78rem; color:var(--text-muted);">
                                Pagado: ${new Date(m.paid_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="badge badge--${new Date(m.expires_at) > new Date() ? 'green' : 'gray'}" style="font-size:0.72rem;">Vence: ${new Date(m.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<p style="color:#FF5252;">Error al cargar historial: ${err.message}</p>`;
    }
}

// ============================================================
// Recargar datos y tabla
// ============================================================
async function reload(container) {
    try {
        allStats = await customerService.getMembershipStats();
        membersCache = allStats.members || [];
        updateStatsUI(container);
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al recargar: ' + err.message, type: 'error' });
    }
}
