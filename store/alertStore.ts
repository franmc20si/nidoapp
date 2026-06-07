import { create } from 'zustand';

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

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  addAlert: (concept, date) =>
    set((s) => ({
      alerts: [...s.alerts, { id: 'al' + Date.now(), concept: concept.trim(), date }],
    })),
  removeAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
}));
