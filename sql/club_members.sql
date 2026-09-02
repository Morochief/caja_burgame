-- ============================================
-- MIGRACIÓN: Club Burgame — Membresías de socios
-- Marca de socio en customers + historial de pagos/renovaciones.
-- La membresía dura 30 días desde el pago.
-- ============================================

-- 1. Marca de socio del Club Burgame en clientes
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_club_member BOOLEAN NOT NULL DEFAULT false;

-- 2. Tabla de membresías (historial de pagos/renovaciones y vigencia)
CREATE TABLE IF NOT EXISTS club_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL DEFAULT 70000,        -- Gs. (membresía mensual)
    paid_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL               -- vencimiento (30 días desde pago)
);

-- 3. RLS permisivo (igual que el resto del sistema)
ALTER TABLE club_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON club_memberships FOR ALL USING (true) WITH CHECK (true);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_club_memberships_customer ON club_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_club_memberships_expires ON club_memberships(expires_at);
