// chat-ui.js  -  Panel de chat Facebook-style
// Usado en cocina.html y en el POS admin
import { chatService } from '../services/chat-service.js';

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

    // Inyectar HTML del panel
    const html = `
        <div class="chat-overlay" id="chat-overlay"></div>
        <button class="chat-fab" id="chat-fab" title="Chat Cocina-Admin">
            \u{1F4AC}
            <span class="chat-fab__badge" id="chat-badge"></span>
        </button>
        <div class="chat-panel" id="chat-panel">
            <div class="chat-panel__header">
                <div class="chat-panel__title">\u{1F4AC} CHAT BURGAME</div>
                <button class="chat-panel__close" id="chat-close">&times;</button>
            </div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-input-area">
                <input type="text" class="chat-input" id="chat-input" placeholder="Escribi un mensaje..." maxlength="300" autocomplete="off">
                <button class="chat-send-btn" id="chat-send">&#10148;</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const fab     = document.getElementById('chat-fab');
    const badge   = document.getElementById('chat-badge');
    const panel   = document.getElementById('chat-panel');
    const overlay = document.getElementById('chat-overlay');
    const closeBtn= document.getElementById('chat-close');
    const msgList = document.getElementById('chat-messages');
    const input   = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    function renderMessages() {
        if (messages.length === 0) {
            msgList.innerHTML = '<div class="chat-empty"><div class="chat-empty__icon">\u{1F4AC}</div><span>Sin mensajes aun</span></div>';
            return;
        }
        msgList.innerHTML = messages.map(msg => {
            const isOwn = msg.sender_role === myRole;
            return `<div class="chat-msg chat-msg--${isOwn ? 'own' : 'other'}">
                <span class="chat-msg__role">${isOwn ? 'Vos' : otherLabel}</span>
                <div class="chat-msg__bubble">${escapeHtml(msg.message)}</div>
                <span class="chat-msg__time">${formatTime(msg.created_at)}</span>
            </div>`;
        }).join('');
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

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        const saved = input.value;
        input.value = '';
        try {
            await chatService.sendMessage(myRole, text);
        } catch (err) {
            console.error('Chat send error:', err);
            input.value = saved;
        } finally {
            sendBtn.disabled = false;
            input.focus();
        }
    }

    fab.addEventListener('click', () => panelOpen ? closePanel() : openPanel());
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    chatService.getTodayMessages().then(msgs => {
        messages = msgs;
        if (panelOpen) renderMessages();
    }).catch(console.error);

    chatChannel = chatService.subscribeToMessages((newMsg) => {
        // Evitar duplicados si el propio mensaje ya esta en la lista
        if (messages.find(m => m.id === newMsg.id)) return;
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
    });

    return {
        destroy() { chatService.unsubscribe(chatChannel); }
    };
}
