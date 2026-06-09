-- Añade color de acento al hogar para sincronización multi-dispositivo
ALTER TABLE households
  ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT 'teja';

-- Política de actualización: cualquier miembro del hogar puede cambiar el color
CREATE POLICY "households_update" ON households FOR UPDATE
  USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()))
  WITH CHECK (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
