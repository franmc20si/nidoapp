import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nidoColorByKey, DEFAULT_COLOR, NidoColor } from '@/constants/nidoColors';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'nido_accent_map'; // { [householdId]: colorKey } — caché local offline

// Cross-platform storage helpers
const storageGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return AsyncStorage.getItem(key);
};
const storageSet = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
};

async function cacheAccent(householdId: string, colorKey: string) {
  try {
    const raw = await storageGet(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[householdId] = colorKey;
    await storageSet(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

async function getCachedAccent(householdId: string): Promise<string | null> {
  try {
    const raw = await storageGet(STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    return map[householdId] ?? null;
  } catch {
    return null;
  }
}

interface NidoState {
  accentKey: string;
  accent: NidoColor;
  fabOpen: boolean;
  taskRev: number; // se incrementa en cada mutación de tareas → las pantallas refetchean
  openFab: () => void;
  closeFab: () => void;
  bumpTasks: () => void;
  loadAccent: (householdId: string) => Promise<void>;
  setAccent: (householdId: string, key: string) => Promise<void>;
}

export const useNidoStore = create<NidoState>((set) => ({
  accentKey: DEFAULT_COLOR.key,
  accent: DEFAULT_COLOR,
  fabOpen: false,
  taskRev: 0,
  openFab: () => set({ fabOpen: true }),
  closeFab: () => set({ fabOpen: false }),
  bumpTasks: () => set((s) => ({ taskRev: s.taskRev + 1 })),

  loadAccent: async (householdId) => {
    // Aplica caché local de inmediato para evitar parpadeo
    const cached = await getCachedAccent(householdId);
    if (cached) {
      set({ accentKey: cached, accent: nidoColorByKey(cached) });
    }

    // Luego comprueba Supabase (fuente de verdad multi-dispositivo)
    try {
      const { data } = await supabase
        .from('households')
        .select('accent_color')
        .eq('id', householdId)
        .single();

      const key = data?.accent_color ?? cached ?? DEFAULT_COLOR.key;
      set({ accentKey: key, accent: nidoColorByKey(key) });
      await cacheAccent(householdId, key);
    } catch {
      // Sin conexión: el caché local ya está aplicado
      if (!cached) {
        set({ accentKey: DEFAULT_COLOR.key, accent: DEFAULT_COLOR });
      }
    }
  },

  setAccent: async (householdId, key) => {
    // Actualiza UI de inmediato (optimista)
    set({ accentKey: key, accent: nidoColorByKey(key) });
    await cacheAccent(householdId, key);

    // Persiste en Supabase para sincronización multi-dispositivo
    try {
      await supabase
        .from('households')
        .update({ accent_color: key })
        .eq('id', householdId);
    } catch {
      // Silencioso: el caché local garantiza que el cambio no se pierde en este dispositivo
    }
  },
}));
