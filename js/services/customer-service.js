import { supabase } from '../supabase-client.js';

// ====== CRUD de la tabla customers ======

export async function getAll() {
    const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, notes, created_at, last_order_at')
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function create(customerData) {
    const { data, error } = await supabase
        .from('customers')
        .insert([{
            name: customerData.name.trim(),
            phone: (customerData.phone || '').trim(),
            notes: (customerData.notes || '').trim()
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Busca un cliente por nombre (case-insensitive). Devuelve null si no existe.
export async function findByName(name) {
    const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, notes, created_at, last_order_at')
        .ilike('name', name.trim())
        .limit(1);
    if (error) throw error;
    return (data && data.length > 0) ? data[0] : null;
}

export async function update(id, customerData) {
    const { data, error } = await supabase
        .from('customers')
        .update({
            name: customerData.name.trim(),
            phone: (customerData.phone || '').trim(),
            notes: (customerData.notes || '').trim()
        })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function remove(id) {
    const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// Reasigna los pedidos de un nombre de cliente a otro (para fusión de duplicados).
// Usa match exacto (case-sensitive) para no afectar clientes con casing distinto.
export async function reassignOrders(fromName, toName) {
    const { error } = await supabase
        .from('orders')
        .update({ customer_name: toName })
        .eq('customer_name', fromName);
    if (error) throw error;
}

// Trae stats de compras agrupadas por customer_name desde orders
export async function getStatsByName() {
    const { data, error } = await supabase
        .from('orders')
        .select('customer_name, total, status, created_at')
        .not('customer_name', 'eq', '')
        .order('created_at', { ascending: false });

    if (error) throw error;

    const stats = {};
    (data || []).forEach(order => {
        const name = (order.customer_name || '').trim();
        if (!name) return;
        if (!stats[name]) {
            stats[name] = { total_spent: 0, order_count: 0, last_order: null, orders: [] };
        }
        if (order.paid_at) {
            stats[name].total_spent += order.total || 0;
        }
        stats[name].order_count++;
        stats[name].orders.push(order);
        if (!stats[name].last_order || new Date(order.created_at) > new Date(stats[name].last_order)) {
            stats[name].last_order = order.created_at;
        }
    });
    return stats;
}

export const customerService = {
    getAll,
    findByName,
    create,
    update,
    remove,
    reassignOrders,
    getStatsByName
};
