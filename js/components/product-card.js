// ============================================================
// product-card.js — Render unificado de tarjeta de producto
// Usado por ventas.js (POS) y cliente.js (autopedido)
// ============================================================

import { formatGs } from './currency.js';
import { getProductType, getComboPrice, getClubPrice } from '../utils/product-types.js';

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
    const clubPrice = getClubPrice(product);

    // Badges flotantes sobre la imagen (estilo Arcade HUD)
    const floatingBadges = [];
    if (type === 'bowser') {
        floatingBadges.push(`<span class="product-badge product-badge--promo">🔥 VIERNES</span>`);
    } else if (type === 'cheat') {
        floatingBadges.push(`<span class="product-badge product-badge--promo">⚡ 3x50K</span>`);
    }

    if (clubPrice) {
        floatingBadges.push(`<span class="product-badge product-badge--club" title="Precio Socio Club">👑 CLUB ${formatGs(clubPrice)}</span>`);
    }

    const badgesHtml = floatingBadges.length > 0 
        ? `<div class="product-card__badges">${floatingBadges.join('')}</div>` 
        : '';

    const btnActions = renderActionsByType(type, product, comboPrice, { compact });

    return `
        <div class="product-card ${compact ? 'product-card--compact' : ''}" data-id="${product.id}">
            <div class="product-card__image">
                <img src="${imageSrc}" alt="${product.name}" loading="lazy">
                ${badgesHtml}
            </div>
            <div class="product-card__content">
                <div class="product-card__info">
                    <h3 class="product-card__title" title="${product.name}">${product.name}</h3>
                    <p class="product-card__ingredients">${(product.ingredients || []).join(', ')}</p>
                </div>
                <div class="product-card__actions">
                    ${btnActions}
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// Botones solo + combo (Dúo con diseño arcade de alto impacto)
// ============================================================
function renderSingleComboButtons(product, comboPrice) {
    return `
        <div class="product-actions__duo">
            <button class="btn btn-action-solo btn-add-single" data-id="${product.id}">
                <span class="btn-action-label">🍔 Solo</span>
                <span class="btn-action-price">${formatGs(product.price)}</span>
            </button>
            <button class="btn btn-action-combo btn-add-combo" data-id="${product.id}">
                <span class="btn-action-label">🍟 Combo</span>
                <span class="btn-action-price">${formatGs(comboPrice)}</span>
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
        case 'burger':  return renderBurgerActions(product, comboPrice);
        case 'chopp':   return renderChoppActions(product, s);
        default:        return renderStandardActions(product);
    }
}

// Hamburguesa con promo 3x50.000 (Jueves)
function renderCheatActions(product, comboPrice, s) {
    const promoLabel = s.compact ? 'PROMO JUEVES' : '🔥 PROMO JUEVES';
    const promoName = 'Promo Jueves Cheat';
    const promoPrice = product.promo_price || 50000;

    return `
        <div class="product-actions__stack">
            ${renderSingleComboButtons(product, comboPrice)}
            <button class="btn btn-action-promo btn-action-promo--gold btn-add-promo" 
                    data-id="${product.id}" 
                    data-vname="${promoName}" 
                    data-vprice="${promoPrice}">
                <span class="promo-text">${promoLabel}</span>
                <span class="promo-price">${formatGs(promoPrice)}</span>
            </button>
        </div>
    `;
}

// Hamburguesa con promo Viernes (Bowser) - Estilo Cyber-Amber sin rojo chillón
function renderBowserActions(product, comboPrice, s) {
    const promoLabel = s.compact ? 'PROMO VIERNES' : '🔥 PROMO VIERNES';
    const promoName = 'Promo Viernes Bowser';
    const promoPrice = product.promo_price || 35000;

    return `
        <div class="product-actions__stack">
            ${renderSingleComboButtons(product, comboPrice)}
            <button class="btn btn-action-promo btn-action-promo--bowser btn-add-promo" 
                    data-id="${product.id}" 
                    data-vname="${promoName}" 
                    data-vprice="${promoPrice}">
                <span class="promo-text">${promoLabel}</span>
                <span class="promo-price">${formatGs(promoPrice)}</span>
            </button>
        </div>
    `;
}

// Hamburguesa estándar (solo + combo)
function renderBurgerActions(product, comboPrice) {
    return renderSingleComboButtons(product, comboPrice);
}

// Chopp: 3 variantes estilizadas limpiamente
function renderChoppActions(product, s) {
    const p1 = product.price_1x || 15000;
    const p2 = product.price_2x1 || 25000;
    const pLibre = product.price_libre || 55000;

    return `
        <div class="product-actions__stack">
            <button class="btn btn-action-variant btn-add-variant" data-id="${product.id}" data-vname="1 Chopp" data-vprice="${p1}">
                <span>🍺 1 Chopp</span>
                <span class="variant-price">${formatGs(p1)}</span>
            </button>
            <button class="btn btn-action-variant btn-action-variant--featured btn-add-variant" data-id="${product.id}" data-vname="2x1 Chopp" data-vprice="${p2}">
                <span>🍻 Promo 2x1</span>
                <span class="variant-price">${formatGs(p2)}</span>
            </button>
            <button class="btn btn-action-variant btn-action-variant--gold btn-add-variant" data-id="${product.id}" data-vname="Chopp LIBRE" data-vprice="${pLibre}">
                <span>♾️ Chopp LIBRE</span>
                <span class="variant-price">${formatGs(pLibre)}</span>
            </button>
        </div>
    `;
}

// Producto estándar (un solo botón agregar con precio mono)
function renderStandardActions(product) {
    return `
        <button class="btn btn-action-single btn-add-single" data-id="${product.id}">
            <span>➕ Agregar</span>
            <span class="single-price">${formatGs(product.price)}</span>
        </button>
    `;
}

