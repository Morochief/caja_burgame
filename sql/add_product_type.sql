-- ============================================
-- MIGRACIÓN: Agregar columnas de tipo y precios extendidos a products
-- ============================================

-- 1. Agregar columna product_type con valores válidos
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'standard'
    CHECK (product_type IN ('cheat', 'bowser', 'burger', 'chopp', 'standard'));

-- 2. Agregar columnas de precios extendidos (si no existen)
ALTER TABLE products ADD COLUMN IF NOT EXISTS promo_price INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_1x INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_2x1 INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_libre INTEGER;

-- 3. Backfill: detectar tipo automáticamente para productos existentes
UPDATE products SET product_type = 'chopp'    WHERE product_type = 'standard' AND (LOWER(name) LIKE '%chopp%' OR LOWER(name) LIKE '%pilsen%');
UPDATE products SET product_type = 'cheat'    WHERE product_type = 'standard' AND LOWER(name) LIKE '%cheat%' AND LOWER(name) NOT LIKE '%doble%';
UPDATE products SET product_type = 'bowser'   WHERE product_type = 'standard' AND LOWER(name) LIKE '%bowser%';
UPDATE products SET product_type = 'burger'   WHERE product_type = 'standard' AND (
    LOWER(name) LIKE '%burger%' 
    OR LOWER(name) LIKE '%classic%' 
    OR LOWER(name) LIKE '%fatality%' 
    OR LOWER(name) LIKE '%ronin%' 
    OR LOWER(name) LIKE '%yoshi%'
);
-- Los que no matcheen quedan como 'standard' (valor por defecto)

-- 4. Índice para filtrar por tipo
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);
