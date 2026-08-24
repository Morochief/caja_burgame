// ============================================================
// product-card.js — Render unificado de tarjeta de producto
// Usado por ventas.js (POS) y cliente.js (autopedido)
// Elimina la duplicación de ~100 líneas de HTML en ambos archivos.
// ============================================================

import { formatGs } from './currency.js';
import { getProductType, getComboPrice } from '../utils/product-types.js';

/**
 * Devuelve el HTML de una tarjeta de producto con sus botones de acción.
 * @param {Object} product - Producto de la DB
 * @param {Object} [opts] - Opciones de render
 * @param {boolean} [opts.compact=false] - Versión compacta (cliente móvil)
 * @returns {string} HTML string
 */
export function renderProductCard(product, opts = {}) {
    const compact = opts.compact || false;
    const imageSrc = product.image_url || 'assets/placeholders/burger-placeholder.svg';
    const type = getProductType(product);
    const comboPrice = getComboPrice(product);
    const pad = compact ? '0.4rem 0.2rem' : '0.35rem 0.15rem';
    const fontSize = compact ? '0.75rem' : '0.68rem';
    const radius = compact ? '6px' : '4px';
    const colGap = compact ? '0.35rem' : '0.25rem';
    const rowGap = compact ? '0.3rem' : '0.25rem';

    const btnActions = renderActionsByType(type, product, comboPrice, { pad, fontSize, radius, colGap, rowGap, compact });

    return `
        <div class="product-card" data-id="${product.id}">
            <div class="product-card__image">
                <img src="${imageSrc}" alt="${product.name}">
            </div>
            <div class="product-card__content" ${compact ? 'style="padding: 0.75rem;"' : ''}>
                <h3 class="product-card__title" ${compact ? 'style="font-size: 0.95rem; font-weight: 800;"' : ''}>${product.name}</h3>
                <p class="product-card__ingredients" ${compact ? 'style="font-size: 0.75rem; min-height: 28px;"' : ''}>${(product.ingredients || []).join(', ')}</p>
                <div class="product-card__actions" style="margin-top: ${compact ? '0.5rem' : '0.4rem'};">
                    ${btnActions}
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Botones solo + combo (compartido por cheat, bowser y burger)
// ============================================================
function renderSingleComboButtons(product, comboPrice, s) {
    const textColor = s.compact ? 'var(--text-color)' : 'var(--text-main)';
    const subFontSize = s.compact ? '0.7rem' : '0.66rem';
    return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: ${s.colGap}; width: 100%;">
            <button class="btn btn-add-single" data-id="${product.id}" style="padding: ${s.pad}; font-size: ${s.fontSize}; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: ${textColor}; border-radius: ${s.radius}; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                <span>🍔 Solo</span><span style="color: var(--color-primary); font-size: ${subFontSize}; font-weight: 800;">${formatGs(product.price)}</span>
            </button>
            <button class="btn btn-add-combo" data-id="${product.id}" style="padding: ${s.pad}; font-size: ${s.fontSize}; font-weight: 800; background: var(--color-primary); border: none; color: #000; border-radius: ${s.radius}; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;">
                <span>🍟 Combo</span><span style="font-size: ${subFontSize}; font-weight: 900;">${formatGs(comboPrice)}</span>
            </button>
        </div>
    `;
}

// ============================================================
// Render de botones por tipo de producto
// ============================================================
function renderActionsByType(type, product, comboPrice, s) {
    switch (type) {
        case 'cheat':   return renderCheatActions(product, comboPrice, s);
        case 'bowser':  return renderBowserActions(product, comboPrice, s);
        case 'burger':  return renderBurgerActions(product, comboPrice, s);
        case 'chopp':   return renderChoppActions(product, s);
        default:        return renderStandardActions(product, s);
    }
}

// Hamburguesa con promo 3x50.000 (Jueves)
function renderCheatActions(product, comboPrice, s) {
    const promoLabel = s.compact ? 'PROMO 3x50.000' : 'PROMO JUEVES';
    const promoName = s.compact ? 'Promo 3x Cheat Burger' : 'Promo Jueves Cheat';
    const promoPad = s.compact ? '0.45rem 0.6rem' : '0.35rem 0.5rem';
    const promoFontSize = s.compact ? '0.78rem' : '0.7rem';
    const boxShadow = s.compact ? 'box-shadow: 0 0 12px rgba(255,215,0,0.3);' : '';

    return `
        <div style="display: flex; flex-direction: column; gap: ${s.rowGap}; width: 100%;">
            ${renderSingleComboButtons(product, comboPrice, s)}
            <button class="btn btn-add-promo" data-id="${product.id}" data-vname="${promoName}" data-vprice="${product.promo_price || 50000}" style="display: flex; justify-content: space-between; align-items: center; padding: ${promoPad}; font-size: ${promoFontSize}; font-weight: 900; background: linear-gradient(135deg, #FFD700, #FF9100); border: none; color: #000; border-radius: ${s.radius}; cursor: pointer; ${boxShadow}">
                <span>🔥 ${promoLabel}</span>
                <span style="font-weight: 900; white-space: nowrap;">${formatGs(product.promo_price || 50000)}</span>
            </button>
        </div>
    `;
}

// Hamburguesa con promo Viernes
function renderBowserActions(product, comboPrice, s) {
    const promoLabel = s.compact ? 'PROMO VIERNES' : 'VIERNES';
    const promoPad = s.compact ? '0.45rem 0.6rem' : '0.35rem 0.4rem';
    const promoFontSize = s.compact ? '0.78rem' : '0.65rem';

    return `
        <div style="display: flex; flex-direction: column; gap: ${s.rowGap}; width: 100%;">
            ${renderSingleComboButtons(product, comboPrice, s)}
            <button class="btn btn-add-promo" data-id="${product.id}" data-vname="Promo Viernes Bowser" data-vprice="${product.promo_price || 35000}" style="display: flex; justify-content: space-between; align-items: center; padding: ${promoPad}; font-size: ${promoFontSize}; font-weight: 900; background: rgba(255,82,82,0.15); border: 1px solid #FF5252; color: #FF5252; border-radius: ${s.radius}; cursor: pointer; overflow: hidden;">
                <span style="white-space: nowrap; flex-shrink: 0;">🔥 ${promoLabel}</span>
                <span style="font-weight: 900; white-space: nowrap; flex-shrink: 0;">${formatGs(product.promo_price || 35000)}</span>
            </button>
        </div>
    `;
}

// Hamburguesa estándar (solo + combo)
function renderBurgerActions(product, comboPrice, s) {
    return renderSingleComboButtons(product, comboPrice, s);
}

// Chopp: 3 variantes (1x, 2x1, libre)
function renderChoppActions(product, s) {
    return `
        <div style="display: flex; flex-direction: column; gap: ${s.rowGap}; width: 100%;">
            <button class="btn btn-add-variant" data-id="${product.id}" data-vname="1 Chopp" data-vprice="${product.price_1x || 15000}" style="display: flex; justify-content: space-between; align-items: center; padding: ${s.compact ? '0.4rem 0.6rem' : '0.35rem 0.5rem'}; font-size: ${s.compact ? '0.78rem' : '0.7rem'}; font-weight: 700; background: rgba(255,255,255,0.05); border: 1px solid var(--border-subtle); color: ${s.compact ? 'var(--text-color)' : 'var(--text-main)'}; border-radius: ${s.radius}; cursor: pointer;">
                <span>🍺 1 Chopp</span>
                <span style="color: var(--color-primary); font-weight: 800;">${formatGs(product.price_1x || 15000)}</span>
            </button>
            <button class="btn btn-add-variant" data-id="${product.id}" data-vname="2x1 Chopp" data-vprice="${product.price_2x1 || 25000}" style="display: flex; justify-content: space-between; align-items: center; padding: ${s.compact ? '0.4rem 0.6rem' : '0.35rem 0.5rem'}; font-size: ${s.compact ? '0.78rem' : '0.7rem'}; font-weight: 800; background: rgba(255,215,0,0.12); border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: ${s.radius}; cursor: pointer;">
                <span>🍻 ${s.compact ? 'Promo 2x1' : '2x1'}</span>
                <span style="font-weight: 900;">${formatGs(product.price_2x1 || 25000)}</span>
            </button>
            <button class="btn btn-add-variant" data-id="${product.id}" data-vname="Chopp LIBRE" data-vprice="${product.price_libre || 55000}" style="display: flex; justify-content: space-between; align-items: center; padding: ${s.compact ? '0.45rem 0.6rem' : '0.38rem 0.5rem'}; font-size: ${s.compact ? '0.78rem' : '0.72rem'}; font-weight: 900; background: var(--color-primary); border: none; color: #000; border-radius: ${s.radius}; cursor: pointer;">
                <span>♾️ Chopp LIBRE</span>
                <span style="font-weight: 900;">${formatGs(product.price_libre || 55000)}</span>
            </button>
        </div>
    `;
}

// Producto estándar (un solo botón agregar)
function renderStandardActions(product, s) {
    return `
        <button class="btn btn-add-single" data-id="${product.id}" style="width: 100%; padding: ${s.compact ? '0.45rem 0.5rem' : '0.4rem 0.5rem'}; font-size: ${s.compact ? '0.8rem' : '0.75rem'}; font-weight: 800; background: rgba(255,215,0,0.12); border: 1px solid var(--color-primary); color: var(--color-primary); border-radius: ${s.radius}; cursor: pointer;">
            ➕ ${formatGs(product.price)}
        </button>
    `;
}
