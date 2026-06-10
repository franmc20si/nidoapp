-- Unirse a un hogar por código de invitación.
-- La política RLS de `households` (SELECT solo para miembros) impide que un
-- usuario nuevo lea el hogar por invite_code antes de unirse → el join era
-- estructuralmente imposible. Esta función SECURITY DEFINER valida el código y
-- añade al miembro de forma atómica, sin relajar la política de lectura.
-- Ejecutar en el SQL Editor de Supabase.

CREATE OR REPLACE FUNCTION join_household_by_code(p_code TEXT)
RETURNS households
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h households;
BEGIN
  SELECT * INTO h FROM households WHERE invite_code = upper(p_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CODE_NOT_FOUND';
  END IF;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (h.id, auth.uid(), 'member')
  ON CONFLICT (household_id, user_id) DO NOTHING; -- idempotente: re-unirse no falla

  RETURN h;
END;
$$;

-- Solo usuarios autenticados pueden ejecutarla
REVOKE ALL ON FUNCTION join_household_by_code(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION join_household_by_code(TEXT) TO authenticated;
