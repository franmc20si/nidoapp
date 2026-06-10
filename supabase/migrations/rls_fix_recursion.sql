-- Arregla la recursión infinita (Postgres 42P17) de la política `members_select`,
-- que consultaba household_members dentro de su propio USING sobre la misma tabla.
-- Solución: una función SECURITY DEFINER que lee los hogares del usuario sin
-- re-disparar RLS. Reutilizable por el resto de políticas para mantener una sola
-- definición de "mis hogares".
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION my_household_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT household_id FROM household_members WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION my_household_ids() FROM public;
GRANT EXECUTE ON FUNCTION my_household_ids() TO authenticated;

-- Política sin recursión sobre household_members
DROP POLICY IF EXISTS "members_select" ON household_members;
CREATE POLICY "members_select" ON household_members FOR SELECT
  USING (household_id IN (SELECT my_household_ids()));

-- (Opcional, recomendado) Reescribir el resto de políticas para reutilizar la
-- función. Equivalentes a las actuales pero centralizadas y sin subconsultas
-- repetidas. Descomenta si quieres unificarlas:
--
-- DROP POLICY IF EXISTS "tasks_household" ON tasks;
-- CREATE POLICY "tasks_household" ON tasks FOR ALL
--   USING (household_id IN (SELECT my_household_ids()));
--
-- DROP POLICY IF EXISTS "shopping_lists_household" ON shopping_lists;
-- CREATE POLICY "shopping_lists_household" ON shopping_lists FOR ALL
--   USING (household_id IN (SELECT my_household_ids()));
--
-- DROP POLICY IF EXISTS "expenses_household" ON expenses;
-- CREATE POLICY "expenses_household" ON expenses FOR ALL
--   USING (household_id IN (SELECT my_household_ids()));
