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

// Trae todos los detalles de una caja específica: registro + órdenes con items + gastos con categorías
export async function getRegisterFullDetails(registerId) {
    const [ordersRes, expensesRes, registerRes] = await Promise.all([
        supabase.from('orders').select('*, order_items(*)').eq('cash_register_id', registerId).order('created_at', { ascending: true }),
        supabase.from('expenses').select('*, expense_categories(*)').eq('cash_register_id', registerId).order('created_at', { ascending: true }),
        supabase.from('cash_registers').select('*').eq('id', registerId).single()
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (expensesRes.error) throw expensesRes.error;
    if (registerRes.error) throw registerRes.error;

    const orders = ordersRes.data || [];
    const expenses = expensesRes.data || [];
    const register = registerRes.data;

    // Solo las pagas cuentan para ventas
    const paidOrders = orders.filter(o => o.status === 'paid');

    const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const payments = { efectivo: 0, transferencia: 0, debito: 0, credito: 0 };
    paidOrders.forEach(o => {
        const method = o.payment_method || 'efectivo';
        if (payments[method] !== undefined) {
            payments[method] += (o.total || 0);
        }
    });

    const expectedCash = (register.initial_amount || 0) + payments.efectivo - totalExpenses;
    const counted = register.counted_amount || 0;
    const difference = counted - expectedCash;

    return {
        register,
        orders,        // todas las órdenes del turno (incluye cancelled)
        paidOrders,    // solo las pagas
        expenses,
        totalSales,
        totalExpenses,
        payments,
        expectedCash,
        counted,
        difference
    };
}

// Edita campos de una caja existente (incluye cajas cerradas para correcciones)
export async function updateRegister(id, updates) {
    const { data, error } = await supabase.from('cash_registers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Trae todas las cajas (abiertas y cerradas) agrupadas para el navegador mes→día
export async function getAllRegistersGrouped() {
    const { data, error } = await supabase.from('cash_registers')
        .select('*')
        .order('opened_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export const cashService = {
    openRegister,
    closeRegister,
    getCurrentRegister,
    getRegisterHistory,
    getRegisterSummary,
    getRegisterFullDetails,
    updateRegister,
    getAllRegistersGrouped
};

