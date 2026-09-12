import { supabase } from '../supabase-client.js';

// Registry de canales para suscripción en tiempo real
const activeTabChannels = new Set();

/**
 * Abre una nueva cuenta para una mesa o cliente.
 */
export async function openTab({ tabName, tableNumber = '', customerName = '', cashRegisterId = null, notes = '' }) {
    const finalName = tabName || (tableNumber ? `Mesa ${tableNumber}${customerName ? ` — ${customerName}` : ''}` : customerName || 'Cuenta Nueva');
    
    try {
        const { data, error } = await supabase
            .from('customer_tabs')
            .insert([{
                tab_name: finalName,
                table_number: String(tableNumber || '').trim(),
                customer_name: String(customerName || '').trim(),
                status: 'open',
                cash_register_id: cashRegisterId || null,
                notes: notes || '',
                total_amount: 0,
                paid_amount: 0
            }])
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('[tabService] No se pudo insertar en customer_tabs (¿falta migración?):', err.message);
        // Fallback: Retornar objeto sintético local
        const fallbackTab = {
            id: 'local-tab-' + Date.now(),
            tab_name: finalName,
            table_number: String(tableNumber || '').trim(),
            customer_name: String(customerName || '').trim(),
            status: 'open',
            cash_register_id: cashRegisterId,
            opened_at: new Date().toISOString(),
            total_amount: 0,
            _isFallback: true
        };
        return fallbackTab;
    }
}

let _customerTabsTableExists = null; // null: no verificado, true: existe, false: usar fallback directo

/**
 * Obtiene todas las cuentas activas (abiertas o pidiendo la cuenta) del turno/día de hoy.
 */
export async function getActiveTabs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Si ya detectamos previamente que customer_tabs no existe en Supabase, ir directo a fallback sin generar 404
    if (_customerTabsTableExists === false) {
        return getFallbackActiveTabs();
    }

    try {
        // 1. Intentar consultar tabla customer_tabs solo de HOY
        const { data: tabs, error: tabsError } = await supabase
            .from('customer_tabs')
            .select('*')
            .in('status', ['open', 'bill_requested'])
            .gte('opened_at', todayIso)
            .order('opened_at', { ascending: false });

        if (tabsError) {
            if (tabsError.code === '42P01' || tabsError.message?.includes('customer_tabs') || tabsError.message?.includes('schema cache')) {
                _customerTabsTableExists = false;
            }
            throw tabsError;
        }

        _customerTabsTableExists = true;

        // Traer órdenes asociadas a estas cuentas
        const tabIds = (tabs || []).map(t => t.id);
        let ordersByTab = {};

        if (tabIds.length > 0) {
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .in('tab_id', tabIds)
                .gte('created_at', todayIso)
                .neq('status', 'cancelled');

            if (!ordersError && orders) {
                orders.forEach(ord => {
                    if (!ordersByTab[ord.tab_id]) ordersByTab[ord.tab_id] = [];
                    ordersByTab[ord.tab_id].push(ord);
                });
            }
        }

        return (tabs || []).map(tab => {
            const relatedOrders = ordersByTab[tab.id] || [];
            const calculatedTotal = relatedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            return {
                ...tab,
                orders: relatedOrders,
                total_amount: calculatedTotal || tab.total_amount || 0,
                order_count: relatedOrders.length
            };
        });

    } catch (err) {
        return getFallbackActiveTabs();
    }
}

/**
 * Fallback de cuentas: solo agrupa pedidos creados HOY que expresamente sean autopedido con cuenta abierta o tengan tab_id
 */
async function getFallbackActiveTabs() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .gte('created_at', todayIso)
            .is('paid_at', null)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true });

        if (error) throw error;
        if (!orders || orders.length === 0) return [];

        // Solo incluir pedidos que explícitamente se abrieron como cuenta o tienen tab_id
        const tabOrders = orders.filter(o => 
            o.tab_id || 
            (o.notes && o.notes.includes('[CUENTA ABIERTA]')) || 
            (o.notes && o.notes.includes('[TAB]'))
        );

        if (tabOrders.length === 0) return [];

        const tabMap = new Map();

        tabOrders.forEach(order => {
            const name = (order.customer_name || '').trim();
            const notes = (order.notes || '').trim();
            
            const mesaMatch = name.match(/Mesa\s*(\w+)/i) || notes.match(/Mesa\s*(\w+)/i);
            const tableNum = mesaMatch ? mesaMatch[1] : '';
            
            const groupKey = order.tab_id || (tableNum ? `mesa-${tableNum.toLowerCase()}` : (name ? `cli-${name.toLowerCase()}` : `ord-${order.id}`));
            const displayTitle = tableNum ? `Mesa ${tableNum} (${name || 'Salón'})` : (name || `Comanda #${order.order_number}`);

            if (!tabMap.has(groupKey)) {
                tabMap.set(groupKey, {
                    id: 'fallback-' + groupKey,
                    tab_name: displayTitle,
                    table_number: tableNum,
                    customer_name: name,
                    status: notes.includes('PIDIÓ CUENTA') ? 'bill_requested' : 'open',
                    opened_at: order.created_at,
                    orders: [],
                    total_amount: 0,
                    _isFallback: true
                });
            }

            const current = tabMap.get(groupKey);
            current.orders.push(order);
            current.total_amount += (order.total || 0);
        });

        return Array.from(tabMap.values());
    } catch (e) {
        console.error('[tabService] Error en fallback de cuentas:', e);
        return [];
    }
}

/**
 * Obtiene el detalle de una cuenta por su ID
 */
export async function getTabById(tabId) {
    if (!tabId) return null;
    
    if (String(tabId).startsWith('fallback-')) {
        const all = await getFallbackActiveTabs();
        return all.find(t => t.id === tabId) || null;
    }

    try {
        const { data: tab, error } = await supabase
            .from('customer_tabs')
            .select('*')
            .eq('id', tabId)
            .single();

        if (error) throw error;

        const { data: orders } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('tab_id', tabId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: true });

        const relatedOrders = orders || [];
        const total = relatedOrders.reduce((sum, o) => sum + (o.total || 0), 0);

        return {
            ...tab,
            orders: relatedOrders,
            total_amount: total || tab.total_amount || 0
        };
    } catch (err) {
        console.warn('[tabService] Error obteniendo cuenta:', err.message);
        return null;
    }
}

/**
 * Asocia una orden existente a una cuenta abierta.
 */
export async function addOrderToTab(tabId, orderId) {
    if (!tabId || !orderId || String(tabId).startsWith('fallback-')) return;

    try {
        await supabase
            .from('orders')
            .update({ tab_id: tabId })
            .eq('id', orderId);
    } catch (err) {
        console.warn('[tabService] Error asignando tab_id a orden:', err.message);
    }
}

/**
 * El cliente solicita la cuenta ("Pedir la cuenta").
 */
export async function requestBill(tabId) {
    if (!tabId) return;

    if (String(tabId).startsWith('fallback-')) {
        // En fallback, actualizamos notas de las órdenes asociadas
        const tab = await getTabById(tabId);
        if (tab && tab.orders) {
            for (const ord of tab.orders) {
                const prevNotes = ord.notes ? ord.notes + ' ' : '';
                await supabase.from('orders').update({
                    notes: `${prevNotes}[PIDIÓ CUENTA]`
                }).eq('id', ord.id);
            }
        }
        return;
    }

    try {
        await supabase
            .from('customer_tabs')
            .update({
                status: 'bill_requested',
                bill_requested_at: new Date().toISOString()
            })
            .eq('id', tabId);
    } catch (err) {
        console.warn('[tabService] Error al solicitar cuenta:', err.message);
    }
}

/**
 * Cierra la cuenta y cobra todas las comandas asociadas de forma consolidada.
 */
export async function closeAndPayTab(tabId, paymentMethod, cashRegisterId) {
    const nowIso = new Date().toISOString();
    const tab = await getTabById(tabId);
    if (!tab) throw new Error('Cuenta no encontrada');

    const ordersToPay = tab.orders || [];

    // 1. Cobrar cada una de las órdenes asociadas a la cuenta
    for (const order of ordersToPay) {
        const updatePayload = {
            paid_at: nowIso,
            payment_method: paymentMethod,
            cash_register_id: cashRegisterId || order.cash_register_id || null
        };
        // Si estaba en pending_payment, pasar a ordered o mantener el estado
        if (order.status === 'pending_payment' || order.status === 'pending_approval') {
            updatePayload.status = 'ordered';
            updatePayload.ordered_at = nowIso;
        }

        await supabase.from('orders').update(updatePayload).eq('id', order.id);
    }

    // 2. Marcar la cuenta como cerrada en customer_tabs (si no es fallback sintético)
    if (!String(tabId).startsWith('fallback-')) {
        try {
            await supabase
                .from('customer_tabs')
                .update({
                    status: 'closed',
                    closed_at: nowIso,
                    payment_method: paymentMethod,
                    paid_amount: tab.total_amount,
                    cash_register_id: cashRegisterId || null
                })
                .eq('id', tabId);
        } catch (err) {
            console.warn('[tabService] Error cerrando customer_tabs:', err.message);
        }
    }

    return {
        success: true,
        tabId,
        ordersPaidCount: ordersToPay.length,
        totalAmount: tab.total_amount,
        paymentMethod
    };
}

/**
 * Suscripción Realtime a cambios en cuentas y órdenes
 */
export function subscribeToTabs(callback) {
    const channel = supabase.channel('customer-tabs-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_tabs' }, callback)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, callback)
        .subscribe();

    activeTabChannels.add(channel);
    return channel;
}

export function unsubscribeAllTabs() {
    activeTabChannels.forEach(ch => {
        try { supabase.removeChannel(ch); } catch { }
    });
    activeTabChannels.clear();
}

export const tabService = {
    openTab,
    getActiveTabs,
    getTabById,
    addOrderToTab,
    requestBill,
    closeAndPayTab,
    subscribeToTabs,
    unsubscribeAllTabs
};
