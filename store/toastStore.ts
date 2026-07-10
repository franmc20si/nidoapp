import { create } from 'zustand';

type ToastType = 'error' | 'success' | 'info';

/** Acción opcional del toast (p.ej. "Deshacer"). */
export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastState {
  message: string | null;
  type: ToastType;
  action: ToastAction | null;
  // Contador que sube en cada showToast: permite re-disparar el toast (y su
  // temporizador) aunque el mensaje se repita (p.ej. completar dos tareas
  // seguidas muestra "Hecho ✓" las dos veces).
  seq: number;
  showToast: (message: string, type?: ToastType, action?: ToastAction | null) => void;
  dismissToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'info',
  action: null,
  seq: 0,
  showToast: (message, type = 'info', action = null) =>
    set((s) => ({ message, type, action, seq: s.seq + 1 })),
  dismissToast: () => set({ message: null, action: null }),
}));

/** Convenience helper — call outside React components */
export function showToast(message: string, type: ToastType = 'info', action: ToastAction | null = null) {
  useToastStore.getState().showToast(message, type, action);
}
