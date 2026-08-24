import { supabase } from '../supabase-client.js';

// ====== CACHE de productos en sessionStorage ======
// Evita un fetch a Supabase en cada carga de página (cliente/ventas/menu)
const CACHE_KEY = 'bg_products_cache';
const CACHE_TS_KEY = 'bg_products_cache_ts';
const CACHE_TTL = 120000; // 2 minutos

function readCache() {
    try {
        const ts = sessionStorage.getItem(CACHE_TS_KEY);
        if (!ts || Date.now() - parseInt(ts, 10) > CACHE_TTL) return null;
        const raw = sessionStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TS_KEY, Date.now().toString());
    } catch { /* sessionStorage lleno o inaccesible */ }
}

// Categorías: cacheadas también (cambian muy rara vez)
const CAT_CACHE_KEY = 'bg_categories_cache';
const CAT_CACHE_TS_KEY = 'bg_categories_cache_ts';
const CAT_CACHE_TTL = 300000; // 5 minutos

function readCatCache() {
    try {
        const ts = sessionStorage.getItem(CAT_CACHE_TS_KEY);
        if (!ts || Date.now() - parseInt(ts, 10) > CAT_CACHE_TTL) return null;
        const raw = sessionStorage.getItem(CAT_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCatCache(data) {
    try {
        sessionStorage.setItem(CAT_CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CAT_CACHE_TS_KEY, Date.now().toString());
    } catch { /* */ }
}

export function invalidateProductCache() {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(CACHE_TS_KEY);
}

export async function getAll() {
    const cached = readCache();
    if (cached) return cached;

    // OPTIMIZACIÓN: select solo de products sin el join categories(*).
    // Las categorías ya se cachean por separado en getCategories().
    const { data, error } = await supabase.from('products').select('*').eq('active', true).order('name');
    if (error) throw error;
    writeCache(data);
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
    const result = productData.id ? await _updateProduct(productData) : await _insertProduct(productData);
    invalidateProductCache(); // Invalidar cache tras mutación
    return result;
}

async function _updateProduct(productData) {
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
}

async function _insertProduct(productData) {
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

export async function toggleActiveStatus(id, activeState) {
    const { data, error } = await supabase.from('products')
        .update({ active: activeState })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    invalidateProductCache();
    return data;
}

export async function deleteProduct(id) {
    return toggleActiveStatus(id, false);
}

export async function getCategories() {
    const cached = readCatCache();
    if (cached) return cached;

    const { data, error } = await supabase.from('categories').select('*').eq('type', 'product').order('sort_order');
    if (error) throw error;
    writeCatCache(data);
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
    getLowStock,
    invalidateProductCache
};


