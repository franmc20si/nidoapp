import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

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
      storage: createJSONStorage(() =>
        Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? localStorage : AsyncStorage)
          : AsyncStorage
      ),
    }
  )
);
