-- ============================================
-- MIGRACIÓN: Tabla de scores del Arcade (Pacman)
-- Persiste los puntajes del juego en Supabase
-- para que sean compartidos entre todos los
-- dispositivos y usuarios del sistema.
-- ============================================

-- 1. Crear tabla arcade_scores
CREATE TABLE IF NOT EXISTS arcade_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initials TEXT NOT NULL CHECK (char_length(initials) <= 3),
    score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS y políticas (acceso público, igual que orders y customers)
ALTER TABLE arcade_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read arcade_scores" ON arcade_scores FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can insert arcade_scores" ON arcade_scores FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can delete arcade_scores" ON arcade_scores FOR DELETE TO anon USING (true);

-- 3. Índice para ordenar por score (consulta más frecuente)
CREATE INDEX IF NOT EXISTS idx_arcade_scores_score ON arcade_scores(score DESC);

-- 4. Datos iniciales (scores de ejemplo)
INSERT INTO arcade_scores (initials, score)
VALUES
    ('BRG', 10000),
    ('LVL', 5000),
    ('PAC', 2500)
ON CONFLICT DO NOTHING;
