import { create } from 'zustand';
import { conflictApi } from '../services/api/conflictApi';
import type { ConflictAlert } from '../types';

interface ConflictState {
  conflicts: ConflictAlert[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchConflicts: (roomId: string) => Promise<void>;
  evaluateConflicts: (roomId: string) => Promise<ConflictAlert[]>;
  setConflicts: (conflicts: ConflictAlert[]) => void;
  reset: () => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  conflicts: [],
  isLoading: false,
  error: null,

  fetchConflicts: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const conflicts = await conflictApi.listConflicts(roomId);
      set({ conflicts, isLoading: false });
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể lấy danh sách cảnh báo xung đột.';
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  evaluateConflicts: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const conflicts = await conflictApi.evaluateConflicts(roomId);
      set({ conflicts, isLoading: false });
      return conflicts;
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể đánh giá cảnh báo xung đột.';
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  setConflicts: (conflicts) => set({ conflicts }),

  reset: () =>
    set({
      conflicts: [],
      isLoading: false,
      error: null,
    }),
}));
