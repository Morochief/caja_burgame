// ============================================================
// cart.js — Lógica de carrito compartida
// Usado por ventas.js (POS) y cliente.js (autopedido)
// Unifica: addItem, addVariant, removeItem, qty +/-, calculateTotal, renderCartItems
// ============================================================

import { formatGs } from './currency.js';

/**
 * Crea una nueva instancia de carrito (state aislado por página).
 * Cada página llama createCart() y obtiene su propio carrito independiente.
 * Soporta "modo club": si está activo, los productos con club_price
 * se cobran a ese precio (todas sus presentaciones).
 */
export function createCart() {
    let items = [];
    let clubMode = false;

    return {
        get items() { return items; },
        set items(v) { items = v; },
        get clubMode() { return clubMode; },
        set clubMode(v) { clubMode = !!v; },
        get count() { return items.reduce((a, b) => a + b.quantity, 0); },
        get total() { return items.reduce((acc, item) => acc + (item.price * item.quantity), 0); },

        /**
         * Calcula el precio vigente según el modo club.
         * En modo club, si el producto tiene club_price, ese precio aplica
         * para TODAS sus presentaciones (solo/combo/variante/promo).
         */
        resolvePrice(product, basePrice) {
            if (clubMode) {
                const club = product && product.club_price;
                if (club) return club;
            }
            return basePrice;
        },

        /**
         * Activa o desactiva el modo club y re-preciifica todos los items.
         * @param {boolean} active
         * @param {Object} [clubLookup] - mapa productId -> producto (o club_price)
         */
        setClubMode(active, clubLookup) {
            clubMode = !!active;
            if (!clubLookup) return;

            items.forEach(item => {
                const entry = clubLookup[item.productId];
                const product = entry && entry.club_price !== undefined ? entry : null;
                const club = product ? product.club_price : null;

                if (clubMode && club) {
                    item.price = club;
                    item.clubApplied = true;
                } else if (product) {
                    // Volver al precio normal de la presentación.
                    item.price = resolveNormalPrice(item, product);
                    item.clubApplied = false;
                }
            });
        },

        /**
         * Agrega un producto al carrito (individual o combo).
         * Si ya existe (mismo producto + combo + sin notas + mismo precio), suma cantidad.
         */
        addProduct(product, isCombo) {
            const basePrice = isCombo ? (product.combo_price || (product.price + 10000)) : product.price;
            const price = this.resolvePrice(product, basePrice);
            const existingIdx = items.findIndex(ci =>
                ci.productId === product.id && ci.isCombo === isCombo && ci.price === price && (ci.customNotes || '') === ''
            );

            if (existingIdx >= 0) {
                items[existingIdx].quantity++;
            } else {
                items.push({
                    productId: product.id,
                    productName: product.name,
                    price: price,
                    basePrice: basePrice,
                    clubApplied: clubMode && !!product.club_price,
                    quantity: 1,
                    isCombo: isCombo,
                    customNotes: ''
                });
            }
        },

        /**
         * Agrega una variante (ej: Chopp 1x, 2x1, Libre; Promo Cheat/Bowser).
         * En modo club, si el producto tiene club_price, la variante pasa a ese precio.
         */
        addVariant(product, variantName, variantPrice) {
            const fullName = `${product.name} (${variantName})`;
            const price = this.resolvePrice(product, variantPrice);
            const existingIdx = items.findIndex(ci =>
                ci.productId === product.id && ci.productName === fullName && ci.price === price
            );

            if (existingIdx >= 0) {
                items[existingIdx].quantity++;
            } else {
                items.push({
                    productId: product.id,
                    productName: fullName,
                    price: price,
                    basePrice: variantPrice,
                    clubApplied: clubMode && !!product.club_price,
                    quantity: 1,
                    isCombo: false,
                    customNotes: ''
                });
            }
        },

        /** Incrementa cantidad del item idx */
        inc(idx) {
            if (items[idx]) items[idx].quantity++;
        },

        /** Decrementa cantidad; si llega a 0 lo elimina */
        dec(idx) {
            if (!items[idx]) return;
            items[idx].quantity--;
            if (items[idx].quantity <= 0) items.splice(idx, 1);
        },

        /** Elimina item por idx */
        remove(idx) {
            items.splice(idx, 1);
        },

        /** Actualiza nota individual de un item */
        setNote(idx, note) {
            if (items[idx]) items[idx].customNotes = note;
        },

        /** Vacia el carrito */
        clear() {
            items = [];
        },

        /**
         * Render HTML de los items del carrito.
         * @param {Object} [opts]
         * @param {string} [opts.noteInputClass] - clase del input de nota ('input-item-note' | 'input-item-note-cliente')
         * @param {boolean} [opts.showComboToggle] - mostrar botón toggle combo (POS) o no (cliente)
         * @param {string} [opts.notePlaceholder] - placeholder del input de nota
         */
        renderItems(opts = {}) {
            if (items.length === 0) {
                return `
                    <div class="cart-empty">
                        <i data-lucide="shopping-cart"></i>
                        <p>Selecciona productos para iniciar el pedido</p>
                    </div>
                `;
            }

            const noteClass = opts.noteInputClass || 'input-item-note';
            const showToggle = opts.showComboToggle !== false;
            const placeholder = opts.notePlaceholder || '✏️ Aclaración (ej: Sin cebolla...)';

            return items.map((item, idx) => {
                const isBurger = item.isCombo !== undefined && !item.productName.includes('(');
                const hasVariantLabel = item.productName.includes('(');

                let subtitleHtml = '';
                if (showToggle && isBurger) {
                    subtitleHtml = `
                        <button class="btn-toggle-combo" data-idx="${idx}" style="background: transparent; border: none; padding: 0; font-size: 0.75rem; cursor: pointer; color: ${item.isCombo ? 'var(--color-primary)' : 'var(--text-muted)'}; margin-top: 0.2rem; font-weight: 700;">
                            ${item.isCombo ? '🍟 COMBO (Papas + Bebida)' : '🍔 Solo Hamburguesa (Cambiar a Combo)'}
                        </button>
                    `;
                } else if (hasVariantLabel) {
                    const variantText = item.productName.match(/\((.*?)\)/)?.[1] || '';
                    subtitleHtml = `
                        <span style="font-size: 0.75rem; color: var(--color-primary); margin-top: 0.2rem; font-weight: 700; display: block;">
                            ✨ Presentación: ${variantText}
                        </span>
                    `;
                }

                return `
                    <div class="cart-item" style="border-left: 3px solid ${item.clubApplied ? '#FFD700' : (item.isCombo ? 'var(--color-primary)' : 'var(--border-subtle)')};">
                        <div class="cart-item__info">
                            <div>
                                <div class="card-item__title" style="font-weight: 700;">${item.productName} ${item.clubApplied ? '<span class="badge badge--yellow" style="font-size:0.62rem; vertical-align: middle; margin-left: 0.25rem;">👑 CLUB</span>' : ''}</div>
                                ${subtitleHtml}
                            </div>
                            <div class="cart-item__subtotal">${formatGs(item.price * item.quantity)}</div>
                        </div>
                        <div style="margin-top: 0.4rem;">
                            <input type="text" class="${noteClass}" data-idx="${idx}" placeholder="${placeholder}" value="${item.customNotes || ''}" style="width: 100%; font-size: 0.78rem; padding: 0.35rem 0.6rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 4px; color: var(--color-primary);">
                        </div>
                        <div class="cart-item__controls" style="margin-top: 0.5rem;">
                            <button class="btn-qty" data-action="dec" data-idx="${idx}">-</button>
                            <span class="cart-item__qty">${item.quantity}</span>
                            <button class="btn-qty" data-action="inc" data-idx="${idx}">+</button>
                            <button class="btn-remove" data-action="del" data-idx="${idx}"><i data-lucide="x"></i></button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    };
}

/**
 * Recalcula el precio NORMAL (sin club) de un item ya agregado.
 * - Si el item es variante/promo (el nombre tiene "(...)"), se conserva
 *   el último precio no-club conocido. Para eso guardamos el precio original
 *   en "basePrice" al agregarlo.
 * - Si es solo/combo, se calcula desde el producto.
 */
function resolveNormalPrice(item, product) {
    if (item.basePrice) return item.basePrice;
    if (item.isCombo) return product.combo_price || (product.price + 10000);
    return product.price;
}
