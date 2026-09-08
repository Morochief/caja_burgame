import { supabase } from '../supabase-client.js';
import { customerService } from './customer-service.js';

// ============================================================
// Servicio para scores del Arcade (Pacman) y Torneos Gamer
// Tabla: arcade_scores (id, initials, score, created_at)
// LocalStorage: burgame_tournaments_v1 (con seed inicial)
// ============================================================

const TABLE = 'arcade_scores';
const TOURNAMENTS_KEY = 'burgame_tournaments_v1';

// Seed de torneos iniciales con el torneo de Rocket League mencionado por el usuario
const DEFAULT_TOURNAMENTS = [
    {
        id: 'tourn-rl-2026-1',
        title: 'Torneo Rocket League 2v2 — Apertura Burgame',
        game: 'Rocket League (2v2)',
        date: '2026-03-01',
        status: 'finished', // 'upcoming', 'active', 'finished'
        participantsCount: 16,
        prizePoolDescription: '2x Membresías Club Burgame + Vales de Consumo',
        firstPlace: {
            name: 'Matias & Lucas (Team Nitro)',
            customerId: null,
            prize: 'Membresía Club Burgame (x2) + 2x Fatality Burgers'
        },
        secondPlace: {
            name: 'Agustin & Tomas (Team Turbo)',
            customerId: null,
            prize: '2x Papas Burgame XL + Bebidas'
        },
        thirdPlace: {
            name: 'Franco & Kevin (Apex Boys)',
            customerId: null,
            prize: '2x Cervezas Artesanales'
        },
        notes: 'Torneo estreno del salón gamer. Los ganadores recibieron su membresía gratuita del Club Burgame como premio oficial.'
    },
    {
        id: 'tourn-smash-2026-2',
        title: 'Super Smash Bros Ultimate — Noche de Campeones',
        game: 'Super Smash Bros Ultimate',
        date: '2026-03-15',
        status: 'upcoming',
        participantsCount: 24,
        prizePoolDescription: '1º Puesto: Membresía Club Burgame + Copa Burgame',
        firstPlace: {
            name: 'Por Definir',
            customerId: null,
            prize: 'Membresía Club Burgame 1 Mes + 1x Cheat Burger'
        },
        secondPlace: {
            name: 'Por Definir',
            customerId: null,
            prize: '1x Combo Arcade Classic'
        },
        thirdPlace: {
            name: 'Por Definir',
            prize: '1x Papas Pacman'
        },
        notes: 'Inscripción abierta en mostrador. Modalidad 1v1 sin ítems.'
    }
];

// --- SCORES SUPABASE / LOCAL ---

// Trae los top N scores de Supabase
export async function getTopScores(limit = 15) {
    try {
        const { data, error } = await supabase
            .from(TABLE)
            .select('id, initials, score, created_at')
            .order('score', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('[arcadeService] Fallback a scores locales:', err.message);
        const localScores = JSON.parse(localStorage.getItem('burgame_scores') || '[]');
        return localScores.slice(0, limit);
    }
}

// Guarda un score nuevo. Devuelve el registro creado.
export async function saveScore(initials, score) {
    const formattedInitials = (initials || 'AAA').toUpperCase().substring(0, 4);
    const scoreVal = parseInt(score, 10) || 0;

    try {
        const { data, error } = await supabase
            .from(TABLE)
            .insert([{
                initials: formattedInitials,
                score: scoreVal,
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('[arcadeService] Guardando local por error Supabase:', err.message);
        const local = JSON.parse(localStorage.getItem('burgame_scores') || '[]');
        const newRecord = {
            id: 'loc-' + Date.now(),
            initials: formattedInitials,
            score: scoreVal,
            created_at: new Date().toISOString()
        };
        local.push(newRecord);
        local.sort((a, b) => b.score - a.score);
        localStorage.setItem('burgame_scores', JSON.stringify(local.slice(0, 50)));
        return newRecord;
    }
}

// Borra un score por id (moderación admin)
export async function deleteScore(id) {
    if (typeof id === 'string' && id.startsWith('loc-')) {
        let local = JSON.parse(localStorage.getItem('burgame_scores') || '[]');
        local = local.filter(s => s.id !== id);
        localStorage.setItem('burgame_scores', JSON.stringify(local));
        return true;
    }

    try {
        const { error } = await supabase
            .from(TABLE)
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (err) {
        console.warn('[arcadeService] Error al borrar de Supabase, limpiando de local si existe:', err.message);
        let local = JSON.parse(localStorage.getItem('burgame_scores') || '[]');
        local = local.filter(s => s.id !== id);
        localStorage.setItem('burgame_scores', JSON.stringify(local));
        return true;
    }
}

// --- TORNEOS GAMER ---

export function getTournaments() {
    try {
        const raw = localStorage.getItem(TOURNAMENTS_KEY);
        if (!raw) {
            localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(DEFAULT_TOURNAMENTS));
            return DEFAULT_TOURNAMENTS;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TOURNAMENTS;
    } catch {
        return DEFAULT_TOURNAMENTS;
    }
}

export function saveTournament(tournament) {
    const list = getTournaments();
    if (tournament.id) {
        const idx = list.findIndex(t => t.id === tournament.id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...tournament, updatedAt: new Date().toISOString() };
        } else {
            list.unshift(tournament);
        }
    } else {
        tournament.id = 'tourn-' + Date.now();
        tournament.createdAt = new Date().toISOString();
        list.unshift(tournament);
    }
    localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(list));
    return tournament;
}

export function deleteTournament(id) {
    let list = getTournaments();
    list = list.filter(t => t.id !== id);
    localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(list));
    return true;
}

/**
 * Otorga directamente una membresía de Club Burgame a un ganador de torneo
 * utilizando customerService con type = 'tournament_prize', amount = 0 y payment_method = 'premio'.
 */
export async function grantTournamentMembership(customerId, tournamentTitle, placeName = '1º Puesto') {
    if (!customerId) throw new Error('Debe seleccionar un cliente registrado');
    return await customerService.registerMembership({
        customerId,
        amount: 0,
        type: 'tournament_prize',
        tournamentName: tournamentTitle || 'Torneo Gamer Burgame',
        paymentMethod: 'premio',
        notes: `Premio oficial de torneo (${placeName}) - Costo 0 Gs`,
        days: 30
    });
}

export const arcadeService = {
    getTopScores,
    saveScore,
    deleteScore,
    getTournaments,
    saveTournament,
    deleteTournament,
    grantTournamentMembership
};
