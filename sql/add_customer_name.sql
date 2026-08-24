-- ============================================
-- MIGRACIÓN: Agregar columna customer_name a orders
-- Guarda el nombre del cliente en su propia columna
-- (antes estaba embebido en notes como [Cliente: NOMBRE])
-- ============================================

-- 1. Agregar columna customer_name
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT '';

-- 2. Backfill: extraer nombres de notas existentes de órdenes viejas
UPDATE orders
SET customer_name = COALESCE(
    (regexp_match(notes, '\[Cliente:\s*([^\]]+)\]', 'i'))[1],
    ''
)
WHERE customer_name = '' AND notes LIKE '%[Cliente:%';

-- 3. Índice para buscar por cliente (opcional, útil para módulo de clientes)
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_name) WHERE customer_name != '';

-- ============================================
-- Actualizar la función RPC para recibir y guardar customer_name
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
BEGIN
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
    VALUES (p_notes, p_cash_register_id, 'ordered', v_total, v_order_number, p_customer_name)
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

-- ============================================
-- Eliminar el prefijo [Cliente: NOMBRE] de notes viejas
-- ya que ahora el nombre va en su propia columna
-- ============================================
UPDATE orders
SET notes = BTRIM(regexp_replace(notes, '\[Cliente:\s*[^\]]+\]\s*', '', 'i'))
WHERE notes LIKE '%[Cliente:%';
