-- ============================================
-- FIX: Permisos DELETE en customers (RLS)
-- Si el delete falla silenciosamente (borra 0 filas
-- sin error), es porque la policy DELETE no existe
-- o RLS la bloquea. Esto la (re)crea con FORCE.
-- ============================================

-- 1. Asegurar que RLS esté activo
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- 2. Dropear policies existentes de DELETE (si las hay) para evitar duplicados
DROP POLICY IF EXISTS "Anyone can delete customers" ON customers;

-- 3. Crear la policy de DELETE para anon (acceso público, igual que las demás)
CREATE POLICY "Anyone can delete customers" ON customers
    FOR DELETE TO anon
    USING (true);

-- 4. Verificar que las policies existen
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'customers'
ORDER BY cmd;
