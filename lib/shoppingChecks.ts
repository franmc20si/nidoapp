/**
 * shoppingChecks — clave estable del estado "comprado" de los ingredientes de
 * receta (tabla shopping_checks) y migración de formato.
 *
 * Antes la clave era `ri-<nombreReceta>-<nombreIngrediente>`: renombrar la receta
 * o el ingrediente dejaba el check huérfano (el ítem reaparecía sin marcar). Ahora
 * usa los ids estables de receta e ingrediente, inmunes a los renombrados.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

export const recipeCheckKey = (recipeId: string, ingredientId: string) =>
  `ri-${recipeId}-${ingredientId}`;

export interface KeyPair { oldKey: string; newKey: string; }

/**
 * Migración suave de formato de clave, una sola vez por semana. Para cada
 * ingrediente del menú de la semana que siguiera marcado con la clave antigua
 * basada en nombres, sube la nueva clave basada en ids y borra la vieja, sin
 * perder el check. No lanza nunca; ante fallo conserva el estado y reintenta otro
 * día (no marca el flag). El flag se comparte entre index.tsx y ShoppingListSheet:
 * quien migre primero deja la BD con claves nuevas y el otro lo lee ya migrado.
 */
export async function migrateRecipeCheckKeys(
  householdId: string,
  weekKey: string,
  pairs: KeyPair[],
  checked: Set<string>,
): Promise<Set<string>> {
  const flag = `nido_shop_checks_keyfmt_${weekKey}`;
  try {
    if (await AsyncStorage.getItem(flag)) return checked;
  } catch {
    return checked;
  }

  const toAdd: string[] = [];
  const toDel: string[] = [];
  for (const { oldKey, newKey } of pairs) {
    if (oldKey === newKey) continue;
    if (checked.has(oldKey) && !checked.has(newKey)) {
      toAdd.push(newKey);
      toDel.push(oldKey);
    }
  }

  if (toAdd.length === 0) {
    try { await AsyncStorage.setItem(flag, '1'); } catch {}
    return checked;
  }

  const { error: upErr } = await supabase.from('shopping_checks').upsert(
    toAdd.map(item_key => ({ household_id: householdId, week_key: weekKey, item_key })),
    { onConflict: 'household_id,week_key,item_key' },
  );
  if (upErr) return checked; // no marcamos el flag: se reintenta en la próxima carga

  await supabase.from('shopping_checks').delete()
    .eq('household_id', householdId)
    .eq('week_key', weekKey)
    .in('item_key', toDel);

  const next = new Set(checked);
  toAdd.forEach(k => next.add(k));
  toDel.forEach(k => next.delete(k));
  try { await AsyncStorage.setItem(flag, '1'); } catch {}
  return next;
}
