import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';
import { TripItem, TripItemKind } from '@/types';

export interface TripItemInput {
  day: string;          // YYYY-MM-DD
  kind: TripItemKind;
  title: string;
  url: string | null;
  place: string | null;
  price: number | null;
}

interface TripState {
  // Items cacheados por periodo (viaje). Cada lista ordenada por día y sort.
  itemsByPeriod: Record<string, TripItem[]>;
  loadedPeriods: Record<string, boolean>;
  loadingFor: string | null;
  loadErrorFor: string | null;

  loadItems: (householdId: string, periodId: string) => Promise<void>;
  addItem: (householdId: string, userId: string | undefined, periodId: string, input: TripItemInput) => Promise<{ ok: boolean; error?: string }>;
  updateItem: (periodId: string, id: string, patch: Partial<TripItemInput>) => Promise<{ ok: boolean; error?: string }>;
  deleteItem: (periodId: string, id: string) => Promise<{ ok: boolean; error?: string }>;
}

const sortItems = (a: TripItem, b: TripItem) =>
  a.day.localeCompare(b.day) || (a.sort - b.sort) || a.created_at.localeCompare(b.created_at);

export const useTripStore = create<TripState>((set, get) => ({
  itemsByPeriod: {},
  loadedPeriods: {},
  loadingFor: null,
  loadErrorFor: null,

  loadItems: async (householdId, periodId) => {
    if (!householdId || !periodId) return;
    if (get().loadingFor === periodId) return;
    set({ loadingFor: periodId, loadErrorFor: null });
    try {
      const { data, error } = await readWithRetry(() =>
        supabase
          .from('trip_items')
          .select('*')
          .eq('household_id', householdId)
          .eq('period_id', periodId)
      );
      // Ante fallo NO sobreescribimos con vacío: conservamos lo cacheado.
      if (error) { set({ loadErrorFor: periodId }); return; }
      // numeric de Postgres puede llegar como string vía PostgREST → normalizamos a number|null
      const items = ((data ?? []) as any[])
        .map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }) as TripItem)
        .sort(sortItems);
      set((s) => ({
        itemsByPeriod: { ...s.itemsByPeriod, [periodId]: items },
        loadedPeriods: { ...s.loadedPeriods, [periodId]: true },
      }));
    } catch (e) {
      console.error('[trip] loadItems error', e);
      set({ loadErrorFor: periodId });
    } finally {
      set({ loadingFor: null });
    }
  },

  addItem: async (householdId, userId, periodId, input) => {
    const id = crypto.randomUUID();
    const item: TripItem = {
      id,
      household_id: householdId,
      period_id: periodId,
      day: input.day,
      kind: input.kind,
      title: input.title,
      url: input.url,
      place: input.place,
      price: input.price,
      sort: Date.now() % 1_000_000,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
    };
    // Optimista
    set((s) => ({
      itemsByPeriod: {
        ...s.itemsByPeriod,
        [periodId]: [...(s.itemsByPeriod[periodId] ?? []), item].sort(sortItems),
      },
    }));
    try {
      const { error } = await withTimeout(
        supabase.from('trip_items').insert({
          id,
          household_id: householdId,
          period_id: periodId,
          day: input.day,
          kind: input.kind,
          title: input.title,
          url: input.url,
          place: input.place,
          price: input.price,
          sort: item.sort,
          created_by: userId,
        } as any)
      );
      if (error) {
        set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: (s.itemsByPeriod[periodId] ?? []).filter((i) => i.id !== id) } }));
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e: any) {
      set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: (s.itemsByPeriod[periodId] ?? []).filter((i) => i.id !== id) } }));
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo guardar') };
    }
  },

  updateItem: async (periodId, id, patch) => {
    const prev = get().itemsByPeriod[periodId] ?? [];
    set((s) => ({
      itemsByPeriod: {
        ...s.itemsByPeriod,
        [periodId]: prev.map((i) => (i.id === id ? { ...i, ...patch } : i)).sort(sortItems),
      },
    }));
    try {
      const { error } = await withTimeout(
        supabase.from('trip_items').update(patch as any).eq('id', id)
      );
      if (error) { set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: prev } })); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: prev } }));
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo guardar') };
    }
  },

  deleteItem: async (periodId, id) => {
    const prev = get().itemsByPeriod[periodId] ?? [];
    set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: prev.filter((i) => i.id !== id) } }));
    try {
      const { error } = await withTimeout(supabase.from('trip_items').delete().eq('id', id));
      if (error) { set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: prev } })); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set((s) => ({ itemsByPeriod: { ...s.itemsByPeriod, [periodId]: prev } }));
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo eliminar') };
    }
  },
}));
