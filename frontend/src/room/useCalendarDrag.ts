// Kéo thả trong lịch (DESIGN gđ6 §3 "Tương tác", T-79): di ô, kéo dãn mép dưới, nhấn giữ trên cảm ứng, Esc huỷ,
// cuộn tự động sát mép, snap 15' theo con trỏ trừ độ lệch chỗ cầm. Tự viết bằng Pointer Events (không HTML5 DnD).
// Trong lúc kéo chỉ đổi bản nháp (transform/chiều cao của một ô) mỗi rAF; thả mới gọi `onCommit` (→ `moveItems`).
// T-80 thêm nguồn kéo từ ngoài lịch (thẻ cột trái, khay mobile): kênh `calendarChannel` nối nguồn ↔ lịch ↔ khung
// phòng (tự mở ngăn kéo), `usePlaceDragSource` cho nguồn, `placeOnCalendar` thêm mới/dời mục cũ khi thả.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';
import type { PlaceCategory, Room, ScheduleItem } from '../types';
import {
  addToCalendarSlot,
  gridRange,
  minuteAtY,
  moveSlot,
  placeDropAction,
  placeScheduleItem,
  resizeSlot,
  SNAP_MIN,
  DEFAULT_WINDOW,
  type CalendarGrid,
  type Slot,
} from './calendar';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import { toast } from '../components/ui/toastStore';
import { formatTime } from '../i18n/format';

/** Di chuột quá ngưỡng này (px) mới thành kéo; dưới ngưỡng là bấm (mở popup). */
export const DRAG_THRESHOLD_PX = 4;
/** Nhấn giữ trên cảm ứng bao lâu thì nhấc ô (ms). */
export const LONG_PRESS_MS = 350;
/** Ngón tay xê dịch quá ngưỡng này trước khi nhấc = người dùng đang cuộn, bỏ nhấn giữ. */
export const TOUCH_SLOP_PX = 8;
/** Vùng sát mép trên/dưới của khung cuộn kích hoạt cuộn tự động (px). */
export const AUTOSCROLL_EDGE_PX = 48;
/** Tốc độ cuộn tự động tối đa (px mỗi khung hình). */
const AUTOSCROLL_MAX_PX = 14;

export type DragMode = 'move' | 'resize';

/** Bản nháp đang kéo: `origin` chụp lúc bắt đầu (cập nhật từ xa tới ô này bị hoãn tới khi thả). */
export interface CalendarDragView {
  id: string;
  mode: DragMode;
  origin: Slot;
  preview: Slot;
  /** Đã qua ngưỡng/nhấc: ô đang theo con trỏ. */
  active: boolean;
  /** Con trỏ đang ở ngoài lưới: thả lúc này = huỷ. */
  outside: boolean;
}

export interface UseCalendarDragOptions {
  grid: CalendarGrid;
  /** Phần tử lưới: đỉnh của nó ứng với `grid.start`. */
  gridRef: RefObject<HTMLElement | null>;
  pxPerMin: number;
  /** Thả xong và giờ có đổi. */
  onCommit: (id: string, slot: Slot) => void;
  disabled?: boolean;
}

export interface UseCalendarDragResult {
  drag: CalendarDragView | null;
  /** Ô đang được "nhấc" trên cảm ứng (sau nhấn giữ): hiện tay nắm 24px, chạm thân là kéo ngay. */
  selectedId: string | null;
  /** Gắn vào `onPointerDown` của thân ô (`mode = 'move'`) hoặc tay nắm mép dưới (`'resize'`). */
  onPointerDown: (e: React.PointerEvent, id: string, slot: Slot, mode: DragMode) => void;
  /** Gọi trong `onClick` của ô: `true` = cú bấm này thuộc một lần kéo/nhấc, bỏ qua. */
  consumeClick: (id: string) => boolean;
  /** Bỏ chọn ô đang nhấc (chạm ra nền lưới). */
  clearSelection: () => void;
  /** Phút đã snap ứng với toạ độ màn hình (cho T-80 tính chỗ thả từ ngoài). */
  slotAtClientY: (clientY: number) => number | null;
  /** Toạ độ màn hình nằm trong lưới (và trong phần đang nhìn thấy của khung cuộn). */
  isInsideGrid: (clientX: number, clientY: number) => boolean;
}

interface Pending {
  id: string;
  mode: DragMode;
  origin: Slot;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  /** Độ lệch (phút) giữa con trỏ và mép được cầm (đỉnh khi di, đáy khi kéo dãn). */
  grabMin: number;
  active: boolean;
  /** Cảm ứng trên ô đã nhấc/tay nắm: chặn cuộn ngay từ đầu, kéo khi qua ngưỡng. */
  blockScroll: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  scroller: HTMLElement | null;
  preview: Slot;
  outside: boolean;
}

const sameSlot = (a: Slot, b: Slot) => a.start_minute === b.start_minute && a.end_minute === b.end_minute;

/** Tổ tiên gần nhất cuộn được theo chiều dọc (cột Kế hoạch `.ws-plan` / tab mobile), không có thì cuộn trang. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/**
 * Tốc độ cuộn tự động (px/khung, âm = lên) khi con trỏ cách mép khung cuộn < 48px; càng sát mép càng nhanh.
 * `top/bottom` là mép nhìn thấy của khung cuộn trên màn hình.
 */
export function autoScrollStep(clientY: number, top: number, bottom: number): number {
  if (bottom - top <= AUTOSCROLL_EDGE_PX * 2) return 0;
  if (clientY < top + AUTOSCROLL_EDGE_PX) {
    const k = Math.min(1, (top + AUTOSCROLL_EDGE_PX - clientY) / AUTOSCROLL_EDGE_PX);
    return -Math.ceil(k * AUTOSCROLL_MAX_PX);
  }
  if (clientY > bottom - AUTOSCROLL_EDGE_PX) {
    const k = Math.min(1, (clientY - (bottom - AUTOSCROLL_EDGE_PX)) / AUTOSCROLL_EDGE_PX);
    return Math.ceil(k * AUTOSCROLL_MAX_PX);
  }
  return 0;
}

/**
 * Bản nháp khi kéo: phút ở con trỏ trừ độ lệch chỗ cầm, snap 15', kẹp trong lưới. `pointerMinute` tính từ toạ độ
 * thật của lưới (đã gồm độ cuộn) nên cuộn giữa chừng không làm lệch.
 */
export function dragPreview(mode: DragMode, origin: Slot, pointerMinute: number, grabMin: number, grid: CalendarGrid): Slot {
  const target = pointerMinute - grabMin;
  return mode === 'move'
    ? moveSlot(origin, target - origin.start_minute, grid)
    : resizeSlot(origin, target, grid);
}

/**
 * Bàn phím trên một ô (bảng §3): ↑/↓ dời 15', Shift+↑/↓ đổi giờ kết thúc 15'. Phím khác → `null`.
 * Kết quả kẹp trong lưới; không đổi gì (chạm biên) thì trả đúng `slot` cũ.
 */
export function keyboardSlot(slot: Slot, key: string, shiftKey: boolean, grid: CalendarGrid): Slot | null {
  const dir = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  if (dir === 0) return null;
  return shiftKey
    ? resizeSlot(slot, slot.end_minute + dir * SNAP_MIN, grid)
    : moveSlot(slot, dir * SNAP_MIN, grid);
}

export function useCalendarDrag({
  grid,
  gridRef,
  pxPerMin,
  onCommit,
  disabled = false,
}: UseCalendarDragOptions): UseCalendarDragResult {
  const [drag, setDrag] = useState<CalendarDragView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const raf = useRef<number | null>(null);
  const clickGuard = useRef<string | null>(null);
  // Giá trị mới nhất cho các listener gắn vào window (tránh closure cũ)
  const latest = useRef({ grid, pxPerMin, onCommit });
  latest.current = { grid, pxPerMin, onCommit };

  const minuteAtClient = useCallback(
    (clientY: number): number | null => {
      const el = gridRef.current;
      if (!el) return null;
      const { grid: g, pxPerMin: ppm } = latest.current;
      return minuteAtY(clientY - el.getBoundingClientRect().top, g.start, ppm);
    },
    [gridRef],
  );

  const isInsideGrid = useCallback(
    (clientX: number, clientY: number): boolean => {
      const el = gridRef.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      let top = r.top;
      let bottom = r.bottom;
      const sc = pending.current?.scroller ?? null;
      if (sc && sc !== document.scrollingElement) {
        const s = sc.getBoundingClientRect();
        top = Math.max(top, s.top);
        bottom = Math.min(bottom, s.bottom);
      }
      return clientX >= r.left && clientX <= r.right && clientY >= top && clientY <= bottom;
    },
    [gridRef],
  );

  const slotAtClientY = useCallback(
    (clientY: number) => {
      const m = minuteAtClient(clientY);
      return m === null ? null : Math.round(m / SNAP_MIN) * SNAP_MIN;
    },
    [minuteAtClient],
  );

  const stopLoop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const teardownRef = useRef<() => void>(() => {});

  const finish = useCallback((commit: boolean) => {
    const p = pending.current;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    stopLoop();
    teardownRef.current();
    pending.current = null;
    document.documentElement.classList.remove('cal-dragging');
    if (p.active) {
      // Cú click theo sau pointerup không được mở popup
      clickGuard.current = p.id;
      setTimeout(() => {
        if (clickGuard.current === p.id) clickGuard.current = null;
      }, 0);
    }
    setDrag(null);
    if (commit && p.active && !p.outside && !sameSlot(p.preview, p.origin)) {
      latest.current.onCommit(p.id, p.preview);
    }
  }, []);

  // Một khung hình: cuộn tự động (nếu sát mép) rồi tính lại bản nháp từ vị trí con trỏ cuối cùng
  const tick = useCallback(() => {
    raf.current = null;
    const p = pending.current;
    if (!p || !p.active) return;
    let scrolling = false;
    const sc = p.scroller;
    if (sc) {
      const isPage = sc === document.scrollingElement;
      const top = isPage ? 0 : sc.getBoundingClientRect().top;
      const bottom = isPage ? window.innerHeight : sc.getBoundingClientRect().bottom;
      const step = autoScrollStep(p.lastY, top, bottom);
      if (step !== 0) {
        const before = sc.scrollTop;
        sc.scrollTop = before + step;
        scrolling = sc.scrollTop !== before;
      }
    }
    const m = minuteAtClient(p.lastY);
    if (m !== null) {
      const next = dragPreview(p.mode, p.origin, m, p.grabMin, latest.current.grid);
      const outside = !isInsideGrid(p.lastX, p.lastY);
      if (!sameSlot(next, p.preview) || outside !== p.outside) {
        p.preview = next;
        p.outside = outside;
        setDrag({ id: p.id, mode: p.mode, origin: p.origin, preview: next, active: true, outside });
      }
    }
    if (scrolling) raf.current = requestAnimationFrame(tick);
  }, [minuteAtClient, isInsideGrid]);

  const schedule = useCallback(() => {
    if (raf.current === null) raf.current = requestAnimationFrame(tick);
  }, [tick]);

  const activate = useCallback(
    (p: Pending, lifted: boolean) => {
      p.active = true;
      p.scroller = scrollParent(gridRef.current);
      document.documentElement.classList.add('cal-dragging');
      if (lifted) {
        setSelectedId(p.id);
        try {
          navigator.vibrate?.(10);
        } catch {
          /* trình duyệt chặn rung: bỏ qua */
        }
      }
      setDrag({ id: p.id, mode: p.mode, origin: p.origin, preview: p.preview, active: true, outside: false });
      schedule();
    },
    [gridRef, schedule],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: string, slot: Slot, mode: DragMode) => {
      if (disabled || pending.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (mode === 'resize') e.stopPropagation();
      const m = minuteAtClient(e.clientY);
      if (m === null) return;
      const isTouch = e.pointerType === 'touch';
      // Cảm ứng: ô chưa nhấc thì phải nhấn giữ; tay nắm chỉ hiện trên ô đã nhấc nên kéo dãn đi ngay
      const needsLongPress = isTouch && mode === 'move' && selectedId !== id;
      if (isTouch && selectedId && selectedId !== id) setSelectedId(null);

      const p: Pending = {
        id,
        mode,
        origin: { start_minute: slot.start_minute, end_minute: slot.end_minute },
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        grabMin: m - (mode === 'move' ? slot.start_minute : slot.end_minute),
        active: false,
        blockScroll: isTouch && !needsLongPress,
        timer: null,
        scroller: null,
        preview: { start_minute: slot.start_minute, end_minute: slot.end_minute },
        outside: false,
      };
      pending.current = p;
      if (needsLongPress) {
        p.timer = setTimeout(() => {
          p.timer = null;
          if (pending.current === p) activate(p, true);
        }, LONG_PRESS_MS);
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== p.pointerId) return;
        p.lastX = ev.clientX;
        p.lastY = ev.clientY;
        if (!p.active) {
          const dist = Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY);
          if (p.pointerType === 'touch' && !p.blockScroll) {
            if (dist > TOUCH_SLOP_PX) finish(false); // đang cuộn, không phải nhấn giữ
            return;
          }
          if (dist <= DRAG_THRESHOLD_PX) return;
          activate(p, false);
          return;
        }
        schedule();
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== p.pointerId) return;
        p.lastX = ev.clientX;
        p.lastY = ev.clientY;
        if (p.active) {
          // Tính lần cuối ngay tại chỗ thả (rAF có thể chưa chạy)
          const mm = minuteAtClient(ev.clientY);
          if (mm !== null) p.preview = dragPreview(p.mode, p.origin, mm, p.grabMin, latest.current.grid);
          p.outside = !isInsideGrid(ev.clientX, ev.clientY);
        }
        finish(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === p.pointerId) finish(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && pending.current === p) {
          ev.preventDefault();
          ev.stopPropagation();
          finish(false);
        }
      };
      // Đã nhấc trên cảm ứng: chặn cuộn trang (listener phải non-passive)
      const onTouchMove = (ev: TouchEvent) => {
        if ((p.active || p.blockScroll) && ev.cancelable) ev.preventDefault();
      };
      const onContext = (ev: Event) => {
        if (p.pointerType === 'touch') ev.preventDefault();
      };
      // Nội dung còn trôi (cuộn quán tính) trong lúc chờ nhấn giữ → ô dưới ngón tay đã đổi, bỏ nhấn giữ
      const onScroll = () => {
        if (!p.active && p.timer) finish(false);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('contextmenu', onContext);
      window.addEventListener('scroll', onScroll, true);
      teardownRef.current = () => {
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('contextmenu', onContext);
      };
    },
    [disabled, minuteAtClient, isInsideGrid, selectedId, activate, finish, schedule],
  );

  // Ngón tay chạm vào lưới phải gặp listener touchmove non-passive ngay từ touchstart thì mới chặn cuộn được
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const block = (ev: TouchEvent) => {
      const p = pending.current;
      if (p && (p.active || p.blockScroll) && ev.cancelable) ev.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, [gridRef]);

  // Gỡ listener khi unmount giữa lúc kéo
  useEffect(() => () => finish(false), [finish]);

  const consumeClick = useCallback((id: string) => {
    if (clickGuard.current === id) {
      clickGuard.current = null;
      return true;
    }
    return false;
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  return { drag, selectedId, onPointerDown, consumeClick, clearSelection, slotAtClientY, isInsideGrid };
}

/* ---------- Kéo quán từ ngoài lịch vào lịch (T-80) ---------- */

/** Quán đang được cầm (nguồn kéo điền). */
export interface PlaceDragInfo {
  placeId: string;
  name: string;
  category?: PlaceCategory;
  /** Ảnh nhỏ cho bóng kéo (thiếu → icon danh mục). */
  photo?: string;
  /** Thời lượng ô thả (phút): mặc định 60; quán đã có trên lịch thì giữ thời lượng mục cũ. */
  duration?: number;
}

/** Quán đang được kéo từ ngoài lịch + vị trí con trỏ. `dropped` chỉ dùng cho nơi gọi cũ qua prop của `CalendarColumn`. */
export interface ExternalCalendarDrag extends PlaceDragInfo {
  clientX: number;
  clientY: number;
  dropped?: boolean;
}

/** Ô đang chờ `POST` (vẽ skeleton tại chỗ thả). */
export interface PendingDrop {
  placeId: string;
  name: string;
  category?: PlaceCategory;
  slot: Slot;
}

export interface CalendarChannelState {
  drag: ExternalCalendarDrag | null;
  /** Lần kéo gần nhất kết thúc: `dropped = false` là huỷ (khung phòng đóng lại ngăn kéo nó đã tự mở). */
  lastEnd: { seq: number; dropped: boolean } | null;
  pending: readonly PendingDrop[];
  /** Mục cần nhận focus khi lịch hiện ra (sau "Thêm vào lịch" bằng menu). */
  focusId: string | null;
  /** Tăng mỗi lần cần mở cột Kế hoạch mà không kéo (menu "Thêm vào lịch"/"Xem trên lịch"). */
  revealSeq: number;
}

/** Lịch đang hiện đăng ký hàm tính chỗ thả theo toạ độ màn hình; `null` = con trỏ ngoài lưới. */
export type DropResolver = (clientX: number, clientY: number, duration?: number) => Slot | null;

const INITIAL_CHANNEL: CalendarChannelState = { drag: null, lastEnd: null, pending: [], focusId: null, revealSeq: 0 };
let channelState: CalendarChannelState = INITIAL_CHANNEL;
let dropResolver: DropResolver | null = null;
let endSeq = 0;
const channelListeners = new Set<() => void>();

/** Kênh dùng chung giữa nguồn kéo (cột trái/khay), lịch (đích) và khung phòng. Ngoài React để không phải truyền prop qua RoomPage. */
export const calendarChannel = {
  get: (): CalendarChannelState => channelState,
  set(patch: Partial<CalendarChannelState>) {
    channelState = { ...channelState, ...patch };
    channelListeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    channelListeners.add(l);
    return () => {
      channelListeners.delete(l);
    };
  },
  /** Lịch gọi khi mount; trả hàm gỡ (chỉ gỡ nếu vẫn là hàm của mình). */
  registerDropTarget(resolve: DropResolver) {
    dropResolver = resolve;
    return () => {
      if (dropResolver === resolve) dropResolver = null;
    };
  },
  resolveDrop(clientX: number, clientY: number, duration?: number): Slot | null {
    return dropResolver ? dropResolver(clientX, clientY, duration) : null;
  },
  /** Kết thúc một lần kéo. */
  end(dropped: boolean) {
    endSeq += 1;
    this.set({ drag: null, lastEnd: { seq: endSeq, dropped } });
  },
  /** Test: về trạng thái đầu. */
  reset() {
    channelState = INITIAL_CHANNEL;
    dropResolver = null;
    channelListeners.forEach((l) => l());
  },
};

/** Đọc một phần kênh (selector phải trả giá trị nguyên thuỷ hoặc tham chiếu có sẵn trong state). */
export function useCalendarChannel<T>(selector: (s: CalendarChannelState) => T): T {
  return useSyncExternalStore(
    calendarChannel.subscribe,
    () => selector(channelState),
    () => selector(channelState),
  );
}

const roomWindow = (room?: Pick<Room, 'start_minute' | 'end_minute'> | null) => ({
  start_minute: room?.start_minute ?? DEFAULT_WINDOW.start,
  end_minute: room?.end_minute ?? DEFAULT_WINDOW.end,
});

/** Lưới ngày đầu đang vẽ (cho "Thêm vào lịch" khi lịch chưa mount). */
export function currentGrid(room: Pick<Room, 'start_minute' | 'end_minute'> | null | undefined, items: readonly ScheduleItem[]): CalendarGrid {
  return gridRange(roomWindow(room), items);
}

/** Kết quả đặt quán lên lịch: id mục + giờ; `null` khi đang chờ thêm chính quán này. */
export interface PlacedResult {
  itemId: string;
  slot: Slot;
  added: boolean;
}

/**
 * Đặt quán vào `slot` (ngày đầu): chưa có mục → `POST` (skeleton tại chỗ trong lúc chờ, rồi sắp lại `order_index`
 * theo giờ); đã có → `moveItems` (lạc quan, dời mục cũ, không nhân bản). Sau đó đánh giá xung đột ở nền. Lỗi → ném lại.
 */
export async function placeOnCalendar(roomId: string, info: PlaceDragInfo, slot: Slot): Promise<PlacedResult | null> {
  if (channelState.pending.some((p) => p.placeId === info.placeId)) return null;
  const store = useScheduleStore.getState();
  const action = placeDropAction(info.placeId, slot, store.items);
  const evaluate = () => void useConflictStore.getState().evaluateConflicts(roomId).catch(() => {});
  if (action.kind === 'none') return { itemId: action.itemId, slot, added: false };
  if (action.kind === 'move') {
    await store.moveItems(roomId, [{ id: action.itemId, day_offset: 0, ...action.slot }]);
    evaluate();
    return { itemId: action.itemId, slot: action.slot, added: false };
  }
  const pend: PendingDrop = { placeId: info.placeId, name: info.name, category: info.category, slot: action.slot };
  calendarChannel.set({ pending: [...channelState.pending, pend] });
  try {
    const item = await store.addItem(roomId, { place_id: info.placeId, day_offset: 0, ...action.slot });
    // WS `SCHEDULE_UPDATED` có thể tới trước kết quả POST → `addItem` nối trùng id: gộp lại
    const s = useScheduleStore.getState();
    if (s.items.filter((i) => i.id === item.id).length > 1) {
      const seen = new Set<string>();
      s.setItems(s.items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))));
    }
    // Mục mới nhận `order_index` cuối: sắp lại theo giờ (PUT chỉ khi có mục đổi thứ tự)
    await s.moveItems(roomId, []).catch(() => {});
    evaluate();
    return { itemId: item.id, slot: action.slot, added: true };
  } finally {
    calendarChannel.set({ pending: channelState.pending.filter((p) => p !== pend) });
  }
}

/** "Thêm vào lịch" không kéo: giờ trống đầu tiên ≥ 60' (kín thì sau mục cuối, kẹp trong khung). Quán đã có mục → giữ nguyên. */
export async function addToFirstFree(
  roomId: string,
  room: Pick<Room, 'start_minute' | 'end_minute'> | null | undefined,
  info: PlaceDragInfo,
): Promise<PlacedResult | null> {
  const items = useScheduleStore.getState().items;
  const existing = items.find((i) => i.place_id === info.placeId);
  if (existing) return { itemId: existing.id, slot: { start_minute: existing.start_minute, end_minute: existing.end_minute }, added: false };
  return placeOnCalendar(roomId, info, addToCalendarSlot(items, currentGrid(room, items), info.duration));
}

export interface UsePlaceDragSourceOptions {
  /** Thả trong lưới: chỗ thả đã snap/kẹp. */
  onDrop: (info: PlaceDragInfo, slot: Slot) => void;
  /** Cảm ứng phải nhấn giữ 350 ms mới nhấc (khay mobile). `false` = bỏ qua chạm (thẻ cột trái). */
  touchLongPress?: boolean;
  disabled?: boolean;
}

export interface UsePlaceDragSourceResult {
  /** Gắn vào `onPointerDown` của thẻ/chip nguồn. */
  onPointerDown: (e: React.PointerEvent, info: PlaceDragInfo) => void;
  /** Gọi trong `onClick`: `true` = cú bấm thuộc một lần kéo, bỏ qua. */
  consumeClick: (placeId: string) => boolean;
  /** Ref cho phần tử bọc các nguồn cảm ứng: listener `touchmove` non-passive có sẵn từ touchstart để chặn cuộn khi đã nhấc. */
  touchBlockRef: (el: HTMLElement | null) => void;
}

/** Nguồn kéo quán vào lịch: chuột/bút qua ngưỡng 4px; cảm ứng nhấn giữ 350 ms (+ rung), xê dịch > 8px trước đó = cuộn. */
export function usePlaceDragSource({ onDrop, touchLongPress = false, disabled = false }: UsePlaceDragSourceOptions): UsePlaceDragSourceResult {
  const active = useRef<{ active: boolean; cancel: () => void } | null>(null);
  const clickGuard = useRef<string | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const blockEl = useRef<HTMLElement | null>(null);

  const blockTouch = useCallback((ev: TouchEvent) => {
    if (active.current?.active && ev.cancelable) ev.preventDefault();
  }, []);
  const touchBlockRef = useCallback(
    (el: HTMLElement | null) => {
      blockEl.current?.removeEventListener('touchmove', blockTouch);
      blockEl.current = el;
      el?.addEventListener('touchmove', blockTouch, { passive: false });
    },
    [blockTouch],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent, info: PlaceDragInfo) => {
      if (disabled || active.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const isTouch = e.pointerType === 'touch';
      if (isTouch && !touchLongPress) return;

      const st = { active: false, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId };
      let timer: ReturnType<typeof setTimeout> | null = null;
      let raf: number | null = null;

      const publish = () => {
        raf = null;
        const d = calendarChannel.get().drag;
        if (st.active && d && d.placeId === info.placeId) calendarChannel.set({ drag: { ...d, clientX: st.x, clientY: st.y } });
      };
      const activate = () => {
        st.active = true;
        if (active.current) active.current.active = true;
        document.documentElement.classList.add('cal-dragging');
        if (isTouch) {
          try {
            navigator.vibrate?.(10);
          } catch {
            /* trình duyệt chặn rung: bỏ qua */
          }
        }
        calendarChannel.set({ drag: { ...info, clientX: st.x, clientY: st.y } });
      };
      const finish = (drop: boolean) => {
        if (timer) clearTimeout(timer);
        if (raf !== null) cancelAnimationFrame(raf);
        teardown();
        active.current = null;
        if (!st.active) return;
        document.documentElement.classList.remove('cal-dragging');
        clickGuard.current = info.placeId;
        setTimeout(() => {
          if (clickGuard.current === info.placeId) clickGuard.current = null;
        }, 0);
        const slot = drop ? calendarChannel.resolveDrop(st.x, st.y, info.duration) : null;
        calendarChannel.end(slot !== null);
        if (slot) onDropRef.current(info, slot);
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== st.pointerId) return;
        st.x = ev.clientX;
        st.y = ev.clientY;
        if (!st.active) {
          const dist = Math.hypot(st.x - st.startX, st.y - st.startY);
          if (isTouch) {
            if (dist > TOUCH_SLOP_PX) finish(false); // đang cuộn khay/cột
            return;
          }
          if (dist > DRAG_THRESHOLD_PX) activate();
          return;
        }
        if (raf === null) raf = requestAnimationFrame(publish);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== st.pointerId) return;
        st.x = ev.clientX;
        st.y = ev.clientY;
        finish(true);
      };
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === st.pointerId) finish(false);
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          finish(false);
        }
      };
      const onTouchMove = (ev: TouchEvent) => {
        if (st.active && ev.cancelable) ev.preventDefault();
      };
      const onContext = (ev: Event) => {
        if (isTouch) ev.preventDefault();
      };
      const onScroll = () => {
        if (!st.active && timer) finish(false);
      };
      const teardown = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('contextmenu', onContext);
        window.removeEventListener('scroll', onScroll, true);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('contextmenu', onContext);
      window.addEventListener('scroll', onScroll, true);
      active.current = { active: false, cancel: () => finish(false) };

      if (isTouch) {
        timer = setTimeout(() => {
          timer = null;
          activate();
        }, LONG_PRESS_MS);
      }
    },
    [disabled, touchLongPress],
  );

  // Unmount giữa lúc kéo: huỷ, gỡ listener
  useEffect(
    () => () => {
      active.current?.cancel();
      blockEl.current?.removeEventListener('touchmove', blockTouch);
    },
    [blockTouch],
  );

  const consumeClick = useCallback((placeId: string) => {
    if (clickGuard.current === placeId) {
      clickGuard.current = null;
      return true;
    }
    return false;
  }, []);

  return { onPointerDown, consumeClick, touchBlockRef };
}

/** Việc nối nguồn kéo/menu với lịch, dùng chung cho cột trái, khay mobile: thả, "Thêm vào lịch", "Xem trên lịch". */
export function useCalendarPlacement(roomId: string, room: Pick<Room, 'start_minute' | 'end_minute'> | null | undefined) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  return useMemo(() => {
    const failText = (placeId: string) =>
      placeScheduleItem(placeId, useScheduleStore.getState().items) ? t('calendar.saveFailed') : t('calendar.addFailed');
    return {
      /** Thả trong lưới: thêm mới hoặc dời mục cũ. Lỗi → toast (dời: store đã hoàn tác). */
      drop(info: PlaceDragInfo, slot: Slot) {
        const fail = failText(info.placeId);
        void placeOnCalendar(roomId, info, slot).catch(() => toast.error(fail));
      },
      /** Không kéo: giờ trống đầu tiên, mở cột Kế hoạch, focus ô mới, báo bằng toast (mobile không thấy lịch). */
      add(info: PlaceDragInfo) {
        void addToFirstFree(roomId, room, info)
          .then((r) => {
            if (!r) return;
            calendarChannel.set({ focusId: r.itemId, revealSeq: calendarChannel.get().revealSeq + 1 });
            if (r.added) {
              toast.success(
                t('calendar.added', {
                  name: info.name,
                  range: t('calendar.range', {
                    start: formatTime(r.slot.start_minute, lang),
                    end: formatTime(r.slot.end_minute, lang),
                  }),
                }),
              );
            }
          })
          .catch(() => toast.error(t('calendar.addFailed')));
      },
      /** "Xem trên lịch": mở cột Kế hoạch + focus ô. */
      show(itemId: string) {
        calendarChannel.set({ focusId: itemId, revealSeq: calendarChannel.get().revealSeq + 1 });
      },
    };
  }, [roomId, room, t, lang]);
}
