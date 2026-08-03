import { supabase } from '../supabase-client.js';

export async function getDailySummary(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [ordersRes, expensesRes] = await Promise.all([
        supabase.from('orders').select('*').gte('created_at', today.toISOString()).eq('status', 'paid'),
        supabase.from('expenses').select('*').gte('created_at', today.toISOString())
    ]);

    const orders = ordersRes.data || [];
    const expenses = expensesRes.data || [];

    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const net = totalSales - totalExpenses;

    return {
        totalSales,
        totalExpenses,
        net,
        orderCount: orders.length
    };
}

export async function getWeeklySales() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase.from('orders').select('*').gte('created_at', sevenDaysAgo.toISOString()).eq('status', 'paid');
    if (error) throw error;
    return data || [];
}

export async function getTopProducts(limit = 10) {
    const { data, error } = await supabase.from('order_items').select('*').limit(limit);
    if (error) throw error;
    return data || [];
}

export async function getPaymentBreakdown() {
    const { data, error } = await supabase.from('orders').select('payment_method, total').eq('status', 'paid');
    if (error) throw error;
    return data || [];
}

export const reportService = {
    getDailySummary,
    getWeeklySales,
    getTopProducts,
    getPaymentBreakdown
};

