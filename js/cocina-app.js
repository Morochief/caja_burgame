import { orderService } from './services/order-service.js';
import { showToast } from './components/toast.js';

let activeOrders = [];
let allTodayOrders = [];
let cocinaActiveTab = 'active'; // 'active' | 'history'
let hiddenDeliveredIds = new Set(); // IDs de comandas entregadas ocultadas manualmente

// ============================================================
// Alerta sonora de nuevas comandas (Item Get - Zelda OoT)
// Suena al llegar una comanda nueva y repite hasta 3 veces si
// el cocinero no le da "Iniciar preparación".
// ============================================================
const ALERT_SOUND_SRC = 'assets/item-get.mp3';
const ALERT_MAX_PLAYS = 3;
const ALERT_INTERVAL_MS = 8000; // separación entre repeticiones
const alertAudio = new Audio(ALERT_SOUND_SRC);
alertAudio.volume = 0.8;

// Map orderId -> { plays: number, timer: intervalId, acknowledged: boolean }
const alertTimers = new Map();

function playAlertOnce() {
    // El Audio solo puede reproducirse tras interacción del usuario.
    // Si el navegador lo bloquea, no rompe nada.
    alertAudio.currentTime = 0;
    alertAudio.play().catch(() => { /* autoplay bloqueado, ignorar */ });
}

function startAlertForOrder(orderId) {
    if (alertTimers.has(orderId)) return; // ya está sonando
    const state = { plays: 0, timer: null, acknowledged: false };

    const play = () => {
        if (state.acknowledged) return;
        state.plays++;
        playAlertOnce();
        if (state.plays < ALERT_MAX_PLAYS) {
            state.timer = setTimeout(play, ALERT_INTERVAL_MS);
        } else {
            // Después de 3 sonidos sin atención, limpiar el registro
            alertTimers.delete(orderId);
        }
    };

    alertTimers.set(orderId, state);
    play();
}

function acknowledgeOrder(orderId) {
    const state = alertTimers.get(orderId);
    if (state) {
        state.acknowledged = true;
        if (state.timer) clearTimeout(state.timer);
        alertTimers.delete(orderId);
    }
}

function isOrderedInsert(payload) {
    // Realtime INSERT de una orden nueva con status 'ordered'
    return payload.eventType === 'INSERT' && payload.new?.status === 'ordered';
}

function isPreparingUpdate(payload) {
    // UPDATE que pasó a 'preparing' (el cocinero inició preparación)
    return payload.eventType === 'UPDATE' && payload.new?.status === 'preparing' && payload.old?.status !== 'preparing';
}

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

    // Listeners de Pestañas
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

    // Listener de Cerrar Sesión
    document.getElementById('btn-kitchen-logout')?.addEventListener('click', async () => {
        const { logout } = await import('./services/auth-service.js');
        logout();
    });

    await loadActiveOrders();
    renderCocinaView();
    setupRealtimeSubscription();

    // Actualizar SOLO los temporizadores cada 30s (sin reconstruir todo el DOM)
    // El DOM completo se reconstruye solo cuando llegan eventos realtime.
    setInterval(() => {
        updateTimers();
    }, 30000);
}

function updateTabButtons() {
    const btnActive = document.getElementById('tab-cocina-active');
    const btnHistory = document.getElementById('tab-cocina-history');

    if (cocinaActiveTab === 'active') {
        btnActive?.classList.add('active', 'btn--primary');
        btnActive?.classList.remove('btn--secondary');
        btnActive?.style.setProperty('color', 'var(--text-inverse)');

        btnHistory?.classList.remove('active', 'btn--primary');
        btnHistory?.classList.add('btn--secondary');
        btnHistory?.style.setProperty('color', 'var(--text-muted)');
    } else {
        btnHistory?.classList.add('active', 'btn--primary');
        btnHistory?.classList.remove('btn--secondary');
        btnHistory?.style.setProperty('color', 'var(--text-inverse)');

        btnActive?.classList.remove('active', 'btn--primary');
        btnActive?.classList.add('btn--secondary');
        btnActive?.style.setProperty('color', 'var(--text-muted)');
    }
}

async function loadActiveOrders() {
    try {
        // OPTIMIZACIÓN: getTodaysOrders ya incluye las activas.
        // Un solo fetch en lugar de dos, ahorrando un round-trip a Supabase.
        const today = await orderService.getTodaysOrders();
        allTodayOrders = today || [];
        activeOrders = allTodayOrders.filter(o => o.status !== 'cancelled');
    } catch (err) {
        console.error('Error cargando comandas:', err);
        showToast({ message: 'Error cargando comandas de cocina: ' + err.message, type: 'error' });
    }
}

// ============================================================
// Actualizar SOLO los temporizadores de las tarjetas existentes
// Sin reconstruir todo el innerHTML (evita fl...
// ============================================================
function updateTimers() {
    const cards = document.querySelectorAll('.kds-card');
    cards.forEach(card => {
        const orderId = card.querySelector('.btn-advance')?.dataset.id
            || card.querySelector('.btn-hide-delivered')?.dataset.id;
        if (!orderId) return;
        const order = activeOrders.find(o => o.id === orderId)
            || allTodayOrders.find(o => o.id === orderId);
        if (!order) return;

        const minutesElapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        const isLate = minutesElapsed >= 15;
        const timerEl = card.querySelector('.kds-card__timer');
        if (timerEl) {
            timerEl.textContent = `⏱️ ${minutesElapsed}m ${isLate && order.status !== 'delivered' ? '⚠️' : ''}`;
            timerEl.classList.toggle('kds-card__timer--late', isLate && order.status !== 'delivered');
        }
    });

    // Actualizar el contador total de items SIN recorrer todos los items de nuevo
    const totalBurgersCountEl = document.getElementById('total-burgers-count');
    if (totalBurgersCountEl) {
        let total = 0;
        allTodayOrders.forEach(o => {
            (o.order_items || []).forEach(item => { total += item.quantity || 1; });
        });
        totalBurgersCountEl.textContent = total;
    }
}

function renderCocinaView() {
    const grid = document.getElementById('cocina-grid');
    const activeCountEl = document.getElementById('active-count');
    const readyCountEl = document.getElementById('ready-count');
    const activeTabCountEl = document.getElementById('active-tab-count');
    const historyTabCountEl = document.getElementById('history-tab-count');

    if (!grid) return;

    // Filtrar comandas según pestaña activa
    const pendingActive = activeOrders.filter(o => ['ordered', 'preparing', 'ready'].includes(o.status));
    const deliveredToday = allTodayOrders.filter(o => o.status === 'delivered' && !hiddenDeliveredIds.has(o.id));

    if (activeTabCountEl) activeTabCountEl.textContent = pendingActive.length;
    if (historyTabCountEl) historyTabCountEl.textContent = deliveredToday.length;

    const ordered = activeOrders.filter(o => o.status === 'ordered');
    const preparing = activeOrders.filter(o => o.status === 'preparing');
    const ready = activeOrders.filter(o => o.status === 'ready');

    if (activeCountEl) activeCountEl.textContent = ordered.length + preparing.length;
    if (readyCountEl) readyCountEl.textContent = ready.length;

    // Contador total de items (una sola pasada)
    const totalBurgersCountEl = document.getElementById('total-burgers-count');
    if (totalBurgersCountEl) {
        let grandTotalItems = 0;
        allTodayOrders.forEach(o => {
            (o.order_items || []).forEach(item => { grandTotalItems += item.quantity || 1; });
        });
        totalBurgersCountEl.textContent = grandTotalItems;
    }

    // Determinar listado a renderizar en el Grid
    const displayList = cocinaActiveTab === 'active' ? pendingActive : deliveredToday;

    if (displayList.length === 0) {
        grid.innerHTML = `
            <div class="cocina-empty">
                <div class="cocina-empty__icon">${cocinaActiveTab === 'active' ? '🔥' : '📜'}</div>
                <div class="cocina-empty__text">${cocinaActiveTab === 'active' ? 'SIN COMANDAS PENDIENTES' : 'HISTORIAL DE ENTREGADOS LIMPIO'}</div>
                <p class="cocina-empty__subtext">
                    ${cocinaActiveTab === 'active' ? 'Esperando que ingresen nuevos pedidos desde el POS o Clientes...' : 'Las comandas entregadas figurarán aquí de forma organizada.'}
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = displayList.map(order => {
        const minutesElapsed = Math.floor((new Date() - new Date(order.created_at)) / 60000);
        const isLate = minutesElapsed >= 15;
        const statusClass = order.status === 'ordered' ? 'ordered' : order.status === 'preparing' ? 'preparing' : order.status === 'ready' ? 'ready' : 'delivered';
        const customerDisplay = order.customer_name || extractCustomerFromNotes(order.notes) || 'Mesa / Cliente';
        return `
            <div class="kds-card kds-card--${statusClass}">
                <div class="kds-card__header">
                    <div>
                        <span class="kds-card__number">PEDIDO #${order.order_number}</span>
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--color-primary); margin-top: 0.2rem;">
                            👤 ${customerDisplay}
                        </div>
                    </div>
                    <span class="kds-card__timer ${isLate && order.status !== 'delivered' ? 'kds-card__timer--late' : ''}">
                        ⏱️ ${minutesElapsed}m ${isLate && order.status !== 'delivered' ? '⚠️' : ''}
                    </span>
                </div>

                <div class="kds-card__status-bar">
                    <span class="badge badge--${getStatusBadgeColor(order.status)}">
                        ${getStatusLabel(order.status)}
                    </span>
                </div>

                <div class="kds-card__body">
                    <ul class="kds-items-list">
                        ${(order.order_items || []).map(item => {
                            // Separar nota individual del nombre del producto
                            const noteMatch = item.product_name.match(/\[📝\s*([^\]]+)\]/);
                            const itemNote = noteMatch ? noteMatch[1] : '';
                            const cleanName = item.product_name.replace(/\s*\[📝\s*[^\]]+\]/, '').trim();

                            return `
                                <li class="kds-item" style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; padding: 0.4rem 0; border-bottom: 1px rgba(255,255,255,0.05) dashed;">
                                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                                        <span class="kds-item__qty">${item.quantity}x</span>
                                        <span class="kds-item__name" style="font-weight: 700;">
                                            ${cleanName}
                                            ${item.is_combo ? '<span class="kds-item__tag">(COMBO)</span>' : ''}
                                        </span>
                                    </div>
                                    ${itemNote ? `
                                        <span style="font-size: 0.78rem; color: var(--color-warning, #FFD700); margin-left: 1.5rem; font-style: italic;">📝 ${itemNote}</span>
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

                <div class="kds-card__footer">
                    ${order.status === 'ordered' ? `
                        <button class="btn btn--primary kds-btn-action btn-advance" data-id="${order.id}" data-next="preparing">
                            🔥 INICIAR PREPARACIÓN
                        </button>
                    ` : order.status === 'preparing' ? `
                        <button class="btn btn--primary kds-btn-action kds-btn-ready btn-advance" data-id="${order.id}" data-next="ready">
                            ✅ MARCAR LISTO EN BARRA
                        </button>
                    ` : order.status === 'ready' ? `
                        <button class="btn btn--secondary kds-btn-action btn-advance" data-id="${order.id}" data-next="delivered">
                            🚀 ENTREGADO AL CLIENTE
                        </button>
                    ` : `
                        <button class="btn btn--danger kds-btn-action btn-hide-delivered" data-id="${order.id}" style="padding: 0.6rem; font-size: 0.8rem;">
                            🗑️ ELIMINAR DE PANTALLA
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    attachEvents();
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
        default: return 'ENTREGADO';
    }
}

function attachEvents() {
    document.querySelectorAll('.btn-advance').forEach(btn => {
        btn.addEventListener('click', async () => {
            const orderId = btn.dataset.id;
            const nextStatus = btn.dataset.next;

            // Si el cocinero inicia la preparación, detener el sonido de alerta
            if (nextStatus === 'preparing') {
                acknowledgeOrder(orderId);
            }

            try {
                await orderService.updateStatus(orderId, nextStatus);
                showToast({ 
                    message: `Pedido actualizado a ${getStatusLabel(nextStatus)}`, 
                    type: 'success' 
                });
                await loadActiveOrders();
                renderCocinaView();
            } catch (err) {
                showToast({ message: 'Error actualizando comanda: ' + err.message, type: 'error' });
            }
        });
    });

    // Botón eliminar comanda entregada del historial
    document.querySelectorAll('.btn-hide-delivered').forEach(btn => {
        btn.addEventListener('click', () => {
            const orderId = btn.dataset.id;
            hiddenDeliveredIds.add(orderId);
            showToast({ message: 'Comanda removida de la pantalla', type: 'info' });
            renderCocinaView();
        });
    });
}

function setupRealtimeSubscription() {
    // DEBOUNCE: si llegan varios eventos realtime juntos (ej: 3 pedidos simultáneos),
    // agruparlos en un solo fetch + render en lugar de N renders.
    let debounceTimer = null;
    orderService.subscribeToOrders((payload) => {
        // Alerta sonora: nueva comanda -> empezar a sonar (hasta 3 veces)
        if (isOrderedInsert(payload)) {
            startAlertForOrder(payload.new.id);
        }
        // El cocinero inició preparación -> detener repeticiones del sonido
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

// Limpia el prefijo [Cliente: ...] de las notas (órdenes viejas que
// aún tienen el nombre embebido en notes en vez de en customer_name)
function cleanNotes(notes) {
    if (!notes) return '';
    return notes.replace(/\[Cliente:\s*[^\]]+\]\s*/gi, '').trim();
}
