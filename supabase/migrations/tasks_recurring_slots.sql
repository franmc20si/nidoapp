-- Ancla de día(s) + franja para tareas recurrentes.
-- Da soporte a la vista semanal de recurrentes y a que las semanales aparezcan
-- de forma predecible (en su día) en vez de "N días tras completarla".
-- Ambas columnas son NULL para las tareas existentes → retrocompatible: sin día
-- asignado se mantiene el comportamiento anterior.
-- Ejecutar en el SQL Editor de Supabase. Idempotente.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS weekdays SMALLINT[],   -- 0=Lunes … 6=Domingo (varios días por tarea)
  ADD COLUMN IF NOT EXISTS day_slot TEXT;         -- 'manana' | 'comida' | 'tarde' | 'noche'
