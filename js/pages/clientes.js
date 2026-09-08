import { customerService } from '../services/customer-service.js';
import { exportCustomersToExcel } from '../services/excel-export-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let allCustomers = [];      // Datos de tabla customers
let statsMap = {};           // Stats de compras por nombre (desde orders)
let enrichedCustomers = [];  // Clientes combinados con stats y RFM
let searchQuery = '';
let currentSegment = 'all';  // 'all' | 'club' | 'vip' | 'frequent' | 'new' | 'at_risk'
let sortField = 'total_spent';
let sortDir = 'desc';
let currentPage = 1;
const PAGE_SIZE = 12;

let pendingMerge = null;
let currentViewingCustomer = null;

export async function renderClientesPage() {
    const container = document.createElement('div');
    container.className = 'clientes-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>👥 MÓDULO DE CLIENTES & CRM</h1>
                <p>Inteligencia gastronómica 360°, segmentación RFM y fidelización de comensales</p>
            </div>
            <div class="clientes-header-actions">
                <button id="cli-btn-export" class="btn btn--secondary" title="Descargar reporte en Excel multi-hoja">
                    <i data-lucide="file-spreadsheet"></i> 📥 Exportar Excel
                </button>
                <button id="cli-btn-new" class="btn btn--primary">
                    <i data-lucide="user-plus"></i> ➕ Nuevo Cliente
                </button>
            </div>
        </header>

        <!-- KPI Dashboard RFM -->
        <div class="clientes-kpi-grid">
            <div class="clientes-kpi-card clientes-kpi-card--gold">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">Total Clientes</span>
                    <span class="clientes-kpi-icon">👥</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-total-cust">0</span>
                <span class="clientes-kpi-sub" id="kpi-active-sub">0 activos últimos 30d</span>
            </div>

            <div class="clientes-kpi-card clientes-kpi-card--purple">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">Club Burgame</span>
                    <span class="clientes-kpi-icon">👑</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-club-cust">0</span>
                <span class="clientes-kpi-sub" id="kpi-club-sub">Socios oficiales</span>
            </div>

            <div class="clientes-kpi-card clientes-kpi-card--cyan">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">VIP & Élite</span>
                    <span class="clientes-kpi-icon">💎</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-vip-cust">0</span>
                <span class="clientes-kpi-sub">Top spenders / recurrentes</span>
            </div>

            <div class="clientes-kpi-card clientes-kpi-card--red">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">En Riesgo</span>
                    <span class="clientes-kpi-icon">⚠️</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-risk-cust">0</span>
                <span class="clientes-kpi-sub">&gt; 40 días sin pedir</span>
            </div>

            <div class="clientes-kpi-card clientes-kpi-card--green">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">LTV Total Clientes</span>
                    <span class="clientes-kpi-icon">💰</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-total-ltv">Gs. 0</span>
                <span class="clientes-kpi-sub">Facturación acumulada</span>
            </div>

            <div class="clientes-kpi-card clientes-kpi-card--orange">
                <div class="clientes-kpi-header">
                    <span class="clientes-kpi-title">Ticket Promedio</span>
                    <span class="clientes-kpi-icon">🎯</span>
                </div>
                <span class="clientes-kpi-value" id="kpi-avg-ticket">Gs. 0</span>
                <span class="clientes-kpi-sub">Por orden de cliente</span>
            </div>
        </div>

        <!-- Segment Pills Navigation -->
        <div class="clientes-segment-pills" id="cli-pills">
            <button class="clientes-pill active" data-segment="all">
                <span>🌟 Todos</span>
                <span class="clientes-pill__count" id="pill-count-all">0</span>
            </button>
            <button class="clientes-pill" data-segment="club">
                <span>👑 Club Burgame</span>
                <span class="clientes-pill__count" id="pill-count-club">0</span>
            </button>
            <button class="clientes-pill" data-segment="vip">
                <span>💎 VIP Élite</span>
                <span class="clientes-pill__count" id="pill-count-vip">0</span>
            </button>
            <button class="clientes-pill" data-segment="frequent">
                <span>🔥 Habituales</span>
                <span class="clientes-pill__count" id="pill-count-frequent">0</span>
            </button>
            <button class="clientes-pill" data-segment="new">
                <span>🌱 Nuevos</span>
                <span class="clientes-pill__count" id="pill-count-new">0</span>
            </button>
            <button class="clientes-pill" data-segment="at_risk">
                <span>⚠️ En Riesgo</span>
                <span class="clientes-pill__count" id="pill-count-at_risk">0</span>
            </button>
        </div>

        <!-- Toolbar -->
        <div class="clientes-toolbar">
            <div class="clientes-search-wrap">
                <span class="clientes-search-icon">🔍</span>
                <input type="text" id="cli-search" placeholder="Buscar por nombre, teléfono, RUC o email...">
                <button type="button" id="cli-search-clear" class="clientes-search-clear">&times;</button>
            </div>

            <select id="cli-sort" class="clientes-sort-select">
                <option value="total_spent-desc">💰 Mayor LTV Gastado ↓</option>
                <option value="order_count-desc">📦 Más Pedidos Realizados ↓</option>
                <option value="last_order-desc">📅 Última Visita Reciente ↓</option>
                <option value="name-asc">🔤 Nombre (A - Z) ↑</option>
                <option value="name-desc">🔤 Nombre (Z - A) ↓</option>
            </select>
        </div>

        <!-- Tabla Enterprise -->
        <div class="clientes-table-card">
            <div class="clientes-table-wrap">
                <table class="clientes-table" id="cli-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-col="name">Cliente</th>
                            <th class="no-sort">Contacto / WhatsApp</th>
                            <th class="sortable" data-col="tier">Nivel Gamer</th>
                            <th class="sortable" data-col="order_count">Pedidos</th>
                            <th class="sortable" data-col="total_spent">Total Gastado (LTV)</th>
                            <th class="sortable" data-col="avg_ticket">Ticket Prom.</th>
                            <th class="sortable" data-col="last_order">Última Visita</th>
                            <th class="no-sort" style="text-align: right;">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="cli-table-body">
                        <tr>
                            <td colspan="8" class="clientes-empty">
                                <div class="page-loading" style="padding: 2rem;">
                                    <div class="pixel-spinner"></div>
                                    <p>Cargando clientes y analítica RFM...</p>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="clientes-pagination" id="cli-pagination"></div>
        </div>

        <!-- ============================================================
             MODAL FICHA 360° INTEGRAL DEL CLIENTE
             ============================================================ -->
        <div id="cli-modal-360" class="modal-overlay hidden">
            <div class="modal-card modal-card--360 card">
                <div class="modal-header">
                    <div class="ficha360-header">
                        <div class="ficha360-profile">
                            <div class="ficha360-avatar" id="f360-avatar">?</div>
                            <div>
                                <div class="ficha360-title" id="f360-name">Cliente</div>
                                <div style="display:flex; gap:0.4rem; align-items:center; margin-top:0.25rem;">
                                    <span class="ficha360-tier-badge" id="f360-tier-badge">BRONZE</span>
                                    <span class="badge" id="f360-segment-badge">SEGMENTO</span>
                                </div>
                            </div>
                        </div>
                        <div class="ficha360-actions">
                            <button id="f360-btn-wa" class="btn btn--secondary" style="border-color:#25D366; color:#25D366;">
                                💬 WhatsApp
                            </button>
                            <button id="f360-btn-edit" class="btn btn--secondary">
                                ✏️ Editar
                            </button>
                        </div>
                    </div>
                    <button class="btn-close" id="f360-btn-close">&times;</button>
                </div>

                <div class="ficha360-body" id="f360-body">
                    <!-- 4 Quick Stats -->
                    <div class="ficha360-stats-grid">
                        <div class="ficha360-stat-card">
                            <span class="ficha360-stat-card__title">LTV Gastado</span>
                            <span class="ficha360-stat-card__value" id="f360-stat-spent" style="color:var(--color-success);">Gs. 0</span>
                        </div>
                        <div class="ficha360-stat-card">
                            <span class="ficha360-stat-card__title">Total Pedidos</span>
                            <span class="ficha360-stat-card__value" id="f360-stat-orders">0</span>
                        </div>
                        <div class="ficha360-stat-card">
                            <span class="ficha360-stat-card__title">Ticket Promedio</span>
                            <span class="ficha360-stat-card__value" id="f360-stat-avg" style="color:var(--color-primary);">Gs. 0</span>
                        </div>
                        <div class="ficha360-stat-card">
                            <span class="ficha360-stat-card__title">Recencia</span>
                            <span class="ficha360-stat-card__value" id="f360-stat-recency">—</span>
                        </div>
                    </div>

                    <!-- Platos Favoritos -->
                    <div>
                        <div class="ficha360-section-title">🍔 Platos & Hamburguesas Favoritas</div>
                        <div class="ficha360-favorites-list" id="f360-favorites">
                            <p style="color:var(--text-muted); font-size:0.82rem;">Cargando preferencias del cliente...</p>
                        </div>
                    </div>

                    <!-- Datos de Contacto y Fiscales -->
                    <div>
                        <div class="ficha360-section-title">📋 Datos de Contacto & Facturación</div>
                        <div class="ficha360-data-grid">
                            <div class="ficha360-data-item">
                                <span class="ficha360-data-label">Teléfono Móvil</span>
                                <span class="ficha360-data-value" id="f360-val-phone">—</span>
                            </div>
                            <div class="ficha360-data-item">
                                <span class="ficha360-data-label">RUC / Cédula</span>
                                <span class="ficha360-data-value" id="f360-val-tax">—</span>
                            </div>
                            <div class="ficha360-data-item">
                                <span class="ficha360-data-label">Dirección Habitual</span>
                                <span class="ficha360-data-value" id="f360-val-address">—</span>
                            </div>
                            <div class="ficha360-data-item">
                                <span class="ficha360-data-label">Cumpleaños</span>
                                <span class="ficha360-data-value" id="f360-val-birthday">—</span>
                            </div>
                            <div class="ficha360-data-item" style="grid-column: 1 / -1;">
                                <span class="ficha360-data-label">Notas & Preferencias</span>
                                <span class="ficha360-data-value" id="f360-val-notes">—</span>
                            </div>
                        </div>
                    </div>

                    <!-- Estado Club Burgame -->
                    <div class="ficha360-club-card" id="f360-club-box">
                        <div>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <span style="font-size:1.2rem;">👑</span>
                                <strong style="color:var(--color-primary); font-size:0.9rem;">Club Burgame</strong>
                                <span id="f360-club-status-badge" class="badge">ESTADO</span>
                            </div>
                            <p id="f360-club-desc" style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem;">
                                Membresía exclusiva con descuentos y regalos de la casa.
                            </p>
                        </div>
                        <button id="f360-btn-club-action" class="btn btn--primary" style="font-size:0.78rem; padding:0.4rem 0.8rem;">
                            👑 Renovar Membresía
                        </button>
                    </div>

                    <!-- Historial de Pedidos -->
                    <div>
                        <div class="ficha360-section-title">📜 Historial de Pedidos Detallado</div>
                        <div class="ficha360-orders-list" id="f360-orders-list">
                            <p style="color:var(--text-muted); font-size:0.82rem;">Cargando historial...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ============================================================
             MODAL WHATSAPP QUICK TEMPLATES
             ============================================================ -->
        <div id="cli-modal-wa" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>💬 Enviar WhatsApp</h2>
                    <button id="cli-btn-close-wa" class="btn-close">&times;</button>
                </div>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
                    Selecciona una plantilla para enviar a <strong id="wa-target-name" style="color:var(--text-main);"></strong>:
                </p>
                <div class="whatsapp-templates-menu">
                    <button class="btn-whatsapp-template" data-tpl="thanks">
                        <strong style="color:#25D366;">🍔 Agradecimiento & Seguimiento</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Hola! Te escribimos desde Burgame Burgers. Queríamos saber si disfrutaste tu último pedido..."
                        </p>
                    </button>
                    <button class="btn-whatsapp-template" data-tpl="reactivation">
                        <strong style="color:#FF9100;">🎁 Promo Reactivación (Te Extrañamos)</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Hola! En Burgame te extrañamos. Tenés un beneficio de 10% OFF en tu próxima burger..."
                        </p>
                    </button>
                    <button class="btn-whatsapp-template" data-tpl="club">
                        <strong style="color:#FFD700;">👑 Recordatorio Club Burgame</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            "¡Hola! Te recordamos el estado de tus beneficios en el Club Burgame..."
                        </p>
                    </button>
                    <button class="btn-whatsapp-template" data-tpl="custom">
                        <strong style="color:#00F0FF;">💬 Chat Libre / Personalizado</strong>
                        <p style="color:var(--text-muted); font-size:0.75rem; margin-top:0.2rem;">
                            Abrir WhatsApp directamente para escribir un mensaje personalizado.
                        </p>
                    </button>
                </div>
            </div>
        </div>

        <!-- ============================================================
             MODAL CRUD: CREAR / EDITAR CLIENTE
             ============================================================ -->
        <div id="cli-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 580px;">
                <div class="modal-header">
                    <h2 id="cli-modal-title">➕ Nuevo Cliente</h2>
                    <button id="cli-btn-close-modal" class="btn-close">&times;</button>
                </div>
                <form id="cli-form">
                    <input type="hidden" id="cli-id">
                    
                    <div class="clientes-form-grid">
                        <div class="form-group">
                            <label>Nombre / Razón Social *</label>
                            <input type="text" id="cli-name" required maxlength="100" placeholder="Ej: Kevin Moraes, Mesa 4...">
                        </div>
                        <div class="form-group">
                            <label>Teléfono Móvil (WhatsApp)</label>
                            <input type="text" id="cli-phone" maxlength="30" placeholder="Ej: 0981 234 567">
                        </div>
                        <div class="form-group">
                            <label>RUC / Cédula de Identidad</label>
                            <input type="text" id="cli-tax" maxlength="30" placeholder="Ej: 4567890-1 o CI">
                        </div>
                        <div class="form-group">
                            <label>Dirección Habitual (Delivery)</label>
                            <input type="text" id="cli-address" maxlength="150" placeholder="Calle, número, barrio...">
                        </div>
                        <div class="form-group">
                            <label>Email (Opcional)</label>
                            <input type="email" id="cli-email" maxlength="80" placeholder="cliente@correo.com">
                        </div>
                        <div class="form-group">
                            <label>Fecha de Cumpleaños</label>
                            <input type="date" id="cli-birthday">
                        </div>
                        <div class="form-group clientes-form-full">
                            <label>Notas, Alergias y Preferencias</label>
                            <textarea id="cli-notes" maxlength="500" placeholder="Ej: Alérgico a mayonesa, prefiere pan extra tostado..."></textarea>
                        </div>
                        <div class="form-group clientes-form-full" style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,215,0,0.06); border:1px solid rgba(255,215,0,0.25); padding:0.75rem 1rem; border-radius:var(--radius-sm);">
                            <div>
                                <label for="cli-club" style="margin:0; font-size:0.85rem; font-weight:800; color:var(--color-primary); cursor:pointer;">
                                    👑 Miembro Oficial del Club Burgame
                                </label>
                                <p style="font-size:0.72rem; color:var(--text-muted); margin-top:0.2rem;">
                                    Habilita descuentos exclusivos de socio en el Punto de Venta (POS).
                                </p>
                            </div>
                            <input type="checkbox" id="cli-club" style="accent-color:#FFD700; width:20px; height:20px; cursor:pointer;">
                        </div>
                    </div>

                    <div style="display:flex; gap:0.75rem; margin-top:1.25rem;">
                        <button type="submit" class="btn btn--primary btn--block" id="cli-btn-save">💾 Guardar Cliente</button>
                        <button type="button" class="btn btn--secondary" id="cli-btn-cancel">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal Confirmar Eliminar -->
        <div id="cli-delete-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 420px;">
                <div class="modal-header">
                    <h2>🗑️ Eliminar Cliente</h2>
                </div>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.9rem;">
                    ¿Seguro que deseas eliminar a <strong id="cli-delete-name" style="color: var(--text-main);"></strong>?<br>
                    <span style="color: var(--color-danger); font-size: 0.8rem;">Esta acción eliminará el registro de contacto permanente.</span>
                </p>
                <div style="display:flex; gap:0.75rem;">
                    <button class="btn btn--danger btn--block" id="cli-btn-confirm-delete">Sí, Eliminar</button>
                    <button class="btn btn--secondary" id="cli-btn-cancel-delete">Cancelar</button>
                </div>
            </div>
        </div>

        <!-- Modal Fusionar Duplicado -->
        <div id="cli-merge-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>🔀 Cliente Ya Existente</h2>
                </div>
                <div id="cli-merge-body" style="margin-bottom: 1.5rem;"></div>
                <div style="display:flex; gap:0.75rem;">
                    <button type="button" class="btn btn--primary btn--block" id="cli-btn-confirm-merge">✅ Sí, Fusionar</button>
                    <button type="button" class="btn btn--secondary" id="cli-btn-cancel-merge">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    await loadClientesData(container);
    return container;
}

// ============================================================
// CARGA Y ENRIQUECIMIENTO DE DATOS
// ============================================================
async function loadClientesData(container) {
    try {
        const [customersData, statsData] = await Promise.all([
            customerService.getAll(),
            customerService.getStatsByName().catch(err => {
                console.warn('[clientes] Error al traer stats de compras:', err);
                return {};
            })
        ]);

        allCustomers = customersData || [];
        statsMap = statsData || {};

        enrichData();
        renderKPIs(container);
        renderPillCounters(container);
        refreshTable(container);
        setupEvents(container);

        if (window.lucide) window.lucide.createIcons();
    } catch (err) {
        console.error('[clientes] Error al inicializar módulo:', err);
        showToast({ message: 'Error al cargar clientes: ' + err.message, type: 'error' });
    }
}

function enrichData() {
    enrichedCustomers = allCustomers.map(c => {
        const key = (c.name || '').trim();
        const stats = statsMap[key] || statsMap[key.toLowerCase()] || {};
        const totalSpent = stats.total_spent || 0;
        const orderCount = stats.order_count || 0;
        const avgTicket = orderCount > 0 ? Math.round(totalSpent / orderCount) : 0;
        const lastOrder = stats.last_order || c.last_order_at || null;

        const tier = customerService.calculateCustomerTier(totalSpent, orderCount);
        const segment = customerService.getCustomerSegment(c, {
            total_spent: totalSpent,
            order_count: orderCount,
            last_order: lastOrder
        });

        let daysSinceLast = null;
        if (lastOrder) {
            daysSinceLast = Math.floor((Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
            ...c,
            total_spent: totalSpent,
            order_count: orderCount,
            avg_ticket: avgTicket,
            last_order: lastOrder,
            days_since_last: daysSinceLast,
            tierId: tier.id,
            tierName: tier.name,
            tierIcon: tier.icon,
            tierColor: tier.color,
            segmentId: segment.id,
            segmentLabel: segment.label,
            segmentClass: segment.badgeClass,
            segmentIcon: segment.icon
        };
    });
}

// ============================================================
// KPIS & CONTADORES
// ============================================================
function renderKPIs(container) {
    const totalCust = enrichedCustomers.length;
    let active30d = 0;
    let clubCount = 0;
    let vipCount = 0;
    let riskCount = 0;
    let totalLTV = 0;
    let totalOrders = 0;

    enrichedCustomers.forEach(c => {
        if (c.is_club_member) clubCount++;
        if (c.segmentId === 'vip') vipCount++;
        if (c.segmentId === 'at_risk') riskCount++;
        if (c.days_since_last !== null && c.days_since_last <= 30) active30d++;
        totalLTV += c.total_spent;
        totalOrders += c.order_count;
    });

    const avgTicket = totalOrders > 0 ? Math.round(totalLTV / totalOrders) : 0;

    const setText = (id, text) => {
        const el = container.querySelector(id);
        if (el) el.textContent = text;
    };

    setText('#kpi-total-cust', totalCust);
    setText('#kpi-active-sub', `${active30d} activos últimos 30d`);
    setText('#kpi-club-cust', clubCount);
    setText('#kpi-vip-cust', vipCount);
    setText('#kpi-risk-cust', riskCount);
    setText('#kpi-total-ltv', formatGs(totalLTV));
    setText('#kpi-avg-ticket', formatGs(avgTicket));
}

function renderPillCounters(container) {
    const counts = {
        all: enrichedCustomers.length,
        club: 0,
        vip: 0,
        frequent: 0,
        new: 0,
        at_risk: 0
    };

    enrichedCustomers.forEach(c => {
        if (counts[c.segmentId] !== undefined) {
            counts[c.segmentId]++;
        }
    });

    Object.keys(counts).forEach(k => {
        const el = container.querySelector(`#pill-count-${k}`);
        if (el) el.textContent = counts[k];
    });
}

// ============================================================
// FILTRADO Y ORDENAMIENTO
// ============================================================
function getFiltered() {
    let list = [...enrichedCustomers];

    // 1. Filtro de Segmento RFM
    if (currentSegment !== 'all') {
        list = list.filter(c => c.segmentId === currentSegment);
    }

    // 2. Buscador de texto
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        list = list.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.tax_id || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q) ||
            (c.address || '').toLowerCase().includes(q)
        );
    }

    // 3. Ordenamiento
    list.sort((a, b) => {
        let valA, valB;

        if (sortField === 'name') {
            valA = (a.name || '').toLowerCase();
            valB = (b.name || '').toLowerCase();
            return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (sortField === 'last_order') {
            valA = new Date(a.last_order || 0).getTime();
            valB = new Date(b.last_order || 0).getTime();
        } else if (sortField === 'tier') {
            const tierRank = { diamond: 4, gold: 3, silver: 2, bronze: 1 };
            valA = tierRank[a.tierId] || 0;
            valB = tierRank[b.tierId] || 0;
        } else {
            valA = a[sortField] || 0;
            valB = b[sortField] || 0;
        }

        return sortDir === 'desc' ? valB - valA : valA - valB;
    });

    return list;
}

// ============================================================
// RENDER TABLA & PAGINACIÓN
// ============================================================
function refreshTable(container) {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    // Headers de orden
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
            <tr>
                <td colspan="8" class="clientes-empty">
                    <div class="empty-icon" style="font-size:2.5rem; margin-bottom:0.5rem;">👥</div>
                    <p style="font-weight:700; color:var(--text-main);">No se encontraron clientes</p>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
                        ${searchQuery ? `Prueba con otros términos en la búsqueda.` : `No hay clientes en el segmento seleccionado.`}
                    </p>
                </td>
            </tr>
        `;
        renderPagination(container, 0, 0, 0);
        return;
    }

    tbody.innerHTML = pageItems.map(c => {
        const lastVisitStr = c.last_order
            ? new Date(c.last_order).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })
            : '<span style="color:var(--text-dim);">Sin pedidos</span>';

        const recencyBadge = c.days_since_last !== null
            ? (c.days_since_last > 40
                ? `<span style="color:var(--color-danger); font-size:0.72rem; display:block;">⚠️ Hace ${c.days_since_last}d</span>`
                : `<span style="color:var(--text-muted); font-size:0.72rem; display:block;">Hace ${c.days_since_last === 0 ? 'hoy' : c.days_since_last + 'd'}</span>`)
            : '';

        const initial = (c.name || '?').charAt(0).toUpperCase();

        const phoneDisplay = c.phone ? `
            <div class="cliente-phone-cell">
                <button class="btn-whatsapp-quick btn-wa-direct" data-phone="${c.phone}" data-name="${c.name}" title="Abrir WhatsApp directo">
                    💬
                </button>
                <span class="cliente-phone-text">${c.phone}</span>
            </div>
        ` : '<span style="color:var(--text-dim); font-size:0.8rem;">—</span>';

        const taxBadge = c.tax_id ? `<span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-muted);">RUC: ${c.tax_id}</span>` : '';

        return `
            <tr>
                <td>
                    <div class="cliente-identity">
                        <div class="cliente-avatar-wrap">
                            <span class="cliente-avatar cliente-avatar--${c.tierId}" title="${c.tierName}">
                                ${initial}
                            </span>
                        </div>
                        <div class="cliente-details">
                            <div class="cliente-name-row btn-view-360" data-id="${c.id}">
                                <span>${c.name}</span>
                                <span class="${c.segmentClass}" title="Segmento RFM">${c.segmentIcon} ${c.segmentLabel}</span>
                            </div>
                            <div class="cliente-meta-row">
                                ${taxBadge}
                                ${c.address ? `<span style="font-size:0.7rem; color:var(--text-muted); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${c.address}">📍 ${c.address}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </td>
                <td>${phoneDisplay}</td>
                <td>
                    <span style="color:${c.tierColor}; font-weight:800; font-size:0.75rem; font-family:var(--font-title); letter-spacing:0.5px;">
                        ${c.tierIcon} ${c.tierId.toUpperCase()}
                    </span>
                </td>
                <td style="font-family:var(--font-mono); font-weight:700; font-size:0.9rem;">
                    ${c.order_count}
                </td>
                <td style="font-family:var(--font-mono); font-weight:800; font-size:0.92rem; color:var(--color-success);">
                    ${formatGs(c.total_spent)}
                </td>
                <td style="font-family:var(--font-mono); font-weight:600; font-size:0.85rem; color:var(--text-muted);">
                    ${formatGs(c.avg_ticket)}
                </td>
                <td>
                    <span style="font-size:0.82rem; font-weight:600;">${lastVisitStr}</span>
                    ${recencyBadge}
                </td>
                <td>
                    <div class="cliente-actions">
                        <button class="btn btn--primary btn-view-360" data-id="${c.id}" title="Ver Ficha 360°">
                            👁️ 360°
                        </button>
                        <button class="btn btn--secondary btn-cli-edit" data-id="${c.id}" title="Editar">
                            ✏️
                        </button>
                        <button class="btn btn--ghost btn-cli-delete" data-id="${c.id}" data-name="${c.name}" title="Eliminar">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Bindings de filas
    tbody.querySelectorAll('.btn-view-360').forEach(btn => {
        btn.addEventListener('click', () => {
            const customer = enrichedCustomers.find(c => c.id === btn.dataset.id);
            if (customer) openFicha360(container, customer);
        });
    });

    tbody.querySelectorAll('.btn-wa-direct').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const phone = btn.dataset.phone;
            const name = btn.dataset.name;
            openWhatsAppModal(container, { phone, name });
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
            Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${totalItems}</strong> clientes
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
// EVENTOS PRINCIPALES
// ============================================================
function setupEvents(container) {
    // Segment Pills
    container.querySelectorAll('.clientes-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            container.querySelectorAll('.clientes-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentSegment = pill.dataset.segment;
            currentPage = 1;
            refreshTable(container);
        });
    });

    // Búsqueda
    const searchInput = container.querySelector('#cli-search');
    const searchClear = container.querySelector('#cli-search-clear');
    searchInput?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        if (searchClear) searchClear.style.display = searchQuery ? 'block' : 'none';
        currentPage = 1;
        refreshTable(container);
    });

    searchClear?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        searchClear.style.display = 'none';
        currentPage = 1;
        refreshTable(container);
    });

    // Ordenamiento Select
    container.querySelector('#cli-sort')?.addEventListener('change', (e) => {
        const [field, dir] = e.target.value.split('-');
        sortField = field;
        sortDir = dir;
        refreshTable(container);
    });

    // Ordenar clic en columnas de tabla
    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (sortField === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                sortField = col;
                sortDir = 'desc';
            }
            refreshTable(container);
        });
    });

    // Botón Exportar Excel Multi-Hoja
    container.querySelector('#cli-btn-export')?.addEventListener('click', async () => {
        const btn = container.querySelector('#cli-btn-export');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Exportando...';
        try {
            await exportCustomersToExcel(enrichedCustomers);
            showToast({ message: '✅ Reporte Excel descargado con éxito', type: 'success' });
        } catch (err) {
            console.error('[clientes] Error al exportar Excel:', err);
            showToast({ message: 'Error al exportar: ' + err.message, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    // Botón Nuevo Cliente
    container.querySelector('#cli-btn-new')?.addEventListener('click', () => openFormModal(container, null));

    // Modales Close Overlays
    container.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Modal Formulario CRUD
    container.querySelector('#cli-btn-close-modal')?.addEventListener('click', () => closeFormModal(container));
    container.querySelector('#cli-btn-cancel')?.addEventListener('click', () => closeFormModal(container));
    container.querySelector('#cli-form')?.addEventListener('submit', (e) => handleSubmitForm(e, container));

    // Modal Ficha 360°
    container.querySelector('#f360-btn-close')?.addEventListener('click', () => {
        container.querySelector('#cli-modal-360')?.classList.add('hidden');
    });

    container.querySelector('#f360-btn-edit')?.addEventListener('click', () => {
        if (currentViewingCustomer) {
            container.querySelector('#cli-modal-360')?.classList.add('hidden');
            const original = allCustomers.find(c => c.id === currentViewingCustomer.id);
            openFormModal(container, original || currentViewingCustomer);
        }
    });

    container.querySelector('#f360-btn-wa')?.addEventListener('click', () => {
        if (currentViewingCustomer) {
            openWhatsAppModal(container, currentViewingCustomer);
        }
    });

    // Modal WhatsApp
    container.querySelector('#cli-btn-close-wa')?.addEventListener('click', () => {
        container.querySelector('#cli-modal-wa')?.classList.add('hidden');
    });

    container.querySelectorAll('.btn-whatsapp-template').forEach(btn => {
        btn.addEventListener('click', () => {
            handleSendWhatsApp(container, btn.dataset.tpl);
        });
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
}

// ============================================================
// FICHA 360° INTEGRAL DEL CLIENTE
// ============================================================
async function openFicha360(container, customer) {
    currentViewingCustomer = customer;
    const modal = container.querySelector('#cli-modal-360');
    if (!modal) return;

    // Rellenar Header
    container.querySelector('#f360-avatar').textContent = (customer.name || '?').charAt(0).toUpperCase();
    container.querySelector('#f360-avatar').className = `ficha360-avatar cliente-avatar--${customer.tierId}`;
    container.querySelector('#f360-name').textContent = customer.name;
    
    const tierBadge = container.querySelector('#f360-tier-badge');
    tierBadge.textContent = `${customer.tierIcon} ${customer.tierName}`;
    tierBadge.style.color = customer.tierColor;
    tierBadge.style.background = `rgba(255, 255, 255, 0.06)`;
    tierBadge.style.border = `1px solid ${customer.tierColor}`;

    const segBadge = container.querySelector('#f360-segment-badge');
    segBadge.className = `badge ${customer.segmentClass}`;
    segBadge.textContent = `${customer.segmentIcon} ${customer.segmentLabel}`;

    // Rellenar 4 Quick Stats
    container.querySelector('#f360-stat-spent').textContent = formatGs(customer.total_spent);
    container.querySelector('#f360-stat-orders').textContent = customer.order_count;
    container.querySelector('#f360-stat-avg').textContent = formatGs(customer.avg_ticket);
    container.querySelector('#f360-stat-recency').textContent = customer.days_since_last !== null
        ? (customer.days_since_last === 0 ? 'Hoy' : `Hace ${customer.days_since_last} días`)
        : 'Sin visitas';

    // Rellenar Datos Fiscales y Contacto
    container.querySelector('#f360-val-phone').textContent = customer.phone || 'No registrado';
    container.querySelector('#f360-val-tax').textContent = customer.tax_id || 'Sin RUC / CI';
    container.querySelector('#f360-val-address').textContent = customer.address || 'Sin dirección registrada';
    container.querySelector('#f360-val-birthday').textContent = customer.birthday ? formatFriendlyDate(customer.birthday) : 'No registrada';
    container.querySelector('#f360-val-notes').textContent = customer.notes || 'Ninguna observación especial';

    // Rellenar Club Burgame Box
    const clubStatusBadge = container.querySelector('#f360-club-status-badge');
    const clubDesc = container.querySelector('#f360-club-desc');
    const clubActionBtn = container.querySelector('#f360-btn-club-action');

    if (customer.is_club_member) {
        clubStatusBadge.className = 'badge badge--yellow';
        clubStatusBadge.textContent = '👑 SOCIO ACTIVO';
        clubDesc.textContent = 'Cliente con membresía oficial del Club Burgame (Descuentos y beneficios VIP activos).';
        clubActionBtn.textContent = '🔄 Renovar Cuota Club';
    } else {
        clubStatusBadge.className = 'badge';
        clubStatusBadge.textContent = 'NO ES SOCIO';
        clubDesc.textContent = 'No está registrado como socio del Club Burgame (70.000 Gs. / 30 días).';
        clubActionBtn.textContent = '👑 Dar de Alta en Club';
    }

    clubActionBtn.onclick = async () => {
        try {
            clubActionBtn.disabled = true;
            clubActionBtn.textContent = '⏳ Registrando...';
            if (customer.is_club_member) {
                await customerService.renewMembership({ customerId: customer.id, amount: 70000 });
                showToast({ message: `✅ Membresía del Club renovada para ${customer.name}`, type: 'success' });
            } else {
                await customerService.registerMembership({ customerId: customer.id, amount: 70000 });
                showToast({ message: `✅ ${customer.name} ahora es Socio oficial del Club Burgame`, type: 'success' });
            }
            modal.classList.add('hidden');
            await reload(container);
        } catch (err) {
            showToast({ message: 'Error en membresía: ' + err.message, type: 'error' });
        } finally {
            clubActionBtn.disabled = false;
        }
    };

    modal.classList.remove('hidden');

    // Cargar en segundo plano las órdenes con items para los Platos Favoritos
    const favsContainer = container.querySelector('#f360-favorites');
    const ordersContainer = container.querySelector('#f360-orders-list');
    favsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">⏳ Analizando consumo...</p>';
    ordersContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">⏳ Cargando pedidos...</p>';

    try {
        const ordersWithItems = await customerService.getCustomerOrdersWithItems(customer.name);
        const favoriteProducts = customerService.getCustomerFavoriteProducts(ordersWithItems);

        // Render Favoritos
        if (favoriteProducts.length === 0) {
            favsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">No hay productos registrados en sus pedidos.</p>';
        } else {
            favsContainer.innerHTML = favoriteProducts.slice(0, 6).map(f => `
                <div class="favorite-item-card">
                    <div class="favorite-item-info">
                        <span class="favorite-item-name">${f.name}</span>
                        ${f.customizations.length > 0 ? `<span class="favorite-item-customizations">📝 ${f.customizations.join(', ')}</span>` : ''}
                    </div>
                    <span class="favorite-item-badge">x${f.quantity}</span>
                </div>
            `).join('');
        }

        // Render Pedidos
        if (ordersWithItems.length === 0) {
            ordersContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.82rem;">No hay pedidos registrados.</p>';
        } else {
            ordersContainer.innerHTML = ordersWithItems.slice(0, 15).map(o => {
                const dateStr = new Date(o.created_at).toLocaleString('es-PY', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                });
                const isPaid = o.paid_at || o.status === 'paid' || o.status === 'delivered';
                const statusBadge = isPaid
                    ? `<span class="badge badge--green" style="font-size:0.7rem;">COBRADO</span>`
                    : (o.status === 'cancelled'
                        ? `<span class="badge badge--red" style="font-size:0.7rem;">CANCELADO</span>`
                        : `<span class="badge badge--yellow" style="font-size:0.7rem;">${o.status.toUpperCase()}</span>`);

                const itemsHtml = (o.order_items && o.order_items.length > 0)
                    ? o.order_items.map(item => `
                        <div class="ficha360-order-prod-row">
                            <span>${item.quantity}x ${item.product_name}</span>
                            <span style="font-family:var(--font-mono); color:var(--text-muted);">${formatGs(item.price * item.quantity)}</span>
                        </div>
                    `).join('')
                    : '<div style="color:var(--text-dim); font-size:0.75rem;">Sin desglose de items</div>';

                return `
                    <div class="ficha360-order-item">
                        <div class="ficha360-order-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <strong style="font-family:var(--font-mono); color:var(--color-primary);">#${o.order_number || '—'}</strong>
                                <span style="font-size:0.78rem; color:var(--text-muted);">${dateStr}</span>
                                ${statusBadge}
                            </div>
                            <div style="display:flex; align-items:center; gap:0.75rem;">
                                <span style="font-family:var(--font-mono); font-weight:800; color:var(--color-success);">${formatGs(o.total)}</span>
                                <span style="font-size:0.75rem; color:var(--text-muted);">▼</span>
                            </div>
                        </div>
                        <div class="ficha360-order-details hidden">
                            ${itemsHtml}
                            ${o.notes ? `<div style="font-size:0.75rem; color:var(--color-primary); margin-top:0.25rem;">📝 ${o.notes}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error('[clientes] Error al traer detalle de órdenes 360:', err);
        favsContainer.innerHTML = '<p style="color:var(--color-danger); font-size:0.8rem;">No se pudieron cargar los favoritos.</p>';
        ordersContainer.innerHTML = '<p style="color:var(--color-danger); font-size:0.8rem;">No se pudo cargar el historial.</p>';
    }
}

// ============================================================
// WHATSAPP MARKETING & CONTACTO 1-CLIC
// ============================================================
let activeWaTarget = null;

function openWhatsAppModal(container, target) {
    activeWaTarget = target;
    const modal = container.querySelector('#cli-modal-wa');
    if (!modal) return;

    container.querySelector('#wa-target-name').textContent = target.name || 'Cliente';
    modal.classList.remove('hidden');
}

function handleSendWhatsApp(container, templateType) {
    if (!activeWaTarget || !activeWaTarget.phone) {
        showToast({ message: 'El cliente no tiene un teléfono registrado', type: 'error' });
        return;
    }

    // Normalizar número telefónico para Paraguay
    let cleanPhone = activeWaTarget.phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('09')) {
        cleanPhone = '595' + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith('9')) {
        cleanPhone = '595' + cleanPhone;
    }

    const name = activeWaTarget.name || 'amigo/a';
    let text = '';

    switch (templateType) {
        case 'thanks':
            text = `¡Hola ${name}! 🍔 Te escribimos desde *Burgame Burgers*. Queríamos agradecerte por tu preferencia y saber si disfrutaste todo en tu última visita. ¡Estamos a tus órdenes para lo que se te antoje! 🎮🔥`;
            break;
        case 'reactivation':
            text = `¡Hola ${name}! 🍔🎮 En *Burgame* te extrañamos. Queremos invitarte a revivir el juego con un *10% OFF exclusivo* en tu próxima burger favorita. ¿Te preparamos algo rico hoy? 🍟`;
            break;
        case 'club':
            text = `¡Hola ${name}! 👑 Te escribimos desde el *Club Burgame*. Queríamos recordarte el estado de tus beneficios y promociones exclusivas para socios. ¡Avísanos y te asesoramos al instante! 🍔✨`;
            break;
        case 'custom':
        default:
            text = `¡Hola ${name}! Te escribimos desde *Burgame Burgers* 🍔🎮: `;
            break;
    }

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    container.querySelector('#cli-modal-wa')?.classList.add('hidden');
}

// ============================================================
// FORMULARIO CRUD
// ============================================================
function openFormModal(container, customer) {
    const modal = container.querySelector('#cli-modal');
    if (!modal) return;

    const isEdit = !!customer;
    container.querySelector('#cli-modal-title').textContent = isEdit ? '✏️ Editar Cliente' : '➕ Nuevo Cliente';
    container.querySelector('#cli-id').value = isEdit ? customer.id : '';
    container.querySelector('#cli-name').value = isEdit ? customer.name : '';
    container.querySelector('#cli-phone').value = isEdit ? (customer.phone || '') : '';
    container.querySelector('#cli-tax').value = isEdit ? (customer.tax_id || '') : '';
    container.querySelector('#cli-address').value = isEdit ? (customer.address || '') : '';
    container.querySelector('#cli-email').value = isEdit ? (customer.email || '') : '';
    container.querySelector('#cli-birthday').value = isEdit ? (customer.birthday || '') : '';
    container.querySelector('#cli-notes').value = isEdit ? (customer.notes || '') : '';
    
    const clubCheck = container.querySelector('#cli-club');
    if (clubCheck) clubCheck.checked = isEdit ? !!customer.is_club_member : false;

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
    const taxId = container.querySelector('#cli-tax').value.trim();
    const address = container.querySelector('#cli-address').value.trim();
    const email = container.querySelector('#cli-email').value.trim();
    const birthday = container.querySelector('#cli-birthday').value;
    const notes = container.querySelector('#cli-notes').value.trim();
    const isClubMember = !!(container.querySelector('#cli-club')?.checked);

    if (!name) {
        showToast({ message: 'El nombre es obligatorio', type: 'error' });
        return;
    }

    const saveBtn = container.querySelector('#cli-btn-save');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Guardando...';

    const customerPayload = {
        name,
        phone,
        tax_id: taxId,
        address,
        email,
        birthday,
        notes,
        is_club_member: isClubMember
    };

    try {
        if (id) {
            // Verificar si el nombre cambió a uno ya existente
            const currentObj = allCustomers.find(c => c.id === id);
            if (name !== currentObj?.name) {
                const existing = await customerService.findByName(name);
                if (existing && existing.id !== id) {
                    pendingMerge = {
                        mode: 'edit-rename',
                        existingId: existing.id,
                        currentId: id,
                        payload: customerPayload
                    };
                    closeFormModal(container);
                    openMergeModal(container, existing, customerPayload);
                    return;
                }
            }
            await customerService.update(id, customerPayload);
            showToast({ message: `✅ Cliente "${name}" actualizado`, type: 'success' });
        } else {
            const existing = await customerService.findByName(name);
            if (existing) {
                pendingMerge = {
                    mode: 'create',
                    existingId: existing.id,
                    payload: customerPayload
                };
                closeFormModal(container);
                openMergeModal(container, existing, customerPayload);
                return;
            }
            await customerService.create(customerPayload);
            showToast({ message: `✅ Cliente "${name}" registrado`, type: 'success' });
        }

        closeFormModal(container);
        await reload(container);
    } catch (err) {
        console.error('[clientes] Error al guardar cliente:', err);
        showToast({ message: 'Error: ' + err.message, type: 'error' });
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// ============================================================
// MODAL FUSIONAR DUPLICADO
// ============================================================
function openMergeModal(container, existing, payload) {
    const modal = container.querySelector('#cli-merge-modal');
    if (!modal) return;

    container.querySelector('#cli-merge-body').innerHTML = `
        <p style="color: var(--text-main); margin-bottom: 1rem;">
            Ya existe un cliente registrado con el nombre <strong style="color: var(--color-primary);">${existing.name}</strong>.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
            <div style="padding: 0.8rem; background: var(--bg-elevated); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted);">Existente</span>
                <p style="font-weight: 700; margin-top: 0.3rem;">${existing.name}</p>
                <p style="font-size: 0.8rem; color: var(--text-muted);">${existing.phone || 'Sin teléfono'}</p>
            </div>
            <div style="padding: 0.8rem; background: var(--bg-elevated); border-radius: var(--radius-sm); border: 1px solid var(--color-primary);">
                <span style="font-size: 0.72rem; text-transform: uppercase; color: var(--color-primary);">Nuevo</span>
                <p style="font-weight: 700; margin-top: 0.3rem;">${payload.name}</p>
                <p style="font-size: 0.8rem; color: var(--text-muted);">${payload.phone || 'Sin teléfono'}</p>
            </div>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted);">
            Al fusionar se combinarán los datos de contacto y se unificarán todos los pedidos en un solo perfil.
        </p>
    `;

    modal.classList.remove('hidden');
}

async function handleMerge(container) {
    if (!pendingMerge) return;
    const mergeBtn = container.querySelector('#cli-btn-confirm-merge');
    const originalText = mergeBtn ? mergeBtn.innerHTML : '';
    if (mergeBtn) {
        mergeBtn.disabled = true;
        mergeBtn.innerHTML = '⏳ Fusionando...';
    }

    try {
        const { mode, existingId, currentId, payload } = pendingMerge;
        const existingCustomer = allCustomers.find(c => c.id === existingId);
        if (!existingCustomer) throw new Error('Cliente existente no encontrado');

        const targetName = existingCustomer.name;
        const mergedPhone = (existingCustomer.phone || '').trim() || (payload.phone || '').trim();
        const mergedTax = (existingCustomer.tax_id || '').trim() || (payload.tax_id || '').trim();
        const mergedAddress = (existingCustomer.address || '').trim() || (payload.address || '').trim();
        const mergedNotes = [existingCustomer.notes, payload.notes].filter(Boolean).join(' | ');
        const mergedClub = !!(existingCustomer.is_club_member || payload.is_club_member);

        await customerService.update(existingId, {
            name: targetName,
            phone: mergedPhone,
            tax_id: mergedTax,
            address: mergedAddress,
            notes: mergedNotes,
            is_club_member: mergedClub
        });

        if (payload.name !== targetName) {
            await customerService.reassignOrders(payload.name, targetName);
        }

        if (mode === 'edit-rename' && currentId) {
            const currentCustomer = allCustomers.find(c => c.id === currentId);
            if (currentCustomer && currentCustomer.name !== targetName) {
                await customerService.reassignOrders(currentCustomer.name, targetName);
            }
            await customerService.remove(currentId);
        }

        showToast({ message: `✅ Clientes unificados en "${targetName}"`, type: 'success' });
        container.querySelector('#cli-merge-modal')?.classList.add('hidden');
        pendingMerge = null;
        await reload(container);
    } catch (err) {
        console.error('[clientes] Error al fusionar:', err);
        showToast({ message: 'Error al fusionar: ' + err.message, type: 'error' });
    } finally {
        if (mergeBtn) {
            mergeBtn.disabled = false;
            mergeBtn.innerHTML = originalText;
        }
    }
}

// ============================================================
// MODAL ELIMINAR
// ============================================================
let deleteTargetId = null;

function openDeleteModal(container, id, name) {
    deleteTargetId = id;
    container.querySelector('#cli-delete-name').textContent = name;
    container.querySelector('#cli-delete-modal')?.classList.remove('hidden');
}

async function handleDelete(container) {
    if (!deleteTargetId) return;
    const delBtn = container.querySelector('#cli-btn-confirm-delete');
    const originalText = delBtn ? delBtn.innerHTML : '';
    if (delBtn) {
        delBtn.disabled = true;
        delBtn.innerHTML = '⏳ Eliminando...';
    }

    try {
        await customerService.remove(deleteTargetId);
        showToast({ message: '✅ Cliente eliminado del directorio', type: 'success' });
        container.querySelector('#cli-delete-modal')?.classList.add('hidden');
        deleteTargetId = null;
        await reload(container);
    } catch (err) {
        console.error('[clientes] Error al eliminar:', err);
        showToast({ message: 'Error al eliminar: ' + err.message, type: 'error' });
    } finally {
        if (delBtn) {
            delBtn.disabled = false;
            delBtn.innerHTML = originalText;
        }
    }
}

// ============================================================
// RECARGA COMPLETA
// ============================================================
async function reload(container) {
    try {
        const [customersData, statsData] = await Promise.all([
            customerService.getAll(),
            customerService.getStatsByName().catch(() => ({}))
        ]);
        allCustomers = customersData || [];
        statsMap = statsData || {};
        enrichData();
        renderKPIs(container);
        renderPillCounters(container);
        refreshTable(container);
    } catch (err) {
        showToast({ message: 'Error al recargar: ' + err.message, type: 'error' });
    }
}

function formatFriendlyDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}
