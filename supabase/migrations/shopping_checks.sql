-- Estado "comprado" de los ingredientes de receta de la lista de la compra.
-- Antes vivía solo en AsyncStorage (device-local) → no sincronizaba entre móviles:
-- si marcabas un ingrediente como comprado en un teléfono, en el otro seguía pendiente.
--
-- Cada fila marca un ingrediente de receta como comprado en una semana concreta.
-- item_key = "ri-<nombre receta>-<nombre ingrediente>" (id determinista que genera
-- ShoppingListSheet). Los productos manuales NO usan esta tabla: su estado de
-- comprado ya vive en shopping_items.is_checked.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS shopping_checks (
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  week_key     TEXT NOT NULL,
  item_key     TEXT NOT NULL,
  checked_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (household_id, week_key, item_key)
);

-- La PK (household_id, week_key, item_key) ya sirve de índice para las lecturas
-- por hogar + semana, que es el único patrón de consulta.

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reutiliza my_household_ids() (definida en rls_fix_recursion.sql) para evitar
-- recursión. Solo los miembros del hogar pueden ver/editar sus marcas.
ALTER TABLE shopping_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopping_checks_household" ON shopping_checks;
CREATE POLICY "shopping_checks_household" ON shopping_checks FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
