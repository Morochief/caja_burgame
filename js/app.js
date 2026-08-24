import { supabase } from './supabase-client.js';
import { cashService } from './services/cash-service.js';
import { initRouter, navigate, currentRoute } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { showToast } from './components/toast.js';

export const appState = {
    cashRegister: null,
    _registerFetchedAt: 0,
    _registerFetchPromise: null
};

// Cache de cashRegister: refresca como mucho cada 30s, no en cada navegación
async function getCachedRegister(force = false) {
    const now = Date.now();
    if (!force && appState.cashRegister && (now - appState._registerFetchedAt) < 30000) {
        return appState.cashRegister;
    }
    // Evita fetch duplicado concurrente
    if (appState._registerFetchPromise) return appState._registerFetchPromise;
    appState._registerFetchPromise = cashService.getCurrentRegister()
        .then(reg => {
            appState.cashRegister = reg || null;
            appState._registerFetchedAt = now;
            return appState.cashRegister;
        })
        .finally(() => { appState._registerFetchPromise = null; });
    return appState._registerFetchPromise;
}

async function init() {
    try {
        await getCachedRegister();
        
        const updateSidebar = async (route) => {
            const reg = await getCachedRegister();
            renderSidebar('sidebar-nav', route || currentRoute, reg ? 'open' : 'closed');
        };

        initRouter((route) => {
            updateSidebar(route);
            // Cerrar sidebar móvil al cambiar de ruta
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebar-backdrop')?.classList.remove('active');
        });
        
        let startRoute = window.location.hash;
        if (!startRoute || startRoute === '#/') {
            startRoute = appState.cashRegister ? '#/ventas' : '#/caja';
        }
        
        updateSidebar(startRoute);
        await navigate(startRoute);

        // Mobile Sidebar Drawer Toggle
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('btn-toggle-sidebar');
        let backdrop = document.getElementById('sidebar-backdrop');

        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'sidebar-backdrop';
            backdrop.className = 'sidebar-backdrop';
            document.body.appendChild(backdrop);
        }

        toggleBtn?.addEventListener('click', () => {
            sidebar?.classList.toggle('open');
            backdrop?.classList.toggle('active');
        });

        backdrop?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            backdrop?.classList.remove('active');
        });

        // Suscripción Realtime para Notificaciones al Admin cuando Cocina marca "LISTO"
        supabase.channel('admin-kitchen-alerts')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'orders' 
            }, (payload) => {
                const updatedOrder = payload.new;
                const oldOrder = payload.old;

                if (updatedOrder && updatedOrder.status === 'ready' && (!oldOrder || oldOrder.status !== 'ready')) {
                    const cName = updatedOrder.customer_name || (updatedOrder.notes && updatedOrder.notes.match(/\[Cliente:\s*([^\]]+)\]/i)?.[1]) || 'Cliente';
                    
                    showToast({
                        message: `🔔 PEDIDO #${updatedOrder.order_number} (${cName}) — ¡LISTO EN BARRA!`,
                        type: 'success',
                        persistent: true,
                        onConfirm: () => {
                            if (window.location.hash === '#/ordenes') {
                                navigate('#/ordenes');
                            }
                        }
                    });
                }
            })
            .subscribe();

        // Initialized router and sidebar
    } catch (error) {
        console.error('App init error:', error);
        showToast({ message: 'Error al inicializar la aplicación', type: 'error' });
    }
}

document.addEventListener('DOMContentLoaded', init);
