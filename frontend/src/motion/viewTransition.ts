// Chuyển tab trong phòng bằng View Transitions API (T-62, preset 'tab.switch', DESIGN §4).
// Trình duyệt không có API hoặc mức 'static' → cập nhật thẳng, không hiệu ứng.
// Tên view-transition chỉ tồn tại trong lúc chuyển: CSS gán theo `:root[data-vt-dir]` (styles/motion.css),
// phần tử dùng chung (thẻ quán ↔ sheet quán) gán tay đúng một phần tử mỗi phía để không trùng tên.
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { stageLog } from './debug';
import { resolvePreset } from './presets';
import { getMotionTier, type MotionTier } from './useMotionTier';

export type TransitionDirection = 'forward' | 'back' | 'none';

/** Tên view-transition của phần tử bay giữa hai tab (thẻ quán đang chọn → sheet quán trên bản đồ). */
export const SHARED_TRANSITION_NAME = 'place-focus';

/** Thuộc tính trên :root khi một lần chuyển tab đang chạy; CSS đọc để chọn hướng trượt. */
export const DIRECTION_ATTR = 'data-vt-dir';
/** Biến CSS thời lượng đã tính theo mức + `?motion=slow` (CSS var `--t-tab` không tự nhân). */
export const DURATION_VAR = '--vt-tab-ms';

interface TransitionHandle {
  finished: Promise<unknown>;
  skipTransition?: () => void;
}

/** Phần tối thiểu của `document` mà hàm cần; test truyền bản giả. */
export interface ViewTransitionDocument {
  startViewTransition?: (update: () => void) => TransitionHandle;
  documentElement: {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
    style: { setProperty(name: string, value: string): void };
  };
}

export interface ViewTransitionOptions {
  direction?: TransitionDirection;
  tier?: MotionTier;
  doc?: ViewTransitionDocument | null;
}

interface SharedElement {
  style: { viewTransitionName: string };
}

// Phần tử gốc của lần chuyển kế tiếp (thẻ vừa bấm "Xem trên bản đồ"). Chỉ sống trong một task:
// nếu không có lần chuyển tab nào ngay sau cú bấm thì tự quên, tránh lần chuyển sau bay nhầm thẻ.
let pendingOrigin: SharedElement | null = null;

/** Đánh dấu phần tử sẽ "bay" ở lần chuyển tab ngay sau đó (gọi trong cùng handler với đổi tab). */
export function markSharedOrigin(el: SharedElement | null): void {
  pendingOrigin = el;
  if (el) {
    queueMicrotask(() => {
      if (pendingOrigin === el) pendingOrigin = null;
    });
  }
}

// Kho nhỏ: phía đích (PlaceSheet) đọc để gán tên trong lúc chuyển có phần tử dùng chung
const sharedListeners = new Set<() => void>();
let sharedActive = false;

function setSharedActive(next: boolean): void {
  if (sharedActive === next) return;
  sharedActive = next;
  sharedListeners.forEach((l) => l());
}

function subscribeShared(cb: () => void): () => void {
  sharedListeners.add(cb);
  return () => {
    sharedListeners.delete(cb);
  };
}

export function isSharedTransitionActive(): boolean {
  return sharedActive;
}

/** Phía đích: `style={{ viewTransitionName: useSharedTransitionName() }}`; ngoài lúc chuyển trả undefined. */
export function useSharedTransitionName(): string | undefined {
  const active = useSyncExternalStore(subscribeShared, isSharedTransitionActive, () => false);
  return active ? SHARED_TRANSITION_NAME : undefined;
}

let current: TransitionHandle | null = null;

/**
 * Chạy `update` (cập nhật state React) trong một view transition.
 * Trả về handle của transition, hoặc null khi đã cập nhật thẳng (không API, mức 'static', lỗi).
 */
export function withViewTransition(
  update: () => void,
  { direction = 'none', tier = getMotionTier(), doc }: ViewTransitionOptions = {},
): TransitionHandle | null {
  const d = doc === undefined ? (typeof document !== 'undefined' ? (document as unknown as ViewTransitionDocument) : null) : doc;
  const origin = pendingOrigin;
  pendingOrigin = null;

  if (!d || typeof d.startViewTransition !== 'function' || tier === 'static') {
    update();
    return null;
  }

  const root = d.documentElement;
  const motion = resolvePreset('tab.switch', tier);
  // Đổi tab dồn dập: bỏ lần trước để lần mới chụp trạng thái thật
  current?.skipTransition?.();
  root.setAttribute(DIRECTION_ATTR, direction);
  root.style.setProperty(DURATION_VAR, `${motion.durationMs}ms`);
  if (origin) origin.style.viewTransitionName = SHARED_TRANSITION_NAME;

  let handle: TransitionHandle;
  try {
    handle = d.startViewTransition(() => {
      // Ảnh cũ đã chụp: gỡ tên khỏi thẻ gốc, gán cho phía đích ngay trong lần render này
      if (origin) origin.style.viewTransitionName = '';
      flushSync(() => {
        if (origin) setSharedActive(true);
        update();
      });
    });
  } catch (err) {
    stageLog('viewTransition', 'start failed', err);
    if (origin) origin.style.viewTransitionName = '';
    root.removeAttribute(DIRECTION_ATTR);
    update();
    return null;
  }

  current = handle;
  stageLog('viewTransition', direction, `${motion.durationMs}ms`, origin ? SHARED_TRANSITION_NAME : '');
  handle.finished
    .catch(() => undefined)
    .finally(() => {
      if (current !== handle) return;
      current = null;
      root.removeAttribute(DIRECTION_ATTR);
      setSharedActive(false);
    });
  return handle;
}
