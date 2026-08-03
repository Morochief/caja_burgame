import { supabase } from './supabase-client.js';
import { cashService } from './services/cash-service.js';
import { initRouter, navigate, currentRoute } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { showToast } from './components/toast.js';

export const appState = {
    cashRegister: null
};

async function init() {
    try {
        const register = await cashService.getCurrentRegister();
        appState.cashRegister = register || null;
        
        const updateSidebar = async (route) => {
            appState.cashRegister = await cashService.getCurrentRegister();
            renderSidebar('sidebar-nav', route || currentRoute, appState.cashRegister ? 'open' : 'closed');
        };

        initRouter((route) => {
            updateSidebar(route);
        });
        
        let startRoute = window.location.hash;
        if (!startRoute || startRoute === '#/') {
            startRoute = appState.cashRegister ? '#/ventas' : '#/caja';
        }
        
        updateSidebar(startRoute);
        await navigate(startRoute);

        // Setup kitchen and logout button listeners
        document.getElementById('btn-open-kitchen')?.addEventListener('click', () => {
            window.open('cocina.html', '_blank');
        });

        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            const { logout } = await import('./services/auth-service.js');
            logout();
        });

    } catch (error) {
        console.error('App init error:', error);
        showToast({ message: 'Error al inicializar la aplicación', type: 'error' });
    }
}

document.addEventListener('DOMContentLoaded', init);
