import { productService } from '../services/product-service.js';
import { orderService } from '../services/order-service.js';
import { cashService } from '../services/cash-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

let currentCategory = 'all';
let searchQuery = '';
let cartItems = [];
let currentNotes = '';
let products = [];
let categories = [];

export async function renderVentasPage() {
    const container = document.createElement('div');
    container.className = 'ventas-page';

    // Cargar datos iniciales
    try {
        const [prodData, catData] = await Promise.all([
            productService.getAll(),
            productService.getCategories()
        ]);
        products = prodData || [];
        categories = catData || [];
    } catch (err) {
        showToast({ message: 'Error al cargar productos', type: 'error' });
    }

    container.innerHTML = `
        <div class="ventas-layout">
            <!-- Sección de Selección de Productos (Izquierda / Centro) -->
            <section class="ventas-catalog">
                <div class="ventas-sticky-header">
                    <header class="ventas-header">
                        <div class="search-bar">
                            <i data-lucide="search"></i>
                            <input type="text" id="pos-search" placeholder="Buscar producto por nombre..." value="${searchQuery}">
                        </div>
                    </header>

                    <!-- Categorías -->
                    <nav class="categories-bar">
                        <button class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-cat="all">
                            ⚡ Todos
                        </button>
                        ${categories.map(cat => `
                            <button class="category-tab ${currentCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
                                ${cat.icon || '🍔'} ${cat.name}
                            </button>
                        `).join('')}
                    </nav>
                </div>

                <!-- Grid de Productos -->
                <div class="products-grid" id="products-grid">
                    ${renderProductsGrid()}
                </div>
            </section>

            <!-- Sidebar Lateral: Ticket del Pedido Actual -->
            <aside class="ticket-panel">
                <div class="ticket-header">
                    <h2><i data-lucide="shopping-bag"></i> PEDIDO ACTUAL</h2>
                    <span class="ticket-status badge badge--yellow">EN PREPARACIÓN</span>
                </div>

                <div class="ticket-items" id="ticket-items">
                    ${renderCartItems()}
                </div>

                <div class="ticket-summary">
                    <div class="ticket-notes">
                        <label for="order-notes"><i data-lucide="file-text"></i> Notas para Cocina:</label>
                        <input type="text" id="order-notes" placeholder="Ej: Sin cebolla, extra salsa..." value="${currentNotes}">
                    </div>

                    <div class="ticket-row ticket-row--total">
                        <span>TOTAL</span>
                        <span class="ticket-total-val" id="ticket-total">${formatGs(calculateTotal())}</span>
                    </div>

                    <div class="ticket-actions">
                        <button id="btn-clear-cart" class="btn btn--danger btn--ghost">
                            <i data-lucide="trash-2"></i> Limpiar
                        </button>
                        <button id="btn-send-order" class="btn btn--primary btn--block">
                            ⌨️ Presiona "O" para ORDENAR
                        </button>
                    </div>
                </div>
            </aside>
        </div>
    `;

    setupEvents(container);
    return container;
}

function renderProductsGrid() {
    let filtered = products;

    if (currentCategory !== 'all') {
        filtered = filtered.filter(p => p.category_id === currentCategory);
    }

    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(query));
    }

    if (filtered.length === 0) {
        return `
            <div class="products-empty">
                <div class="empty-icon">🎮</div>
                <p>No se encontraron productos disponibles</p>
            </div>
        `;
    }

    return filtered.map(product => {
        const imageSrc = product.image_url || 'assets/placeholders/burger-placeholder.svg';
        return `
            <div class="product-card" data-id="${product.id}">
                <div class="product-card__image">
                    <img src="${imageSrc}" alt="${product.name}">
                </div>
                <div class="product-card__content">
                    <h3 class="product-card__title">${product.name}</h3>
                    <p class="product-card__ingredients">${(product.ingredients || []).join(', ')}</p>
                    <div class="product-card__footer">
                        <span class="product-card__price">${formatGs(product.price)}</span>
                        ${product.combo_price ? `<span class="badge badge--combo">Combo ${formatGs(product.combo_price)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCartItems() {
    if (cartItems.length === 0) {
        return `
            <div class="cart-empty">
                <i data-lucide="shopping-cart"></i>
                <p>Selecciona productos para iniciar el pedido</p>
            </div>
        `;
    }

    return cartItems.map((item, idx) => `
        <div class="cart-item">
            <div class="cart-item__info">
                <div class="cart-item__title">${item.productName} ${item.isCombo ? '(COMBO)' : ''}</div>
                <div class="cart-item__subtotal">${formatGs(item.price * item.quantity)}</div>
            </div>
            <div class="cart-item__controls">
                <button class="btn-qty" data-action="dec" data-idx="${idx}">-</button>
                <span class="cart-item__qty">${item.quantity}</span>
                <button class="btn-qty" data-action="inc" data-idx="${idx}">+</button>
                <button class="btn-remove" data-action="del" data-idx="${idx}"><i data-lucide="x"></i></button>
            </div>
        </div>
    `).join('');
}

function calculateTotal() {
    return cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}

function setupEvents(container) {
    // Filtros de categoría
    container.querySelectorAll('.category-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.cat;
            container.querySelectorAll('.category-tab').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            container.querySelector('#products-grid').innerHTML = renderProductsGrid();
            attachProductClickEvents(container);
        });
    });

    // Búsqueda
    const searchInput = container.querySelector('#pos-search');
    searchInput?.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        container.querySelector('#products-grid').innerHTML = renderProductsGrid();
        attachProductClickEvents(container);
    });

    // Notas de Cocina
    const notesInput = container.querySelector('#order-notes');
    notesInput?.addEventListener('input', (e) => {
        currentNotes = e.target.value;
    });

    // Limpiar Carrito
    container.querySelector('#btn-clear-cart')?.addEventListener('click', () => {
        cartItems = [];
        updateTicketUI(container);
    });

    // Enviar Pedido
    container.querySelector('#btn-send-order')?.addEventListener('click', () => {
        sendOrderToKitchen(container);
    });

    attachProductClickEvents(container);
    setupKeyboardShortcuts(container);
}

function attachProductClickEvents(container) {
    container.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const product = products.find(p => p.id === id);
            if (!product) return;

            // Si tiene combo_price, agregar estándar por defecto
            const existingIdx = cartItems.findIndex(ci => ci.productId === product.id && !ci.isCombo);
            if (existingIdx >= 0) {
                cartItems[existingIdx].quantity++;
            } else {
                cartItems.push({
                    productId: product.id,
                    productName: product.name,
                    price: product.price,
                    quantity: 1,
                    isCombo: false,
                    aggregates: []
                });
            }

            updateTicketUI(container);
        });
    });
}

function updateTicketUI(container) {
    const ticketItemsContainer = container.querySelector('#ticket-items');
    if (ticketItemsContainer) {
        ticketItemsContainer.innerHTML = renderCartItems();
        if (window.lucide) window.lucide.createIcons();
    }

    const totalEl = container.querySelector('#ticket-total');
    if (totalEl) {
        totalEl.textContent = formatGs(calculateTotal());
    }

    // Attach qty controls
    container.querySelectorAll('.btn-qty, .btn-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);

            if (action === 'inc') {
                cartItems[idx].quantity++;
            } else if (action === 'dec') {
                cartItems[idx].quantity--;
                if (cartItems[idx].quantity <= 0) {
                    cartItems.splice(idx, 1);
                }
            } else if (action === 'del') {
                cartItems.splice(idx, 1);
            }
            updateTicketUI(container);
        });
    });
}

async function sendOrderToKitchen(container) {
    if (cartItems.length === 0) {
        showToast({ message: 'Agrega al menos un producto al pedido', type: 'warning' });
        return;
    }

    try {
        const activeRegister = await cashService.getCurrentRegister();
        if (!activeRegister) {
            showToast({ message: 'Debes abrir caja antes de registrar pedidos', type: 'error' });
            return;
        }

        const newOrder = await orderService.createOrder({
            items: cartItems,
            notes: currentNotes,
            cashRegisterId: activeRegister.id
        });

        showToast({ 
            message: `🏆 ¡Pedido #${newOrder.order_number || ''} enviado a cocina!`, 
            type: 'success' 
        });

        // Limpiar ticket
        cartItems = [];
        currentNotes = '';
        const notesInput = container.querySelector('#order-notes');
        if (notesInput) notesInput.value = '';
        updateTicketUI(container);

    } catch (err) {
        showToast({ message: 'Error al enviar pedido a la cocina: ' + err.message, type: 'error' });
    }
}

function setupKeyboardShortcuts(container) {
    const handler = (e) => {
        if (e.key.toLowerCase() === 'o' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
            e.preventDefault();
            sendOrderToKitchen(container);
        }
    };
    window.addEventListener('keydown', handler);
}
