import { supabase } from '../supabase-client.js';

// ====== CRUD de la tabla customers ======

const CUSTOMER_SELECT = 'id, name, phone, notes, is_club_member, created_at, last_order_at';

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
            is_club_member: !!customerData.is_club_member
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
    const { data, error } = await supabase
        .from('customers')
        .update({
            name: customerData.name.trim(),
            phone: (customerData.phone || '').trim(),
            notes: (customerData.notes || '').trim(),
            ...(customerData.is_club_member !== undefined
                ? { is_club_member: !!customerData.is_club_member }
                : {})
        })
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
        .select('customer_name, total, status, created_at')
        .not('customer_name', 'eq', '')
        .order('created_at', { ascending: false });

    if (error) throw error;

    const stats = {};
    (data || []).forEach(order => {
        const name = (order.customer_name || '').trim();
        if (!name) return;
        if (!stats[name]) {
            stats[name] = { total_spent: 0, order_count: 0, last_order: null, orders: [] };
        }
        if (order.paid_at) {
            stats[name].total_spent += order.total || 0;
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

export const customerService = {
    getAll,
    findByName,
    create,
    update,
    remove,
    reassignOrders,
    getStatsByName,
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
