-- ============================================================
-- MIGRACIÓN: Cuentas Abiertas / Mesas (Customer Tabs)
-- Permite que clientes y mozos abran una cuenta, acumulen pedidos
-- a lo largo de su consumo y se cobre el total al finalizar.
-- ============================================================

-- 1. Crear tabla customer_tabs
CREATE TABLE IF NOT EXISTS customer_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tab_name TEXT NOT NULL,                  -- Ej: "Mesa 4 — Kevin" o "Barra 2"
    table_number TEXT DEFAULT '',            -- "4"
    customer_name TEXT DEFAULT '',           -- "Kevin"
    status TEXT NOT NULL DEFAULT 'open',     -- 'open' (consumiendo) | 'bill_requested' (pidió la cuenta) | 'closed' (cobrada)
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    bill_requested_at TIMESTAMPTZ,
    cash_register_id UUID REFERENCES cash_registers(id) ON DELETE SET NULL,
    total_amount INTEGER DEFAULT 0,
    paid_amount INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT '',          -- 'efectivo' | 'transferencia' | 'debito' | 'credito'
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS en customer_tabs (acceso para anon, coherente con el resto de la app)
ALTER TABLE customer_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon read customer_tabs" ON customer_tabs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon insert customer_tabs" ON customer_tabs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon update customer_tabs" ON customer_tabs FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon delete customer_tabs" ON customer_tabs FOR DELETE TO anon USING (true);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_customer_tabs_status ON customer_tabs(status);
CREATE INDEX IF NOT EXISTS idx_customer_tabs_created_at ON customer_tabs(created_at);

-- 4. Agregar columna tab_id a la tabla orders si no existe
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tab_id UUID REFERENCES customer_tabs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tab_id ON orders(tab_id);

-- 5. Agregar customer_tabs a la publicación realtime de Supabase (si existe)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE customer_tabs;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;
