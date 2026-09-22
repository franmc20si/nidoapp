/**
 * basicsStore — "básicos semanales": lista PLANTILLA de productos de compra
 * habituales del hogar. No es por semana; es una lista fija que se gestiona desde
 * la tab Menú y se vuelca a la lista de la compra de la semana con un botón.
 *
 * Mismo patrón de robustez que banksStore (readWithRetry/withTimeout, id en
 * cliente, actualización optimista con rollback).
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { withTimeout, readWithRetry } from '@/lib/withTimeout';

export interface Basic {
  id: string;
  name: string;
  amount?: string;   // ↔ columna shopping_basics.unit
  category: string;  // clave de GROCERY_CATS
}

export interface BasicInput {
  name: string;
  amount?: string;
  category: string;
}

const timeoutMsg = (e: any, fallback: string) =>
  e?.message === 'TIMEOUT' ? 'La conexión tardó demasiado. Inténtalo de nuevo.' : (e?.message ?? fallback);

interface BasicsState {
  basics: Basic[];
  loaded: boolean;
  loadError: boolean;
  loadingFor: string | null;

  loadBasics: (householdId: string) => Promise<void>;
  addBasic: (householdId: string, userId: string | undefined, b: BasicInput) => Promise<{ ok: boolean; error?: string; basic?: Basic }>;
  updateBasic: (id: string, b: BasicInput) => Promise<{ ok: boolean; error?: string }>;
  deleteBasic: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useBasicsStore = create<BasicsState>((set, get) => ({
  basics: [],
  loaded: false,
  loadError: false,
  loadingFor: null,

  loadBasics: async (householdId) => {
    if (!householdId) return;
    if (get().loadingFor === householdId) return;
    set({ loadingFor: householdId, loadError: false });
    try {
      const { data, error } = await readWithRetry(() =>
        supabase
          .from('shopping_basics')
          .select('id, name, unit, category')
          .eq('household_id', householdId)
          .order('sort', { ascending: true })
          .order('name', { ascending: true })
      );
      if (error) throw error;
      set({
        basics: (data ?? []).map((r: any) => ({
          id: r.id,
          name: r.name,
          amount: r.unit ?? undefined,
          category: r.category ?? 'otros',
        })),
        loaded: true,
      });
    } catch (e) {
      console.error('[basics] loadBasics error', e);
      set({ loadError: true });
    } finally {
      set({ loadingFor: null });
    }
  },

  addBasic: async (householdId, userId, b) => {
    const id = crypto.randomUUID();
    const basic: Basic = { id, name: b.name, amount: b.amount, category: b.category };
    try {
      const { error } = await withTimeout(
        supabase.from('shopping_basics').insert({
          id,
          household_id: householdId,
          name: b.name,
          unit: b.amount ?? null,
          category: b.category,
          created_by: userId,
        } as any)
      );
      if (error) return { ok: false, error: error.message };
      set((s) => ({ basics: [...s.basics, basic] }));
      return { ok: true, basic };
    } catch (e: any) {
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el básico') };
    }
  },

  updateBasic: async (id, b) => {
    const prev = get().basics;
    set({ basics: prev.map((x) => x.id === id ? { ...x, name: b.name, amount: b.amount, category: b.category } : x) });
    try {
      const { error } = await withTimeout(
        supabase.from('shopping_basics').update({ name: b.name, unit: b.amount ?? null, category: b.category } as any).eq('id', id)
      );
      if (error) { set({ basics: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ basics: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo guardar el básico') };
    }
  },

  deleteBasic: async (id) => {
    const prev = get().basics;
    set({ basics: prev.filter((x) => x.id !== id) });
    try {
      const { error } = await withTimeout(supabase.from('shopping_basics').delete().eq('id', id));
      if (error) { set({ basics: prev }); return { ok: false, error: error.message }; }
      return { ok: true };
    } catch (e: any) {
      set({ basics: prev });
      return { ok: false, error: timeoutMsg(e, 'No se pudo eliminar el básico') };
    }
  },
}));
