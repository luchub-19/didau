import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toastData) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toastData, id }],
    }));
    return id;
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));

/**
 * Hàm gọi toast nhanh từ bất cứ đâu trong ứng dụng (DESIGN.md §5, T-40).
 * Tự ẩn mặc định sau 4 giây.
 */
export const toast = {
  success: (message: string, duration = 4000) => {
    return useToastStore.getState().addToast({ type: 'success', message, duration });
  },
  error: (message: string, duration = 4000) => {
    return useToastStore.getState().addToast({ type: 'error', message, duration });
  },
  info: (message: string, duration = 4000) => {
    return useToastStore.getState().addToast({ type: 'info', message, duration });
  },
  warning: (message: string, duration = 4000) => {
    return useToastStore.getState().addToast({ type: 'warning', message, duration });
  },
  dismiss: (id: string) => {
    useToastStore.getState().removeToast(id);
  },
};
