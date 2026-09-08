import { supabase } from '../supabase-client.js';
import { productService } from './product-service.js';

export async function getInventoryProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*, categories(*)')
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function getMovements(limit = 100, productId = null) {
    let query = supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (productId) {
        query = query.eq('product_id', productId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function adjustStock({ productId, quantity, reason = 'ajuste', notes = '' }) {
    const fullReason = notes ? `${reason}: ${notes}` : reason;
    const { data, error } = await supabase.rpc('adjust_stock', {
        p_product_id: productId,
        p_quantity: Number(quantity),
        p_reason: fullReason
    });

    if (error) throw error;
    productService.invalidateProductCache();
    return data;
}

export async function setDirectStock({ productId, currentStock, targetStock, reason = 'conteo_fisico', notes = '' }) {
    const diff = Number(targetStock) - Number(currentStock);
    if (diff === 0) {
        return { previous_stock: currentStock, new_stock: targetStock, diff: 0 };
    }
    const fullReason = notes ? `[CONTEO REAL] ${reason}: ${notes}` : `[CONTEO REAL] ${reason}`;
    const result = await adjustStock({
        productId,
        quantity: diff,
        reason: fullReason
    });
    return { ...result, diff };
}

export async function updateInventoryConfig(productId, { min_stock, cost_price }) {
    const updates = {};
    if (min_stock !== undefined) updates.min_stock = Math.max(0, parseInt(min_stock, 10) || 0);
    if (cost_price !== undefined) updates.cost_price = Math.max(0, parseInt(cost_price, 10) || 0);

    const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single();

    if (error) throw error;
    productService.invalidateProductCache();
    return data;
}

export async function toggleProductActive(productId, active) {
    const { data, error } = await supabase
        .from('products')
        .update({ active })
        .eq('id', productId)
        .select()
        .single();

    if (error) throw error;
    productService.invalidateProductCache();
    return data;
}

export const inventoryService = {
    getInventoryProducts,
    getMovements,
    adjustStock,
    setDirectStock,
    updateInventoryConfig,
    toggleProductActive
};
