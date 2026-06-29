import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getActiveHouseholdId } from './activeHousehold';

export async function ensureProfile(user: User) {
  const { data: existing } = await supabase
    .from('profiles')
    .select()
    .eq('id', user.id)
    .maybeSingle();
  if (existing) return existing;

  const meta = user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? user.email ?? '';
  const avatar = meta.avatar_url ?? null;
  const { data } = await supabase
    .from('profiles')
    .insert({ id: user.id, full_name: name, avatar_url: avatar })
    .select()
    .single();
  return data;
}

export async function resolveDestination(userId: string) {
  const { data } = await supabase
    .from('household_members')
    .select('household_id, households(*)')
    .eq('user_id', userId);

  const memberships = (data ?? []).filter((r: any) => r.households);
  if (memberships.length === 0) {
    return { route: '/(auth)/onboarding' as const, household: null };
  }

  // Vuelve al último nido activo si el usuario sigue siendo miembro;
  // si no, al primero disponible.
  const savedId = await getActiveHouseholdId();
  const chosen =
    memberships.find((r: any) => r.household_id === savedId) ?? memberships[0];
  return { route: '/(tabs)' as const, household: chosen.households as any };
}
