import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';
import { House } from '@/types';

export interface HouseInput {
  name: string;
  color: string;
}

const timeoutMsg = (e: any, fallback: string) =>
  e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? fallback);

interface HousesState {
  houses: House[];
  loaded: boolean;
  loadError: boolean;
  loadingFor: string | null;

  loadHouses: (householdId: string) => Promise<void>;
  addHouse: (householdId: string, userId: string | undefined, h: HouseInput) => Promise<{ ok: boolean; error?: string; house?: House }>;
  updateHouse: (id: string, h: HouseInput) => Promise<{ ok: boolean; error?: string }>;
  deleteHouse: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useHousesStore = create<HousesState>((set, get) => ({
  houses: [],
  loaded: false,
  loadError: false,
  loadingFor: null,

  loadHouses: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return;
    set({ loadingFor: householdId, loadError: false });
    try {
      const { data, error } = await readWithRetry(() =>
        supabase
          .from('houses')
          .select('*')
          .eq('household_id', householdId)
          .order('name', { ascending: true })
      );
      if (error) throw error;
      set({ houses: (data ?? []) as House[], loaded: true });
    } catch (e) {
      console.error('[houses] loadHouses error', e);
      set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  addHouse: async (householdId, userId, h) => {
    const id = crypto.randomUUID();
    const house: House = {
      id,
      household_id: householdId,
      name: h.name,
      color: h.color,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await withTimeout(
        supabase.from('houses').insert({
          id,
          household_id: householdId,
          name: h.name,
          color: h.color,
          created_by: userId,
        } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((s) => ({ houses: [...s.houses, house].sort((a, x) => a.name.localeCompare(x.name)) }));
      return { ok: true, house };
    } catch (e: any) {
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar la casa') };
    }
  },

  updateHouse: async (id, h) => {
    const prev = get().houses;
    set({ houses: prev.map((x) => x.id === id ? { ...x, ...h } : x).sort((a, x) => a.name.localeCompare(x.name)) });
    try {
      const { error } = await withTimeout(
        supabase.from('houses').update({ name: h.name, color: h.color } as any).eq('id', id)
      );
      if (error) { set({ houses: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ houses: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar la casa') };
    }
  },

  deleteHouse: async (id) => {
    const prev = get().houses;
    set({ houses: prev.filter((x) => x.id !== id) });
    try {
      const { error } = await withTimeout(supabase.from('houses').delete().eq('id', id));
      if (error) { set({ houses: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ houses: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo eliminar la casa') };
    }
  },
}));
