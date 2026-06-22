-- Precio opcional por sitio de un viaje (Ver/Comer/Dormir).
-- Se muestra en la card del sitio y se suma en el total del viaje.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE trip_items
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
