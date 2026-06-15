-- Servicios / suscripciones activas del hogar (tab "Servicios").
-- Cada fila es un servicio recurrente: luz, agua, internet, streaming, etc.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS subscriptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT,                       -- luz | agua | gas | internet | movil | comunidad | seguro | streaming | gimnasio | otros
  amount       NUMERIC NOT NULL,           -- importe por ciclo
  cycle        TEXT NOT NULL DEFAULT 'monthly', -- monthly | bimonthly | quarterly | semiannual | yearly
  next_payment DATE,                       -- fecha del próximo cobro
  bank_account TEXT,                       -- desde qué cuenta de banco se paga (texto libre)
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Lecturas filtran por household y ordenan por próximo pago
CREATE INDEX IF NOT EXISTS subscriptions_household_idx
  ON subscriptions (household_id, next_payment);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Reutiliza my_household_ids() (definida en rls_fix_recursion.sql) para evitar
-- recursión. Solo los miembros del hogar pueden ver/editar sus servicios.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_household" ON subscriptions;
CREATE POLICY "subscriptions_household" ON subscriptions FOR ALL
  USING (household_id IN (SELECT my_household_ids()))
  WITH CHECK (household_id IN (SELECT my_household_ids()));
