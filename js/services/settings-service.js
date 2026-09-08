import { supabase } from '../supabase-client.js';

const SETTINGS_STORAGE_KEY = 'bg_system_settings_v2';

export const DEFAULT_SETTINGS = {
    // Empresa y Facturación
    businessName: 'Burgame — Arcade Burger Bar',
    legalName: 'Burgame S.R.L.',
    taxId: '80012345-6',
    phone: '0981 123 456',
    address: 'Av. Principal c/ Gamer St., Asunción, Paraguay',
    ticketFooter: '¡Gracias por jugar con nosotros! 🎮🍔 GG WP',
    ticketWidth: '80mm', // '80mm' | '58mm'
    autoPrintTicket: false,

    // Cocina KDS & Alertas
    kitchenSound: 'assets/item-get.mp3',
    kitchenVolume: 0.8,
    kitchenDelayWarningMinutes: 20,

    // Club Burgame
    clubFee: 70000,
    clubDefaultDays: 30,
    clubWarnDays: 5,
    clubRenewalMessage: '¡Hola {nombre}! 🍔 Te escribimos de Burgame. Tu membresía al Club vence en {dias} día(s). ¡Te esperamos para renovarla y no perder tus beneficios gamer!',

    // QR Dinámico y Seguridad
    gpsEnabled: true,
    gpsLat: -25.2880,
    gpsLng: -57.5918,
    gpsRadiusMeters: 250,
    qrRotationMinutes: 10
};

export function getSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
        console.warn('Error leyendo configuración, usando valores predeterminados:', e);
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(newSettings) {
    try {
        const current = getSettings();
        const merged = { ...current, ...newSettings };
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        return merged;
    } catch (e) {
        console.error('Error guardando configuración:', e);
        throw e;
    }
}

export function resetSettings() {
    try {
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        return { ...DEFAULT_SETTINGS };
    } catch (e) {
        console.error('Error restableciendo configuración:', e);
        throw e;
    }
}

// Prueba de latencia con la base de datos Supabase en tiempo real
export async function testSupabaseLatency() {
    const start = performance.now();
    try {
        const { error } = await supabase.from('categories').select('id').limit(1);
        const end = performance.now();
        const latencyMs = Math.round(end - start);
        if (error) {
            return { ok: false, error: error.message, latencyMs };
        }
        return { ok: true, latencyMs };
    } catch (err) {
        const end = performance.now();
        return { ok: false, error: err.message, latencyMs: Math.round(end - start) };
    }
}

// Limpia cachés locales de sesión
export function clearLocalCaches() {
    try {
        sessionStorage.removeItem('bg_products_cache');
        sessionStorage.removeItem('bg_products_cache_ts');
        sessionStorage.removeItem('bg_categories_cache');
        sessionStorage.removeItem('bg_categories_cache_ts');
        return true;
    } catch (e) {
        console.error('Error limpiando cachés:', e);
        return false;
    }
}

// Exporta un archivo JSON de Respaldo Completo de la base de datos (Disaster Recovery)
export async function exportFullBackup() {
    const [
        productsRes,
        categoriesRes,
        customersRes,
        expensesRes,
        ordersRes,
        membershipsRes
    ] = await Promise.all([
        supabase.from('products').select('*'),
        supabase.from('categories').select('*'),
        supabase.from('customers').select('*'),
        supabase.from('expenses').select('*'),
        supabase.from('orders').select('*, order_items(*)').limit(500),
        supabase.from('club_memberships').select('*')
    ]);

    const backupData = {
        app: 'Burgame POS Enterprise',
        version: '2.5.0',
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        data: {
            categories: categoriesRes.data || [],
            products: productsRes.data || [],
            customers: customersRes.data || [],
            expenses: expensesRes.data || [],
            orders: ordersRes.data || [],
            memberships: membershipsRes.data || []
        }
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `burgame_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return {
        productsCount: (productsRes.data || []).length,
        customersCount: (customersRes.data || []).length,
        ordersCount: (ordersRes.data || []).length,
        expensesCount: (expensesRes.data || []).length
    };
}

export const settingsService = {
    getSettings,
    saveSettings,
    resetSettings,
    testSupabaseLatency,
    clearLocalCaches,
    exportFullBackup
};
