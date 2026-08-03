import { authService } from './services/auth-service.js';

export let currentRoute = '';

const routes = {
    '#/login': () => import('./pages/login.js').then(m => m.renderLoginPage()),
    '#/dashboard': () => import('./pages/dashboard.js').then(m => m.renderDashboardPage()),
    '#/ventas': () => import('./pages/ventas.js').then(m => m.renderVentasPage()),
    '#/ordenes': () => import('./pages/ordenes.js').then(m => m.renderOrdenesPage()),
    '#/menu': () => import('./pages/menu.js').then(m => m.renderMenuPage()),
    '#/caja': () => import('./pages/caja.js').then(m => m.renderCajaPage()),
    '#/gastos': () => import('./pages/gastos.js').then(m => m.renderGastosPage()),
    '#/reportes': () => import('./pages/reportes.js').then(m => m.renderReportesPage()),
    '#/ajustes': () => import('./pages/ajustes.js').then(m => m.renderAjustesPage()),
    '#/cliente': () => {
        window.location.href = 'cliente.html';
        const dummy = document.createElement('div');
        return dummy;
    }
};

export async function navigate(path) {
    const session = authService.getSession();

    // Redirigir a login si no hay sesión iniciada
    if (!session && path !== '#/login') {
        path = '#/login';
    } else if (session && session.role === 'kitchen' && path !== '#/login') {
        // Redirigir al cocinero a la pantalla de cocina
        window.location.href = 'cocina.html';
        return;
    } else if (session && path === '#/login') {
        path = '#/ventas';
    }

    if (!routes[path]) {
        path = '#/ventas';
    }
    
    currentRoute = path;
    window.location.hash = path;

    // Ocultar Sidebar y Header Móvil en la pantalla de Login
    const sidebar = document.getElementById('sidebar');
    const mobileHeader = document.querySelector('.mobile-header');
    if (path === '#/login') {
        if (sidebar) sidebar.style.display = 'none';
        if (mobileHeader) mobileHeader.style.display = 'none';
    } else {
        if (sidebar) sidebar.style.display = '';
        if (mobileHeader) mobileHeader.style.display = '';
    }
    
    const pageContainer = document.getElementById('page-container');
    if (pageContainer) {
        pageContainer.innerHTML = `
            <div class="page-loading">
                <div class="pixel-spinner"></div>
                <p>Cargando...</p>
            </div>
        `;
        
        try {
            const pageElement = await routes[path]();
            pageContainer.innerHTML = '';
            if (pageElement instanceof HTMLElement) {
                pageContainer.appendChild(pageElement);
            } else if (typeof pageElement === 'string') {
                pageContainer.innerHTML = pageElement;
            }
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Failed to load page', error);
            pageContainer.innerHTML = `
                <div class="card p-4" style="color: #FF5252; padding: 2rem; text-align: center;">
                    <h2>Error al cargar la página</h2>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

export function initRouter(onRouteChanged) {
    window.addEventListener('hashchange', () => {
        const route = window.location.hash || '#/ventas';
        navigate(route);
        if (onRouteChanged) onRouteChanged(route);
    });
}
