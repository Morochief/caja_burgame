import { supabase } from '../supabase-client.js';

export async function create({ 
    description, 
    categoryId, 
    amount, 
    cashRegisterId, 
    voucherType = 'sin_comprobante', 
    voucherNumber = null, 
    supplier = null, 
    paymentMethod = 'efectivo',
    expenseDate = null 
}) {
    const payload = {
        description,
        category_id: categoryId,
        amount: Number(amount),
        cash_register_id: paymentMethod === 'efectivo' ? cashRegisterId : null,
        voucher_type: voucherType,
        voucher_number: voucherNumber || null,
        supplier: supplier || null,
        payment_method: paymentMethod,
        expense_date: expenseDate || new Date().toISOString().slice(0, 10)
    };

    const { data, error } = await supabase.from('expenses').insert([payload]).select('*, expense_categories(*)').single();
    if (error) throw error;
    return data;
}

export async function update(id, updates) {
    const payload = { ...updates };
    if (payload.amount !== undefined) payload.amount = Number(payload.amount);
    
    // Si cambia el método de pago y no es efectivo, desvincular de la gaveta de caja
    if (payload.payment_method && payload.payment_method !== 'efectivo') {
        payload.cash_register_id = null;
    }

    const { data, error } = await supabase.from('expenses')
        .update(payload)
        .eq('id', id)
        .select('*, expense_categories(*)')
        .single();
    if (error) throw error;
    return data;
}

export async function getAll() {
    const { data, error } = await supabase.from('expenses').select('*, expense_categories(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getByDateRange(from, to) {
    const { data, error } = await supabase.from('expenses').select('*, expense_categories(*)').gte('created_at', from).lte('created_at', to).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getByCategory(categoryId) {
    const { data, error } = await supabase.from('expenses').select('*, expense_categories(*)').eq('category_id', categoryId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function getCategories() {
    const { data, error } = await supabase.from('expense_categories').select('*').order('name');
    if (error) throw error;
    return data;
}

export async function createCategory({ name, icon = '📌' }) {
    const { data, error } = await supabase.from('expense_categories').insert([{ name, icon }]).select().single();
    if (error) throw error;
    return data;
}

export async function deleteCategory(id) {
    const { data, error } = await supabase.from('expense_categories').delete().eq('id', id);
    if (error) throw error;
    return data;
}

export async function deleteExpense(id) {
    const { data, error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    return data;
}

export const expenseService = {
    create,
    update,
    getAll,
    getByDateRange,
    getByCategory,
    getCategories,
    createCategory,
    deleteCategory,
    deleteExpense
};



