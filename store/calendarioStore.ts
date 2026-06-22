import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';
import { VacationPeriod } from '@/types';

export interface PeriodInput {
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  label: string;
  color: string;
  is_trip: boolean;
}

interface CalendarioState {
  periods: VacationPeriod[];
  loaded: boolean;
  loadError: boolean;
  loadingFor: string | null;

  loadPeriods: (householdId: string) => Promise<void>;
  addPeriod: (householdId: string, userId: string | undefined, p: PeriodInput) => Promise<{ ok: boolean; error?: string }>;
  updatePeriod: (id: string, p: PeriodInput) => Promise<{ ok: boolean; error?: string }>;
  deletePeriod: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useCalendarioStore = create<CalendarioState>((set, get) => ({
  periods: [],
  loaded: false,
  loadError: false,
  loadingFor: null,

  loadPeriods: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return;
    set({ loadingFor: householdId, loadError: false });
    try {
      const { data, error } = await readWithRetry(() =>
        supabase
          .from('vacation_periods')
          .select('*')
          .eq('household_id', householdId)
          .order('start_date', { ascending: true })
      );
      if (error) throw error;
      set({ periods: (data ?? []) as VacationPeriod[], loaded: true });
    } catch (e) {
      console.error('[calendario] loadPeriods error', e);
      set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  addPeriod: async (householdId, userId, p) => {
    const id = crypto.randomUUID();
    const period: VacationPeriod = {
      id,
      household_id: householdId,
      start_date: p.start_date,
      end_date: p.end_date,
      label: p.label,
      color: p.color,
      is_trip: p.is_trip,
      created_by: userId ?? null,
      created_at: new Date().toISOString(),
    };
    try {
      const { error } = await withTimeout(
        supabase.from('vacation_periods').insert({
          id,
          household_id: householdId,
          start_date: p.start_date,
          end_date: p.end_date,
          label: p.label,
          color: p.color,
          is_trip: p.is_trip,
          created_by: userId,
        } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((s) => ({ periods: [...s.periods, period].sort((a, b) => a.start_date.localeCompare(b.start_date)) }));
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo guardar') };
    }
  },

  updatePeriod: async (id, p) => {
    const prev = get().periods;
    set({
      periods: prev.map((per) => per.id === id ? { ...per, ...p } : per)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    });
    try {
      const { error } = await withTimeout(
        supabase.from('vacation_periods').update({
          start_date: p.start_date,
          end_date: p.end_date,
          label: p.label,
          color: p.color,
          is_trip: p.is_trip,
        } as any).eq('id', id)
      );
      if (error) { set({ periods: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ periods: prev });
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo guardar') };
    }
  },

  deletePeriod: async (id) => {
    const prev = get().periods;
    set({ periods: prev.filter((per) => per.id !== id) });
    try {
      const { error } = await withTimeout(supabase.from('vacation_periods').delete().eq('id', id));
      if (error) { set({ periods: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ periods: prev });
      return { ok: false, error: e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? 'No se pudo eliminar') };
    }
  },
}));
