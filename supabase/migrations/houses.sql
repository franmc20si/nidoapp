-- Casas / viviendas del hogar (pantalla "Casas", accesible desde Servicios).
-- Cada servicio puede atribuirse a una casa; permite ver el gasto mensual
-- estimado por casa y el total de todas las casas juntas.
-- Mismo patrón que banks.sql. Ejecutar en el SQL Editor de Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS houses (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT 'teja', -- clave de NIDO_COLORS: teja|terracota|cielo|bosque|iris
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS houses_household_idx ON houses (household_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que subscriptions/banks: reutiliza my_household_ids() (rls_fix_recursion.sql).
ALTER TABLE houses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "houses_household" ON houses;
CREATE POLICY "houses_household" ON houses FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));

-- ── Enlace subscriptions → houses ───────────────────────────────────────────
-- ON DELETE SET NULL implementa el "desasignar": al borrar una casa, sus
-- servicios quedan sin casa en vez de borrarse.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS house_id UUID REFERENCES houses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subscriptions_house_idx ON subscriptions (house_id);
