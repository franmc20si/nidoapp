import { create } from 'zustand';

type ToastType = 'error' | 'success' | 'info';

interface ToastState {
  message: string | null;
  type: ToastType;
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'info',
  showToast: (message, type = 'info') => set({ message, type }),
  dismissToast: () => set({ message: null }),
}));

/** Convenience helper — call outside React components */
export function showToast(message: string, type: ToastType = 'info') {
  useToastStore.getState().showToast(message, type);
}
