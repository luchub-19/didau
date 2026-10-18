import { create } from 'zustand';
import { scheduleApi } from '../services/api/scheduleApi';
import type {
  AutoPlanApplyRequest,
  AutoPlanPreviewRequest,
  AutoPlanPreviewResponse,
  BulkUpdateScheduleRequest,
  CreateScheduleItemRequest,
  ScheduleItem,
} from '../types';
import { errorKey } from '../i18n/serverText';

interface ScheduleState {
  items: ScheduleItem[];
  isLoading: boolean;
  error: string | null;

  // AutoPlan state
  autoPlanPreview: AutoPlanPreviewResponse | null;
  isAutoPlanLoading: boolean;
  autoPlanError: string | null;
  durationOverrides: Record<string, number>;

  // Actions
  fetchSchedule: (roomId: string) => Promise<void>;
  addItem: (
    roomId: string,
    data: CreateScheduleItemRequest,
  ) => Promise<ScheduleItem>;
  bulkUpdate: (
    roomId: string,
    data: BulkUpdateScheduleRequest,
  ) => Promise<ScheduleItem[]>;
  deleteItem: (roomId: string, itemId: string) => Promise<void>;

  // AutoPlan actions
  previewAutoPlan: (
    roomId: string,
    data?: AutoPlanPreviewRequest,
  ) => Promise<AutoPlanPreviewResponse>;
  applyAutoPlan: (
    roomId: string,
    data: AutoPlanApplyRequest,
  ) => Promise<ScheduleItem[]>;
  setDurationOverride: (placeId: string, duration: number) => void;
  resetDurationOverrides: () => void;
  setAutoPlanPreview: (preview: AutoPlanPreviewResponse | null) => void;
  clearAutoPlanPreview: () => void;

  // Realtime updates & local state
  setItems: (items: ScheduleItem[]) => void;
  upsertItem: (item: ScheduleItem) => void;
  removeItem: (itemId: string) => void;
  reset: () => void;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  items: [],
  isLoading: false,
  error: null,
  autoPlanPreview: null,
  isAutoPlanLoading: false,
  autoPlanError: null,
  durationOverrides: {},

  fetchSchedule: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const items = await scheduleApi.listSchedule(roomId);
      items.sort((a, b) => a.order_index - b.order_index);
      set({ items, isLoading: false });
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'LOAD_SCHEDULE_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  addItem: async (roomId: string, data: CreateScheduleItemRequest) => {
    set({ isLoading: true, error: null });
    try {
      const item = await scheduleApi.createScheduleItem(roomId, data);
      set((state) => ({
        items: [...state.items, item].sort(
          (a, b) => a.order_index - b.order_index,
        ),
        isLoading: false,
      }));
      return item;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'ADD_SCHEDULE_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  bulkUpdate: async (roomId: string, data: BulkUpdateScheduleRequest) => {
    try {
      const updated = await scheduleApi.bulkUpdateSchedule(roomId, data);
      updated.sort((a, b) => a.order_index - b.order_index);
      set({ items: updated });
      return updated;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'UPDATE_SCHEDULE_FAILED');
      set({ error: errorMsg });
      throw err;
    }
  },

  deleteItem: async (roomId: string, itemId: string) => {
    try {
      await scheduleApi.deleteScheduleItem(roomId, itemId);
      set((state) => ({
        items: state.items.filter((i) => i.id !== itemId),
      }));
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'DELETE_SCHEDULE_FAILED');
      set({ error: errorMsg });
      throw err;
    }
  },

  previewAutoPlan: async (roomId: string, data?: AutoPlanPreviewRequest) => {
    set({ isAutoPlanLoading: true, autoPlanError: null });
    try {
      const preview = await scheduleApi.previewAutoPlan(roomId, data);
      set({ autoPlanPreview: preview, isAutoPlanLoading: false });
      return preview;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'AUTOPLAN_PREVIEW_FAILED');
      set({ autoPlanError: errorMsg, isAutoPlanLoading: false });
      throw err;
    }
  },

  applyAutoPlan: async (roomId: string, data: AutoPlanApplyRequest) => {
    set({ isAutoPlanLoading: true, autoPlanError: null });
    try {
      const items = await scheduleApi.applyAutoPlan(roomId, data);
      const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
      set({ items: sorted, autoPlanPreview: null, isAutoPlanLoading: false });
      return sorted;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'AUTOPLAN_APPLY_FAILED');
      set({ autoPlanError: errorMsg, isAutoPlanLoading: false });
      throw err;
    }
  },

  setDurationOverride: (placeId: string, duration: number) =>
    set((state) => ({
      durationOverrides: {
        ...state.durationOverrides,
        [placeId]: duration,
      },
    })),

  resetDurationOverrides: () => set({ durationOverrides: {} }),

  setAutoPlanPreview: (preview) => set({ autoPlanPreview: preview }),

  clearAutoPlanPreview: () =>
    set({
      autoPlanPreview: null,
      autoPlanError: null,
      durationOverrides: {},
    }),

  setItems: (items) => {
    const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
    set({ items: sorted });
  },

  upsertItem: (item) =>
    set((state) => {
      const exists = state.items.some((i) => i.id === item.id);
      const newItems = exists
        ? state.items.map((i) => (i.id === item.id ? item : i))
        : [...state.items, item];
      newItems.sort((a, b) => a.order_index - b.order_index);
      return { items: newItems };
    }),

  removeItem: (itemId) =>
    set((state) => ({
      items: state.items.filter((i) => i.id !== itemId),
    })),

  reset: () =>
    set({
      items: [],
      isLoading: false,
      error: null,
      autoPlanPreview: null,
      isAutoPlanLoading: false,
      autoPlanError: null,
      durationOverrides: {},
    }),
}));
