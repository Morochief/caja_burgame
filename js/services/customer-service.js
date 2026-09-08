import { supabase } from '../supabase-client.js';

// ====== CRUD de la tabla customers ======

const CUSTOMER_SELECT = 'id, name, phone, notes, is_club_member, created_at, last_order_at, tax_id, email, address, birthday, category';

export async function getAll() {
    const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT)
        .order('name');
    if (error) throw error;
    return data || [];
}

export async function create(customerData) {
    const { data, error } = await supabase
        .from('customers')
        .insert([{
            name: customerData.name.trim(),
            phone: (customerData.phone || '').trim(),
            notes: (customerData.notes || '').trim(),
            is_club_member: !!customerData.is_club_member,
            tax_id: (customerData.tax_id || '').trim(),
            email: (customerData.email || '').trim(),
            address: (customerData.address || '').trim(),
            birthday: (customerData.birthday || '').trim(),
            category: (customerData.category || 'general').trim()
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Busca un cliente por nombre (case-insensitive). Devuelve null si no existe.
export async function findByName(name) {
    const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT)
        .ilike('name', name.trim())
        .limit(1);
    if (error) throw error;
    return (data && data.length > 0) ? data[0] : null;
}

export async function update(id, customerData) {
    const payload = {
        name: customerData.name.trim(),
        phone: (customerData.phone || '').trim(),
        notes: (customerData.notes || '').trim(),
        ...(customerData.is_club_member !== undefined ? { is_club_member: !!customerData.is_club_member } : {}),
        ...(customerData.tax_id !== undefined ? { tax_id: (customerData.tax_id || '').trim() } : {}),
        ...(customerData.email !== undefined ? { email: (customerData.email || '').trim() } : {}),
        ...(customerData.address !== undefined ? { address: (customerData.address || '').trim() } : {}),
        ...(customerData.birthday !== undefined ? { birthday: (customerData.birthday || '').trim() } : {}),
        ...(customerData.category !== undefined ? { category: (customerData.category || 'general').trim() } : {})
    };

    const { data, error } = await supabase
        .from('customers')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function remove(id) {
    if (!id) throw new Error('ID de cliente no proporcionado');
    const { error, count } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
    if (error) {
        console.error('[customer-service] Error al eliminar cliente:', error);
        throw new Error(`${error.message} (código: ${error.code})`);
    }
    if (count === 0) {
        console.warn('[customer-service] Delete retornó 0 filas - el cliente puede no existir o RLS lo bloquea. id=', id);
        throw new Error('No se pudo eliminar: el cliente no existe o la base de datos bloqueó la operación (RLS).');
    }
}

// Reasigna los pedidos de un nombre de cliente a otro (para fusión de duplicados).
// Usa match exacto (case-sensitive) para no afectar clientes con casing distinto.
export async function reassignOrders(fromName, toName) {
    const { error } = await supabase
        .from('orders')
        .update({ customer_name: toName })
        .eq('customer_name', fromName);
    if (error) throw error;
}

// Trae stats de compras agrupadas por customer_name desde orders
export async function getStatsByName() {
    const { data, error } = await supabase
        .from('orders')
        .select('customer_name, total, status, created_at, paid_at')
        .not('customer_name', 'is', null)
        .order('created_at', { ascending: false });

    if (error) throw error;

    const stats = {};
    (data || []).forEach(order => {
        const name = (order.customer_name || '').trim();
        if (!name) return;

        // Guardar con clave normalizada y con clave exacta
        const lowerName = name.toLowerCase();
        if (!stats[name]) {
            stats[name] = { total_spent: 0, order_count: 0, last_order: null, orders: [] };
        }
        if (!stats[lowerName]) {
            stats[lowerName] = stats[name];
        }

        // Sumar como gastado si la orden fue pagada o entregada
        const isPaid = order.paid_at || order.status === 'paid' || order.status === 'delivered';
        if (isPaid) {
            stats[name].total_spent += (order.total || 0);
        }
        stats[name].order_count++;
        stats[name].orders.push(order);
        if (!stats[name].last_order || new Date(order.created_at) > new Date(stats[name].last_order)) {
            stats[name].last_order = order.created_at;
        }
    });
    return stats;
}

// ============================================================
// Club Burgame — Membresías (30 días desde el pago)
// ============================================================

const MEMBERSHIP_DAYS = 30;
const CLUB_WARN_DAYS = 5;

// Suma 30 días a una fecha ISO (o a now si no se pasa).
function addMembershipDays(fromIso) {
    const base = fromIso ? new Date(fromIso) : new Date();
    const exp = new Date(base);
    exp.setDate(exp.getDate() + MEMBERSHIP_DAYS);
    return exp.toISOString();
}

// Clientes marcados como socios (is_club_member = true).
export async function getClubMembers() {
    const { data, error } = await supabase
        .from('customers')
        .select(CUSTOMER_SELECT)
        .eq('is_club_member', true)
        .order('name');
    if (error) throw error;
    return data || [];
}

// Última membresía con expires_at > ahora (vigente). Devuelve null si no hay.
export async function getActiveMembership(customerId) {
    const { data, error } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('customer_id', customerId)
        .gt('expires_at', new Date().toISOString())
        .order('paid_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    return (data && data.length > 0) ? data[0] : null;
}

// Última membresía (esté o no vigente) — para saber el último vencimiento.
export async function getLastMembership(customerId) {
    const { data, error } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('customer_id', customerId)
        .order('paid_at', { ascending: false })
        .limit(1);
    if (error) throw error;
    return (data && data.length > 0) ? data[0] : null;
}

// Todas las membresías de un cliente, ordenadas por paid_at desc.
export async function getMembershipHistory(customerId) {
    const { data, error } = await supabase
        .from('club_memberships')
        .select('*')
        .eq('customer_id', customerId)
        .order('paid_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

// Marca al cliente como socio (is_club_member = true).
async function markAsMember(customerId) {
    const { error } = await supabase
        .from('customers')
        .update({ is_club_member: true })
        .eq('id', customerId);
    if (error) throw error;
}

/**
 * Registra una membresía nueva para un cliente.
 * Si no hay membresía vigente (o viene vencida), arranca desde hoy + 30 días.
 * @param {Object} params
 * @param {string} params.customerId
 * @param {number} [params.amount=70000]
 */
export async function registerMembership({ customerId, amount }) {
    if (!customerId) throw new Error('Cliente no proporcionado');
    const expiresAt = addMembershipDays(); // desde hoy
    const { data, error } = await supabase
        .from('club_memberships')
        .insert([{
            customer_id: customerId,
            amount: amount || 70000,
            paid_at: new Date().toISOString(),
            expires_at: expiresAt
        }])
        .select()
        .single();
    if (error) throw error;
    await markAsMember(customerId);
    return data;
}

/**
 * Renueva la membresía de un cliente.
 * Si tiene una membresía vigente, extiende desde su vencimiento actual (acumula días).
 * Si está vencido o no tiene, arranca desde hoy + 30 días.
 * @param {Object} params
 * @param {string} params.customerId
 * @param {number} [params.amount=70000]
 * @param {string|null} [params.previousExpiry] - expires_at de la membresía vigente actual
 */
export async function renewMembership({ customerId, amount, previousExpiry }) {
    if (!customerId) throw new Error('Cliente no proporcionado');
    const activeExpiry = previousExpiry && new Date(previousExpiry) > new Date()
        ? previousExpiry
        : null;
    const expiresAt = addMembershipDays(activeExpiry); // max(now, vencimiento) + 30 días
    const { data, error } = await supabase
        .from('club_memberships')
        .insert([{
            customer_id: customerId,
            amount: amount || 70000,
            paid_at: new Date().toISOString(),
            expires_at: expiresAt
        }])
        .select()
        .single();
    if (error) throw error;
    await markAsMember(customerId);
    return data;
}

/**
 * Devuelve el estado de membresía de un cliente para mostrar en POS.
 * @returns {Promise<{status:'active'|'expiring'|'expired'|'none', membership:Object|null, daysLeft:number|null}>}
 */
export async function getMembershipStatus(customerId) {
    const membership = await getLastMembership(customerId);
    if (!membership) {
        return { status: 'none', membership: null, daysLeft: null };
    }
    const now = new Date();
    const expires = new Date(membership.expires_at);
    const daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
        return { status: 'expired', membership, daysLeft };
    }
    if (daysLeft <= CLUB_WARN_DAYS) {
        return { status: 'expiring', membership, daysLeft };
    }
    return { status: 'active', membership, daysLeft };
}

/**
 * Stats globales para el módulo Club y Dashboard.
 * @returns {Promise<{totalClub:number, active:number, expiring:number, expired:number,
 *                    renewedThisMonth:number, revenueThisMonth:number, members:Array}>}
 */
export async function getMembershipStats() {
    const [members, memberships] = await Promise.all([
        getClubMembers(),
        supabase.from('club_memberships').select('*').order('paid_at', { ascending: false })
    ]);
    const allMemberships = memberships.data || [];
    if (memberships.error) throw memberships.error;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = {
        totalClub: 0,
        active: 0,
        expiring: 0,
        expired: 0,
        renewedThisMonth: 0,
        revenueThisMonth: 0,
        members: []
    };

    // Mapa de la última membresía por customer
    const lastByCustomer = {};
    allMemberships.forEach(m => {
        if (!lastByCustomer[m.customer_id] || new Date(m.paid_at) > new Date(lastByCustomer[m.customer_id].paid_at)) {
            lastByCustomer[m.customer_id] = m;
        }
    });

    members.forEach(c => {
        const last = lastByCustomer[c.customer_id] || null;
        let daysLeft = null;
        let status = 'none';
        if (last) {
            const expires = new Date(last.expires_at);
            daysLeft = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) status = 'expired';
            else if (daysLeft <= CLUB_WARN_DAYS) status = 'expiring';
            else status = 'active';
        }
        stats.totalClub++;
        if (status === 'active') stats.active++;
        else if (status === 'expiring') stats.expiring++;
        else if (status === 'expired') stats.expired++;
        stats.members.push({ ...c, membership: last, status, daysLeft });
    });

    // Stats del mes sobre TODOS los pagos de membresía (renovaciones + altas)
    allMemberships.forEach(m => {
        const paid = new Date(m.paid_at);
        if (paid >= monthStart) {
            stats.renewedThisMonth++;
            stats.revenueThisMonth += (m.amount || 0);
        }
    });

    // Ordenar: activos → por vencer → vencidos, luego por nombre
    const order = { active: 0, expiring: 1, expired: 2, none: 3 };
    stats.members.sort((a, b) => (order[a.status] - order[b.status]) || a.name.localeCompare(b.name));

    return stats;
}

/**
 * Obtiene todas las órdenes de un cliente con el detalle de items consumidos (order_items).
 * @param {string} customerName
 */
export async function getCustomerOrdersWithItems(customerName) {
    if (!customerName) return [];
    const trimmed = customerName.trim();
    const { data, error } = await supabase
        .from('orders')
        .select(`
            id,
            order_number,
            status,
            total,
            payment_method,
            notes,
            created_at,
            paid_at,
            order_items (
                id,
                product_name,
                price,
                quantity,
                is_combo
            )
        `)
        .ilike('customer_name', trimmed)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[customer-service] Error fetching orders with items:', error);
        throw error;
    }
    return data || [];
}

/**
 * Analiza las órdenes con items para calcular el ranking de productos favoritos del cliente.
 * @param {Array} ordersWithItems
 * @returns {Array<{name: string, quantity: number, total: number, customizations: string[]}>}
 */
export function getCustomerFavoriteProducts(ordersWithItems = []) {
    const map = {};

    (ordersWithItems || []).forEach(order => {
        // Solo contar pedidos no cancelados
        if (order.status === 'cancelled') return;

        (order.order_items || []).forEach(item => {
            let rawName = item.product_name || 'Producto';
            let customization = '';
            
            // Si tiene notas tipo [📝 Sin cebolla], extraer la nota
            const match = rawName.match(/\[(.*?)\]/);
            if (match) {
                customization = match[1].replace('📝', '').trim();
            }

            // Normalizar el nombre base para agrupar (ej: 'Arcade Classic')
            let baseName = rawName.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').trim();
            if (!baseName) baseName = rawName;

            if (!map[baseName]) {
                map[baseName] = {
                    name: baseName,
                    quantity: 0,
                    total: 0,
                    customizations: new Set()
                };
            }

            const qty = item.quantity || 1;
            const price = item.price || 0;
            map[baseName].quantity += qty;
            map[baseName].total += (price * qty);
            if (customization) {
                map[baseName].customizations.add(customization);
            }
        });
    });

    return Object.values(map)
        .map(p => ({
            name: p.name,
            quantity: p.quantity,
            total: p.total,
            customizations: Array.from(p.customizations)
        }))
        .sort((a, b) => b.quantity - a.quantity || b.total - a.total);
}

/**
 * Determina el Nivel / Tier Arcade del cliente según LTV y pedidos.
 * @param {number} totalSpent
 * @param {number} orderCount
 * @returns {{id: string, name: string, icon: string, color: string, glow: string}}
 */
export function calculateCustomerTier(totalSpent = 0, orderCount = 0) {
    if (totalSpent >= 600000 || orderCount >= 10) {
        return { id: 'diamond', name: 'DIAMOND LEVEL', icon: '💎', color: '#00F0FF', glow: 'rgba(0,240,255,0.4)' };
    }
    if (totalSpent >= 300000 || orderCount >= 5) {
        return { id: 'gold', name: 'GOLD LEVEL', icon: '🥇', color: '#FFD700', glow: 'rgba(255,215,0,0.4)' };
    }
    if (totalSpent >= 120000 || orderCount >= 2) {
        return { id: 'silver', name: 'SILVER LEVEL', icon: '🥈', color: '#C0C0C0', glow: 'rgba(192,192,192,0.3)' };
    }
    return { id: 'bronze', name: 'BRONZE LEVEL', icon: '🥉', color: '#CD7F32', glow: 'rgba(205,127,50,0.3)' };
}

/**
 * Calcula el segmento RFM operativo del cliente.
 * @param {Object} customer
 * @param {Object} stats
 * @returns {{id: string, label: string, badgeClass: string, icon: string}}
 */
export function getCustomerSegment(customer = {}, stats = {}) {
    if (customer.is_club_member) {
        return { id: 'club', label: 'Club Burgame', badgeClass: 'badge--club', icon: '👑' };
    }

    const totalSpent = stats.total_spent || 0;
    const orderCount = stats.order_count || 0;
    const lastOrder = stats.last_order || customer.last_order_at;

    let daysSinceLast = 0;
    if (lastOrder) {
        daysSinceLast = Math.floor((Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24));
    }

    if (totalSpent >= 250000 || orderCount >= 4) {
        return { id: 'vip', label: 'VIP Élite', badgeClass: 'badge--vip', icon: '💎' };
    }

    if (lastOrder && daysSinceLast >= 40) {
        return { id: 'at_risk', label: 'En Riesgo', badgeClass: 'badge--risk', icon: '⚠️' };
    }

    if (orderCount >= 2) {
        return { id: 'frequent', label: 'Habitual', badgeClass: 'badge--frequent', icon: '🔥' };
    }

    return { id: 'new', label: 'Nuevo', badgeClass: 'badge--new', icon: '🌱' };
}

export const customerService = {
    getAll,
    findByName,
    create,
    update,
    remove,
    reassignOrders,
    getStatsByName,
    // CRM 360 y RFM
    getCustomerOrdersWithItems,
    getCustomerFavoriteProducts,
    calculateCustomerTier,
    getCustomerSegment,
    // Club Burgame
    getClubMembers,
    getActiveMembership,
    getLastMembership,
    getMembershipHistory,
    getMembershipStatus,
    getMembershipStats,
    registerMembership,
    renewMembership,
    MEMBERSHIP_DAYS,
    CLUB_WARN_DAYS
};
