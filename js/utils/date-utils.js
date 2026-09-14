// ============================================================
// date-utils.js — Utilidades de Fecha y Zona Horaria para Paraguay
// Zona horaria oficial: America/Asuncion (UTC-3 / UTC-4)
// ============================================================

export const PARAGUAY_TZ = 'America/Asuncion';

/**
 * Obtiene el offset actual de Paraguay (ej: '-03:00' o '-04:00')
 * para una fecha dada.
 * @param {Date} [dateObj=new Date()]
 * @returns {string} Offset en formato [+-]HH:mm
 */
export function getParaguayOffset(dateObj = new Date()) {
    try {
        const tzStr = dateObj.toLocaleString('en-US', { timeZone: PARAGUAY_TZ, timeZoneName: 'longOffset' });
        const match = tzStr.match(/GMT([+-]\d{2}):?(\d{2})?/);
        if (!match) return '-03:00';
        const sign = match[1].slice(0, 1);
        const hours = match[1].slice(1).padStart(2, '0');
        const mins = (match[2] || '00').padStart(2, '0');
        return sign + hours + ':' + mins;
    } catch {
        return '-03:00';
    }
}

/**
 * Retorna la fecha de HOY en Paraguay en formato 'YYYY-MM-DD'.
 * Es inmune a desfases nocturnos de UTC después de las 21:00 hs.
 * @returns {string} 'YYYY-MM-DD'
 */
export function getParaguayToday() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: PARAGUAY_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

/**
 * Formatea cualquier fecha, timestamp o cadena ISO a 'YYYY-MM-DD' en hora de Paraguay.
 * @param {Date|string|number} dateOrIso
 * @returns {string} 'YYYY-MM-DD'
 */
export function formatParaguayDate(dateOrIso) {
    if (!dateOrIso) return '';
    const d = typeof dateOrIso === 'string' || typeof dateOrIso === 'number' ? new Date(dateOrIso) : dateOrIso;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: PARAGUAY_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

/**
 * Formatea una fecha a hora legible 'HH:mm' o 'HH:mm:ss' en hora de Paraguay.
 * @param {Date|string|number} dateOrIso
 * @param {boolean} [includeSeconds=false]
 * @returns {string} 'HH:mm' o 'HH:mm:ss'
 */
export function formatParaguayTime(dateOrIso, includeSeconds = false) {
    if (!dateOrIso) return '';
    const d = typeof dateOrIso === 'string' || typeof dateOrIso === 'number' ? new Date(dateOrIso) : dateOrIso;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-PY', {
        timeZone: PARAGUAY_TZ,
        hour: '2-digit',
        minute: '2-digit',
        ...(includeSeconds ? { second: '2-digit' } : {}),
        hour12: false
    }).format(d);
}

/**
 * Retorna la hora entera (0 a 23) en hora de Paraguay.
 * Ideal para cálculo de horas pico en cocina/ventas.
 * @param {Date|string|number} dateOrIso
 * @returns {number} 0-23
 */
export function getParaguayHour(dateOrIso) {
    if (!dateOrIso) return 0;
    const d = typeof dateOrIso === 'string' || typeof dateOrIso === 'number' ? new Date(dateOrIso) : dateOrIso;
    if (isNaN(d.getTime())) return 0;
    const hourStr = new Intl.DateTimeFormat('en-US', {
        timeZone: PARAGUAY_TZ,
        hour: 'numeric',
        hour12: false
    }).format(d);
    const h = parseInt(hourStr, 10);
    return h === 24 ? 0 : h;
}

/**
 * Retorna el día de la semana en Paraguay:
 * 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
 * @param {Date|string|number} [dateOrIso=new Date()]
 * @returns {number} 0 a 6
 */
export function getParaguayDayOfWeek(dateOrIso = new Date()) {
    const d = typeof dateOrIso === 'string' || typeof dateOrIso === 'number' ? new Date(dateOrIso) : dateOrIso;
    if (isNaN(d.getTime())) return 0;
    const str = new Intl.DateTimeFormat('en-US', { timeZone: PARAGUAY_TZ, weekday: 'short' }).format(d);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[str] !== undefined ? map[str] : 0;
}

/**
 * Suma o resta días calendario de forma segura a una fecha en formato 'YYYY-MM-DD'.
 * @param {string} ymdStr 'YYYY-MM-DD'
 * @param {number} deltaDays Días a sumar (positivo) o restar (negativo)
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDaysToYmd(ymdStr, deltaDays) {
    if (!ymdStr) return '';
    const [y, m, d] = ymdStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Convierte un rango de fechas calendario de Paraguay ('YYYY-MM-DD')
 * a límites ISO en UTC (desde las 00:00:00.000 hasta las 23:59:59.999 hora de Paraguay).
 * Resuelve el problema donde new Date('YYYY-MM-DD') se parseaba en UTC y atrasaba un día.
 * @param {string} startYmd 'YYYY-MM-DD'
 * @param {string} [endYmd=startYmd] 'YYYY-MM-DD'
 * @returns {{ fromIso: string, toIso: string }}
 */
export function getParaguayIsoRange(startYmd, endYmd = startYmd) {
    if (!startYmd) startYmd = getParaguayToday();
    if (!endYmd) endYmd = startYmd;

    // Obtener offset aproximado al mediodía para evitar cualquier salto
    const approx = new Date(startYmd + 'T12:00:00Z');
    const offset = getParaguayOffset(approx);

    const fromDate = new Date(`${startYmd}T00:00:00.000${offset}`);
    const toDate = new Date(`${endYmd}T23:59:59.999${offset}`);

    return {
        fromIso: fromDate.toISOString(),
        toIso: toDate.toISOString()
    };
}

/**
 * Genera los rangos de fechas (actual y período equivalente anterior) para los selectores
 * de analítica y reportes ('today', 'yesterday', '7d', 'week', '30d', 'month', 'custom').
 * @param {string} period
 * @param {string} [customFrom]
 * @param {string} [customTo]
 * @returns {{
 *   startYmd: string,
 *   endYmd: string,
 *   fromIso: string,
 *   toIso: string,
 *   prevStartYmd: string,
 *   prevEndYmd: string,
 *   prevFromIso: string,
 *   prevToIso: string
 * }}
 */
export function getParaguayPresetRange(period, customFrom, customTo) {
    const today = getParaguayToday();
    let startYmd = today;
    let endYmd = today;
    let prevStartYmd = today;
    let prevEndYmd = today;

    if (period === 'today') {
        startYmd = today;
        endYmd = today;
        const yesterday = addDaysToYmd(today, -1);
        prevStartYmd = yesterday;
        prevEndYmd = yesterday;
    } else if (period === 'yesterday') {
        const yesterday = addDaysToYmd(today, -1);
        startYmd = yesterday;
        endYmd = yesterday;
        const anteayer = addDaysToYmd(today, -2);
        prevStartYmd = anteayer;
        prevEndYmd = anteayer;
    } else if (period === '7d' || period === 'week') {
        startYmd = addDaysToYmd(today, -7);
        endYmd = today;
        prevStartYmd = addDaysToYmd(today, -14);
        prevEndYmd = addDaysToYmd(today, -8);
    } else if (period === '30d') {
        startYmd = addDaysToYmd(today, -30);
        endYmd = today;
        prevStartYmd = addDaysToYmd(today, -60);
        prevEndYmd = addDaysToYmd(today, -31);
    } else if (period === 'month') {
        const [y, m] = today.split('-').map(Number);
        startYmd = `${y}-${String(m).padStart(2, '0')}-01`;
        endYmd = today;

        // Mes anterior: desde el día 1 hasta el último día del mes pasado
        const prevMonthDate = new Date(Date.UTC(y, m - 2, 1, 12, 0, 0));
        const prevYear = prevMonthDate.getUTCFullYear();
        const prevMonth = prevMonthDate.getUTCMonth() + 1;
        prevStartYmd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;

        // Último día del mes anterior
        const lastDayOfPrevMonth = new Date(Date.UTC(y, m - 1, 0, 12, 0, 0)).getUTCDate();
        prevEndYmd = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
    } else if (period === 'custom') {
        startYmd = customFrom || addDaysToYmd(today, -7);
        endYmd = customTo || today;

        // Calcular duración en días para retroceder la misma cantidad
        const startD = new Date(startYmd + 'T12:00:00Z').getTime();
        const endD = new Date(endYmd + 'T12:00:00Z').getTime();
        const diffDays = Math.max(1, Math.round((endD - startD) / (24 * 3600 * 1000)));

        prevEndYmd = addDaysToYmd(startYmd, -1);
        prevStartYmd = addDaysToYmd(prevEndYmd, -(diffDays - 1));
    }

    const currentIso = getParaguayIsoRange(startYmd, endYmd);
    const prevIso = getParaguayIsoRange(prevStartYmd, prevEndYmd);

    return {
        startYmd,
        endYmd,
        fromIso: currentIso.fromIso,
        toIso: currentIso.toIso,
        prevStartYmd,
        prevEndYmd,
        prevFromIso: prevIso.fromIso,
        prevToIso: prevIso.toIso
    };
}
