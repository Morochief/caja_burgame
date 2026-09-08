import { supabase } from '../supabase-client.js';
import { customerService } from './customer-service.js';

// ============================================================
// Servicio para Arcade (Pac-Man) y Suite de Torneos Gamer
// Estilo Challonge: Inscripciones, Generación de Brackets,
// Control de Partidas y Premiaciones Oficiales Burgame.
// Tablas Supabase:
// - arcade_scores
// - tournaments
// - tournament_participants
// - tournament_matches
// ============================================================

const SCORES_TABLE = 'arcade_scores';
const TOURNAMENTS_TABLE = 'tournaments';
const PARTICIPANTS_TABLE = 'tournament_participants';
const MATCHES_TABLE = 'tournament_matches';

const LOCAL_SCORES_KEY = 'burgame_scores';
const LOCAL_TOURNAMENTS_KEY = 'burgame_tournaments_v1';
const LOCAL_PARTICIPANTS_KEY = 'burgame_participants_v1';
const LOCAL_MATCHES_KEY = 'burgame_matches_v1';

// Seed inicial con el torneo real de Rocket League 2v2
const DEFAULT_TOURNAMENTS = [
    {
        id: 'tourn-rl-2026-1',
        title: 'Torneo Rocket League 2v2 — Apertura Burgame',
        game: 'Rocket League (2v2)',
        date: '2026-03-01',
        start_time: '19:00',
        modality: '2v2',
        format: 'single_elimination',
        max_participants: 16,
        status: 'finished', // 'upcoming', 'active', 'finished'
        registration_open: false,
        prize_pool: {
            first: 'Membresía Club Burgame (x2) + 2x Fatality Burgers',
            second: '2x Papas Burgame XL + Bebidas',
            third: '2x Cervezas Artesanales'
        },
        first_place: {
            name: 'Matias & Lucas (Team Nitro)',
            customerId: null,
            prize: 'Membresía Club Burgame (x2) + 2x Fatality Burgers'
        },
        second_place: {
            name: 'Agustin & Tomas (Team Turbo)',
            customerId: null,
            prize: '2x Papas Burgame XL + Bebidas'
        },
        third_place: {
            name: 'Franco & Kevin (Apex Boys)',
            customerId: null,
            prize: '2x Cervezas Artesanales'
        },
        rules: 'Modalidad 2v2 al mejor de 3 partidos (BO3). Final al mejor de 5 (BO5). Partidos con tiempo estándar de 5 minutos.',
        notes: 'Torneo estreno del salón gamer. Los ganadores recibieron su membresía gratuita del Club Burgame como premio oficial.'
    },
    {
        id: 'tourn-smash-2026-2',
        title: 'Super Smash Bros Ultimate — Noche de Campeones',
        game: 'Super Smash Bros Ultimate',
        date: '2026-03-15',
        start_time: '20:00',
        modality: '1v1',
        format: 'single_elimination',
        max_participants: 16,
        status: 'upcoming',
        registration_open: true,
        prize_pool: {
            first: 'Membresía Club Burgame 1 Mes + 1x Cheat Burger',
            second: '1x Combo Arcade Classic',
            third: '1x Papas Pacman'
        },
        first_place: {
            name: 'Por Definir',
            customerId: null,
            prize: 'Membresía Club Burgame 1 Mes + 1x Cheat Burger'
        },
        second_place: {
            name: 'Por Definir',
            customerId: null,
            prize: '1x Combo Arcade Classic'
        },
        third_place: {
            name: 'Por Definir',
            prize: '1x Papas Pacman'
        },
        rules: 'Modalidad 1v1 sin ítems, 3 stocks, 7 minutos. Escenarios competitivos legales (Battlefield / Omega / Smashville).',
        notes: 'Inscripción abierta en mostrador y online vía link público.'
    }
];

// ============================================================
// 1. SCORES DEL JUEGO ARCADE (PAC-MAN)
// ============================================================

export async function getTopScores(limit = 15) {
    try {
        const { data, error } = await supabase
            .from(SCORES_TABLE)
            .select('id, initials, score, created_at')
            .order('score', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.warn('[arcadeService] Fallback a scores locales:', err.message);
        const localScores = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || '[]');
        return localScores.slice(0, limit);
    }
}

export async function saveScore(initials, score) {
    const formattedInitials = (initials || 'AAA').toUpperCase().substring(0, 4);
    const scoreVal = parseInt(score, 10) || 0;

    try {
        const { data, error } = await supabase
            .from(SCORES_TABLE)
            .insert([{
                initials: formattedInitials,
                score: scoreVal,
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (err) {
        console.warn('[arcadeService] Guardando score local por error Supabase:', err.message);
        const local = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || '[]');
        const newRecord = {
            id: 'loc-' + Date.now(),
            initials: formattedInitials,
            score: scoreVal,
            created_at: new Date().toISOString()
        };
        local.push(newRecord);
        local.sort((a, b) => b.score - a.score);
        localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(local.slice(0, 50)));
        return newRecord;
    }
}

export async function deleteScore(id) {
    if (typeof id === 'string' && id.startsWith('loc-')) {
        let local = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || '[]');
        local = local.filter(s => s.id !== id);
        localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(local));
        return true;
    }

    try {
        const { error } = await supabase
            .from(SCORES_TABLE)
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    } catch (err) {
        console.warn('[arcadeService] Error al borrar de Supabase, limpiando local si existe:', err.message);
        let local = JSON.parse(localStorage.getItem(LOCAL_SCORES_KEY) || '[]');
        local = local.filter(s => s.id !== id);
        localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(local));
        return true;
    }
}

// ============================================================
// 2. GESTIÓN DE TORNEOS (CRUD)
// ============================================================

export async function getTournaments() {
    try {
        const { data, error } = await supabase
            .from(TOURNAMENTS_TABLE)
            .select('*')
            .order('date', { ascending: false });

        if (!error && data && data.length > 0) {
            // Normalizar campos si vienen de Supabase
            const normalized = data.map(normalizeTournament);
            localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(normalized));
            return normalized;
        }
    } catch (err) {
        console.warn('[arcadeService] Error al consultar tournaments en Supabase, usando local:', err.message);
    }

    // Fallback a localStorage
    try {
        const raw = localStorage.getItem(LOCAL_TOURNAMENTS_KEY);
        if (!raw) {
            localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(DEFAULT_TOURNAMENTS));
            // Intentar sembrar en Supabase en segundo plano
            seedDefaultTournamentsSupabase();
            return DEFAULT_TOURNAMENTS;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TOURNAMENTS;
    } catch {
        return DEFAULT_TOURNAMENTS;
    }
}

function normalizeTournament(t) {
    return {
        id: t.id,
        title: t.title,
        game: t.game,
        date: t.date,
        start_time: t.start_time || '19:00',
        modality: t.modality || '2v2',
        format: t.format || 'single_elimination',
        max_participants: t.max_participants || 16,
        participantsCount: t.max_participants || 16,
        status: t.status || 'upcoming',
        registration_open: t.registration_open !== false,
        prize_pool: t.prize_pool || {},
        prizePoolDescription: typeof t.prize_pool === 'object' ? (t.prize_pool.first || 'Membresía Club') : t.prize_pool,
        firstPlace: t.first_place || { name: 'Por definir', prize: 'Membresía Club Burgame' },
        secondPlace: t.second_place || { name: 'Por definir', prize: 'Premio secundario' },
        thirdPlace: t.third_place || { name: 'Por definir', prize: 'Consolación' },
        first_place: t.first_place,
        second_place: t.second_place,
        third_place: t.third_place,
        rules: t.rules || '',
        notes: t.notes || '',
        created_at: t.created_at,
        updated_at: t.updated_at
    };
}

async function seedDefaultTournamentsSupabase() {
    try {
        for (const t of DEFAULT_TOURNAMENTS) {
            await supabase.from(TOURNAMENTS_TABLE).upsert({
                id: t.id,
                title: t.title,
                game: t.game,
                date: t.date,
                start_time: t.start_time || '19:00',
                modality: t.modality || '2v2',
                format: t.format || 'single_elimination',
                max_participants: t.max_participants || 16,
                status: t.status || 'upcoming',
                registration_open: t.registration_open !== false,
                prize_pool: t.prize_pool || {},
                first_place: t.firstPlace || t.first_place,
                second_place: t.secondPlace || t.second_place,
                third_place: t.thirdPlace || t.third_place,
                rules: t.rules || '',
                notes: t.notes || ''
            });
        }
    } catch (e) {
        console.warn('Could not seed default tournaments to Supabase:', e);
    }
}

export async function getTournamentById(id) {
    if (!id) return null;

    let tournament = null;
    try {
        const { data, error } = await supabase
            .from(TOURNAMENTS_TABLE)
            .select('*')
            .eq('id', id)
            .single();

        if (!error && data) {
            tournament = normalizeTournament(data);
        }
    } catch (err) {
        console.warn('[arcadeService] Error al obtener torneo en Supabase:', err.message);
    }

    if (!tournament) {
        const list = await getTournaments();
        tournament = list.find(t => t.id === id) || null;
    }

    if (!tournament) return null;

    // Obtener participantes y matches asociados
    const [participants, matches] = await Promise.all([
        getParticipants(id),
        getMatches(id)
    ]);

    tournament.participants = participants;
    tournament.matches = matches;
    return tournament;
}

export async function saveTournament(tournament) {
    if (!tournament.id) {
        tournament.id = 'tourn-' + Date.now();
    }
    tournament.updated_at = new Date().toISOString();

    const recordForDb = {
        id: tournament.id,
        title: tournament.title,
        game: tournament.game,
        date: tournament.date,
        start_time: tournament.start_time || '19:00',
        modality: tournament.modality || '2v2',
        format: tournament.format || 'single_elimination',
        max_participants: parseInt(tournament.max_participants || tournament.participantsCount, 10) || 16,
        status: tournament.status || 'upcoming',
        registration_open: tournament.registration_open !== false,
        prize_pool: tournament.prize_pool || {
            first: tournament.firstPlace?.prize || 'Membresía Club Burgame',
            second: tournament.secondPlace?.prize || '2x Papas XL',
            third: tournament.thirdPlace?.prize || 'Cervezas Artesanales'
        },
        first_place: tournament.firstPlace || tournament.first_place || null,
        second_place: tournament.secondPlace || tournament.second_place || null,
        third_place: tournament.thirdPlace || tournament.third_place || null,
        rules: tournament.rules || 'Modalidad eliminación simple estándar.',
        notes: tournament.notes || '',
        updated_at: tournament.updated_at
    };

    // 1. Guardar en Supabase
    try {
        const { data, error } = await supabase
            .from(TOURNAMENTS_TABLE)
            .upsert(recordForDb)
            .select()
            .single();

        if (error) throw error;
        if (data) tournament = normalizeTournament(data);
    } catch (err) {
        console.warn('[arcadeService] Guardando torneo en local por fallo en Supabase:', err.message);
    }

    // 2. Guardar en LocalStorage
    try {
        let list = JSON.parse(localStorage.getItem(LOCAL_TOURNAMENTS_KEY) || '[]');
        const idx = list.findIndex(t => t.id === tournament.id);
        const norm = normalizeTournament(tournament);
        if (idx !== -1) {
            list[idx] = norm;
        } else {
            list.unshift(norm);
        }
        localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(list));
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }

    return tournament;
}

export async function deleteTournament(id) {
    try {
        await supabase.from(TOURNAMENTS_TABLE).delete().eq('id', id);
    } catch (err) {
        console.warn('[arcadeService] Error al borrar de Supabase:', err.message);
    }

    try {
        let list = JSON.parse(localStorage.getItem(LOCAL_TOURNAMENTS_KEY) || '[]');
        list = list.filter(t => t.id !== id);
        localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(list));

        // Limpiar participantes y matches locales
        let parts = JSON.parse(localStorage.getItem(LOCAL_PARTICIPANTS_KEY) || '[]');
        parts = parts.filter(p => p.tournament_id !== id);
        localStorage.setItem(LOCAL_PARTICIPANTS_KEY, JSON.stringify(parts));

        let matches = JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || '[]');
        matches = matches.filter(m => m.tournament_id !== id);
        localStorage.setItem(LOCAL_MATCHES_KEY, JSON.stringify(matches));
    } catch (e) {
        console.warn('LocalStorage delete error:', e);
    }

    return true;
}

// ============================================================
// 3. INSCRIPCIONES & PARTICIPANTES
// ============================================================

export async function getParticipants(tournamentId) {
    if (!tournamentId) return [];

    try {
        const { data, error } = await supabase
            .from(PARTICIPANTS_TABLE)
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('seed', { ascending: true, nullsFirst: false });

        if (!error && data) {
            return data;
        }
    } catch (err) {
        console.warn('[arcadeService] Error al consultar participantes en Supabase:', err.message);
    }

    // Fallback local
    const local = JSON.parse(localStorage.getItem(LOCAL_PARTICIPANTS_KEY) || '[]');
    return local.filter(p => p.tournament_id === tournamentId);
}

export async function registerParticipant(participant) {
    if (!participant.tournament_id) throw new Error('tournament_id es requerido');
    if (!participant.team_name) throw new Error('El nombre de equipo o jugador es requerido');
    if (!participant.captain_name) throw new Error('El nombre del capitán es requerido');
    if (!participant.captain_phone) throw new Error('El teléfono/WhatsApp es requerido');

    // Asignar ID y timestamp
    participant.id = participant.id || 'part-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    participant.created_at = participant.created_at || new Date().toISOString();
    participant.status = participant.status || 'registered'; // 'registered', 'checked_in'

    // Calcular próximo seed
    const currentList = await getParticipants(participant.tournament_id);
    participant.seed = participant.seed || (currentList.length + 1);

    const record = {
        id: participant.id,
        tournament_id: participant.tournament_id,
        team_name: participant.team_name.trim(),
        captain_name: participant.captain_name.trim(),
        captain_phone: participant.captain_phone.trim(),
        player2_name: (participant.player2_name || '').trim(),
        player2_phone: (participant.player2_phone || '').trim(),
        customer_id: participant.customer_id || null,
        seed: participant.seed,
        status: participant.status,
        created_at: participant.created_at
    };

    // 1. Guardar en Supabase
    try {
        const { data, error } = await supabase
            .from(PARTICIPANTS_TABLE)
            .insert([record])
            .select()
            .single();

        if (error) throw error;
        if (data) Object.assign(record, data);
    } catch (err) {
        console.warn('[arcadeService] Falló registro en Supabase, guardando local:', err.message);
    }

    // 2. Guardar en LocalStorage
    try {
        const local = JSON.parse(localStorage.getItem(LOCAL_PARTICIPANTS_KEY) || '[]');
        const idx = local.findIndex(p => p.id === record.id);
        if (idx !== -1) {
            local[idx] = record;
        } else {
            local.push(record);
        }
        localStorage.setItem(LOCAL_PARTICIPANTS_KEY, JSON.stringify(local));
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }

    return record;
}

export async function updateParticipantStatus(participantId, status) {
    try {
        await supabase
            .from(PARTICIPANTS_TABLE)
            .update({ status })
            .eq('id', participantId);
    } catch (err) {
        console.warn('[arcadeService] Error al actualizar status en Supabase:', err.message);
    }

    try {
        const local = JSON.parse(localStorage.getItem(LOCAL_PARTICIPANTS_KEY) || '[]');
        const item = local.find(p => p.id === participantId);
        if (item) {
            item.status = status;
            localStorage.setItem(LOCAL_PARTICIPANTS_KEY, JSON.stringify(local));
        }
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }
    return true;
}

export async function deleteParticipant(participantId) {
    try {
        await supabase.from(PARTICIPANTS_TABLE).delete().eq('id', participantId);
    } catch (err) {
        console.warn('[arcadeService] Error al borrar participante en Supabase:', err.message);
    }

    try {
        let local = JSON.parse(localStorage.getItem(LOCAL_PARTICIPANTS_KEY) || '[]');
        local = local.filter(p => p.id !== participantId);
        localStorage.setItem(LOCAL_PARTICIPANTS_KEY, JSON.stringify(local));
    } catch (e) {
        console.warn('LocalStorage error:', e);
    }
    return true;
}

// ============================================================
// 4. MOTOR DE BRACKETS INTERACTIVO (ESTILO CHALLONGE)
// ============================================================

export async function getMatches(tournamentId) {
    if (!tournamentId) return [];

    try {
        const { data, error } = await supabase
            .from(MATCHES_TABLE)
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('round_index', { ascending: true })
            .order('match_index', { ascending: true });

        if (!error && data) {
            return data;
        }
    } catch (err) {
        console.warn('[arcadeService] Error al obtener matches en Supabase:', err.message);
    }

    const local = JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || '[]');
    return local.filter(m => m.tournament_id === tournamentId);
}

/**
 * Genera el cuadro completo de llaves (Single Elimination)
 * Soporta 4, 8, 16 o 32 equipos. Si la cantidad de equipos no es potencia de 2,
 * rellena con Byes automáticos.
 * @param {string} tournamentId
 * @param {object} options { shuffle: boolean, includeThirdPlace: boolean }
 */
export async function generateBrackets(tournamentId, options = {}) {
    const { shuffle = false, includeThirdPlace = true } = options;

    let participants = await getParticipants(tournamentId);
    if (participants.length < 2) {
        throw new Error('Se requieren al menos 2 participantes para generar los brackets.');
    }

    // Filtrar solo confirmados o registrados
    participants = participants.filter(p => p.status !== 'disqualified');

    // Sorteo aleatorio si se solicitó
    if (shuffle) {
        participants = [...participants].sort(() => Math.random() - 0.5);
        participants.forEach((p, i) => { p.seed = i + 1; });
    } else {
        // Ordenar por seed existente
        participants = [...participants].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    }

    // Calcular tamaño de bracket (4, 8, 16, o 32)
    const count = participants.length;
    let bracketSize = 4;
    if (count > 16) bracketSize = 32;
    else if (count > 8) bracketSize = 16;
    else if (count > 4) bracketSize = 8;

    const totalRounds = Math.log2(bracketSize); // ej: 8 -> 3 rondas

    // Nombres de rondas
    function getRoundName(roundIdx, total) {
        const distanceToFinal = total - roundIdx;
        if (distanceToFinal === 0) return 'Gran Final';
        if (distanceToFinal === 1) return 'Semifinales';
        if (distanceToFinal === 2) return 'Cuartos de Final';
        if (distanceToFinal === 3) return 'Octavos de Final';
        return `Ronda ${roundIdx}`;
    }

    // Generar IDs de partidos y estructura
    const matches = [];

    // Primero creamos el esqueleto de todas las rondas para poder enlazar next_match_id
    // Ronda 1 tiene bracketSize / 2 partidos
    // Ronda 2 tiene bracketSize / 4 partidos
    // ...
    // Ronda final tiene 1 partido
    const roundMatchIds = {};

    for (let r = 1; r <= totalRounds; r++) {
        roundMatchIds[r] = [];
        const matchesInRound = bracketSize / Math.pow(2, r);
        for (let m = 0; m < matchesInRound; m++) {
            const matchId = `match-${tournamentId}-r${r}-m${m}`;
            roundMatchIds[r].push(matchId);
        }
    }

    // Enlace de partidos y asignación de participantes
    for (let r = 1; r <= totalRounds; r++) {
        const matchesInRound = bracketSize / Math.pow(2, r);
        const roundName = getRoundName(r, totalRounds);

        for (let m = 0; m < matchesInRound; m++) {
            const matchId = roundMatchIds[r][m];
            const nextMatchId = r < totalRounds ? roundMatchIds[r + 1][Math.floor(m / 2)] : null;

            let p1Id = null;
            let p2Id = null;
            let status = 'pending';
            let winnerId = null;
            let score1 = 0;
            let score2 = 0;

            // En la Ronda 1 asignamos a los participantes reales y Byes
            if (r === 1) {
                // Esquema de emparejamiento clásico:
                // m = 0: Seed 1 vs Seed (bracketSize)
                // m = 1: Seed 4 vs Seed (bracketSize - 3)
                // etc. Para simplicidad y robustez:
                const idx1 = m;
                const idx2 = bracketSize - 1 - m;

                const p1 = participants[idx1] || null;
                const p2 = participants[idx2] || null;

                p1Id = p1 ? p1.id : null;
                p2Id = p2 ? p2.id : null;

                // Si uno es Bye (nulo), el otro avanza automáticamente
                if (p1Id && !p2Id) {
                    status = 'completed';
                    winnerId = p1Id;
                    score1 = 1;
                    score2 = 0;
                } else if (!p1Id && p2Id) {
                    status = 'completed';
                    winnerId = p2Id;
                    score1 = 0;
                    score2 = 1;
                }
            }

            matches.push({
                id: matchId,
                tournament_id: tournamentId,
                round_index: r,
                round_name: roundName,
                match_index: m,
                participant1_id: p1Id,
                participant2_id: p2Id,
                score1,
                score2,
                winner_id: winnerId,
                next_match_id: nextMatchId,
                is_third_place: false,
                status,
                updated_at: new Date().toISOString()
            });
        }
    }

    // Si hubo Byes en la Ronda 1 que ya ganaron, los avanzamos a la Ronda 2
    for (const m of matches.filter(x => x.round_index === 1 && x.status === 'completed')) {
        if (m.winner_id && m.next_match_id) {
            const nextMatch = matches.find(x => x.id === m.next_match_id);
            if (nextMatch) {
                if (m.match_index % 2 === 0) {
                    nextMatch.participant1_id = m.winner_id;
                } else {
                    nextMatch.participant2_id = m.winner_id;
                }
            }
        }
    }

    // Partido opcional por el 3er Puesto (si hay al menos 4 equipos)
    if (includeThirdPlace && totalRounds >= 2) {
        matches.push({
            id: `match-${tournamentId}-third-place`,
            tournament_id: tournamentId,
            round_index: totalRounds,
            round_name: '3er y 4to Puesto',
            match_index: 99,
            participant1_id: null,
            participant2_id: null,
            score1: 0,
            score2: 0,
            winner_id: null,
            next_match_id: null,
            is_third_place: true,
            status: 'pending',
            updated_at: new Date().toISOString()
        });
    }

    // 1. Guardar en Supabase (limpiar anteriores e insertar nuevos)
    try {
        await supabase.from(MATCHES_TABLE).delete().eq('tournament_id', tournamentId);
        const { error } = await supabase.from(MATCHES_TABLE).insert(matches);
        if (error) throw error;

        // Actualizar estado del torneo a 'active'
        await supabase.from(TOURNAMENTS_TABLE).update({ status: 'active' }).eq('id', tournamentId);
    } catch (err) {
        console.warn('[arcadeService] Error al guardar matches en Supabase, guardando local:', err.message);
    }

    // 2. Guardar en LocalStorage
    try {
        let local = JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || '[]');
        local = local.filter(m => m.tournament_id !== tournamentId);
        local.push(...matches);
        localStorage.setItem(LOCAL_MATCHES_KEY, JSON.stringify(local));

        // Actualizar torneo local
        let tourns = JSON.parse(localStorage.getItem(LOCAL_TOURNAMENTS_KEY) || '[]');
        const t = tourns.find(x => x.id === tournamentId);
        if (t) {
            t.status = 'active';
            localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(tourns));
        }
    } catch (e) {
        console.warn('LocalStorage matches error:', e);
    }

    return matches;
}

/**
 * Registra el resultado de una partida y traslada automáticamente al ganador
 * a la siguiente ronda del bracket.
 */
export async function updateMatchScore(matchId, score1, score2, winnerId) {
    if (!matchId) throw new Error('matchId es requerido');

    // 1. Obtener partido actual
    let matches = [];
    try {
        const { data } = await supabase.from(MATCHES_TABLE).select('*').eq('id', matchId);
        if (data && data.length > 0) {
            const tournamentId = data[0].tournament_id;
            matches = await getMatches(tournamentId);
        }
    } catch (e) {
        console.warn(e);
    }

    if (matches.length === 0) {
        const local = JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || '[]');
        const match = local.find(m => m.id === matchId);
        if (match) {
            matches = local.filter(m => m.tournament_id === match.tournament_id);
        }
    }

    const currentMatch = matches.find(m => m.id === matchId);
    if (!currentMatch) throw new Error('Partido no encontrado: ' + matchId);

    const tournamentId = currentMatch.tournament_id;
    currentMatch.score1 = parseInt(score1, 10) || 0;
    currentMatch.score2 = parseInt(score2, 10) || 0;
    currentMatch.winner_id = winnerId;
    currentMatch.status = 'completed';
    currentMatch.updated_at = new Date().toISOString();

    const loserId = currentMatch.participant1_id === winnerId ? currentMatch.participant2_id : currentMatch.participant1_id;

    // Si tiene siguiente partido en el bracket principal:
    if (currentMatch.next_match_id) {
        const nextMatch = matches.find(m => m.id === currentMatch.next_match_id);
        if (nextMatch) {
            // El match_index par va a participant1, impar a participant2
            if (currentMatch.match_index % 2 === 0) {
                nextMatch.participant1_id = winnerId;
            } else {
                nextMatch.participant2_id = winnerId;
            }
            nextMatch.updated_at = new Date().toISOString();
        }
    }

    // Si este partido fue una Semifinal y existe partido por el 3er puesto, enviar al perdedor
    if (currentMatch.round_name === 'Semifinales') {
        const thirdPlaceMatch = matches.find(m => m.is_third_place && m.tournament_id === tournamentId);
        if (thirdPlaceMatch && loserId) {
            if (!thirdPlaceMatch.participant1_id) {
                thirdPlaceMatch.participant1_id = loserId;
            } else if (!thirdPlaceMatch.participant2_id) {
                thirdPlaceMatch.participant2_id = loserId;
            }
            thirdPlaceMatch.updated_at = new Date().toISOString();
        }
    }

    // Comprobar si fue la Gran Final
    let tournamentFinished = false;
    let podiumData = null;

    if (currentMatch.round_name === 'Gran Final') {
        tournamentFinished = true;
        const participants = await getParticipants(tournamentId);
        const champ = participants.find(p => p.id === winnerId);
        const runnerUp = participants.find(p => p.id === loserId);

        // Buscar ganador del 3er puesto si ya se jugó
        const thirdMatch = matches.find(m => m.is_third_place);
        const thirdPlaceParticipant = thirdMatch?.winner_id ? participants.find(p => p.id === thirdMatch.winner_id) : null;

        podiumData = {
            first_place: {
                name: champ ? champ.team_name : 'Campeón',
                captain: champ ? champ.captain_name : '',
                phone: champ ? champ.captain_phone : '',
                prize: 'Membresía Club Burgame + Burger'
            },
            second_place: {
                name: runnerUp ? runnerUp.team_name : 'Subcampeón',
                captain: runnerUp ? runnerUp.captain_name : '',
                phone: runnerUp ? runnerUp.captain_phone : '',
                prize: '2x Papas Burgame XL + Bebidas'
            },
            third_place: {
                name: thirdPlaceParticipant ? thirdPlaceParticipant.team_name : 'Por definir',
                prize: 'Cervezas Artesanales'
            }
        };
    }

    // 1. Guardar cambios en Supabase
    try {
        await supabase
            .from(MATCHES_TABLE)
            .update({
                score1: currentMatch.score1,
                score2: currentMatch.score2,
                winner_id: currentMatch.winner_id,
                status: 'completed',
                updated_at: currentMatch.updated_at
            })
            .eq('id', currentMatch.id);

        if (currentMatch.next_match_id) {
            const nextMatch = matches.find(m => m.id === currentMatch.next_match_id);
            if (nextMatch) {
                await supabase
                    .from(MATCHES_TABLE)
                    .update({
                        participant1_id: nextMatch.participant1_id,
                        participant2_id: nextMatch.participant2_id,
                        updated_at: nextMatch.updated_at
                    })
                    .eq('id', nextMatch.id);
            }
        }

        if (tournamentFinished && podiumData) {
            await supabase
                .from(TOURNAMENTS_TABLE)
                .update({
                    status: 'finished',
                    first_place: podiumData.first_place,
                    second_place: podiumData.second_place,
                    third_place: podiumData.third_place
                })
                .eq('id', tournamentId);
        }
    } catch (err) {
        console.warn('[arcadeService] Error actualizando partido en Supabase:', err.message);
    }

    // 2. Guardar en LocalStorage
    try {
        let localMatches = JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || '[]');
        localMatches = localMatches.filter(m => m.tournament_id !== tournamentId);
        localMatches.push(...matches);
        localStorage.setItem(LOCAL_MATCHES_KEY, JSON.stringify(localMatches));

        if (tournamentFinished && podiumData) {
            let tourns = JSON.parse(localStorage.getItem(LOCAL_TOURNAMENTS_KEY) || '[]');
            const t = tourns.find(x => x.id === tournamentId);
            if (t) {
                t.status = 'finished';
                t.first_place = podiumData.first_place;
                t.second_place = podiumData.second_place;
                t.third_place = podiumData.third_place;
                t.firstPlace = podiumData.first_place;
                t.secondPlace = podiumData.second_place;
                t.thirdPlace = podiumData.third_place;
                localStorage.setItem(LOCAL_TOURNAMENTS_KEY, JSON.stringify(tourns));
            }
        }
    } catch (e) {
        console.warn('LocalStorage update error:', e);
    }

    return {
        match: currentMatch,
        tournamentFinished,
        podiumData
    };
}

// ============================================================
// 5. ASIGNACIÓN OFICIAL DE MEMBRESÍAS CLUB BURGAME (0 Gs)
// ============================================================

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
    getTournamentById,
    saveTournament,
    deleteTournament,
    getParticipants,
    registerParticipant,
    updateParticipantStatus,
    deleteParticipant,
    getMatches,
    generateBrackets,
    updateMatchScore,
    grantTournamentMembership
};
