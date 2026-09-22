-- Básicos semanales: lista PLANTILLA de productos de compra habituales del hogar
-- (leche, pan, huevos…). No es por semana: es una lista fija que se mantiene desde
-- la tab Menú ("Básicos semanales") y se vuelca de una vez a la lista de la compra
-- de la semana con el botón "Añadir básicos". Ejecutar en el SQL Editor. Idempotente.

CREATE TABLE IF NOT EXISTS shopping_basics (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  unit         TEXT,              -- cantidad opcional (ej: "1L", "docena"); se copia a shopping_items.unit
  category     TEXT NOT NULL DEFAULT 'otros', -- clave de GROCERY_CATS
  sort         INT  NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shopping_basics_household_idx ON shopping_basics (household_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que banks/subscriptions: reutiliza my_household_ids() (rls_fix_recursion.sql).
ALTER TABLE shopping_basics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shopping_basics_household" ON shopping_basics;
CREATE POLICY "shopping_basics_household" ON shopping_basics FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
