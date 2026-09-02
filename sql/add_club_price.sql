-- ============================================
-- MIGRACIÓN: Precio socio Club Burgame por producto
-- NULL = el producto NO participa del precio de socio.
-- Si tiene valor, TODAS sus presentaciones (Solo, Combo,
-- promo/variante) pasan a costar ese precio con el toggle Club.
-- ============================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS club_price INTEGER;
