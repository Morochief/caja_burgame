/**
 * Formats a number to Guaraní format.
 * @param {number} amount 
 * @returns {string}
 */
export function formatGs(amount) {
    if (isNaN(amount)) amount = 0;
    return `Gs. ${Math.round(amount).toLocaleString('es-PY', { minimumFractionDigits: 0 }).replace(/,/g, '.')}`;
}

/**
 * Parses a Guaraní formatted string back to a number.
 * @param {string} string 
 * @returns {number}
 */
export function parseGs(string) {
    if (!string) return 0;
    const numStr = string.toString().replace(/[^\d]/g, '');
    return parseInt(numStr, 10) || 0;
}
