-- ============================================================
-- MIGRACIÓN: SUITE DE TORNEOS GAMER & MOTOR DE BRACKETS
-- Plataforma estilo Challonge integrada con Burgame
-- Tablas:
-- 1. tournaments (datos generales del torneo)
-- 2. tournament_participants (equipos o jugadores inscriptos)
-- 3. tournament_matches (árbol de eliminación, llaves y puntajes)
-- ============================================================

-- 1. Tabla de Torneos
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    game TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME DEFAULT '19:00',
    modality TEXT DEFAULT '2v2', -- '1v1', '2v2', '3v3', '5v5'
    format TEXT DEFAULT 'single_elimination', -- 'single_elimination', 'double_elimination'
    max_participants INTEGER DEFAULT 16,
    status TEXT DEFAULT 'upcoming', -- 'draft', 'upcoming', 'active', 'finished'
    registration_open BOOLEAN DEFAULT true,
    url_slug TEXT,
    host_name TEXT DEFAULT 'Burgame Gaming Arena',
    stage_type TEXT DEFAULT 'single_stage', -- 'single_stage', 'two_stage'
    registration_fee TEXT DEFAULT 'free', -- 'free', 'paid'
    fee_amount NUMERIC DEFAULT 0,
    include_third_place BOOLEAN DEFAULT true,
    require_checkin BOOLEAN DEFAULT true,
    seeding_rule TEXT DEFAULT 'traditional', -- 'traditional', 'shuffle', 'sequential'
    quick_advance BOOLEAN DEFAULT false,
    hide_bracket_preview BOOLEAN DEFAULT false,
    prize_pool JSONB DEFAULT '{"first": "Membresía Club Burgame + Burger", "second": "Papas XL + Bebidas", "third": "Cervezas Artesanales"}'::jsonb,
    first_place JSONB,
    second_place JSONB,
    third_place JSONB,
    rules TEXT DEFAULT 'Modalidad eliminación simple. Respeto obligatorio a rivales y staff de Burgame.',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabla de Participantes / Equipos Inscriptos
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    captain_name TEXT NOT NULL,
    captain_phone TEXT NOT NULL,
    player2_name TEXT,
    player2_phone TEXT,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    seed INTEGER,
    status TEXT DEFAULT 'registered', -- 'registered', 'checked_in', 'disqualified', 'eliminated'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabla de Partidos / Enfrentamientos (Brackets)
CREATE TABLE IF NOT EXISTS public.tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL, -- 1: Primera Ronda/Cuartos, 2: Semifinales, 3: Final, etc.
    round_name TEXT NOT NULL, -- 'Cuartos de Final', 'Semifinales', 'Gran Final', '3er Puesto'
    match_index INTEGER NOT NULL, -- Índice dentro de la ronda (0, 1, 2, ...)
    participant1_id TEXT, -- Puede ser null si aún no se definió o es Bye
    participant2_id TEXT,
    score1 INTEGER DEFAULT 0,
    score2 INTEGER DEFAULT 0,
    winner_id TEXT,
    next_match_id TEXT,
    is_third_place BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tourn ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tourn ON public.tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_date ON public.tournaments(date DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- Políticas RLS Permisivas para funcionamiento en POS y portal público
DO $$
BEGIN
    -- Tournaments
    DROP POLICY IF EXISTS "Anyone can read tournaments" ON public.tournaments;
    DROP POLICY IF EXISTS "Anyone can insert tournaments" ON public.tournaments;
    DROP POLICY IF EXISTS "Anyone can update tournaments" ON public.tournaments;
    DROP POLICY IF EXISTS "Anyone can delete tournaments" ON public.tournaments;

    CREATE POLICY "Anyone can read tournaments" ON public.tournaments FOR SELECT TO anon USING (true);
    CREATE POLICY "Anyone can insert tournaments" ON public.tournaments FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Anyone can update tournaments" ON public.tournaments FOR UPDATE TO anon USING (true);
    CREATE POLICY "Anyone can delete tournaments" ON public.tournaments FOR DELETE TO anon USING (true);

    -- Participants
    DROP POLICY IF EXISTS "Anyone can read tournament_participants" ON public.tournament_participants;
    DROP POLICY IF EXISTS "Anyone can insert tournament_participants" ON public.tournament_participants;
    DROP POLICY IF EXISTS "Anyone can update tournament_participants" ON public.tournament_participants;
    DROP POLICY IF EXISTS "Anyone can delete tournament_participants" ON public.tournament_participants;

    CREATE POLICY "Anyone can read tournament_participants" ON public.tournament_participants FOR SELECT TO anon USING (true);
    CREATE POLICY "Anyone can insert tournament_participants" ON public.tournament_participants FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Anyone can update tournament_participants" ON public.tournament_participants FOR UPDATE TO anon USING (true);
    CREATE POLICY "Anyone can delete tournament_participants" ON public.tournament_participants FOR DELETE TO anon USING (true);

    -- Matches
    DROP POLICY IF EXISTS "Anyone can read tournament_matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can insert tournament_matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can update tournament_matches" ON public.tournament_matches;
    DROP POLICY IF EXISTS "Anyone can delete tournament_matches" ON public.tournament_matches;

    CREATE POLICY "Anyone can read tournament_matches" ON public.tournament_matches FOR SELECT TO anon USING (true);
    CREATE POLICY "Anyone can insert tournament_matches" ON public.tournament_matches FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "Anyone can update tournament_matches" ON public.tournament_matches FOR UPDATE TO anon USING (true);
    CREATE POLICY "Anyone can delete tournament_matches" ON public.tournament_matches FOR DELETE TO anon USING (true);
END $$;
