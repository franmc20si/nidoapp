-- Bancos / cuentas de pago del hogar (pantalla "Bancos", accesible desde Servicios).
-- Cada servicio puede asignarse a un banco; la pantalla muestra el gasto mensual
-- acumulado por banco. Ejecutar en el SQL Editor de Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS banks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT 'teja', -- clave de NIDO_COLORS: teja|terracota|cielo|bosque|iris
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS banks_household_idx ON banks (household_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que subscriptions: reutiliza my_household_ids() (rls_fix_recursion.sql).
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banks_household" ON banks;
CREATE POLICY "banks_household" ON banks FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));

-- ── Enlace subscriptions → banks ────────────────────────────────────────────
-- ON DELETE SET NULL implementa el "desasignar": al borrar un banco, sus
-- servicios quedan sin banco en vez de borrarse.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS bank_id UUID REFERENCES banks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subscriptions_bank_idx ON subscriptions (bank_id);

-- ── Migración de datos: texto libre bank_account → bancos ───────────────────
-- Crea un banco por cada texto distinto (por hogar), con color rotado de la
-- paleta, y enlaza los servicios. Idempotente: no duplica bancos ya creados.
INSERT INTO banks (household_id, name, color)
SELECT household_id, name,
       (ARRAY['teja','terracota','cielo','bosque','iris'])[((rn - 1) % 5) + 1]
FROM (
  SELECT household_id, btrim(bank_account) AS name,
         row_number() OVER (PARTITION BY household_id ORDER BY btrim(bank_account)) AS rn
  FROM subscriptions
  WHERE bank_account IS NOT NULL AND btrim(bank_account) <> ''
  GROUP BY household_id, btrim(bank_account)
) d
WHERE NOT EXISTS (
  SELECT 1 FROM banks b
  WHERE b.household_id = d.household_id AND b.name = d.name
);

UPDATE subscriptions s
SET bank_id = b.id
FROM banks b
WHERE s.bank_id IS NULL
  AND s.bank_account IS NOT NULL
  AND b.household_id = s.household_id
  AND b.name = btrim(s.bank_account);
