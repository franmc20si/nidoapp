import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { nidoColorByKey, DEFAULT_COLOR, NidoColor } from '@/constants/nidoColors';

const STORAGE_KEY = 'nido_accent_map'; // { [householdId]: colorKey }

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

interface NidoState {
  accentKey: string;
  accent: NidoColor;
  loadAccent: (householdId: string) => Promise<void>;
  setAccent: (householdId: string, key: string) => Promise<void>;
}

export const useNidoStore = create<NidoState>((set) => ({
  accentKey: DEFAULT_COLOR.key,
  accent: DEFAULT_COLOR,

  loadAccent: async (householdId) => {
    try {
      const raw = await storageGet(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      const key = map[householdId] ?? DEFAULT_COLOR.key;
      set({ accentKey: key, accent: nidoColorByKey(key) });
    } catch {
      set({ accentKey: DEFAULT_COLOR.key, accent: DEFAULT_COLOR });
    }
  },

  setAccent: async (householdId, key) => {
    try {
      const raw = await storageGet(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[householdId] = key;
      await storageSet(STORAGE_KEY, JSON.stringify(map));
    } catch {}
    set({ accentKey: key, accent: nidoColorByKey(key) });
  },
}));
