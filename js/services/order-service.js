import { supabase } from '../supabase-client.js';

export async function createOrder({ items, notes, customerName, cashRegisterId }) {
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // El nombre del cliente va en su propia columna (customer_name),
    // no embebido en notes. Notes queda solo para notas de cocina reales.
    let finalNotes = notes || '';
    let cName = customerName ? customerName.trim() : '';

    // Mapear items al formato JSON que espera la función RPC
    const rpcItems = items.map(item => {
        let pName = item.productName;
        const note = item.customNotes ? item.customNotes.trim() : '';
        if (note) {
            pName = `${pName} [📝 ${note}]`;
        }
        return {
            product_id: item.productId || null,
            product_name: pName,
            price: item.price,
            quantity: item.quantity,
            is_combo: item.isCombo || false
        };
    });

    // INTENTO 1: usar la función RPC atómica (1 solo round-trip)
    const { data: rpcData, error: rpcError } = await supabase.rpc('create_order_with_items', {
        p_notes: finalNotes,
        p_cash_register_id: cashRegisterId || null,
        p_items: rpcItems,
        p_customer_name: cName
    });

    if (!rpcError && rpcData) {
        return rpcData;
    }

    // FALLBACK: si la RPC no existe (no migrada), usar los 2 INSERTs secuenciales
    if (rpcError && !rpcError.message.includes('Could not find the function')) {
        throw new Error(rpcError.message || 'Error al guardar pedido');
    }

    console.warn('RPC create_order_with_items no disponible, usando fallback de 2 INSERTs');

    const basePayload = {
        notes: finalNotes,
        cash_register_id: cashRegisterId || null,
        status: 'ordered',
        total: total,
        customer_name: cName
    };

    const { data, error } = await supabase
        .from('orders')
        .insert([basePayload])
        .select()
        .single();

    if (error) {
        throw new Error(error.message || 'Error al guardar pedido en base de datos');
    }

    const order = data;

    const orderItems = items.map(item => {
        let pName = item.productName;
        const note = item.customNotes ? item.customNotes.trim() : '';
        if (note) {
            pName = `${pName} [📝 ${note}]`;
        }
        return {
            order_id: order.id,
            product_id: item.productId,
            product_name: pName,
            price: item.price,
            quantity: item.quantity,
            is_combo: item.isCombo || false
        };
    });

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    return order;
}

export async function updateStatus(orderId, newStatus) {
    const updateData = { status: newStatus };
    const timestampField = `${newStatus}_at`;
    if (['preparing', 'ready', 'delivered', 'paid', 'cancelled'].includes(newStatus)) {
        updateData[timestampField] = new Date().toISOString();
    }
    const { data, error } = await supabase.from('orders').update(updateData).eq('id', orderId).select().single();
    if (error) throw error;
    return data;
}

export async function processPayment(orderId, paymentMethod) {
    // El pago NO cambia el status de cocina (ordered→preparing→ready→delivered).
    // Se trackea con paid_at + payment_method, independientes del flujo de cocina.
    // Así la comanda sigue visible en cocina aunque el cliente ya haya pagado.
    const { data, error } = await supabase.from('orders').update({
        payment_method: paymentMethod,
        paid_at: new Date().toISOString()
    }).eq('id', orderId).select().single();
    if (error) throw error;
    return data;
}

export async function getDistinctCustomers() {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('name')
            .order('name');
        if (error) throw error;
        console.log('[customers] cargados desde tabla customers:', (data || []).length);
        return (data || []).map(c => c.name);
    } catch (err) {
        console.warn('[customers] falló query a customers, usando fallback de orders:', err.message || err);
        // Fallback: si la tabla customers no existe o falla, leer de orders
        const { data, error: fallbackErr } = await supabase
            .from('orders')
            .select('customer_name')
            .not('customer_name', 'eq', '')
            .order('customer_name');
        if (fallbackErr) console.warn('[customers] fallback también falló:', fallbackErr.message);
        const seen = new Set();
        const unique = [];
        (data || []).forEach(row => {
            const name = (row.customer_name || '').trim();
            if (name && !seen.has(name.toLowerCase())) {
                seen.add(name.toLowerCase());
                unique.push(name);
            }
        });
        console.log('[customers] cargados desde fallback (orders):', unique.length);
        return unique;
    }
}

export async function getActiveOrders() {
    // Comandas activas en cocina: todo lo que no esté cancelado.
    // El pago (paid_at) es independiente del status de preparación.
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).neq('status', 'cancelled').order('created_at');
    if (error) throw error;
    return data;
}

export async function getPendingPayment() {
    // Pedidos pendientes de cobro: los que no tienen paid_at y no están cancelados.
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).is('paid_at', null).neq('status', 'cancelled').order('created_at');
    if (error) throw error;
    return data;
}

export async function getTodaysOrders() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).gte('created_at', today.toISOString()).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getOrderItems(orderId) {
    const { data, error } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    if (error) throw error;
    return data;
}

export async function getOrdersByDateRange(from, to) {
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function cancelOrder(orderId) {
    return updateStatus(orderId, 'cancelled');
}

// Registry de canales realtime para limpiarlos al cambiar de página
const activeChannels = new Set();

export function subscribeToOrders(callback) {
    const channel = supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, callback)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, callback)
      .subscribe();
    activeChannels.add(channel);
    return channel;
}

// Limpia todas las suscripciones realtime activas (llamar al navegar entre páginas)
export function unsubscribeAllOrders() {
    activeChannels.forEach(ch => {
        try { supabase.removeChannel(ch); } catch { /* */ }
    });
    activeChannels.clear();
}

export async function updatePaymentMethod(orderId, newPaymentMethod) {
    const { data, error } = await supabase.from('orders')
        .update({ payment_method: newPaymentMethod })
        .eq('id', orderId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export const orderService = {
    createOrder,
    updateStatus,
    processPayment,
    updatePaymentMethod,
    getActiveOrders,
    getPendingPayment,
    getTodaysOrders,
    getTodayOrders: getTodaysOrders,
    getOrderItems,
    getOrdersByDateRange,
    cancelOrder,
    subscribeToOrders,
    unsubscribeAllOrders,
    getDistinctCustomers
};

