import { customerService } from '../services/customer-service.js';
import { exportClubToExcel } from '../services/excel-export-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allStats = null;
let membersCache = [];
let allMembershipsRaw = [];
let searchQuery = '';
let currentFilter = 'all'; // 'all' | 'active' | 'expiring' | 'expired' | 'tournament' | 'paid'
let sortField = 'expires_at';
let sortDir = 'asc';

let currentMemberTarget = null;   // Socio seleccionado
let currentMembershipTarget = null; // Registro de membresía específico a editar/eliminar

export async function renderClubPage() {
    const container = document.createElement('div');
    container.className = 'club-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>👑 CLUB BURGAME — GESTIÓN DE SOCIOS & TORNEOS</h1>
                <p>Control de socios, premios de torneos gamer, membresías y recaudación real</p>
            </div>
            <div class="club-header-actions">
                <button id="club-btn-export" class="btn btn--secondary" title="Descargar padrón oficial en Excel">
                    <i data-lucide="file-spreadsheet"></i> 📥 Exportar Excel
                </button>
                <button id="club-btn-new" class="btn btn--primary">
                    <i data-lucide="crown"></i> ➕ Nuevo Socio / Otorgar Premio
                </button>
            </div>
        </header>

        <!-- KPI Dashboard Arcade -->
        <div class="club-stats-grid">
            <div class="club-kpi-card club-kpi-card--gold">
                <div class="club-kpi-header">
                    <span class="club-kpi-title">Socios Activos</span>
                    <span class="club-kpi-icon">👑</span>
                </div>
                <span class="club-kpi-value" id="club-stat-active">0</span>
                <span class="club-kpi-sub">Vigencia al día</span>
            </div>

            <div class="club-kpi-card club-kpi-card--yellow">
                <div class="club-kpi-header">
                    <span class="club-kpi-title">Por Vencer</span>
                    <span class="club-kpi-icon">⚠️</span>
                </div>
                <span class="club-kpi-value" id="club-stat-expiring">0</span>
                <span class="club-kpi-sub">Próximos 5 días</span>
            </div>

            <div class="club-kpi-card club-kpi-card--red">
                <div class="club-kpi-header">
                    <span class="club-kpi-title">Vencidos</span>
                    <span class="club-kpi-icon">🔴</span>
                </div>
                <span class="club-kpi-value" id="club-stat-expired">0</span>
                <span class="club-kpi-sub">Requieren renovación</span>
            </div>

            <div class="club-kpi-card club-kpi-card--cyan">
                <div class="club-kpi-header">
                    <span class="club-kpi-title">Premios Torneo</span>
                    <span class="club-kpi-icon">🏆</span>
                </div>
                <span class="club-kpi-value" id="club-stat-tournaments">0</span>
                <span class="club-kpi-sub" id="club-stat-tournaments-sub">Ganadores premiados</span>
            </div>

            <div class="club-kpi-card club-kpi-card--green">
                <div class="club-kpi-header">
                    <span class="club-kpi-title">Ingresos del Mes</span>
                    <span class="club-kpi-icon">💰</span>
                </div>
                <span class="club-kpi-value" id="club-stat-revenue">Gs. 0</span>
                <span class="club-kpi-sub" id="club-stat-renewed-sub">Solo pagos cobrados</span>
            </div>
        </div>

        <!-- Filter Pills Bar -->
        <div class="club-pills-bar" id="club-pills">
            <button class="club-pill active" data-filter="all">
                <span>🌟 Todos los Socios</span>
                <span class="club-pill__count" id="club-pill-all">0</span>
            </button>
            <button class="club-pill" data-filter="active">
                <span>🟢 Activos</span>
                <span class="club-pill__count" id="club-pill-active">0</span>
            </button>
            <button class="club-pill" data-filter="expiring">
                <span>⚠️ Por Vencer</span>
                <span class="club-pill__count" id="club-pill-expiring">0</span>
            </button>
            <button class="club-pill" data-filter="expired">
                <span>🔴 Vencidos</span>
                <span class="club-pill__count" id="club-pill-expired">0</span>
            </button>
            <button class="club-pill" data-filter="tournament">
                <span>🏆 Ganadores Torneo</span>
                <span class="club-pill__count" id="club-pill-tournament">0</span>
            </button>
            <button class="club-pill" data-filter="paid">
                <span>💳 Pagos Regulares</span>
                <span class="club-pill__count" id="club-pill-paid">0</span>
            </button>
        </div>

        <!-- Toolbar -->
        <div class="club-toolbar">
            <div class="club-search-wrap">
                <span class="club-search-icon">🔍</span>
                <input type="text" id="club-search" placeholder="Buscar socio por nombre, teléfono o torneo ganado...">
            </div>
        </div>

        <!-- Tabla Enterprise -->
        <div class="club-table-card">
            <div class="club-table-wrap">
                <table class="club-table" id="club-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-col="name">Socio / Contacto</th>
                            <th class="no-sort">Estado</th>
                            <th class="no-sort">Origen Beneficio</th>
                            <th class="sortable" data-col="expires_at">Vencimiento</th>
                            <th class="no-sort">Último Pago / Premio</th>
                            <th class="no-sort" style="text-align: right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="club-table-body">
                        <tr>
                            <td colspan="6" class="club-empty">
                                <div class="page-loading" style="padding: 1.5rem;">
                                    <div class="pixel-spinner"></div>
                                    <p>Cargando socios del Club Burgame...</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- ============================================================
             MODAL ALTA / RENOVACIÓN / PREMIO DE TORNEO
             ============================================================ -->
        <div id="club-form-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 580px;">
                <div class="modal-header">
                    <h2 id="club-modal-title">👑 Nueva Membresía</h2>
                    <button class="btn-close club-close-modal">&times;</button>
                </div>

                <form id="club-form">
                    <!-- Selector de Tipo de Membresía -->
                    <div class="club-type-tabs">
                        <div class="club-type-tab active" data-type="paid">
                            💳 Pago Regular
                        </div>
                        <div class="club-type-tab club-type-tab--tournament" data-type="tournament_prize">
                            🏆 Premio Torneo
                        </div>
                        <div class="club-type-tab" data-type="courtesy">
                            🎁 Cortesía / Promo
                        </div>
                    </div>
                    <input type="hidden" id="club-type" value="paid">

                    <!-- Campo Torneo (visible cuando type === tournament_prize) -->
                    <div class="form-group hidden" id="group-tournament-name">
                        <label style="color:#00F0FF; font-weight:700;">🏆 Nombre del Torneo / Evento *</label>
                        <input type="text" id="club-tournament" placeholder="Ej: Torneo Rocket League 2v2 (1er Puesto)">
                        <div class="club-duration-pills" style="margin-top:0.35rem;">
                            <span class="club-duration-pill club-tpl-tournament" data-val="Torneo Rocket League 2v2 (1er Puesto)">🚀 Rocket League 2v2</span>
                            <span class="club-duration-pill club-tpl-tournament" data-val="Torneo Super Smash Bros (1er Puesto)">⚔️ Smash Bros</span>
                            <span class="club-duration-pill club-tpl-tournament" data-val="Torneo FIFA / EA FC (Campeón)">⚽ FIFA</span>
                            <span class="club-duration-pill club-tpl-tournament" data-val="Torneo Mario Kart (1er Puesto)">🏎️ Mario Kart</span>
                        </div>
                    </div>

                    <!-- Datos del Socio -->
                    <div class="form-group">
                        <label>Nombre / Apodo del Socio *</label>
                        <input type="text" id="club-name" required maxlength="100" placeholder="Ej: Kevin Moraes, Ethien, Boris...">
                    </div>

                    <div class="form-group">
                        <label>Teléfono Móvil (WhatsApp)</label>
                        <input type="text" id="club-phone" maxlength="30" placeholder="Ej: 0981 234 567">
                    </div>

                    <!-- Duración en días -->
                    <div class="form-group">
                        <label>Duración de la Membresía</label>
                        <div class="club-duration-pills">
                            <span class="club-duration-pill active" data-days="30">⚡ 30 días (1 mes)</span>
                            <span class="club-duration-pill" data-days="60">🎮 60 días (2 meses)</span>
                            <span class="club-duration-pill" data-days="90">🏆 90 días (Temporada)</span>
                            <span class="club-duration-pill" data-days="custom">📅 Fecha exacta</span>
                        </div>
                        <input type="hidden" id="club-days" value="30">
                        <div id="group-custom-date" class="hidden" style="margin-top:0.5rem;">
                            <label style="font-size:0.75rem; color:var(--text-muted);">Fecha exacta de vencimiento:</label>
                            <input type="date" id="club-custom-expiry">
                        </div>
                    </div>

                    <!-- Monto y Medio de Pago -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
                        <div class="form-group">
                            <label id="lbl-club-amount">Monto Cobrado (Gs.)</label>
                            <input type="number" id="club-amount" value="70000" min="0" step="1000">
                            <small id="help-club-amount" style="color:var(--text-muted); font-size:0.72rem;">Por defecto 70.000 Gs.</small>
                        </div>
                        <div class="form-group">
                            <label>Medio de Pago / Registro</label>
                            <select id="club-payment-method">
                                <option value="efectivo">💵 Efectivo en Caja</option>
                                <option value="qr_transferencia">📱 QR / Transferencia</option>
                                <option value="tarjeta">💳 Tarjeta Débito / Crédito</option>
                                <option value="premio">🏆 Premio (Sin costo)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Notas / Observaciones</label>
                        <input type="text" id="club-notes" maxlength="150" placeholder="Ej: Campeón torneo fin de semana, promo apertura...">
                    </div>

                    <div id="club-member-status" class="club-member-status" style="display:none;"></div>

                    <div style="display:flex; gap:0.75rem; margin-top:1.25rem;">
                        <button type="submit" class="btn btn--primary btn--block" id="club-btn-save">💾 Guardar y Registrar</button>
                        <button type="button" class="btn btn--secondary club-close-modal" id="club-btn-cancel">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- ============================================================
             MODAL HISTORIAL Y AUDITORÍA DE MEMBRESÍAS
             ============================================================ -->
        <div id="club-history-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 680px;">
                <div class="modal-header">
                    <h2 id="club-history-title">📋 Historial de Membresías</h2>
                    <button class="btn-close club-close-history">&times;</button>
                </div>
                <div id="club-history-body" style="max-height: 65vh; overflow-y: auto;">
                    <!-- Contenido dinámico -->
                </div>
            </div>
        </div>

        <!-- ============================================================
             MODAL EDITAR MEMBRESÍA ESPECÍFICA (CORRECCIÓN DE DATOS)
             ============================================================ -->
        <div id="club-edit-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>✏️ Corregir Datos de Membresía</h2>
                    <button class="btn-close" id="club-close-edit">&times;</button>
                </div>
                <form id="club-edit-form">
                    <input type="hidden" id="edit-mem-id">

                    <div class="form-group">
                        <label>Tipo de Membresía</label>
                        <select id="edit-mem-type">
                            <option value="paid">💳 Pago Regular</option>
                            <option value="tournament_prize">🏆 Premio de Torneo</option>
                            <option value="courtesy">🎁 Cortesía / Promoción</option>
                        </select>
                    </div>

                    <div class="form-group" id="group-edit-tournament">
                        <label>Nombre del Torneo / Motivo</label>
                        <input type="text" id="edit-mem-tournament" placeholder="Ej: Torneo Rocket League 2v2">
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
                        <div class="form-group">
                            <label>Fecha Inicio / Pago</label>
                            <input type="date" id="edit-mem-paid-at" required>
                        </div>
                        <div class="form-group">
                            <label>Fecha Vencimiento</label>
                            <input type="date" id="edit-mem-expires-at" required>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.75rem;">
                        <div class="form-group">
                            <label>Monto Cobrado (Gs.)</label>
                            <input type="number" id="edit-mem-amount" min="0" step="1000">
                        </div>
                        <div class="form-group">
                            <label>Medio de Pago</label>
                            <select id="edit-mem-payment">
                                <option value="efectivo">💵 Efectivo</option>
                                <option value="qr_transferencia">📱 QR / Transf.</option>
                                <option value="tarjeta">💳 Tarjeta</option>
                                <option value="premio">🏆 Premio</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Notas</label>
                        <input type="text" id="edit-mem-notes">
                    </div>

                    <div style="display:flex; gap:0.75rem; margin-top:1.25rem;">
                        <button type="submit" class="btn btn--primary btn--block" id="btn-save-edit-mem">💾 Guardar Cambios</button>
                        <button type="button" class="btn btn--secondary" id="btn-cancel-edit-mem">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- ============================================================
             MODAL DAR DE BAJA / ANULAR SOCIO
             ============================================================ -->
        <div id="club-revoke-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 440px;">
                <div class="modal-header">
                    <h2>🚪 Dar de Baja del Club</h2>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1.25rem; font-size: 0.9rem;">
                    ¿Seguro que deseas quitar a <strong id="revoke-target-name" style="color: var(--text-main);"></strong> del Club Burgame?<br><br>
                    <span style="color: var(--color-primary); font-size: 0.8rem;">
                        ℹ️ Esta acción revoca sus beneficios de socio pero <strong>NO borra</strong> sus pedidos ni su ficha de cliente.
                    </span>
                </p>
                <div style="display:flex; gap:0.75rem;">
                    <button class="btn btn--danger btn--block" id="btn-confirm-revoke">Sí, Dar de Baja</button>
                    <button class="btn btn--secondary" id="btn-cancel-revoke">Cancelar</button>
                </div>
            </div>
        </div>

        <!-- ============================================================
             MODAL WHATSAPP SOCIO
             ============================================================ -->
        <div id="club-wa-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 480px;">
                <div class="modal-header">
                    <h2>💬 Enviar WhatsApp al Socio</h2>
                    <button class="btn-close" id="club-close-wa">&times;</button>
                </div>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
                    Enviar mensaje a <strong id="club-wa-name" style="color:var(--text-main);"></strong>:
                </p>
                <div class="whatsapp-templates-menu">
                    <button class="btn-whatsapp-template" data-tpl="tournament">
                        <strong style="color:#00F0FF;">🏆 Felicitaciones Ganador de Torneo</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Felicitaciones por tu victoria en el torneo! Tu membresía al Club Burgame ya está activa..."
                        </p>
                    </button>
                    <button class="btn-whatsapp-template" data-tpl="renewal">
                        <strong style="color:#FFC107;">⚠️ Recordatorio de Vencimiento</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Hola! Te recordamos que tu membresía al Club Burgame está próxima a vencer..."
                        </p>
                    </button>
                    <button class="btn-whatsapp-template" data-tpl="welcome">
                        <strong style="color:#FFD700;">👑 Bienvenida / Beneficios de Socio</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Bienvenido al Club Burgame! Ya podés disfrutar de hamburguesas con descuentos exclusivos..."
                        </p>
                    </button>
                </div>
            </div>
        </div>
    `;

    await loadClubData(container);
    return container;
}

// ============================================================
// CARGA DE DATOS
// ============================================================
async function loadClubData(container) {
    try {
        allStats = await customerService.getMembershipStats();
        membersCache = allStats.members || [];

        // Traer todos los registros de membresías para auditoría
        try {
            allMembershipsRaw = await customerService.getMembershipHistory();
        } catch (_) {
            allMembershipsRaw = [];
        }

        updateStatsUI(container);
        updatePillCounters(container);
        refreshTable(container);
        setupEvents(container);

        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('[club] Error al cargar:', err);
        showToast({ message: 'Error al cargar el Club: ' + err.message, type: 'error' });
    }
}

function updateStatsUI(container) {
    const setText = (id, val) => { const el = container.querySelector(id); if (el) el.textContent = val; };
    setText('#club-stat-active', allStats.active || 0);
    setText('#club-stat-expiring', allStats.expiring || 0);
    setText('#club-stat-expired', allStats.expired || 0);
    setText('#club-stat-tournaments', allStats.totalTournamentPrizes || allStats.tournamentMembers || 0);
    setText('#club-stat-tournaments-sub', `${allStats.tournamentPrizesThisMonth || 0} otorgados este mes`);
    setText('#club-stat-revenue', formatGs(allStats.revenueThisMonth || 0));
    setText('#club-stat-renewed-sub', `${allStats.renewedThisMonth || 0} cuotas/movimientos`);
}

function updatePillCounters(container) {
    const counts = {
        all: membersCache.length,
        active: 0,
        expiring: 0,
        expired: 0,
        tournament: 0,
        paid: 0
    };

    membersCache.forEach(m => {
        if (m.status === 'active') counts.active++;
        if (m.status === 'expiring') counts.expiring++;
        if (m.status === 'expired') counts.expired++;

        const last = m.membership;
        if (last && last.type === 'tournament_prize') {
            counts.tournament++;
        } else {
            counts.paid++;
        }
    });

    Object.keys(counts).forEach(k => {
        const el = container.querySelector(`#club-pill-${k}`);
        if (el) el.textContent = counts[k];
    });
}

// ============================================================
// FILTRADO Y TABLA
// ============================================================
function getFilteredMembers() {
    let list = [...membersCache];

    // Filtro por Pill Tab
    if (currentFilter === 'active') {
        list = list.filter(m => m.status === 'active');
    } else if (currentFilter === 'expiring') {
        list = list.filter(m => m.status === 'expiring');
    } else if (currentFilter === 'expired') {
        list = list.filter(m => m.status === 'expired');
    } else if (currentFilter === 'tournament') {
        list = list.filter(m => m.membership && m.membership.type === 'tournament_prize');
    } else if (currentFilter === 'paid') {
        list = list.filter(m => !m.membership || m.membership.type !== 'tournament_prize');
    }

    // Buscador
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        list = list.filter(m => {
            const name = (m.name || '').toLowerCase();
            const phone = (m.phone || '').toLowerCase();
            const tournament = (m.membership?.tournament_name || '').toLowerCase();
            return name.includes(q) || phone.includes(q) || tournament.includes(q);
        });
    }

    // Ordenamiento
    list.sort((a, b) => {
        if (sortField === 'name') {
            return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        } else if (sortField === 'expires_at') {
            const expA = a.membership ? new Date(a.membership.expires_at).getTime() : 0;
            const expB = b.membership ? new Date(b.membership.expires_at).getTime() : 0;
            return sortDir === 'asc' ? expA - expB : expB - expA;
        }
        return 0;
    });

    return list;
}

function refreshTable(container) {
    const tbody = container.querySelector('#club-table-body');
    if (!tbody) return;

    const filtered = getFilteredMembers();

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="club-empty">
                    <div class="empty-icon" style="font-size:2.5rem; margin-bottom:0.5rem;">👑</div>
                    <p style="font-weight:700; color:var(--text-main);">No se encontraron socios</p>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                        ${searchQuery ? 'Prueba con otros términos de búsqueda.' : 'No hay socios en el filtro seleccionado.'}
                    </p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(c => {
        const { status, daysLeft, membership } = c;
        const isTournament = membership && membership.type === 'tournament_prize';

        const statusBadge = getStatusBadge(status, daysLeft);

        const originBadge = isTournament
            ? `<span class="badge--tournament" title="${membership.tournament_name || 'Torneo'}">🏆 ${membership.tournament_name || 'Premio de Torneo'}</span>`
            : `<span class="badge--paid-membership">💳 Cuota Mensual</span>`;

        const vence = membership
            ? new Date(membership.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        const daysLeftText = daysLeft !== null
            ? (daysLeft < 0
                ? `<span style="color:var(--color-danger); font-size:0.72rem; display:block;">Venció hace ${Math.abs(daysLeft)}d</span>`
                : `<span style="color:var(--text-muted); font-size:0.72rem; display:block;">Quedan ${daysLeft} día(s)</span>`)
            : '';

        const lastPaid = membership
            ? new Date(membership.paid_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })
            : '—';

        const amountStr = isTournament
            ? `<strong style="font-family:var(--font-mono); color:#00F0FF;">0 Gs. (Premio)</strong>`
            : `<strong style="font-family:var(--font-mono); color:var(--color-success);">${formatGs(membership?.amount || 70000)}</strong>`;

        return `
            <tr>
                <td>
                    <div class="socio-identity">
                        <span class="socio-avatar">👑</span>
                        <div class="socio-info">
                            <div class="socio-name">
                                <span>${c.name}</span>
                            </div>
                            <div class="socio-meta">
                                ${c.phone ? `<span style="font-family:var(--font-mono);">📞 ${c.phone}</span>` : '<span style="color:var(--text-dim);">Sin teléfono</span>'}
                            </div>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>${originBadge}</td>
                <td>
                    <span style="font-family:var(--font-mono); font-weight:700; font-size:0.85rem;">${vence}</span>
                    ${daysLeftText}
                </td>
                <td>
                    <div style="font-size:0.82rem;">${lastPaid} · ${amountStr}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">${membership?.payment_method || (isTournament ? 'premio' : 'efectivo')}</div>
                </td>
                <td>
                    <div class="club-actions">
                        <button class="btn btn--primary btn-club-renew" data-id="${c.id}" data-name="${c.name}" title="Renovar o extender membresía">
                            🔄 Renovar
                        </button>
                        <button class="btn btn--secondary btn-club-history" data-id="${c.id}" title="Ver y auditar historial de cuotas/premios">
                            📋
                        </button>
                        <button class="btn btn--secondary btn-club-wa" data-id="${c.id}" data-name="${c.name}" data-phone="${c.phone || ''}" title="Contactar vía WhatsApp">
                            💬
                        </button>
                        <button class="btn btn--ghost btn-club-revoke" data-id="${c.id}" data-name="${c.name}" title="Dar de baja del Club">
                            🚪
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bindings
    tbody.querySelectorAll('.btn-club-renew').forEach(btn => {
        btn.addEventListener('click', () => openRenewModal(container, btn.dataset.id, btn.dataset.name));
    });

    tbody.querySelectorAll('.btn-club-history').forEach(btn => {
        btn.addEventListener('click', () => openHistoryModal(container, btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-club-wa').forEach(btn => {
        btn.addEventListener('click', () => openWhatsAppModal(container, {
            id: btn.dataset.id,
            name: btn.dataset.name,
            phone: btn.dataset.phone
        }));
    });

    tbody.querySelectorAll('.btn-club-revoke').forEach(btn => {
        btn.addEventListener('click', () => openRevokeModal(container, btn.dataset.id, btn.dataset.name));
    });
}

function getStatusBadge(status, daysLeft) {
    if (status === 'active') {
        return `<span class="badge badge--green">🟢 Activo</span>`;
    }
    if (status === 'expiring') {
        return `<span class="badge badge--yellow">🟡 Por vencer · ${daysLeft}d</span>`;
    }
    if (status === 'expired') {
        return `<span class="badge badge--red">🔴 Vencido</span>`;
    }
    return `<span class="badge badge--gray">Sin registro</span>`;
}

// ============================================================
// EVENTOS
// ============================================================
function setupEvents(container) {
    // Pills
    container.querySelectorAll('.club-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            container.querySelectorAll('.club-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentFilter = pill.dataset.filter;
            refreshTable(container);
        });
    });

    // Búsqueda
    container.querySelector('#club-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        refreshTable(container);
    });

    // Botón Exportar Excel
    container.querySelector('#club-btn-export')?.addEventListener('click', async () => {
        const btn = container.querySelector('#club-btn-export');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Exportando...';
        try {
            await exportClubToExcel(membersCache, allMembershipsRaw);
            showToast({ message: '✅ Padrón oficial de Socios exportado a Excel', type: 'success' });
        } catch (err) {
            console.error('[club] Error al exportar:', err);
            showToast({ message: 'Error al exportar: ' + err.message, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    // Botón Nuevo Socio / Otorgar Premio
    container.querySelector('#club-btn-new')?.addEventListener('click', () => openNewModal(container));

    // Modales Close
    container.querySelectorAll('.club-close-modal').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#club-form-modal')?.classList.add('hidden'));
    });

    container.querySelectorAll('.club-close-history').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#club-history-modal')?.classList.add('hidden'));
    });

    container.querySelector('#club-close-edit')?.addEventListener('click', () => {
        container.querySelector('#club-edit-modal')?.classList.add('hidden');
    });

    container.querySelector('#btn-cancel-edit-mem')?.addEventListener('click', () => {
        container.querySelector('#club-edit-modal')?.classList.add('hidden');
    });

    container.querySelector('#club-close-wa')?.addEventListener('click', () => {
        container.querySelector('#club-wa-modal')?.classList.add('hidden');
    });

    container.querySelector('#btn-cancel-revoke')?.addEventListener('click', () => {
        container.querySelector('#club-revoke-modal')?.classList.add('hidden');
    });

    // Close overlays
    container.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Tabs de Tipo (Pago vs Torneo vs Cortesía)
    container.querySelectorAll('.club-type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            container.querySelectorAll('.club-type-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const type = tab.dataset.type;
            container.querySelector('#club-type').value = type;
            handleTypeChange(container, type);
        });
    });

    // Templates de Torneo rápidos
    container.querySelectorAll('.club-tpl-tournament').forEach(tpl => {
        tpl.addEventListener('click', () => {
            const input = container.querySelector('#club-tournament');
            if (input) input.value = tpl.dataset.val;
        });
    });

    // Pills de Duración
    container.querySelectorAll('.club-duration-pill[data-days]').forEach(pill => {
        pill.addEventListener('click', () => {
            container.querySelectorAll('.club-duration-pill[data-days]').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const days = pill.dataset.days;
            container.querySelector('#club-days').value = days;
            const customGroup = container.querySelector('#group-custom-date');
            if (days === 'custom') {
                customGroup?.classList.remove('hidden');
            } else {
                customGroup?.classList.add('hidden');
            }
        });
    });

    // Form Submit (Alta/Renovación)
    container.querySelector('#club-form')?.addEventListener('submit', (e) => handleSubmitForm(e, container));

    // Form Submit (Editar Membresía Individual)
    container.querySelector('#club-edit-form')?.addEventListener('submit', (e) => handleSaveEditMembership(e, container));

    // Confirmar Revocación / Baja
    container.querySelector('#btn-confirm-revoke')?.addEventListener('click', () => handleConfirmRevoke(container));

    // Enviar WhatsApp templates
    container.querySelectorAll('#club-wa-modal .btn-whatsapp-template').forEach(btn => {
        btn.addEventListener('click', () => handleSendWhatsApp(container, btn.dataset.tpl));
    });
}

function handleTypeChange(container, type) {
    const tournamentGroup = container.querySelector('#group-tournament-name');
    const amountInput = container.querySelector('#club-amount');
    const paymentSelect = container.querySelector('#club-payment-method');
    const amountHelp = container.querySelector('#help-club-amount');

    if (type === 'tournament_prize') {
        tournamentGroup?.classList.remove('hidden');
        amountInput.value = '0';
        paymentSelect.value = 'premio';
        if (amountHelp) amountHelp.textContent = '0 Gs. para ganadores de torneos (premio oficial).';
    } else if (type === 'courtesy') {
        tournamentGroup?.classList.add('hidden');
        amountInput.value = '0';
        paymentSelect.value = 'premio';
        if (amountHelp) amountHelp.textContent = '0 Gs. por cortesía de la casa / embajador.';
    } else {
        tournamentGroup?.classList.add('hidden');
        amountInput.value = '70000';
        paymentSelect.value = 'efectivo';
        if (amountHelp) amountHelp.textContent = 'Por defecto 70.000 Gs.';
    }
}

// ============================================================
// MODAL NUEVO / RENOVAR
// ============================================================
function openNewModal(container) {
    currentMemberTarget = null;
    container.querySelector('#club-modal-title').textContent = '👑 Nueva Membresía / Otorgar Premio';
    container.querySelector('#club-name').value = '';
    container.querySelector('#club-phone').value = '';
    container.querySelector('#club-tournament').value = '';
    container.querySelector('#club-notes').value = '';

    // Reset tabs to paid
    container.querySelectorAll('.club-type-tab').forEach(t => t.classList.remove('active'));
    container.querySelector('.club-type-tab[data-type="paid"]')?.classList.add('active');
    container.querySelector('#club-type').value = 'paid';
    handleTypeChange(container, 'paid');

    // Reset duration to 30 days
    container.querySelectorAll('.club-duration-pill[data-days]').forEach(p => p.classList.remove('active'));
    container.querySelector('.club-duration-pill[data-days="30"]')?.classList.add('active');
    container.querySelector('#club-days').value = '30';
    container.querySelector('#group-custom-date')?.classList.add('hidden');

    const statusEl = container.querySelector('#club-member-status');
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';

    container.querySelector('#club-form-modal')?.classList.remove('hidden');
    setTimeout(() => container.querySelector('#club-name')?.focus(), 100);
}

function openRenewModal(container, customerId, name) {
    const member = membersCache.find(m => m.id === customerId);
    if (!member) {
        showToast({ message: 'No se encontró el socio', type: 'error' });
        return;
    }
    currentMemberTarget = member;
    container.querySelector('#club-modal-title').textContent = `🔄 Renovar: ${member.name}`;
    container.querySelector('#club-name').value = member.name;
    container.querySelector('#club-phone').value = member.phone || '';
    container.querySelector('#club-tournament').value = member.membership?.tournament_name || '';
    container.querySelector('#club-notes').value = '';

    const lastType = member.membership?.type || 'paid';
    container.querySelectorAll('.club-type-tab').forEach(t => t.classList.remove('active'));
    const tabToActivate = container.querySelector(`.club-type-tab[data-type="${lastType}"]`) || container.querySelector('.club-type-tab[data-type="paid"]');
    tabToActivate?.classList.add('active');
    container.querySelector('#club-type').value = lastType;
    handleTypeChange(container, lastType);

    const statusEl = container.querySelector('#club-member-status');
    statusEl.style.display = 'block';
    if (member.status === 'expired') {
        statusEl.innerHTML = `<span style="color:#FF5252; font-weight:700;">🔴 Membresía vencida. La nueva vigencia arrancará desde HOY.</span>`;
    } else if (member.status === 'active' || member.status === 'expiring') {
        const vence = member.membership ? new Date(member.membership.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        statusEl.innerHTML = `<span style="color:#FFC107; font-weight:700;">⚠️ Socio activo hasta el ${vence}. La renovación extenderá los días a partir de ese vencimiento.</span>`;
    } else {
        statusEl.innerHTML = '';
    }

    container.querySelector('#club-form-modal')?.classList.remove('hidden');
}

async function handleSubmitForm(e, container) {
    e.preventDefault();
    const name = container.querySelector('#club-name').value.trim();
    const phone = container.querySelector('#club-phone').value.trim();
    const type = container.querySelector('#club-type').value || 'paid';
    const tournamentName = container.querySelector('#club-tournament').value.trim();
    const amount = parseInt(container.querySelector('#club-amount').value, 10) || 0;
    const paymentMethod = container.querySelector('#club-payment-method').value;
    const notes = container.querySelector('#club-notes').value.trim();
    const daysMode = container.querySelector('#club-days').value;
    const customExpiry = container.querySelector('#club-custom-expiry').value;

    if (!name) {
        showToast({ message: 'El nombre es obligatorio', type: 'error' });
        return;
    }

    if (type === 'tournament_prize' && !tournamentName) {
        showToast({ message: 'Indica el nombre del torneo (ej: Torneo Rocket League 2v2)', type: 'error' });
        return;
    }

    const saveBtn = container.querySelector('#club-btn-save');
    const origText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Guardando...';

    try {
        let customer = currentMemberTarget;
        if (!customer || customer.name.toLowerCase() !== name.toLowerCase()) {
            const found = await customerService.findByName(name);
            if (found) {
                customer = found;
                if (phone && !customer.phone) {
                    await customerService.update(customer.id, { phone });
                }
            } else {
                customer = await customerService.create({ name, phone });
            }
        }

        const activeMembership = await customerService.getActiveMembership(customer.id);
        const days = daysMode === 'custom' ? null : parseInt(daysMode, 10) || 30;

        const payload = {
            customerId: customer.id,
            amount,
            type,
            tournamentName,
            paymentMethod,
            notes,
            days,
            customExpiresAt: daysMode === 'custom' && customExpiry ? customExpiry : null
        };

        if (activeMembership) {
            payload.previousExpiry = activeMembership.expires_at;
            await customerService.renewMembership(payload);
        } else {
            await customerService.registerMembership(payload);
        }

        showToast({ message: `✅ Membresía registrada con éxito para ${customer.name}`, type: 'success' });
        container.querySelector('#club-form-modal')?.classList.add('hidden');
        await reload(container);
    } catch (err) {
        console.error('[club] Error al guardar membresía:', err);
        showToast({ message: 'Error al registrar membresía: ' + err.message, type: 'error' });
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origText;
    }
}

// ============================================================
// HISTORIAL & AUDITORÍA DE MEMBRESÍAS CON EDICIÓN Y ANULACIÓN
// ============================================================
async function openHistoryModal(container, customerId) {
    const member = membersCache.find(m => m.id === customerId);
    if (!member) return;

    currentMemberTarget = member;
    container.querySelector('#club-history-title').textContent = `📋 ${member.name} — Historial & Auditoría`;

    const body = container.querySelector('#club-history-body');
    body.innerHTML = `<div class="page-loading" style="padding: 2rem;"><div class="pixel-spinner"></div><p>Cargando auditoría...</p></div>`;
    container.querySelector('#club-history-modal')?.classList.remove('hidden');

    try {
        const history = await customerService.getMembershipHistory(customerId);
        let totalPaidReal = 0;
        let tournamentCount = 0;

        history.forEach(h => {
            if (h.type !== 'tournament_prize' && h.amount > 0) {
                totalPaidReal += h.amount;
            } else if (h.type === 'tournament_prize') {
                tournamentCount++;
            }
        });

        if (history.length === 0) {
            body.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:2rem;">Sin membresías registradas.</p>`;
            return;
        }

        body.innerHTML = `
            <div class="clientes-stat-grid" style="margin-bottom:1rem;">
                <div class="stat-card stat-card--green">
                    <span class="stat-card__title">Cuotas Pagadas</span>
                    <span class="stat-card__value" style="color:var(--color-success);">${formatGs(totalPaidReal)}</span>
                </div>
                <div class="stat-card stat-card--cyan">
                    <span class="stat-card__title">Premios Torneo</span>
                    <span class="stat-card__value" style="color:#00F0FF;">${tournamentCount}</span>
                </div>
                <div class="stat-card stat-card--yellow">
                    <span class="stat-card__title">Total Ciclos</span>
                    <span class="stat-card__value">${history.length}</span>
                </div>
            </div>

            <h3 style="font-size:0.8rem; color:var(--color-primary); margin:0.75rem 0; font-family:var(--font-title);">📜 Registro Histórico</h3>
            <div class="club-history-list">
                ${history.map(h => {
                    const isTournament = h.type === 'tournament_prize';
                    const badge = isTournament
                        ? `<span class="badge--tournament">🏆 ${h.tournament_name || 'Torneo'}</span>`
                        : `<span class="badge--paid-membership">💳 Pago Regular</span>`;

                    const amountText = isTournament
                        ? `<span style="color:#00F0FF; font-weight:800; font-family:var(--font-mono);">0 Gs. (Premio)</span>`
                        : `<span style="color:var(--color-success); font-weight:800; font-family:var(--font-mono);">${formatGs(h.amount)}</span>`;

                    const startStr = new Date(h.paid_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                    const endStr = new Date(h.expires_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                    const isCurrent = new Date(h.expires_at) > new Date();

                    return `
                        <div class="club-history-row">
                            <div class="club-history-info">
                                <div style="display:flex; align-items:center; gap:0.5rem;">
                                    ${badge}
                                    ${amountText}
                                    <span class="badge badge--${isCurrent ? 'green' : 'gray'}" style="font-size:0.65rem;">${isCurrent ? 'VIGENTE' : 'FINALIZADO'}</span>
                                </div>
                                <div class="club-history-dates" style="margin-top:0.25rem;">
                                    📅 Desde: <strong>${startStr}</strong> → Hasta: <strong>${endStr}</strong>
                                    ${h.payment_method ? ` · Medio: ${h.payment_method}` : ''}
                                </div>
                                ${h.notes ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.2rem;">📝 ${h.notes}</div>` : ''}
                            </div>
                            <div class="club-history-actions">
                                <button class="btn btn--secondary btn-edit-mem" data-json="${encodeURIComponent(JSON.stringify(h))}" title="Editar / Corregir este registro" style="padding:0.35rem 0.6rem; font-size:0.75rem;">
                                    ✏️
                                </button>
                                <button class="btn btn--ghost btn-del-mem" data-id="${h.id}" title="Anular este registro" style="padding:0.35rem 0.6rem; font-size:0.75rem; color:var(--color-danger);">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // Bindings de edición y anulación
        body.querySelectorAll('.btn-edit-mem').forEach(btn => {
            btn.addEventListener('click', () => {
                const mem = JSON.parse(decodeURIComponent(btn.dataset.json));
                openEditMembershipModal(container, mem);
            });
        });

        body.querySelectorAll('.btn-del-mem').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('¿Seguro que deseas anular y eliminar este registro de membresía?')) {
                    try {
                        await customerService.deleteMembership(btn.dataset.id);
                        showToast({ message: '✅ Registro de membresía anulado', type: 'success' });
                        await reload(container);
                        openHistoryModal(container, customerId);
                    } catch (err) {
                        showToast({ message: 'Error al anular: ' + err.message, type: 'error' });
                    }
                }
            });
        });
    } catch (err) {
        body.innerHTML = `<p style="color:#FF5252; padding:1rem;">Error al cargar historial: ${err.message}</p>`;
    }
}

// ============================================================
// MODAL EDITAR MEMBRESÍA EXISTENTE
// ============================================================
function openEditMembershipModal(container, membership) {
    currentMembershipTarget = membership;
    const modal = container.querySelector('#club-edit-modal');
    if (!modal) return;

    container.querySelector('#edit-mem-id').value = membership.id;
    container.querySelector('#edit-mem-type').value = membership.type || 'paid';
    container.querySelector('#edit-mem-tournament').value = membership.tournament_name || '';
    container.querySelector('#edit-mem-amount').value = membership.amount || 0;
    container.querySelector('#edit-mem-payment').value = membership.payment_method || 'efectivo';
    container.querySelector('#edit-mem-notes').value = membership.notes || '';

    // Fechas en formato YYYY-MM-DD
    const paidDate = membership.paid_at ? new Date(membership.paid_at).toISOString().split('T')[0] : '';
    const expDate = membership.expires_at ? new Date(membership.expires_at).toISOString().split('T')[0] : '';
    container.querySelector('#edit-mem-paid-at').value = paidDate;
    container.querySelector('#edit-mem-expires-at').value = expDate;

    modal.classList.remove('hidden');
}

async function handleSaveEditMembership(e, container) {
    e.preventDefault();
    if (!currentMembershipTarget) return;

    const id = container.querySelector('#edit-mem-id').value;
    const type = container.querySelector('#edit-mem-type').value;
    const tournamentName = container.querySelector('#edit-mem-tournament').value.trim();
    const paidAt = container.querySelector('#edit-mem-paid-at').value;
    const expiresAt = container.querySelector('#edit-mem-expires-at').value;
    const amount = parseInt(container.querySelector('#edit-mem-amount').value, 10) || 0;
    const paymentMethod = container.querySelector('#edit-mem-payment').value;
    const notes = container.querySelector('#edit-mem-notes').value.trim();

    const saveBtn = container.querySelector('#btn-save-edit-mem');
    const origText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Guardando...';

    try {
        await customerService.updateMembership(id, {
            type,
            tournament_name: tournamentName,
            paid_at: paidAt,
            expires_at: expiresAt,
            amount,
            payment_method: paymentMethod,
            notes
        });

        showToast({ message: '✅ Membresía actualizada correctamente', type: 'success' });
        container.querySelector('#club-edit-modal')?.classList.add('hidden');
        await reload(container);
        if (currentMemberTarget) {
            openHistoryModal(container, currentMemberTarget.id);
        }
    } catch (err) {
        console.error('[club] Error al editar membresía:', err);
        showToast({ message: 'Error: ' + err.message, type: 'error' });
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origText;
    }
}

// ============================================================
// DAR DE BAJA SOCIO
// ============================================================
let revokeCustomerId = null;

function openRevokeModal(container, customerId, name) {
    revokeCustomerId = customerId;
    container.querySelector('#revoke-target-name').textContent = name;
    container.querySelector('#club-revoke-modal')?.classList.remove('hidden');
}

async function handleConfirmRevoke(container) {
    if (!revokeCustomerId) return;
    const btn = container.querySelector('#btn-confirm-revoke');
    btn.disabled = true;
    btn.innerHTML = '⏳ Procesando baja...';

    try {
        await customerService.revokeClubMembership(revokeCustomerId);
        showToast({ message: '✅ Socio dado de baja del Club Burgame', type: 'success' });
        container.querySelector('#club-revoke-modal')?.classList.add('hidden');
        revokeCustomerId = null;
        await reload(container);
    } catch (err) {
        showToast({ message: 'Error al dar de baja: ' + err.message, type: 'error' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Sí, Dar de Baja';
    }
}

// ============================================================
// WHATSAPP
// ============================================================
let activeWaMember = null;

function openWhatsAppModal(container, member) {
    activeWaMember = member;
    if (!member.phone) {
        showToast({ message: 'El socio no tiene número de teléfono registrado', type: 'error' });
        return;
    }
    container.querySelector('#club-wa-name').textContent = member.name;
    container.querySelector('#club-wa-modal')?.classList.remove('hidden');
}

function handleSendWhatsApp(container, tpl) {
    if (!activeWaMember || !activeWaMember.phone) return;

    let cleanPhone = activeWaMember.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('09')) cleanPhone = '595' + cleanPhone.substring(1);
    else if (cleanPhone.startsWith('9')) cleanPhone = '595' + cleanPhone;

    const name = activeWaMember.name || 'Socio';
    let text = '';

    if (tpl === 'tournament') {
        text = `¡Hola ${name}! 🍔🎮 ¡Felicitaciones de parte del equipo de *Burgame* por tu victoria en el torneo! Te confirmamos que tu membresía oficial al *Club Burgame* ya está activa. Podés disfrutar de tus beneficios y descuentos exclusivos en tu próxima visita. ¡Que sigan los éxitos! 🏆🔥`;
    } else if (tpl === 'renewal') {
        text = `¡Hola ${name}! 👑 Te escribimos desde el *Club Burgame* para recordarte que tu membresía está próxima a vencer. Si querés renovarla para seguir disfrutando de tus beneficios y descuentos VIP, avísanos por acá! 🍔✨`;
    } else {
        text = `¡Hola ${name}! 👑 ¡Te damos la bienvenida oficial al *Club Burgame*! Tu membresía ya se encuentra activa en el sistema para que disfrutes de todas nuestras burgers y beneficios exclusivos. ¡Nos vemos pronto en el arcade! 🍔🎮`;
    }

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    container.querySelector('#club-wa-modal')?.classList.add('hidden');
}

// ============================================================
// RECARGA GENERAL
// ============================================================
async function reload(container) {
    try {
        allStats = await customerService.getMembershipStats();
        membersCache = allStats.members || [];
        updateStatsUI(container);
        updatePillCounters(container);
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al recargar: ' + err.message, type: 'error' });
    }
}
