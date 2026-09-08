// ============================================================
// qr-auth-service.js — Servicio de Seguridad y Rotación de QR
// ============================================================
// Genera tokens rotativos basados en bloques de tiempo (TOTP-like)
// y gestiona las sesiones locales de los comensales (45 min).
// ============================================================

const STORAGE_SESSION_KEY = 'burgame_client_session_v1';
const ROTATION_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos por bloque
const SESSION_DURATION_MS = 45 * 60 * 1000;  // 45 minutos de validez para el comensal
const SECRET_SEED = 'BURGAME_ARCADE_2026_SECURE_SALT_99';

/**
 * Función de hashing simple y rápida (Jenkins 32-bit modificado)
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Genera el token y PIN para un bloque de tiempo específico
 */
function generateBlockCredentials(blockNumber) {
    const raw = `${SECRET_SEED}_BLOCK_${blockNumber}`;
    const numHash = hashString(raw);

    // PIN de 4 dígitos (entre 1000 y 9999)
    const pin = String(1000 + (numHash % 9000));

    // Token alfanumérico de 8 caracteres en mayúsculas
    const hex = numHash.toString(16).toUpperCase().padStart(8, '0');
    const token = `BG-${pin}-${hex.slice(0, 4)}`;

    return { token, pin, blockNumber };
}

export const qrAuthService = {
    ROTATION_INTERVAL_MS,
    SESSION_DURATION_MS,

    /**
     * Retorna el bloque de tiempo actual
     */
    getCurrentBlock() {
        return Math.floor(Date.now() / ROTATION_INTERVAL_MS);
    },

    /**
     * Obtiene las credenciales actuales (Token, PIN, milisegundos restantes)
     */
    getCurrentCredentials() {
        const currentBlock = this.getCurrentBlock();
        const creds = generateBlockCredentials(currentBlock);
        const timeIntoBlock = Date.now() % ROTATION_INTERVAL_MS;
        const msRemaining = ROTATION_INTERVAL_MS - timeIntoBlock;

        return {
            ...creds,
            msRemaining,
            secondsRemaining: Math.ceil(msRemaining / 1000)
        };
    },

    /**
     * Valida si un token es válido en la ventana actual o en la inmediatamente anterior (tolerancia de 20 min)
     */
    isValidToken(token) {
        if (!token || typeof token !== 'string') return false;
        const trimmed = token.trim().toUpperCase();
        const currentBlock = this.getCurrentBlock();

        // Chequear bloque actual y anterior (gracia de 10 min adicionales)
        for (let b = currentBlock; b >= currentBlock - 1; b--) {
            const creds = generateBlockCredentials(b);
            if (creds.token === trimmed) return true;
        }
        return false;
    },

    /**
     * Valida si un PIN de 4 dígitos es válido en la ventana actual o anterior
     */
    isValidPin(pin) {
        if (!pin) return false;
        const cleaned = String(pin).trim();
        const currentBlock = this.getCurrentBlock();

        for (let b = currentBlock; b >= currentBlock - 1; b--) {
            const creds = generateBlockCredentials(b);
            if (creds.pin === cleaned) return true;
        }
        return false;
    },

    /**
     * Guarda una sesión activa de comensal en el dispositivo
     */
    startClientSession({ method = 'qr', table = '' } = {}) {
        const session = {
            authenticated: true,
            method, // 'qr' | 'pin'
            table: table || '',
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_DURATION_MS
        };

        try {
            sessionStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
            // También en localStorage como respaldo si se recarga el navegador en móvil
            localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
        } catch (e) {
            console.warn('Error guardando sesión de cliente:', e);
        }

        return session;
    },

    /**
     * Obtiene la sesión activa y verifica si no ha expirado
     */
    getActiveSession() {
        let raw = null;
        try {
            raw = sessionStorage.getItem(STORAGE_SESSION_KEY) || localStorage.getItem(STORAGE_SESSION_KEY);
        } catch (e) {
            return null;
        }

        if (!raw) return null;

        try {
            const session = JSON.parse(raw);
            if (!session || !session.authenticated || !session.expiresAt) {
                this.clearClientSession();
                return null;
            }

            // Verificar si expiró
            if (Date.now() > session.expiresAt) {
                this.clearClientSession();
                return null;
            }

            return session;
        } catch {
            this.clearClientSession();
            return null;
        }
    },

    /**
     * Verifica si el cliente tiene permiso activo para pedir
     */
    isSessionValid() {
        return this.getActiveSession() !== null;
    },

    /**
     * Limpia la sesión actual
     */
    clearClientSession() {
        try {
            sessionStorage.removeItem(STORAGE_SESSION_KEY);
            localStorage.removeItem(STORAGE_SESSION_KEY);
        } catch { }
    },

    /**
     * Genera la URL completa para el código QR con el token dinámico y mesa opcional
     */
    buildCustomerUrl(baseUrl = window.location.origin, options = {}) {
        const creds = this.getCurrentCredentials();
        // Asegurar que use cliente.html
        let fullBase = baseUrl;
        if (!fullBase.endsWith('/')) fullBase += '/';
        const url = new URL('cliente.html', fullBase);
        url.searchParams.set('token', creds.token);
        url.searchParams.set('pin', creds.pin);
        if (options.table) {
            url.searchParams.set('mesa', options.table);
        }
        return url.toString();
    },

    // ============================================================
    // GEOFENCING GPS — Límite de radio para autopedidos
    // ============================================================
    BURGAME_COORDS: {
        latitude: -25.28802865549245,
        longitude: -57.591759482390025,
        maxRadiusMeters: 250 // 250 metros de tolerancia alrededor del local
    },

    /**
     * Calcula la distancia en metros entre dos coordenadas (fórmula de Haversine)
     */
    calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Radio de la Tierra en metros
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Verifica si el dispositivo del cliente se encuentra físicamente dentro del rango del local
     */
    async verifyGeofence() {
        if (!navigator.geolocation) {
            return {
                supported: false,
                inRange: true, // Si el navegador no soporta GPS, permitimos continuar respaldado por el QR
                error: null
            };
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;
                    const distance = this.calculateDistanceInMeters(
                        userLat,
                        userLng,
                        this.BURGAME_COORDS.latitude,
                        this.BURGAME_COORDS.longitude
                    );

                    const distanceRounded = Math.round(distance);
                    const inRange = distance <= this.BURGAME_COORDS.maxRadiusMeters;

                    resolve({
                        supported: true,
                        inRange,
                        distanceMeters: distanceRounded,
                        userCoords: { latitude: userLat, longitude: userLng },
                        error: inRange ? null : `Estás a ${distanceRounded >= 1000 ? (distanceRounded / 1000).toFixed(1) + ' km' : distanceRounded + ' metros'} del local.`
                    });
                },
                (err) => {
                    let msg = 'No se pudo obtener la ubicación GPS.';
                    if (err.code === err.PERMISSION_DENIED) {
                        msg = 'Permiso de ubicación denegado. Activa tu GPS para verificar que estás en el local.';
                    } else if (err.code === err.TIMEOUT) {
                        msg = 'Tiempo de espera de GPS agotado.';
                    }
                    resolve({
                        supported: true,
                        inRange: false,
                        permissionDenied: err.code === err.PERMISSION_DENIED,
                        error: msg
                    });
                },
                {
                    enableHighAccuracy: true,
                    timeout: 7000,
                    maximumAge: 30000
                }
            );
        });
    }
};

