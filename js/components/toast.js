export function showToast({ message, type = 'success', duration = 3200, persistent = false, onConfirm = null }) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = {
        success: '⚡',
        error: '💥',
        warning: '⚠️',
        info: '🕹️'
    };

    const typeTitles = {
        success: 'SISTEMA BURGAME',
        error: 'ALERTA DE SISTEMA',
        warning: 'AVISO',
        info: 'NOTIFICACIÓN'
    };

    const toast = document.createElement('div');
    toast.className = `toast-card toast-card--${type} ${persistent ? 'toast-card--persistent' : ''}`;
    
    toast.innerHTML = `
        <div class="toast-card__icon">${icons[type] || '⚡'}</div>
        <div class="toast-card__content">
            <div class="toast-card__title">${typeTitles[type] || 'SISTEMA'}</div>
            <div class="toast-card__message">${message}</div>
        </div>
        ${persistent ? `
            <button class="btn btn--primary btn--sm btn-toast-confirm" style="margin-left: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.75rem; white-space: nowrap;">
                ✓ CHECK
            </button>
        ` : `
            <button class="toast-card__close">&times;</button>
        `}
        ${!persistent ? `<div class="toast-card__progress"></div>` : ''}
    `;

    const closeToast = () => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 250);
    };

    // Botón cerrar estándar
    toast.querySelector('.toast-card__close')?.addEventListener('click', closeToast);

    // Botón confirm persistente
    toast.querySelector('.btn-toast-confirm')?.addEventListener('click', () => {
        if (typeof onConfirm === 'function') onConfirm();
        closeToast();
    });

    container.appendChild(toast);

    if (!persistent) {
        const progressEl = toast.querySelector('.toast-card__progress');
        if (progressEl) {
            progressEl.style.transition = `transform ${duration}ms linear`;
            requestAnimationFrame(() => {
                progressEl.style.transform = 'scaleX(0)';
            });
        }

        setTimeout(() => {
            if (toast.parentNode) {
                closeToast();
            }
        }, duration);
    }
}
