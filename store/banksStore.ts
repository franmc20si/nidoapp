import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/withTimeout';
import { Bank } from '@/types';

export interface BankInput {
  name: string;
  color: string;
}

const timeoutMsg = (e: any, fallback: string) =>
  e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? fallback);

interface BanksState {
  banks: Bank[];
  loaded: boolean;
  loadError: boolean;
  loadingFor: string | null;

  loadBanks: (householdId: string) => Promise<void>;
  addBank: (householdId: string, userId: string | undefined, b: BankInput) => Promise<{ ok: boolean; error?: string; bank?: Bank }>;
  updateBank: (id: string, b: BankInput) => Promise<{ ok: boolean; error?: string }>;
  deleteBank: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useBanksStore = create<BanksState>((set, get) => ({
  banks: [],
  loaded: false,
  loadError: false,
  loadingFor: null,

  loadBanks: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return;
    set({ loadingFor: householdId, loadError: false });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('banks')
          .select('*')
          .eq('household_id', householdId)
          .order('name', { ascending: true })
      );
      if (error) throw error;
      set({ banks: (data ?? []) as Bank[], loaded: true });
    } catch (e) {
      console.error('[banks] loadBanks error', e);
      set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  addBank: async (householdId, userId, b) => {
    const id = crypto.randomUUID();
    const bank: Bank = {
      id,
      household_id: householdId,
      name: b.name,
      color: b.color,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await withTimeout(
        supabase.from('banks').insert({
          id,
          household_id: householdId,
          name: b.name,
          color: b.color,
          created_by: userId,
        } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((s) => ({ banks: [...s.banks, bank].sort((a, x) => a.name.localeCompare(x.name)) }));
      return { ok: true, bank };
    } catch (e: any) {
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el banco') };
    }
  },

  updateBank: async (id, b) => {
    const prev = get().banks;
    set({ banks: prev.map((x) => x.id === id ? { ...x, ...b } : x).sort((a, x) => a.name.localeCompare(x.name)) });
    try {
      const { error } = await withTimeout(
        supabase.from('banks').update({ name: b.name, color: b.color } as any).eq('id', id)
      );
      if (error) { set({ banks: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ banks: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el banco') };
    }
  },

  deleteBank: async (id) => {
    const prev = get().banks;
    set({ banks: prev.filter((x) => x.id !== id) });
    try {
      const { error } = await withTimeout(supabase.from('banks').delete().eq('id', id));
      if (error) { set({ banks: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ banks: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo eliminar el banco') };
    }
  },
}));
