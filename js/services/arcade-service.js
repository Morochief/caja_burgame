import { supabase } from '../supabase-client.js';

// ============================================================
// Servicio para scores del Arcade (Pacman) en Supabase
// Tabla: arcade_scores (id, initials, score, created_at)
// ============================================================

const TABLE = 'arcade_scores';

// Trae los top N scores de Supabase
export async function getTopScores(limit = 10) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, initials, score, created_at')
        .order('score', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

// Guarda un score nuevo. Devuelve el registro creado.
export async function saveScore(initials, score) {
    const { data, error } = await supabase
        .from(TABLE)
        .insert([{
            initials: (initials || 'AAA').toUpperCase().substring(0, 3),
            score: parseInt(score, 10) || 0,
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

// Borra un score por id (solo admin)
export async function deleteScore(id) {
    const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export const arcadeService = {
    getTopScores,
    saveScore,
    deleteScore,
};
