-- Gasto del súper: cada compra (importe + fecha + tienda) para ver la evolución
-- semanal desde la tab Menú. Las tiendas son una lista editable del hogar
-- (nombre + color de NIDO_COLORS), calcada de banks. Ejecutar en el SQL Editor.
-- Idempotente.

CREATE TABLE IF NOT EXISTS grocery_stores (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT 'teja',  -- clave de NIDO_COLORS
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grocery_stores_household_idx ON grocery_stores (household_id);

CREATE TABLE IF NOT EXISTS grocery_spends (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  -- Borrar una tienda no borra sus compras: quedan "Sin tienda".
  store_id     UUID REFERENCES grocery_stores(id) ON DELETE SET NULL,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  spent_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS grocery_spends_household_date_idx ON grocery_spends (household_id, spent_on);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que banks/shopping_basics: reutiliza my_household_ids() (rls_fix_recursion.sql).
ALTER TABLE grocery_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_spends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grocery_stores_household" ON grocery_stores;
CREATE POLICY "grocery_stores_household" ON grocery_stores FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));

DROP POLICY IF EXISTS "grocery_spends_household" ON grocery_spends;
CREATE POLICY "grocery_spends_household" ON grocery_spends FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
