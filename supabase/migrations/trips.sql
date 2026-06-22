-- Viajes (tab "Calendario" → botón "Viajes").
-- Un "viaje" es un periodo vacacional marcado con is_trip = true. Para cada viaje
-- se planifican elementos por día y categoría (ver / comer / dormir), cada uno con
-- un nombre y un link opcional de Google Maps.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

-- 1) Marca de "viaje" sobre los periodos vacacionales existentes.
ALTER TABLE vacation_periods
  ADD COLUMN IF NOT EXISTS is_trip BOOLEAN NOT NULL DEFAULT false;

-- 2) Elementos planificados de un viaje.
CREATE TABLE IF NOT EXISTS trip_items (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  period_id    UUID REFERENCES vacation_periods(id) ON DELETE CASCADE,
  day          DATE NOT NULL,
  kind         TEXT NOT NULL,          -- 'ver' | 'comer' | 'dormir'
  title        TEXT NOT NULL,
  url          TEXT,                   -- link de Google Maps (opcional)
  place        TEXT,                   -- nombre del sitio extraído del link (opcional)
  sort         INT  NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas filtran por viaje y ordenan por día
CREATE INDEX IF NOT EXISTS trip_items_period_idx
  ON trip_items (household_id, period_id, day);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que vacation_periods: reutiliza my_household_ids() para evitar
-- recursión. Solo los miembros del hogar pueden ver/editar sus viajes.
ALTER TABLE trip_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_items_household" ON trip_items;
CREATE POLICY "trip_items_household" ON trip_items FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
