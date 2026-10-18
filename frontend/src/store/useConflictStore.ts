import { create } from 'zustand';
import { conflictApi } from '../services/api/conflictApi';
import type { ConflictAlert } from '../types';
import { errorKey } from '../i18n/serverText';

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
        errorKey(err, 'LOAD_CONFLICTS_FAILED');
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
        errorKey(err, 'EVALUATE_CONFLICTS_FAILED');
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
