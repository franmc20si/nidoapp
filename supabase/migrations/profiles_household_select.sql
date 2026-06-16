-- profiles_own (USING auth.uid() = id) solo permite leer el propio perfil.
-- Por eso fetchProfiles() en nido.tsx no consigue el full_name de otros
-- miembros del hogar y la app cae en el fallback "Alguien" en las cards
-- de reparto. Añadimos una política de SELECT adicional que permite leer
-- los perfiles de cualquier miembro de un hogar compartido, reutilizando
-- my_household_ids() (SECURITY DEFINER) para evitar recursión RLS.
-- Ejecutar en el SQL Editor de Supabase.

CREATE POLICY "profiles_household_members" ON profiles FOR SELECT
  USING (
    id IN (
      SELECT user_id FROM household_members
      WHERE household_id IN (SELECT my_household_ids())
    )
  );
