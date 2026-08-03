import { supabase } from '../supabase-client.js';

export async function openRegister(initialAmount) {
    const { data, error } = await supabase.from('cash_registers').insert([{
        initial_amount: initialAmount,
        status: 'open'
    }]).select().single();
    if (error) throw error;
    return data;
}

export async function closeRegister(id, countedAmount, notes) {
    const { data, error } = await supabase.from('cash_registers').update({
        counted_amount: countedAmount,
        notes: notes,
        status: 'closed',
        closed_at: new Date().toISOString()
    }).eq('id', id).select().single();
    if (error) throw error;
    return data;
}

export async function getCurrentRegister() {
    const { data, error } = await supabase.from('cash_registers').select('*').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
}

export async function getRegisterHistory() {
    const { data, error } = await supabase.from('cash_registers').select('*').order('opened_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getRegisterSummary(registerId) {
    const [ordersRes, expensesRes, registerRes] = await Promise.all([
        supabase.from('orders').select('*').eq('cash_register_id', registerId).eq('status', 'paid'),
        supabase.from('expenses').select('*').eq('cash_register_id', registerId),
        supabase.from('cash_registers').select('*').eq('id', registerId).single()
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (registerRes.error) throw registerRes.error;

    const orders = ordersRes.data || [];
    const expenses = expensesRes.data || [];
    const register = registerRes.data;

    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const payments = {
        efectivo: 0,
        transferencia: 0,
        debito: 0,
        credito: 0
    };

    orders.forEach(o => {
        const method = o.payment_method || 'efectivo';
        if (payments[method] !== undefined) {
            payments[method] += (o.total || 0);
        }
    });

    const expectedCash = (register.initial_amount || 0) + payments.efectivo - totalExpenses;

    return {
        totalSales,
        totalExpenses,
        expectedCash,
        payments
    };
}

export const cashService = {
    openRegister,
    closeRegister,
    getCurrentRegister,
    getRegisterHistory,
    getRegisterSummary
};

