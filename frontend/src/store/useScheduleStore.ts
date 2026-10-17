import { create } from 'zustand';
import { scheduleApi } from '../services/api/scheduleApi';
import type {
  BulkUpdateScheduleRequest,
  CreateScheduleItemRequest,
  ScheduleItem,
} from '../types';

interface ScheduleState {
  items: ScheduleItem[];
  isLoading: boolean;
  error: string | null;

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

  fetchSchedule: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const items = await scheduleApi.listSchedule(roomId);
      items.sort((a, b) => a.order_index - b.order_index);
      set({ items, isLoading: false });
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể lấy danh sách lịch trình.';
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
        (err as { message?: string })?.message ||
        'Không thể thêm vào lịch trình.';
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
        (err as { message?: string })?.message ||
        'Không thể cập nhật lịch trình.';
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
        (err as { message?: string })?.message || 'Không thể xóa mục lịch trình.';
      set({ error: errorMsg });
      throw err;
    }
  },

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
    }),
}));
