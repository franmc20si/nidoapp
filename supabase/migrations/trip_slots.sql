-- Reorganiza las franjas de los viajes: antes (ver / comer / dormir),
-- ahora (manana / comida / tarde / cena / dormir).
--
-- La columna trip_items.kind es TEXT sin CHECK, así que los valores nuevos se
-- aceptan sin cambiar el esquema: solo hay que remapear las filas existentes.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
--
-- Mapeo: 'ver' → 'manana' (actividades del día; muévelas a Tarde a mano si toca),
--        'comer' → 'comida',  'dormir' se mantiene igual.
UPDATE trip_items SET kind = 'manana' WHERE kind = 'ver';
UPDATE trip_items SET kind = 'comida' WHERE kind = 'comer';
