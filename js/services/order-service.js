import { supabase } from '../supabase-client.js';

export async function createOrder({ items, notes, customerName, cashRegisterId }) {
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const { data: order, error: orderError } = await supabase.from('orders').insert([{
        notes,
        customer_name: customerName || 'Mesa / Cliente General',
        cash_register_id: cashRegisterId,
        status: 'ordered',
        total: total
    }]).select().single();
    if (orderError) throw orderError;

    const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        price: item.price,
        quantity: item.quantity,
        is_combo: item.isCombo || false
    }));

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
    const { data, error } = await supabase.from('orders').update({
        status: 'paid',
        payment_method: paymentMethod,
        paid_at: new Date().toISOString()
    }).eq('id', orderId).select().single();
    if (error) throw error;
    return data;
}

export async function getActiveOrders() {
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).not('status', 'in', '("paid","cancelled")').order('created_at');
    if (error) throw error;
    return data;
}

export async function getPendingPayment() {
    const { data, error } = await supabase.from('orders').select(`*, order_items(*)`).in('status', ['ordered', 'preparing', 'ready', 'delivered']).order('created_at');
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

export function subscribeToOrders(callback) {
    const channel = supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, callback)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, callback)
      .subscribe();
    return channel;
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
    subscribeToOrders
};

