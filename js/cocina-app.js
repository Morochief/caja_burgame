import { orderService } from './services/order-service.js';
import { showToast } from './components/toast.js';
import { initChat } from './components/chat-ui.js';

let activeOrders = [];
let allTodayOrders = [];
let cocinaActiveTab = 'active'; // 'active' | 'history'
let cocinaSubFilter = 'all'; // 'all' | 'ordered' | 'preparing' | 'ready' | 'late'
let cocinaSortOrder = 'fifo'; // 'fifo' (antiguos primero) | 'lifo' (nuevos primero)
let searchQuery = '';
let hiddenDeliveredIds = new Set();
let checkedItemsMap = new Set(); // Claves `${orderId}_${itemIdx}`
let lastAction = null; // { orderId, prevStatus, newStatus, orderNumber, timestamp }
let isSoundEnabled = true;
let kdsZoom = 'normal'; // 'compact' | 'normal' | 'large'
let isProductionBarCollapsed = false;

// ============================================================
// Configuración de Audio Zelda & Alertas Sonoras
// ============================================================
const ALERT_SOUND_SRC = 'assets/item-get.mp3';
const alertAudio = new Audio(ALERT_SOUND_SRC);
alertAudio.volume = 0.85;

const alertedOrderIds = new Set();

function playAlertOnce() {
    if (!isSoundEnabled) return;
    alertAudio.currentTime = 0;
    alertAudio.play().catch(() => { /* Autoplay bloqueado por navegador */ });
}

function startAlertForOrder(orderId) {
    if (alertedOrderIds.has(orderId)) return;
    alertedOrderIds.add(orderId);
    playAlertOnce();
}

function acknowledgeOrder(orderId) {
    alertedOrderIds.delete(orderId);
}

function isOrderedInsert(payload) {
    return payload.eventType === 'INSERT' && payload.new?.status === 'ordered';
}

function isOrderApprovedUpdate(payload) {
    return payload.eventType === 'UPDATE' &&
           payload.new?.status === 'ordered' &&
           (payload.old?.status === 'pending_payment' || payload.old?.status === 'pending_approval');
}

function isPreparingUpdate(payload) {
    return payload.eventType === 'UPDATE' && payload.new?.status === 'preparing' && payload.old?.status !== 'preparing';
}

// ============================================================
// Inicialización del KDS Élite
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    await initCocina();
});

async function initCocina() {
    const { getSession } = await import('./services/auth-service.js');
    const session = getSession();
    if (!session) {
        window.location.href = 'index.html#/login';
        return;
    }

    const grid = document.getElementById('cocina-grid');
    if (!grid) return;

    // Cargar preferencias locales
    isSoundEnabled = localStorage.getItem('bg_kds_sound_enabled') !== 'false';
    kdsZoom = localStorage.getItem('bg_kds_zoom') || 'normal';
    isProductionBarCollapsed = localStorage.getItem('bg_kds_prod_collapsed') === 'true';
    applyZoom(kdsZoom);
    updateSoundButtonUi();

    if (isProductionBarCollapsed) {
        document.getElementById('kds-production-panel')?.classList.add('collapsed');
        const collapseBtn = document.getElementById('btn-toggle-production-bar');
        if (collapseBtn) collapseBtn.textContent = '▼ Mostrar';
    }

    // Cargar ítems tachados de memoria local
    try {
        const savedChecked = JSON.parse(localStorage.getItem('bg_kds_checked_items') || '[]');
        checkedItemsMap = new Set(savedChecked);
    } catch {
        checkedItemsMap = new Set();
    }

    // Listeners de Pestañas Principales
    document.getElementById('tab-cocina-active')?.addEventListener('click', () => {
        cocinaActiveTab = 'active';
        updateTabButtons();
        renderCocinaView();
    });

    document.getElementById('tab-cocina-history')?.addEventListener('click', () => {
        cocinaActiveTab = 'history';
        updateTabButtons();
        renderCocinaView();
    });

    // Sub-filtros para comandas activas
    document.querySelectorAll('.kds-filter-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            cocinaSubFilter = pill.dataset.subfilter || 'all';
            document.querySelectorAll('.kds-filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            renderCocinaView();
        });
    });

    // Buscador en tiempo real
    const searchInput = document.getElementById('kds-search-input');
    searchInput?.addEventListener('input', e => {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        renderCocinaView();
    });

    // Ordenador (FIFO vs LIFO)
    const sortBtn = document.getElementById('btn-kds-sort');
    sortBtn?.addEventListener('click', () => {
        cocinaSortOrder = cocinaSortOrder === 'fifo' ? 'lifo' : 'fifo';
        const label = document.getElementById('kds-sort-label');
        if (label) {
            label.textContent = cocinaSortOrder === 'fifo' ? '⏱️ Antiguos primero' : '⏱️ Nuevos primero';
        }
        renderCocinaView();
    });

    // Toggle Barra de Producción en Plancha
    const toggleProdBtn = document.getElementById('btn-toggle-production-bar');
    toggleProdBtn?.addEventListener('click', () => {
        const panel = document.getElementById('kds-production-panel');
        if (!panel) return;
        isProductionBarCollapsed = !isProductionBarCollapsed;
        panel.classList.toggle('collapsed', isProductionBarCollapsed);
        toggleProdBtn.textContent = isProductionBarCollapsed ? '▼ Mostrar' : '▲ Ocultar';
        localStorage.setItem('bg_kds_prod_collapsed', isProductionBarCollapsed ? 'true' : 'false');
    });

    // Botón Deshacer Último Despacho (Recall)
    document.getElementById('btn-kds-undo')?.addEventListener('click', async () => {
        await handleUndoLastAction();
    });

    // Toggle Sonido Zelda
    document.getElementById('btn-kds-sound-toggle')?.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        localStorage.setItem('bg_kds_sound_enabled', isSoundEnabled ? 'true' : 'false');
        updateSoundButtonUi();
        showToast({
            message: isSoundEnabled ? '🔊 Alertas sonoras activadas' : '🔇 Cocina silenciada',
            type: 'info'
        });
    });

    // Probar Sonido
    document.getElementById('btn-kds-sound-test')?.addEventListener('click', () => {
        alertAudio.currentTime = 0;
        alertAudio.play().then(() => {
            showToast({ message: '🎵 Alerta Zelda probada con éxito', type: 'success' });
        }).catch(() => {
            showToast({ message: 'Haz clic en la pantalla primero para desbloquear audio', type: 'warning' });
        });
    });

    // Zoom A- y A+
    document.getElementById('btn-kds-zoom-out')?.addEventListener('click', () => {
        if (kdsZoom === 'large') kdsZoom = 'normal';
        else if (kdsZoom === 'normal') kdsZoom = 'compact';
        applyZoom(kdsZoom);
    });
    document.getElementById('btn-kds-zoom-in')?.addEventListener('click', () => {
        if (kdsZoom === 'compact') kdsZoom = 'normal';
        else if (kdsZoom === 'normal') kdsZoom = 'large';
        applyZoom(kdsZoom);
    });

    // Pantalla Completa (F11)
    document.getElementById('btn-kds-fullscreen')?.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // Cerrar Sesión
    document.getElementById('btn-kitchen-logout')?.addEventListener('click', async () => {
        const { logout } = await import('./services/auth-service.js');
        logout();
    });

    await loadActiveOrders();
    renderCocinaView();
    setupRealtimeSubscription();

    // Inicializar chat Cocina <-> Barra/POS
    initChat('kitchen');

    // Cronómetro reactivo cada 15s
    setInterval(() => {
        updateTimers();
    }, 15000);
}

function updateSoundButtonUi() {
    const btn = document.getElementById('btn-kds-sound-toggle');
    const icon = document.getElementById('kds-sound-icon');
    if (!btn || !icon) return;
    if (isSoundEnabled) {
        btn.classList.add('active');
        icon.textContent = '🔊';
    } else {
        btn.classList.remove('active');
        icon.textContent = '🔇';
    }
}

function applyZoom(zoom) {
    document.body.dataset.kdsZoom = zoom;
    localStorage.setItem('bg_kds_zoom', zoom);
}

function updateTabButtons() {
    const btnActive = document.getElementById('tab-cocina-active');
    const btnHistory = document.getElementById('tab-cocina-history');
    const activeFilters = document.getElementById('kds-active-filters');

    if (cocinaActiveTab === 'active') {
        btnActive?.classList.add('active');
        btnHistory?.classList.remove('active');
        if (activeFilters) activeFilters.style.display = 'flex';
    } else {
        btnHistory?.classList.add('active');
        btnActive?.classList.remove('active');
        if (activeFilters) activeFilters.style.display = 'none';
    }
}

async function loadActiveOrders() {
    try {
        const today = await orderService.getTodaysOrders();
        allTodayOrders = today || [];
        activeOrders = allTodayOrders.filter(o => o.status !== 'cancelled' && o.status !== 'pending_payment' && o.status !== 'pending_approval');
    } catch (err) {
        console.error('Error cargando comandas:', err);
        showToast({ message: 'Error cargando comandas de cocina: ' + err.message, type: 'error' });
    }
}

// ============================================================
// Cálculo de Métricas y KPIs Operativos
// ============================================================
function calculateKpiMetrics() {
    const ordered = activeOrders.filter(o => o.status === 'ordered');
    const preparing = activeOrders.filter(o => o.status === 'preparing');
    const ready = activeOrders.filter(o => o.status === 'ready');
    const inMarch = ordered.length + preparing.length;

    // Conteo de pedidos demorados (> 15 minutos en cocina)
    const delayed = activeOrders.filter(o => {
        if (['ordered', 'preparing'].includes(o.status)) {
            const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
            return mins >= 15;
        }
        return false;
    });

    // Tiempo promedio de despacho hoy (órdenes entregadas o listas con timestamps)
    const completedOrders = allTodayOrders.filter(o => ['ready', 'delivered'].includes(o.status));
    let avgPrepMinutes = '--';
    if (completedOrders.length > 0) {
        let totalMinutes = 0;
        let counted = 0;
        completedOrders.forEach(o => {
            const endTs = o.ready_at ? new Date(o.ready_at).getTime() : (o.delivered_at ? new Date(o.delivered_at).getTime() : null);
            if (endTs) {
                const diff = Math.max(1, Math.floor((endTs - new Date(o.created_at).getTime()) / 60000));
                totalMinutes += diff;
                counted++;
            }
        });
        if (counted > 0) {
            avgPrepMinutes = Math.round(totalMinutes / counted) + 'm';
        }
    }

    // Total de hamburguesas y productos hoy
    let grandTotalItems = 0;
    allTodayOrders.forEach(o => {
        (o.order_items || []).forEach(item => { grandTotalItems += item.quantity || 1; });
    });

    // Actualizar elementos en UI
    const activeCountEl = document.getElementById('active-count');
    const readyCountEl = document.getElementById('ready-count');
    const avgPrepTimeEl = document.getElementById('avg-prep-time');
    const delayedCountEl = document.getElementById('delayed-count');
    const totalBurgersCountEl = document.getElementById('total-burgers-count');

    if (activeCountEl) activeCountEl.textContent = inMarch;
    if (readyCountEl) readyCountEl.textContent = ready.length;
    if (avgPrepTimeEl) avgPrepTimeEl.textContent = avgPrepMinutes;
    if (delayedCountEl) delayedCountEl.textContent = delayed.length;
    if (totalBurgersCountEl) totalBurgersCountEl.textContent = grandTotalItems;

    // Actualizar contadores de pestañas y subfiltros
    const activeTabCountEl = document.getElementById('active-tab-count');
    const historyTabCountEl = document.getElementById('history-tab-count');
    const subAllCountEl = document.getElementById('sub-all-count');
    const subOrderedCountEl = document.getElementById('sub-ordered-count');
    const subPreparingCountEl = document.getElementById('sub-preparing-count');
    const subReadyCountEl = document.getElementById('sub-ready-count');
    const subLateCountEl = document.getElementById('sub-late-count');

    const pendingActive = activeOrders.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status));
    const deliveredToday = allTodayOrders.filter(o => o.status === 'delivered' && !hiddenDeliveredIds.has(o.id));

    if (activeTabCountEl) activeTabCountEl.textContent = pendingActive.length;
    if (historyTabCountEl) historyTabCountEl.textContent = deliveredToday.length;
    if (subAllCountEl) subAllCountEl.textContent = pendingActive.length;
    if (subOrderedCountEl) subOrderedCountEl.textContent = ordered.length;
    if (subPreparingCountEl) subPreparingCountEl.textContent = preparing.length;
    if (subReadyCountEl) subReadyCountEl.textContent = ready.length;
    if (subLateCountEl) subLateCountEl.textContent = delayed.length;

    return { inMarch, ready: ready.length, delayed: delayed.length, pendingActive, deliveredToday };
}

// ============================================================
// Barra de Producción Agregada ("All Day Count" / En Plancha)
// ============================================================
function updateProductionChips() {
    const chipsContainer = document.getElementById('kds-production-chips');
    if (!chipsContainer) return;

    // Agrupar ítems pendientes de pedidos en estado 'ordered' o 'preparing'
    const pendingOrders = activeOrders.filter(o => ['ordered', 'preparing'].includes(o.status));
    const itemsMap = {};

    pendingOrders.forEach(order => {
        (order.order_items || []).forEach((item, idx) => {
            const itemKey = `${order.id}_${idx}`;
            // Si el ítem ya fue tachado por el cocinero, no lo sumamos a la plancha pendiente
            if (checkedItemsMap.has(itemKey)) return;

            const cleanName = item.product_name
                .replace(/\s*\[📝\s*[^\]]+\]/, '')
                .replace(/\s*\(COMBO\)/i, '')
                .trim();

            const qty = item.quantity || 1;
            itemsMap[cleanName] = (itemsMap[cleanName] || 0) + qty;
        });
    });

    const entries = Object.entries(itemsMap).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        chipsContainer.innerHTML = `
            <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic; padding: 0.2rem 0;">
                ✨ Plancha despejada — no hay hamburguesas pendientes de cocción
            </span>
        `;
        return;
    }

    chipsContainer.innerHTML = entries.map(([name, qty]) => `
        <div class="kds-chip">
            <span class="kds-chip__qty">${qty}x</span>
            <span class="kds-chip__name">${name}</span>
        </div>
    `).join('');
}

// ============================================================
// Renderizado Principal del KDS
// ============================================================
function renderCocinaView() {
    const grid = document.getElementById('cocina-grid');
    if (!grid) return;

    const { pendingActive, deliveredToday } = calculateKpiMetrics();
    updateProductionChips();

    // Seleccionar lista base según pestaña activa
    let displayList = cocinaActiveTab === 'active' ? [...pendingActive] : [...deliveredToday];

    // Aplicar sub-filtro si estamos en pestañas activas
    if (cocinaActiveTab === 'active') {
        if (cocinaSubFilter === 'ordered') {
            displayList = displayList.filter(o => o.status === 'ordered');
        } else if (cocinaSubFilter === 'preparing') {
            displayList = displayList.filter(o => o.status === 'preparing');
        } else if (cocinaSubFilter === 'ready') {
            displayList = displayList.filter(o => o.status === 'ready');
        } else if (cocinaSubFilter === 'late') {
            displayList = displayList.filter(o => {
                const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
                return mins >= 15;
            });
        }
    }

    // Aplicar búsqueda en vivo
    if (searchQuery) {
        displayList = displayList.filter(o => {
            const numMatch = (o.order_number || '').toString().toLowerCase().includes(searchQuery);
            const clientMatch = (o.customer_name || '').toLowerCase().includes(searchQuery);
            const notesMatch = (o.notes || '').toLowerCase().includes(searchQuery);
            const itemsMatch = (o.order_items || []).some(item => (item.product_name || '').toLowerCase().includes(searchQuery));
            return numMatch || clientMatch || notesMatch || itemsMatch;
        });
    }

    // Ordenar (FIFO: más antiguos primero por defecto)
    displayList.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return cocinaSortOrder === 'fifo' ? (timeA - timeB) : (timeB - timeA);
    });

    if (displayList.length === 0) {
        grid.innerHTML = `
            <div class="cocina-empty">
                <div class="cocina-empty__icon">${cocinaActiveTab === 'active' ? '🔥' : '📜'}</div>
                <div class="cocina-empty__text">
                    ${cocinaActiveTab === 'active' ? (searchQuery ? 'NINGÚN PEDIDO COINCIDE CON LA BÚSQUEDA' : 'SIN COMANDAS PENDIENTES') : 'HISTORIAL DE ENTREGADOS VACÍO'}
                </div>
                <p class="cocina-empty__subtext">
                    ${cocinaActiveTab === 'active' ? 'Esperando que ingresen nuevos pedidos desde el POS o Clientes...' : 'Las comandas entregadas figurarán aquí de forma organizada.'}
                </p>
            </div>
        `;
        renderPreparedBreakdown();
        return;
    }

    grid.innerHTML = displayList.map(order => {
        const minutesElapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
        const isWarning = minutesElapsed >= 8 && minutesElapsed < 15;
        const isLate = minutesElapsed >= 15;
        const statusClass = order.status === 'ordered' ? 'ordered' : order.status === 'preparing' ? 'preparing' : order.status === 'ready' ? 'ready' : 'delivered';
        const customerDisplay = order.customer_name || extractCustomerFromNotes(order.notes) || 'Mesa / Mostrador';

        // Detección de Modalidad (Salón vs Llevar vs Delivery)
        const modalityBadge = detectModalityBadge(order.notes);

        // Hora formateada
        const timeFormatted = new Date(order.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="kds-card kds-card--${statusClass}" id="card-order-${order.id}">
                <!-- Header de Tarjeta -->
                <div class="kds-card__header">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;">
                            <span class="kds-card__number">PEDIDO #${order.order_number}</span>
                            ${modalityBadge}
                        </div>
                        <div style="font-size: 0.88rem; font-weight: 700; color: var(--color-primary); margin-top: 0.25rem;">
                            👤 ${customerDisplay}
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem;">
                        <span class="kds-card__timer ${isLate && order.status !== 'delivered' ? 'kds-card__timer--late' : ''}">
                            ⏱️ ${minutesElapsed}m ${isLate && order.status !== 'delivered' ? '⚠️' : ''}
                        </span>
                        <span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">
                            🕒 ${timeFormatted}
                        </span>
                    </div>
                </div>

                <!-- Barra de Estado -->
                <div class="kds-card__status-bar">
                    <span class="badge badge--${getStatusBadgeColor(order.status)}">
                        ${getStatusLabel(order.status)}
                    </span>
                </div>

                <!-- Cuerpo con Ítems y Checkoff Interactivo -->
                <div class="kds-card__body">
                    <ul class="kds-items-list">
                        ${(order.order_items || []).map((item, idx) => {
                            const itemKey = `${order.id}_${idx}`;
                            const isChecked = checkedItemsMap.has(itemKey);
                            const noteMatch = item.product_name.match(/\[📝\s*([^\]]+)\]/);
                            const itemNote = noteMatch ? noteMatch[1] : '';
                            const cleanName = item.product_name.replace(/\s*\[📝\s*[^\]]+\]/, '').trim();

                            return `
                                <li class="kds-item ${isChecked ? 'kds-item--checked' : ''}" data-order-id="${order.id}" data-item-idx="${idx}">
                                    <div style="display: flex; align-items: center; gap: 0.45rem; width: 100%;">
                                        <span class="kds-item__check-box">${isChecked ? '✓' : ''}</span>
                                        <span class="kds-item__qty">${item.quantity}x</span>
                                        <span class="kds-item__name">
                                            ${cleanName}
                                            ${item.is_combo ? '<span class="kds-item__tag">(COMBO)</span>' : ''}
                                        </span>
                                    </div>
                                    ${itemNote ? `
                                        <span style="font-size: 0.78rem; color: var(--color-warning, #FFD700); margin-left: 2rem; font-style: italic;">
                                            ⚠️ ${itemNote}
                                        </span>
                                    ` : ''}
                                </li>
                            `;
                        }).join('')}
                    </ul>

                    ${order.notes ? `
                        <div class="kds-notes">
                            📝 <strong>NOTAS:</strong> ${cleanNotes(order.notes)}
                        </div>
                    ` : ''}
                </div>

                <!-- Footer de Acciones KDS -->
                <div class="kds-card__footer">
                    <div class="kds-card-footer-grid">
                        ${order.status === 'ordered' ? `
                            <button class="btn btn--primary kds-btn-action btn-advance" data-id="${order.id}" data-next="preparing">
                                🔥 INICIAR PREPARACIÓN
                            </button>
                        ` : order.status === 'preparing' ? `
                            <button class="kds-btn-undo-action btn-revert" data-id="${order.id}" data-prev="ordered" title="Volver a Nuevo Pedido">
                                ◀
                            </button>
                            <button class="btn btn--primary kds-btn-action kds-btn-ready btn-advance" data-id="${order.id}" data-next="ready">
                                ✅ MARCAR LISTO EN BARRA
                            </button>
                        ` : order.status === 'ready' ? `
                            <button class="kds-btn-undo-action btn-revert" data-id="${order.id}" data-prev="preparing" title="Volver a En Preparación">
                                ◀
                            </button>
                            <button class="btn btn--secondary kds-btn-action btn-advance" data-id="${order.id}" data-next="delivered">
                                🚀 ENTREGADO AL CLIENTE
                            </button>
                        ` : `
                            <button class="kds-btn-undo-action btn-revert" data-id="${order.id}" data-prev="ready" title="Reactivar comanda en barra">
                                ↩️ Reactivar
                            </button>
                            <button class="btn btn--danger kds-btn-action btn-hide-delivered" data-id="${order.id}" style="padding: 0.6rem; font-size: 0.8rem;">
                                🗑️ Ocultar
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    attachEvents();
    renderPreparedBreakdown();
}

function detectModalityBadge(notes) {
    if (!notes) return `<span class="kds-badge-modalidad kds-badge-modalidad--salon">🍽️ SALÓN</span>`;
    const str = notes.toUpperCase();
    if (str.includes('[🥡 LLEVAR]') || str.includes('LLEVAR') || str.includes('TAKEAWAY')) {
        return `<span class="kds-badge-modalidad kds-badge-modalidad--takeaway">🥡 PARA LLEVAR</span>`;
    }
    if (str.includes('[🛵 DELIVERY]') || str.includes('DELIVERY')) {
        return `<span class="kds-badge-modalidad kds-badge-modalidad--delivery">🛵 DELIVERY</span>`;
    }
    const mesaMatch = notes.match(/Mesa\s*\d+/i);
    return `<span class="kds-badge-modalidad kds-badge-modalidad--salon">🍽️ ${mesaMatch ? mesaMatch[0].toUpperCase() : 'SALÓN'}</span>`;
}

function getStatusBadgeColor(status) {
    switch (status) {
        case 'ordered': return 'yellow';
        case 'preparing': return 'orange';
        case 'ready': return 'green';
        default: return 'blue';
    }
}

function getStatusLabel(status) {
    switch (status) {
        case 'ordered': return '⚡ NUEVO PEDIDO';
        case 'preparing': return '🔥 EN PREPARACIÓN';
        case 'ready': return '✅ LISTO PARA ENTREGAR';
        default: return '🚀 ENTREGADO';
    }
}

function updateUndoButtonUi() {
    const undoBtn = document.getElementById('btn-kds-undo');
    if (!undoBtn) return;
    if (lastAction && (Date.now() - lastAction.timestamp) < 60000) {
        undoBtn.disabled = false;
        undoBtn.innerHTML = `↩️ <span class="kds-tool-label">Deshacer #${lastAction.orderNumber}</span>`;
    } else {
        undoBtn.disabled = true;
        undoBtn.innerHTML = `↩️ <span class="kds-tool-label">Deshacer</span>`;
        lastAction = null;
    }
}

async function handleUndoLastAction() {
    if (!lastAction) return;
    try {
        const { orderId, prevStatus, orderNumber } = lastAction;
        await orderService.updateStatus(orderId, prevStatus);
        showToast({ message: `Comanda #${orderNumber} devuelta a ${getStatusLabel(prevStatus)}`, type: 'info' });
        lastAction = null;
        updateUndoButtonUi();
        await loadActiveOrders();
        renderCocinaView();
    } catch (err) {
        showToast({ message: 'Error al deshacer comanda: ' + err.message, type: 'error' });
    }
}

function attachEvents() {
    // Avanzar comanda
    document.querySelectorAll('.btn-advance').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const orderId = btn.dataset.id;
            const nextStatus = btn.dataset.next;
            const order = activeOrders.find(o => o.id === orderId) || allTodayOrders.find(o => o.id === orderId);

            if (nextStatus === 'preparing') {
                acknowledgeOrder(orderId);
            }

            try {
                if (order) {
                    lastAction = {
                        orderId,
                        prevStatus: order.status,
                        newStatus: nextStatus,
                        orderNumber: order.order_number,
                        timestamp: Date.now()
                    };
                    updateUndoButtonUi();
                }

                await orderService.updateStatus(orderId, nextStatus);
                await loadActiveOrders();
                renderCocinaView();
            } catch (err) {
                showToast({ message: 'Error actualizando comanda: ' + err.message, type: 'error' });
            }
        });
    });

    // Revertir comanda con el botón de flecha atrás en la tarjeta
    document.querySelectorAll('.btn-revert').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const orderId = btn.dataset.id;
            const prevStatus = btn.dataset.prev;

            try {
                await orderService.updateStatus(orderId, prevStatus);
                showToast({ message: `Comanda devuelta a ${getStatusLabel(prevStatus)}`, type: 'info' });
                await loadActiveOrders();
                renderCocinaView();
            } catch (err) {
                showToast({ message: 'Error al revertir comanda: ' + err.message, type: 'error' });
            }
        });
    });

    // Tachado interactivo de ítems individuales (Item Checkoff)
    document.querySelectorAll('.kds-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
            const orderId = itemEl.dataset.orderId;
            const itemIdx = itemEl.dataset.itemIdx;
            const key = `${orderId}_${itemIdx}`;

            if (checkedItemsMap.has(key)) {
                checkedItemsMap.delete(key);
            } else {
                checkedItemsMap.add(key);
            }

            // Guardar en localStorage
            localStorage.setItem('bg_kds_checked_items', JSON.stringify(Array.from(checkedItemsMap)));

            // Actualizar estilo visual del ítem
            itemEl.classList.toggle('kds-item--checked', checkedItemsMap.has(key));
            const box = itemEl.querySelector('.kds-item__check-box');
            if (box) box.textContent = checkedItemsMap.has(key) ? '✓' : '';

            // Recalcular chips de la plancha en tiempo real
            updateProductionChips();
        });
    });

    // Ocultar comanda entregada
    document.querySelectorAll('.btn-hide-delivered').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const orderId = btn.dataset.id;
            hiddenDeliveredIds.add(orderId);
            renderCocinaView();
        });
    });
}

// ============================================================
// Actualizar Cronómetros de Tarjetas sin parpadeo
// ============================================================
function updateTimers() {
    updateUndoButtonUi();
    const cards = document.querySelectorAll('.kds-card');
    cards.forEach(card => {
        const orderId = card.id.replace('card-order-', '');
        if (!orderId) return;
        const order = activeOrders.find(o => o.id === orderId) || allTodayOrders.find(o => o.id === orderId);
        if (!order) return;

        const minutesElapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
        const isLate = minutesElapsed >= 15;
        const timerEl = card.querySelector('.kds-card__timer');
        if (timerEl) {
            timerEl.textContent = `⏱️ ${minutesElapsed}m ${isLate && order.status !== 'delivered' ? '⚠️' : ''}`;
            timerEl.classList.toggle('kds-card__timer--late', isLate && order.status !== 'delivered');
        }
    });

    calculateKpiMetrics();
}

// ============================================================
// Panel de Desglose de Productos Preparados Hoy
// ============================================================
function renderPreparedBreakdown() {
    const container = document.getElementById('kitchen-prepared-breakdown');
    if (!container) return;

    const counts = {};
    allTodayOrders.forEach(order => {
        (order.order_items || []).forEach(item => {
            const cleanName = item.product_name
                .replace(/\s*\[📝\s*[^\]]+\]/, '')
                .replace(/\s*\(COMBO\)/i, '')
                .trim();
            const qty = item.quantity || 1;
            counts[cleanName] = (counts[cleanName] || 0) + qty;
        });
    });

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No hay productos preparados hoy aún.</span>';
        return;
    }

    container.innerHTML = entries.map(([name, qty]) => `
        <div class="card card--interactive" style="padding: 0.6rem 1rem; display: flex; align-items: center; gap: 0.75rem; background: #0D0F14; border-color: var(--border-subtle);">
            <span style="font-family: var(--font-mono); font-weight: 800; font-size: 1.1rem; color: var(--color-primary);">${qty}x</span>
            <span style="font-weight: 700; font-size: 0.85rem; color: #FFF;">${name}</span>
        </div>
    `).join('');
}

// ============================================================
// Conexión Supabase Realtime
// ============================================================
function setupRealtimeSubscription() {
    let debounceTimer = null;
    orderService.subscribeToOrders(payload => {
        // Alerta sonora para nueva comanda
        if (isOrderedInsert(payload) || isOrderApprovedUpdate(payload)) {
            startAlertForOrder(payload.new.id);
        }
        if (isPreparingUpdate(payload)) {
            acknowledgeOrder(payload.new.id);
        }

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            debounceTimer = null;
            await loadActiveOrders();
            renderCocinaView();
        }, 300);
    });
}

function extractCustomerFromNotes(notes) {
    if (!notes) return null;
    const match = notes.match(/\[Cliente:\s*([^\]]+)\]/i);
    return match ? match[1].trim() : null;
}

function cleanNotes(notes) {
    if (!notes) return '';
    return notes.replace(/\[Cliente:\s*[^\]]+\]\s*/gi, '').trim();
}
