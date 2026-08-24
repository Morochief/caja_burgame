// ============================================================
// product-types.js — Detección unificada de tipo de producto
// Reemplaza las cadenas de .includes('burger'), .includes('cheat')...
// que estaban duplicadas en ventas.js y cliente.js
// ============================================================

const BURGER_NAMES = ['burger', 'classic', 'bowser', 'cheat', 'fatality', 'ronin', 'yoshi'];
const CHOPP_NAMES = ['pilsen', 'chopp'];

/**
 * Devuelve el tipo de producto basado en su nombre/categoría.
 * @param {Object} product - Producto de la DB
 * @returns {'cheat'|'bowser'|'burger'|'chopp'|'standard'}
 */
export function getProductType(product) {
    const name = (product.name || '').toLowerCase();

    // Chopp se detecta primero porque "Chopp" no contiene "burger"
    if (CHOPP_NAMES.some(k => name.includes(k))) return 'chopp';

    // Cheat: hamburguesa con promo especial (excluir "doble" para no matchear "Doble Cheat" como promo cheat)
    if (name.includes('cheat') && !name.includes('doble')) return 'cheat';

    // Bowser: hamburguesa con promo viernes
    if (name.includes('bowser')) return 'bowser';

    // Burger: cualquier hamburguesa (por nombre o categoría)
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
