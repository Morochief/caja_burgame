// chat-ui.js  -  Panel de chat Facebook/Telegram style
// Doble-click en mensaje propio para editar, igual a Telegram
import { chatService } from '../services/chat-service.js';

// --- Sonido de notificacion de chat ---
function playChatNotification() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
    } catch (_) {}
}

function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function initChat(myRole) {
    const otherLabel = myRole === 'admin' ? '\u{1F468}\u200D\u{1F373} Cocina' : '\u{1F5A5}\uFE0F Admin';
    let messages = [];
    let unread = 0;
    let panelOpen = false;
    let chatChannel = null;

    // Estado de edicion
    let editingId = null; // id del mensaje que se esta editando

    // ----- Inyectar HTML -----
    const clearBtn = myRole === 'admin'
        ? `<button class="chat-clear-btn" id="chat-clear" title="Limpiar chat de hoy">\u{1F5D1}\uFE0F</button>`
        : '';

    const html = `
        <div class="chat-overlay" id="chat-overlay"></div>
        <button class="chat-fab" id="chat-fab" title="Chat Cocina-Admin">
            \u{1F4AC}
            <span class="chat-fab__badge" id="chat-badge"></span>
        </button>
        <div class="chat-panel" id="chat-panel">
            <div class="chat-panel__header">
                <div class="chat-panel__title">\u{1F4AC} CHAT BURGAME</div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    ${clearBtn}
                    <button class="chat-panel__close" id="chat-close">&times;</button>
                </div>
            </div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-edit-bar" id="chat-edit-bar" style="display:none;">
                <span>\u270F\uFE0F Editando mensaje</span>
                <button id="chat-edit-cancel">&times; Cancelar</button>
            </div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" id="chat-input" placeholder="Escribi un mensaje..." maxlength="300" autocomplete="off">
                <button class="chat-send-btn" id="chat-send">&#10148;</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const fab      = document.getElementById('chat-fab');
    const badge    = document.getElementById('chat-badge');
    const panel    = document.getElementById('chat-panel');
    const overlay  = document.getElementById('chat-overlay');
    const closeBtn = document.getElementById('chat-close');
    const msgList  = document.getElementById('chat-messages');
    const input    = document.getElementById('chat-input');
    const sendBtn  = document.getElementById('chat-send');
    const editBar  = document.getElementById('chat-edit-bar');
    const editCancel = document.getElementById('chat-edit-cancel');
    const clearBtnEl = document.getElementById('chat-clear');

    // ----- Render -----
    function renderMessages() {
        if (messages.length === 0) {
            msgList.innerHTML = '<div class="chat-empty"><div class="chat-empty__icon">\u{1F4AC}</div><span>Sin mensajes hoy</span><span style="font-size:0.65rem;color:#333;margin-top:0.3rem;">Solo se muestran los mensajes del dia actual</span></div>';
            return;
        }
        msgList.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_role === myRole;
            const editedTag = msg.edited
                ? `<span class="chat-msg__edited">(editado)</span>`
                : '';
            const editHint = isOwn
                ? `title="Doble-click para editar"`
                : '';
            return `<div class="chat-msg chat-msg--${isOwn ? 'own' : 'other'}"
                        data-id="${msg.id}"
                        data-own="${isOwn}"
                        ${editHint}>
                <span class="chat-msg__role">${isOwn ? 'Vos' : otherLabel}</span>
                <div class="chat-msg__bubble">${escapeHtml(msg.message)}${editedTag}</div>
                <span class="chat-msg__time">${formatTime(msg.created_at)}</span>
            </div>`;
        }).join('');

        // Double-click para editar mensajes propios
        msgList.querySelectorAll('.chat-msg[data-own="true"]').forEach(el => {
            el.addEventListener('dblclick', () => startEdit(el.dataset.id));
        });

        msgList.scrollTop = msgList.scrollHeight;
    }

    function updateBadge() {
        if (unread > 0) {
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    }

    function openPanel() {
        panelOpen = true;
        panel.classList.add('open');
        overlay.classList.add('visible');
        unread = 0;
        updateBadge();
        const unreadIds = messages
            .filter(m => m.sender_role !== myRole && !m.read_at)
            .map(m => m.id);
        if (unreadIds.length > 0) chatService.markRead(unreadIds);
        renderMessages();
        input.focus();
    }

    function closePanel() {
        panelOpen = false;
        panel.classList.remove('open');
        overlay.classList.remove('visible');
        cancelEdit();
    }

    function showChatToast(msg) {
        const existing = document.getElementById('chat-toast-popup');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'chat-toast';
        toast.id = 'chat-toast-popup';
        toast.innerHTML = `<span class="chat-toast__from">${otherLabel}</span><span class="chat-toast__text">${escapeHtml(msg.message)}</span>`;
        toast.addEventListener('click', () => { toast.remove(); openPanel(); });
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
    }

    // ----- Edicion -----
    function startEdit(id) {
        const msg = messages.find(m => m.id === id);
        if (!msg) return;
        editingId = id;
        input.value = msg.message;
        editBar.style.display = 'flex';
        input.placeholder = 'Edita el mensaje...';
        input.focus();
        // Scroll al mensaje editado
        const el = msgList.querySelector(`[data-id="${id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function cancelEdit() {
        editingId = null;
        input.value = '';
        editBar.style.display = 'none';
        input.placeholder = 'Escribi un mensaje...';
    }

    // ----- Enviar / Editar -----
    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        const saved = input.value;

        try {
            if (editingId) {
                // Modo edicion
                await chatService.updateMessage(editingId, text);
                // El UPDATE llega via realtime y actualiza el array local
                cancelEdit();
            } else {
                // Nuevo mensaje
                input.value = '';
                await chatService.sendMessage(myRole, text);
            }
        } catch (err) {
            console.error('Chat error:', err);
            input.value = saved;
        } finally {
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // ----- Events -----
    fab.addEventListener('click', () => panelOpen ? closePanel() : openPanel());
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    sendBtn.addEventListener('click', sendMessage);
    if (editCancel) editCancel.addEventListener('click', cancelEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        if (e.key === 'Escape') cancelEdit();
    });

    if (clearBtnEl) {
        clearBtnEl.addEventListener('click', async () => {
            if (!confirm('Limpiar todos los mensajes de hoy?')) return;
            try {
                await chatService.clearTodayMessages();
                messages = [];
                if (panelOpen) renderMessages();
            } catch (err) {
                console.error('Error clearing chat:', err);
            }
        });
    }

    // ----- Carga inicial -----
    chatService.getTodayMessages().then(msgs => {
        messages = msgs;
        if (panelOpen) renderMessages();
    }).catch(console.error);

    // ----- Realtime -----
    chatChannel = chatService.subscribeToMessages(
        // INSERT
        (newMsg) => {
            if (messages.find(m => m.id === newMsg.id)) return; // evitar duplicados
            messages.push(newMsg);
            if (newMsg.sender_role !== myRole) {
                if (panelOpen) {
                    renderMessages();
                    chatService.markRead([newMsg.id]);
                } else {
                    unread++;
                    updateBadge();
                    playChatNotification();
                    showChatToast(newMsg);
                }
            } else {
                if (panelOpen) renderMessages();
            }
        },
        // UPDATE (edicion)
        (updatedMsg) => {
            const idx = messages.findIndex(m => m.id === updatedMsg.id);
            if (idx >= 0) {
                messages[idx] = { ...messages[idx], ...updatedMsg };
                if (panelOpen) renderMessages();
            }
        }
    );

    return {
        destroy() { chatService.unsubscribe(chatChannel); }
    };
}
