-- Columnas de `tasks` que el código y types/index.ts usan pero que el
-- supabase_schema.sql base no incluía. Versiona lo que la BD viva ya tenía
-- parcheado a mano, para que un entorno nuevo sea reproducible.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS points       INTEGER,
  ADD COLUMN IF NOT EXISTS duration_min INTEGER,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Acelera las lecturas de Reparto/Perfil (filtran por household + is_done + completed_at)
CREATE INDEX IF NOT EXISTS tasks_household_done_idx
  ON tasks (household_id, is_done, completed_at);
