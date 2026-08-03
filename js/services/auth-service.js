const AUTH_KEY = 'burgame_session';

export function getSession() {
    try {
        const raw = localStorage.getItem(AUTH_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function loginWithPin(pin) {
    if (pin === '1234') {
        const session = {
            role: 'kitchen',
            name: 'Cocinero',
            loginTime: new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        return session;
    } else if (pin === '8888') {
        const session = {
            role: 'admin',
            name: 'Administrador / Cajero',
            loginTime: new Date().toISOString()
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(session));
        return session;
    } else {
        throw new Error('PIN incorrecto. Intenta de nuevo.');
    }
}

export function logout() {
    localStorage.removeItem(AUTH_KEY);
    window.location.hash = '#/login';
}

export function isAdmin() {
    const session = getSession();
    return session && session.role === 'admin';
}

export function isKitchen() {
    const session = getSession();
    return session && session.role === 'kitchen';
}

export const authService = {
    getSession,
    loginWithPin,
    logout,
    isAdmin,
    isKitchen
};
