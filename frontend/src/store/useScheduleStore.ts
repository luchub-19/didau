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
import { reorderByStart, toBulkPayload, type ScheduleChange } from '../room/calendar';

const byOrder = (a: ScheduleItem, b: ScheduleItem) => a.order_index - b.order_index;
/** Số thứ tự của lần `moveItems` mới nhất: kết quả server của lần cũ không được đè bản vẽ lạc quan của lần sau. */
let moveSeq = 0;

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
  /**
   * Di/đổi giờ/sửa ghi chú nhiều mục (lạc quan): vẽ ngay, sắp lại `order_index` theo giờ, `PUT` chỉ các mục đổi
   * (luôn kèm `note`), rồi thay bằng kết quả server. Lỗi → khôi phục các mục đã đổi và ném lại lỗi để UI toast.
   */
  moveItems: (roomId: string, updates: ScheduleChange[]) => Promise<ScheduleItem[]>;
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

export const useScheduleStore = create<ScheduleState>((set, get) => ({
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
      // Phòng hờ nơi gọi cũ: mục thiếu `note` thì lấy từ bản hiện có (CR-10), không để backend xoá ghi chú
      const current = new Map(get().items.map((i) => [i.id, i]));
      const safe: BulkUpdateScheduleRequest = {
        items: data.items.map((i) =>
          'note' in i ? i : { ...i, note: current.get(i.id)?.note ?? null },
        ),
      };
      const updated = await scheduleApi.bulkUpdateSchedule(roomId, safe);
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

  moveItems: async (roomId: string, updates: ScheduleChange[]) => {
    const before = get().items;
    const patch = new Map(updates.map((u) => [u.id, u]));
    const next = reorderByStart(before.map((i) => (patch.has(i.id) ? { ...i, ...patch.get(i.id) } : i)));
    const payload = toBulkPayload(next, before);
    if (payload.length === 0) return before;

    const prev = new Map(before.map((i) => [i.id, i]));
    const sent = new Set(payload.map((p) => p.id));
    const seq = ++moveSeq;
    set({ items: next.sort(byOrder), error: null });
    try {
      const updated = await scheduleApi.bulkUpdateSchedule(roomId, { items: payload });
      updated.sort(byOrder);
      if (seq === moveSeq) set({ items: updated });
      return updated;
    } catch (err: unknown) {
      const errorMsg = errorKey(err, 'UPDATE_SCHEDULE_FAILED');
      set((state) => ({
        items: state.items.map((i) => (sent.has(i.id) ? prev.get(i.id) ?? i : i)).sort(byOrder),
        error: errorMsg,
      }));
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
