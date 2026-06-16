-- Calendario de vacaciones (tab "Calendario").
-- Cada fila es un periodo (puede ser un solo día) con una etiqueta y un color.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS vacation_periods (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  label        TEXT NOT NULL,
  color        TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas filtran por household y ordenan por fecha de inicio
CREATE INDEX IF NOT EXISTS vacation_periods_household_idx
  ON vacation_periods (household_id, start_date);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reutiliza my_household_ids() (definida en rls_fix_recursion.sql) para evitar
-- recursión. Solo los miembros del hogar pueden ver/editar su calendario.
ALTER TABLE vacation_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vacation_periods_household" ON vacation_periods;
CREATE POLICY "vacation_periods_household" ON vacation_periods FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
