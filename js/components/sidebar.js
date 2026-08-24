import { logout } from '../services/auth-service.js';

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
        { path: '#/inventario', icon: 'package', label: 'Inventario' },
        { path: '#/clientes', icon: 'users', label: 'Clientes' },
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

        <footer class="sidebar-footer" style="padding-top: 1rem; border-top: 1px solid var(--border-subtle); margin-top: auto; display: flex; flex-direction: column; gap: 0.75rem;">
            <!-- Badge Perfil Pixel Art BurgAdmin -->
            <div class="sidebar-user-card" style="background: rgba(255, 215, 0, 0.06); border: 1px solid var(--border-gold); border-radius: var(--radius-md); padding: 0.75rem 0.9rem; display: flex; align-items: center; gap: 0.75rem; box-shadow: 0 0 12px rgba(255, 215, 0, 0.15);">
                <div style="width: 36px; height: 36px; background: var(--color-primary); color: #0A0B0E; border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 900; box-shadow: 0 0 10px var(--color-primary-glow);">
                    👑
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-family: var(--font-title); font-size: 0.75rem; color: var(--color-primary); letter-spacing: 0.5px;">BURGADMIN</span>
                    <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); font-weight: 600;">LEVEL MAX • P1</span>
                </div>
            </div>

            <button id="btn-open-kitchen" class="btn btn--secondary btn--block" style="font-size: 0.85rem; padding: 0.6rem; border-color: var(--border-gold); color: var(--color-primary);">
                👨‍🍳 PANTALLA COCINA
            </button>
            
            <button id="btn-logout" class="btn btn--ghost btn--block" style="color: var(--color-danger); font-size: 0.85rem; font-weight: 700; padding: 0.5rem;">
                🚪 CERRAR SESIÓN
            </button>
        </footer>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Adjuntar eventos de forma garantizada cada vez que se renderiza el sidebar
    container.querySelector('#btn-open-kitchen')?.addEventListener('click', () => {
        window.open('cocina.html', '_blank');
    });

    container.querySelector('#btn-logout')?.addEventListener('click', () => {
        logout();
    });
}
