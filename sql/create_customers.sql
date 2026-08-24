-- ============================================
-- MIGRACIÓN: Tabla de clientes registrados
-- Permite tener un registro único de clientes
-- y un dropdown en el carrito de ventas.
-- Los clientes nuevos se registran automáticamente
-- cuando se hace un pedido (upsert en la RPC).
-- ============================================

-- 1. Crear tabla customers
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    phone TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    last_order_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS y políticas (acceso público lectura/escritura, igual que orders)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read customers" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can insert customers" ON customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can update customers" ON customers FOR UPDATE TO anon USING (true);

-- 3. Índice para búsqueda en el dropdown
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- 4. Backfill: migrar nombres únicos de orders a customers
INSERT INTO customers (name, last_order_at, created_at)
SELECT
    TRIM(customer_name),
    MAX(created_at),
    MIN(created_at)
FROM orders
WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
GROUP BY TRIM(customer_name)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 5. Actualizar la función RPC para hacer upsert de clientes
-- Cuando se crea un pedido, si el cliente no existe lo registra,
-- y si existe actualiza last_order_at.
-- ============================================
CREATE OR REPLACE FUNCTION create_order_with_items(
    p_notes TEXT DEFAULT '',
    p_cash_register_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_customer_name TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_total INTEGER := 0;
    v_order_number INTEGER;
    v_item JSONB;
    v_product_name TEXT;
    v_price INTEGER;
    v_quantity INTEGER;
    v_result JSONB;
    v_customer TEXT;
BEGIN
    v_customer := BTRIM(p_customer_name);

    -- Registrar/actualizar el cliente automáticamente (upsert)
    IF v_customer IS NOT NULL AND v_customer != '' THEN
        INSERT INTO customers (name, last_order_at)
        VALUES (v_customer, now())
        ON CONFLICT (name) DO UPDATE SET last_order_at = now();
    END IF;

    -- Calcular total desde los items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_price := (v_item->>'price')::INTEGER;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_total := v_total + (v_price * v_quantity);
    END LOOP;

    -- Generar order_number diario
    v_order_number := COALESCE(
        (SELECT MAX(order_number) + 1 FROM orders WHERE created_at::date = CURRENT_DATE),
        1
    );

    -- Insertar la orden (con customer_name en columna propia)
    INSERT INTO orders (notes, cash_register_id, status, total, order_number, customer_name)
    VALUES (p_notes, p_cash_register_id, 'ordered', v_total, v_order_number, v_customer)
    RETURNING id INTO v_order_id;

    -- Insertar los items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_name := v_item->>'product_name';
        v_price := (v_item->>'price')::INTEGER;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);

        INSERT INTO order_items (order_id, product_id, product_name, price, quantity, is_combo)
        VALUES (
            v_order_id,
            NULLIF(v_item->>'product_id', '')::UUID,
            v_product_name,
            v_price,
            v_quantity,
            COALESCE((v_item->>'is_combo')::BOOLEAN, false)
        );
    END LOOP;

    -- Devolver la orden creada con su order_number
    SELECT jsonb_build_object(
        'id', v_order_id,
        'order_number', v_order_number,
        'total', v_total,
        'status', 'ordered'
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Permisos para que el rol anon pueda ejecutar la función
GRANT EXECUTE ON FUNCTION create_order_with_items(TEXT, UUID, JSONB, TEXT) TO anon;
