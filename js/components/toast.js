export function showToast({ message, type = 'success', duration = 3200 }) {
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
    toast.className = `toast-card toast-card--${type}`;
    
    toast.innerHTML = `
        <div class="toast-card__icon">${icons[type] || '⚡'}</div>
        <div class="toast-card__content">
            <div class="toast-card__title">${typeTitles[type] || 'SISTEMA'}</div>
            <div class="toast-card__message">${message}</div>
        </div>
        <button class="toast-card__close">&times;</button>
        <div class="toast-card__progress"></div>
    `;

    // Botón cerrar
    toast.querySelector('.toast-card__close').addEventListener('click', () => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    const progressEl = toast.querySelector('.toast-card__progress');
    if (progressEl) {
        progressEl.style.transition = `transform ${duration}ms linear`;
        requestAnimationFrame(() => {
            progressEl.style.transform = 'scaleX(0)';
        });
    }

    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 250);
        }
    }, duration);
}
