import { supabase } from '../supabase-client.js';

export async function getAll() {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('active', true).order('name');
    if (error) throw error;
    return data;
}

export async function getById(id) {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('id', id).single();
    if (error) throw error;
    return data;
}

export async function getByCategory(categoryId) {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('category_id', categoryId).eq('active', true).order('name');
    if (error) throw error;
    return data;
}

export async function search(query) {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('active', true).ilike('name', `%${query}%`).order('name');
    if (error) throw error;
    return data;
}

export async function create(product) {
    const { data, error } = await supabase.from('products').insert([product]).select().single();
    if (error) throw error;
    return data;
}

export async function update(id, productData) {
    const { data, error } = await supabase.from('products').update(productData).eq('id', id).select().single();
    if (error) throw error;
    return data;
}

export async function getAllAdmin() {
    const { data, error } = await supabase.from('products').select('*, categories(*)').order('name');
    if (error) throw error;
    return data;
}

export async function saveProduct(productData) {
    if (productData.id) {
        const { data, error } = await supabase.from('products')
            .update({
                name: productData.name,
                category_id: productData.category_id,
                price: productData.price,
                combo_price: productData.combo_price || null,
                ingredients: productData.ingredients || [],
                stock: productData.stock || 0,
                image_url: productData.image_url,
                active: productData.active !== undefined ? productData.active : true
            })
            .eq('id', productData.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const { data, error } = await supabase.from('products')
            .insert([{
                name: productData.name,
                category_id: productData.category_id,
                price: productData.price,
                combo_price: productData.combo_price || null,
                ingredients: productData.ingredients || [],
                stock: productData.stock || 0,
                image_url: productData.image_url,
                active: true
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    }
}

export async function toggleActiveStatus(id, activeState) {
    const { data, error } = await supabase.from('products')
        .update({ active: activeState })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteProduct(id) {
    return toggleActiveStatus(id, false);
}

export async function getCategories() {
    const { data, error } = await supabase.from('categories').select('*').eq('type', 'product').order('sort_order');
    if (error) throw error;
    return data;
}

export async function getLowStock(threshold = 10) {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('active', true).lt('stock', threshold).order('stock');
    if (error) throw error;
    return data;
}

export const productService = {
    getAll,
    getAllAdmin,
    getById,
    getByCategory,
    search,
    create,
    update,
    saveProduct,
    deleteProduct,
    toggleActiveStatus,
    getCategories,
    getLowStock
};


