import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Adaptador único: en web usa localStorage (síncrono), en nativo AsyncStorage
// (asíncrono). Conforma StateStorage explícitamente para que ambos ramales
// tengan firmas compatibles (evita unir Storage | AsyncStorageStatic).
const crossStorage: StateStorage = {
  getItem: (name) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') return localStorage.getItem(name);
    return AsyncStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') { localStorage.setItem(name, value); return; }
    return AsyncStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') { localStorage.removeItem(name); return; }
    return AsyncStorage.removeItem(name);
  },
};

export interface Alert {
  id: string;
  concept: string;
  date: string; // YYYY-MM-DD
}

interface AlertState {
  alerts: Alert[];
  addAlert: (concept: string, date: string) => void;
  removeAlert: (id: string) => void;
}

export const useAlertStore = create<AlertState>()(
  persist(
    (set) => ({
      alerts: [],
      addAlert: (concept, date) =>
        set((s) => ({
          alerts: [
            ...s.alerts,
            {
              id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              concept: concept.trim(),
              date,
            },
          ],
        })),
      removeAlert: (id) =>
        set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
    }),
    {
      name: 'nido-alerts',
      storage: createJSONStorage(() => crossStorage),
    }
  )
);
