import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';
import { weekKey } from '@/lib/week';
import { GroceryStore, GrocerySpend } from '@/types';

// Gasto del súper: tiendas (lista editable, patrón banksStore) + compras.
// Fuente única para la tarjeta de la tab Menú y la pantalla /super.

export interface StoreInput { name: string; color: string }
export interface SpendInput { amount: number; store_id: string | null; spent_on: string }

const timeoutMsg = (e: any, fallback: string) =>
  e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? fallback);

const byName = (a: GroceryStore, b: GroceryStore) => a.name.localeCompare(b.name);
// Más reciente primero (fecha de compra y, a igualdad, la creada después).
const byDateDesc = (a: GrocerySpend, b: GrocerySpend) =>
  b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at);

/** "YYYY-MM-DD" → Date local (sin el desfase UTC de `new Date('YYYY-MM-DD')`). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Date → "YYYY-MM-DD" en hora local. */
export function toDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Semana ISO de una compra — misma clave que el plan del menú. */
export const spendWeek = (s: Pick<GrocerySpend, 'spent_on'>) => weekKey(parseDay(s.spent_on));

export const money = (n: number) => n.toFixed(2).replace('.', ',');

interface GroceryState {
  stores: GroceryStore[];
  spends: GrocerySpend[];
  loaded: boolean;
  loadError: boolean;
  loadingFor: string | null;

  load: (householdId: string) => Promise<void>;
  addStore: (householdId: string, userId: string | undefined, s: StoreInput) => Promise<{ ok: boolean; error?: string; store?: GroceryStore }>;
  updateStore: (id: string, s: StoreInput) => Promise<{ ok: boolean; error?: string }>;
  deleteStore: (id: string) => Promise<{ ok: boolean; error?: string }>;
  addSpend: (householdId: string, userId: string | undefined, s: SpendInput) => Promise<{ ok: boolean; error?: string }>;
  updateSpend: (id: string, s: SpendInput) => Promise<{ ok: boolean; error?: string }>;
  deleteSpend: (id: string) => Promise<{ ok: boolean; error?: string; spend?: GrocerySpend }>;
  restoreSpend: (s: GrocerySpend) => Promise<{ ok: boolean; error?: string }>;
}

export const useGroceryStore = create<GroceryState>((set, get) => ({
  stores: [],
  spends: [],
  loaded: false,
  loadError: false,
  loadingFor: null,

  load: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return;
    set({ loadingFor: householdId, loadError: false });
    try {
      const [storesRes, spendsRes] = await Promise.all([
        readWithRetry(() => supabase.from('grocery_stores').select('*').eq('household_id', householdId)),
        readWithRetry(() => supabase.from('grocery_spends').select('*').eq('household_id', householdId)),
      ]);
      // En fallo se conserva el estado previo (nunca se sobreescribe con vacío).
      if (storesRes.error || spendsRes.error) throw storesRes.error ?? spendsRes.error;
      set({
        stores: ((storesRes.data ?? []) as GroceryStore[]).sort(byName),
        // PostgREST puede devolver numeric como string.
        spends: ((spendsRes.data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }) as GrocerySpend).sort(byDateDesc),
        loaded: true,
      });
    } catch (e) {
      console.error('[grocery] load error', e);
      if (!get().loaded) set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  // ── tiendas ─────────────────────────────────────────────────────────────────
  addStore: async (householdId, userId, s) => {
    const id = crypto.randomUUID();
    const store: GroceryStore = {
      id, household_id: householdId, name: s.name, color: s.color,
      created_by: userId ?? null, created_at: new Date().toISOString(),
    };
    try {
      const { error } = await withTimeout(
        supabase.from('grocery_stores').insert({ id, household_id: householdId, name: s.name, color: s.color, created_by: userId } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((st) => ({ stores: [...st.stores, store].sort(byName) }));
      return { ok: true, store };
    } catch (e: any) {
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar la tienda') };
    }
  },

  updateStore: async (id, s) => {
    const prev = get().stores;
    set({ stores: prev.map((x) => x.id === id ? { ...x, ...s } : x).sort(byName) });
    try {
      const { error } = await withTimeout(supabase.from('grocery_stores').update({ name: s.name, color: s.color } as any).eq('id', id));
      if (error) { set({ stores: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ stores: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar la tienda') };
    }
  },

  deleteStore: async (id) => {
    const prev = get();
    // Reflejo local del ON DELETE SET NULL: sus compras quedan sin tienda.
    set({
      stores: prev.stores.filter((x) => x.id !== id),
      spends: prev.spends.map((sp) => sp.store_id === id ? { ...sp, store_id: null } : sp),
    });
    try {
      const { error } = await withTimeout(supabase.from('grocery_stores').delete().eq('id', id));
      if (error) { set({ stores: prev.stores, spends: prev.spends }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ stores: prev.stores, spends: prev.spends });
      return { ok: false, error: timeoutMsg(e, 'No se pudo eliminar la tienda') };
    }
  },

  // ── compras ─────────────────────────────────────────────────────────────────
  addSpend: async (householdId, userId, s) => {
    const id = crypto.randomUUID();
    const spend: GrocerySpend = {
      id, household_id: householdId, store_id: s.store_id, amount: s.amount, spent_on: s.spent_on,
      created_by: userId ?? null, created_at: new Date().toISOString(),
    };
    try {
      const { error } = await withTimeout(
        supabase.from('grocery_spends').insert({
          id, household_id: householdId, store_id: s.store_id, amount: s.amount, spent_on: s.spent_on, created_by: userId,
        } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((st) => ({ spends: [spend, ...st.spends].sort(byDateDesc) }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el gasto') };
    }
  },

  updateSpend: async (id, s) => {
    const prev = get().spends;
    set({ spends: prev.map((x) => x.id === id ? { ...x, ...s } : x).sort(byDateDesc) });
    try {
      const { error } = await withTimeout(
        supabase.from('grocery_spends').update({ store_id: s.store_id, amount: s.amount, spent_on: s.spent_on } as any).eq('id', id)
      );
      if (error) { set({ spends: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ spends: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el gasto') };
    }
  },

  deleteSpend: async (id) => {
    const prev = get().spends;
    const spend = prev.find((x) => x.id === id);
    set({ spends: prev.filter((x) => x.id !== id) });
    try {
      const { error } = await withTimeout(supabase.from('grocery_spends').delete().eq('id', id));
      if (error) { set({ spends: prev }); return { ok: false, error: error.message }; }
      return { ok: true, spend };
    } catch (e: any) {
      set({ spends: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo eliminar el gasto') };
    }
  },

  // Para "Deshacer" tras borrar: reinserta la fila tal cual (mismo id).
  restoreSpend: async (s) => {
    set((st) => ({ spends: [s, ...st.spends.filter((x) => x.id !== s.id)].sort(byDateDesc) }));
    try {
      const { error } = await withTimeout(
        supabase.from('grocery_spends').insert({
          id: s.id, household_id: s.household_id, store_id: s.store_id, amount: s.amount,
          spent_on: s.spent_on, created_by: s.created_by,
        } as any)
      );
      if (error) { set((st) => ({ spends: st.spends.filter((x) => x.id !== s.id) })); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set((st) => ({ spends: st.spends.filter((x) => x.id !== s.id) }));
      return { ok: false, error: timeoutMsg(e, 'No se pudo restaurar el gasto') };
    }
  },
}));

/** Totales por semana para `count` semanas que acaban en `endMonday` (incluida). */
export function weeklyTotals(spends: GrocerySpend[], endMonday: Date, count: number) {
  const totals = new Map<string, number>();
  for (const s of spends) {
    const k = spendWeek(s);
    totals.set(k, (totals.get(k) ?? 0) + s.amount);
  }
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(endMonday);
    monday.setDate(endMonday.getDate() - (count - 1 - i) * 7);
    const key = weekKey(monday);
    return { key, monday, total: totals.get(key) ?? 0 };
  });
}
