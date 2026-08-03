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
        
        const updateSidebar = (route) => {
            renderSidebar('sidebar-nav', route || currentRoute, appState.cashRegister ? 'open' : 'closed');
        };

        initRouter(updateSidebar);
        
        let startRoute = window.location.hash;
        if (!startRoute || startRoute === '#/') {
            startRoute = appState.cashRegister ? '#/ventas' : '#/caja';
        }
        
        updateSidebar(startRoute);
        await navigate(startRoute);

        // Setup kitchen button listener
        document.getElementById('btn-open-kitchen')?.addEventListener('click', () => {
            window.open('cocina.html', '_blank');
        });

    } catch (error) {
        console.error('App init error:', error);
        showToast({ message: 'Error al inicializar la aplicación', type: 'error' });
    }
}

document.addEventListener('DOMContentLoaded', init);
