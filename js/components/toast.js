export function showToast({ message, type = 'info', duration = 3000 }) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
    }

    const colors = {
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-500',
        info: 'bg-blue-600'
    };

    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'i'
    };

    const toast = document.createElement('div');
    toast.className = `${colors[type]} text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 transform translate-y-full opacity-0 transition-all duration-300 relative overflow-hidden`;
    
    toast.innerHTML = `
        <div class="font-bold text-lg">${icons[type]}</div>
        <div>${message}</div>
        <div class="absolute bottom-0 left-0 h-1 bg-white bg-opacity-30 w-full toast-progress" style="transform-origin: left;"></div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-full', 'opacity-0');
        const progress = toast.querySelector('.toast-progress');
        progress.style.transition = `transform ${duration}ms linear`;
        requestAnimationFrame(() => {
            progress.style.transform = 'scaleX(0)';
        });
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
