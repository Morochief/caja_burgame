export function renderSidebar(containerId, currentRoute, cashRegisterStatus) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const navItems = [
        { path: '#/ventas', icon: 'shopping-cart', label: 'Ventas (POS)' },
        { path: '#/ordenes', icon: 'clipboard-list', label: 'Órdenes' },
        { path: '#/dashboard', icon: 'bar-chart-3', label: 'Dashboard' },
        { path: '#/menu', icon: 'utensils', label: 'Menú' },
        { path: '#/caja', icon: 'wallet', label: 'Caja' },
        { path: '#/gastos', icon: 'arrow-down-right', label: 'Gastos' },
        { path: '#/reportes', icon: 'trending-up', label: 'Reportes' },
        { path: '#/ajustes', icon: 'settings', label: 'Ajustes' }
    ];

    container.innerHTML = `
        <div class="sidebar__register-status sidebar__register-status--${cashRegisterStatus}">
            <span class="status-indicator"></span>
            <span>Caja: ${cashRegisterStatus === 'open' ? 'ABIERTA' : 'CERRADA'}</span>
        </div>

        <ul class="sidebar__menu">
            ${navItems.map(item => {
                const isActive = currentRoute === item.path;
                return `
                    <li class="sidebar__menu-item">
                        <a href="${item.path}" class="sidebar__menu-link ${isActive ? 'active' : ''}">
                            <i data-lucide="${item.icon}"></i>
                            <span>${item.label}</span>
                        </a>
                    </li>
                `;
            }).join('')}
        </ul>
    `;

    if (window.lucide) window.lucide.createIcons();
}
