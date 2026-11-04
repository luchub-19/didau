// Kéo thả trong lịch (DESIGN gđ6 §3 "Tương tác", T-79): di ô, kéo dãn mép dưới, nhấn giữ trên cảm ứng, Esc huỷ,
// cuộn tự động sát mép, snap 15' theo con trỏ trừ độ lệch chỗ cầm. Tự viết bằng Pointer Events (không HTML5 DnD).
// Trong lúc kéo chỉ đổi bản nháp (transform/chiều cao của một ô) mỗi rAF; thả mới gọi `onCommit` (→ `moveItems`).
// T-80 thêm nguồn kéo từ ngoài lịch: dùng `slotAtClientY` + `isInsideGrid` để tính ô xem trước/chỗ thả.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { minuteAtY, moveSlot, resizeSlot, SNAP_MIN, type CalendarGrid, type Slot } from './calendar';

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
