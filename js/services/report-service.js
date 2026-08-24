import { supabase } from '../supabase-client.js';

export async function getCurrentShiftSummary(cashRegisterId) {
    if (!cashRegisterId) {
        return {
            totalSales: 0,
            totalExpenses: 0,
            net: 0,
            orderCount: 0
        };
    }

    const [ordersRes, expensesRes] = await Promise.all([
        supabase.from('orders').select('*').eq('cash_register_id', cashRegisterId).eq('status', 'paid'),
        supabase.from('expenses').select('*').eq('cash_register_id', cashRegisterId)
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

export async function getRegisterHistory() {
    const { data, error } = await supabase.from('cash_registers').select('*').order('opened_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getDailySalesSummary(days = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('orders')
        .select('total, status, payment_method, created_at')
        .gte('created_at', fromDate.toISOString())
        .eq('status', 'paid')
        .order('created_at', { ascending: true });

    if (error) throw error;

    // Agrupar por día
    const dailyMap = {};
    (data || []).forEach(order => {
        const day = new Date(order.created_at).toISOString().split('T')[0];
        if (!dailyMap[day]) {
            dailyMap[day] = {
                date: day,
                totalSales: 0,
                orderCount: 0,
                payments: { efectivo: 0, transferencia: 0, debito: 0, credito: 0 }
            };
        }
        dailyMap[day].totalSales += order.total || 0;
        dailyMap[day].orderCount++;
        const method = order.payment_method || 'efectivo';
        if (dailyMap[day].payments[method] !== undefined) {
            dailyMap[day].payments[method] += order.total || 0;
        }
    });

    return Object.values(dailyMap).reverse(); // más reciente primero
}

export const reportService = {
    getCurrentShiftSummary,
    getWeeklySales,
    getTopProducts,
    getPaymentBreakdown,
    getRegisterHistory,
    getDailySalesSummary
};

