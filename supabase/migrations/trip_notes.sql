-- Notas opcionales por sitio de un viaje (horarios, comentarios, etc.).
-- Se editan en el popup de detalle del sitio y se muestran en su tarjeta.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE trip_items
  ADD COLUMN IF NOT EXISTS notes TEXT;
