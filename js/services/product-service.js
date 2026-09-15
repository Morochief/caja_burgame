import { supabase } from '../supabase-client.js';

// ====== CACHE de productos y categorías en localStorage con memoria fallback ======
// Permite carga ULTRA RÁPIDA (0 ms) instantánea en POS y portal de clientes,
// tolerando Edge Tracking Prevention y modos de navegación restringida sin errores.
const CACHE_KEY = 'bg_products_cache_v2';
const CACHE_TS_KEY = 'bg_products_cache_ts_v2';
const CACHE_TTL = 300000; // 5 minutos (revalidación SWR en background)

const CAT_CACHE_KEY = 'bg_categories_cache_v2';
const CAT_CACHE_TS_KEY = 'bg_categories_cache_ts_v2';
const CAT_CACHE_TTL = 600000; // 10 minutos

const memoryStore = new Map();

function safeGetItem(key) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch { /* Tracking Prevention o cookies bloqueadas */ }
    return memoryStore.get(key) || null;
}

function safeSetItem(key, value) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
            return;
        }
    } catch { /* QuotaExceeded o Tracking Prevention */ }
    memoryStore.set(key, value);
}

function safeRemoveItem(key) {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(key);
        }
    } catch { /* */ }
    memoryStore.delete(key);
}

export function getCached() {
    try {
        const raw = safeGetItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function getCachedCategories() {
    try {
        const raw = safeGetItem(CAT_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function readCache() {
    try {
        const ts = safeGetItem(CACHE_TS_KEY);
        if (!ts || Date.now() - parseInt(ts, 10) > CACHE_TTL) return null;
        const raw = safeGetItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(data) {
    try {
        safeSetItem(CACHE_KEY, JSON.stringify(data));
        safeSetItem(CACHE_TS_KEY, Date.now().toString());
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bg:products-updated', { detail: data }));
        }
    } catch (e) {
        console.warn('[product-service] Error escribiendo cache:', e);
    }
}

function readCatCache() {
    try {
        const ts = safeGetItem(CAT_CACHE_TS_KEY);
        if (!ts || Date.now() - parseInt(ts, 10) > CAT_CACHE_TTL) return null;
        const raw = safeGetItem(CAT_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCatCache(data) {
    try {
        safeSetItem(CAT_CACHE_KEY, JSON.stringify(data));
        safeSetItem(CAT_CACHE_TS_KEY, Date.now().toString());
    } catch { /* */ }
}

export function invalidateProductCache() {
    try {
        safeRemoveItem(CACHE_KEY);
        safeRemoveItem(CACHE_TS_KEY);
    } catch { /* */ }
}

export function invalidateCatCache() {
    try {
        safeRemoveItem(CAT_CACHE_KEY);
        safeRemoveItem(CAT_CACHE_TS_KEY);
    } catch { /* */ }
}

export async function getAll() {
    const cached = readCache();
    if (cached) {
        // En background revalidar suavemente
        getAllFresh().catch(() => {});
        return cached;
    }
    return getAllFresh();
}

// Fetch fresco que actualiza localStorage y emite evento global
export async function getAllFresh() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name');
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
            promo_price: productData.promo_price || null,
            club_price: productData.club_price || null,
            price_1x: productData.price_1x || null,
            price_2x1: productData.price_2x1 || null,
            price_libre: productData.price_libre || null,
            product_type: productData.product_type || 'standard',
            ingredients: productData.ingredients || [],
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
            promo_price: productData.promo_price || null,
            club_price: productData.club_price || null,
            price_1x: productData.price_1x || null,
            price_2x1: productData.price_2x1 || null,
            price_libre: productData.price_libre || null,
            product_type: productData.product_type || 'standard',
            ingredients: productData.ingredients || [],
            stock: 0,
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

// Eliminación real (hard delete) de la base de datos.
export async function hardDeleteProduct(id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw error;
    invalidateProductCache();
    return true;
}

export async function getCategories() {
    const cached = readCatCache();
    if (cached) return cached;

    const { data, error } = await supabase.from('categories').select('*').eq('type', 'product').order('sort_order');
    if (error) throw error;
    writeCatCache(data);
    return data;
}

export async function createCategory(catData) {
    const { data, error } = await supabase.from('categories').insert([{
        name: catData.name,
        icon: catData.icon || '🍔',
        type: 'product',
        sort_order: catData.sort_order !== undefined ? Number(catData.sort_order) : 99
    }]).select().single();
    if (error) throw error;
    invalidateCatCache();
    return data;
}

export async function updateCategory(id, catData) {
    const { data, error } = await supabase.from('categories').update({
        name: catData.name,
        icon: catData.icon,
        sort_order: catData.sort_order !== undefined ? Number(catData.sort_order) : 99
    }).eq('id', id).select().single();
    if (error) throw error;
    invalidateCatCache();
    return data;
}

export async function deleteCategory(id) {
    const { count, error: countErr } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category_id', id);
    if (!countErr && count > 0) {
        throw new Error(`No se puede eliminar la categoría porque contiene ${count} producto(s). Reasigna o elimina los productos primero.`);
    }
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
    invalidateCatCache();
    return true;
}

export async function getLowStock(threshold = 10) {
    const { data, error } = await supabase.from('products').select('*, categories(*)').eq('active', true).lt('stock', threshold).order('stock');
    if (error) throw error;
    return data;
}

export const productService = {
    getAll,
    getAllFresh,
    getAllAdmin,
    getById,
    getByCategory,
    getCached,
    getCachedCategories,
    search,
    create,
    update,
    saveProduct,
    deleteProduct,
    hardDeleteProduct,
    toggleActiveStatus,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    invalidateCatCache,
    getLowStock,
    invalidateProductCache
};


