-- ============================================================
-- DEDUPLICACIÓN DE PRODUCTOS
-- Elimina duplicados en la tabla products, dejando solo 1 por nombre.
-- Seguro: reasigna order_items antes de borrar para no romper FKs.
-- ============================================================
-- EJECUTAR EN: Supabase SQL Editor (Dashboard > SQL > New query)
-- ============================================================

-- 0) Vista previa: ver qué productos están duplicados
-- Descomenta y ejecuta SOLO esta parte primero para revisar:
--
-- SELECT
--     trim(lower(name)) AS norm_name,
--     count(*) AS qty,
--     array_agg(id ORDER BY created_at) AS ids,
--     array_agg(name ORDER BY created_at) AS all_names
-- FROM products
-- GROUP BY trim(lower(name))
-- HAVING count(*) > 1
-- ORDER BY qty DESC;

-- ============================================================

BEGIN;

-- 1) Construir una tabla temporal con el producto "canónico" a conservar.
--    Criterio: por nombre normalizado (trim + lower), el más antiguo por created_at.
--    (Si created_at es nulo, usa ctid como fallback de orden.)
CREATE TEMP TABLE _dup_keep AS
SELECT DISTINCT ON (trim(lower(name)))
    id           AS keep_id,
    name         AS keep_name,
    trim(lower(name)) AS norm_name
FROM products
ORDER BY trim(lower(name)), created_at ASC NULLS LAST, ctid;

-- 2) Identificar los duplicados a eliminar (todos los que NO son el canónico)
CREATE TEMP TABLE _dup_kill AS
SELECT p.id AS kill_id, k.keep_id
FROM products p
JOIN _dup_keep k ON trim(lower(p.name)) = k.norm_name
WHERE p.id <> k.keep_id;

-- 3) Reasignar order_items.product_id de los duplicados al canónico
--    (evita violar foreign keys al borrar)
UPDATE order_items oi
SET product_id = dk.kill_id_to_keep
FROM (
    SELECT oi2.product_id AS kill_id, dk.keep_id AS kill_id_to_keep
    FROM order_items oi2
    JOIN _dup_kill dk ON oi2.product_id = dk.kill_id
) sub
WHERE oi.product_id = sub.kill_id;

-- 4) Eliminar los duplicados (hard delete)
DELETE FROM products
WHERE id IN (SELECT kill_id FROM _dup_kill);

-- 5) Reporte de resultado
SELECT
    (SELECT count(*) FROM _dup_kill)            AS duplicados_eliminados,
    (SELECT count(*) FROM products)             AS productos_restantes;

-- 6) Limpieza de tablas temporales (se borran solas al cerrar la sesión, pero por si acaso)
DROP TABLE IF EXISTS _dup_kill;
DROP TABLE IF EXISTS _dup_keep;

COMMIT;

-- ============================================================
-- NOTAS:
-- - Este script deja 1 producto por nombre (case-insensitive, sin espacios extra).
-- - Conserva el más antiguo (primer created_at).
-- - Reasigna cualquier order_items que apuntaba a un duplicado.
-- - Si preferís soft-delete en vez de hard delete, reemplazá el bloque
--   "DELETE FROM products" por:
--     UPDATE products SET active = false
--     WHERE id IN (SELECT kill_id FROM _dup_kill);
-- - Si tenés una constraint UNIQUE en (name), agregala después:
--     ALTER TABLE products ADD CONSTRAINT products_name_unique UNIQUE (name);
--   (previene futuros duplicados a nivel DB)
-- ============================================================
