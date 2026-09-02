// ============================================================
// product-types.js — Detección de tipo de producto
// Prioriza el campo product_type de la DB. Si no existe (productos
// viejos sin migrar), hace fallback por nombre como antes.
// ============================================================

const BURGER_NAMES = ['burger', 'classic', 'bowser', 'cheat', 'fatality', 'ronin', 'yoshi'];
const CHOPP_NAMES = ['pilsen', 'chopp'];

/**
 * Devuelve el tipo de producto.
 * @param {Object} product - Producto de la DB (con campo product_type)
 * @returns {'cheat'|'bowser'|'burger'|'chopp'|'standard'}
 */
export function getProductType(product) {
    // Priorizar el campo de la DB si existe
    if (product.product_type && product.product_type !== 'standard') {
        return product.product_type;
    }

    // Fallback por nombre (productos sin migrar)
    const name = (product.name || '').toLowerCase();
    if (CHOPP_NAMES.some(k => name.includes(k))) return 'chopp';
    if (name.includes('cheat') && !name.includes('doble')) return 'cheat';
    if (name.includes('bowser')) return 'bowser';
    if (product.category_id === 'burgers' || BURGER_NAMES.some(k => name.includes(k))) return 'burger';
    return 'standard';
}

/**
 * Calcula el precio combo de un producto.
 * Usa combo_price si existe, sino price + 10.000 (regla de negocio actual).
 */
export function getComboPrice(product) {
    return product.combo_price || (product.price + 10000);
}

/**
 * Precio socio Club Burgame de un producto.
 * Devuelve club_price si existe, o null si el producto NO participa.
 */
export function getClubPrice(product) {
    return product && product.club_price ? product.club_price : null;
}
