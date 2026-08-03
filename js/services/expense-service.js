import { supabase } from '../supabase-client.js';

export async function create({ description, categoryId, amount, cashRegisterId }) {
    const { data, error } = await supabase.from('expenses').insert([{
        description,
        category_id: categoryId,
        amount,
        cash_register_id: cashRegisterId
    }]).select().single();
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

export async function deleteExpense(id) {
    const { data, error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) throw error;
    return data;
}

export const expenseService = {
    create,
    getAll,
    getByDateRange,
    getByCategory,
    getCategories,
    deleteExpense
};


