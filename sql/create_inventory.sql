-- ============================================
-- MIGRACIÓN: Tabla de movimientos de inventario
-- Permite registrar entradas/salidas de stock
-- y tener trazabilidad de cada ajuste.
-- ============================================

CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,           -- positivo = entrada, negativo = salida
    reason TEXT DEFAULT '',               -- 'compra', 'ajuste', 'merma', 'venta', etc
    previous_stock INTEGER NOT NULL DEFAULT 0,
    new_stock INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para buscar movimientos por producto
CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON inventory_movements(product_id);
-- Índice para buscar movimientos por fecha
CREATE INDEX IF NOT EXISTS idx_inv_mov_date ON inventory_movements(created_at DESC);

-- Habilitar RLS
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- Políticas: anon puede leer y escribir (sistema POS de un solo usuario)
CREATE POLICY "allow_all_inventory" ON inventory_movements
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- Vista para resumir movimientos por día
-- ============================================
CREATE OR REPLACE VIEW inventory_daily_summary AS
SELECT
    DATE(created_at) AS day,
    product_id,
    product_name,
    SUM(quantity) AS total_change,
    MAX(new_stock) AS end_of_day_stock,
    COUNT(*) AS movement_count
FROM inventory_movements
GROUP BY DATE(created_at), product_id, product_name
ORDER BY day DESC, product_name;

-- ============================================
-- Función para ajustar stock atómicamente
-- ============================================
CREATE OR REPLACE FUNCTION adjust_stock(
    p_product_id UUID,
    p_quantity INTEGER,        -- positivo = sumar, negativo = restar
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product RECORD;
    v_new_stock INTEGER;
BEGIN
    SELECT name, stock INTO v_product FROM products WHERE id = p_product_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado';
    END IF;

    v_new_stock := v_product.stock + p_quantity;
    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente. Stock actual: %, intenta restar: %', v_product.stock, p_quantity;
    END IF;

    -- Actualizar stock del producto
    UPDATE products SET stock = v_new_stock WHERE id = p_product_id;

    -- Registrar movimiento
    INSERT INTO inventory_movements (product_id, product_name, quantity, reason, previous_stock, new_stock)
    VALUES (p_product_id, v_product.name, p_quantity, p_reason, v_product.stock, v_new_stock);

    RETURN jsonb_build_object(
        'product_id', p_product_id,
        'product_name', v_product.name,
        'previous_stock', v_product.stock,
        'new_stock', v_new_stock
    );
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_stock(UUID, INTEGER, TEXT) TO anon;
