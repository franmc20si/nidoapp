-- Añade clave de semana a shopping_lists para la lista de compra por semana
ALTER TABLE shopping_lists
  ADD COLUMN IF NOT EXISTS week_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_household_week
  ON shopping_lists (household_id, week_key)
  WHERE week_key IS NOT NULL;
