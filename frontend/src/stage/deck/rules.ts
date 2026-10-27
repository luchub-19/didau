// Luật thuần của sân khấu quẹt thẻ (T-60): ngưỡng thả, độ nghiêng, phím tắt, chống kẹt kéo.
// Không import thư viện chuyển động để test chạy không cần DOM (docs/phase4/DESIGN.md §4).
import type { MotionTier } from '../../motion';

/** Kéo quá khoảng này (px) rồi thả là bỏ phiếu, bất kể vận tốc. */
export const THROW_DISTANCE_PX = 90;
/** Quăng nhanh hơn ngưỡng này (px/s) cũng là bỏ phiếu, dù kéo chưa xa. */
export const THROW_VELOCITY_PX_S = 600;
/** Quăng nhanh vẫn phải lệch tối thiểu chừng này (px) để chạm nhẹ không thành phiếu. */
export const THROW_MIN_OFFSET_PX = 24;
/** Xoay tối đa theo độ lệch khi kéo (độ). */
export const MAX_DRAG_ROTATE_DEG = 12;
/** Nghiêng 3D tối đa theo con trỏ khi hover (độ), chỉ mức 'full'. */
export const MAX_HOVER_TILT_DEG = 6;
/** Nhãn Thích/Thôi bắt đầu hiện từ độ lệch này và rõ hẳn ở ngưỡng thả. */
export const STAMP_START_PX = 20;

/** true = Thích, false = Thôi, null = bật lại chỗ cũ. */
export type ThrowResult = boolean | null;

/** Quyết định khi thả thẻ: theo khoảng cách HOẶC vận tốc (cùng chiều với độ lệch). */
export function throwDecision(offsetX: number, velocityX: number): ThrowResult {
  if (!Number.isFinite(offsetX)) return null;
  if (Math.abs(offsetX) >= THROW_DISTANCE_PX) return offsetX > 0;
  const v = Number.isFinite(velocityX) ? velocityX : 0;
  const sameDirection = Math.sign(v) === Math.sign(offsetX);
  if (Math.abs(offsetX) >= THROW_MIN_OFFSET_PX && sameDirection && Math.abs(v) >= THROW_VELOCITY_PX_S) {
    return offsetX > 0;
  }
  return null;
}

/** Độ rõ (0..1) của nhãn Thích (offset > 0) hoặc Thôi (offset < 0) theo độ kéo. */
export function stampProgress(offsetX: number): number {
  const d = Math.abs(offsetX);
  if (d <= STAMP_START_PX) return 0;
  return Math.min(1, (d - STAMP_START_PX) / (THROW_DISTANCE_PX - STAMP_START_PX));
}

/** Góc xoay theo độ lệch: tối đa ±12°, mức 'static' không xoay. */
export function rotationFor(offsetX: number, tier: MotionTier): number {
  if (tier === 'static' || !Number.isFinite(offsetX)) return 0;
  const deg = (offsetX / (THROW_DISTANCE_PX * 2)) * MAX_DRAG_ROTATE_DEG;
  return Math.max(-MAX_DRAG_ROTATE_DEG, Math.min(MAX_DRAG_ROTATE_DEG, deg));
}

/**
 * Nghiêng 3D theo vị trí con trỏ trong thẻ (px tương đối, 0..width/0..height).
 * Trả { rotateX, rotateY } ≤ 6°; mức khác 'full' luôn phẳng.
 */
export function tiltFor(
  px: number,
  py: number,
  width: number,
  height: number,
  tier: MotionTier,
): { rotateX: number; rotateY: number } {
  if (tier !== 'full' || width <= 0 || height <= 0) return { rotateX: 0, rotateY: 0 };
  const nx = Math.max(-1, Math.min(1, (px / width) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, (py / height) * 2 - 1));
  return { rotateX: -ny * MAX_HOVER_TILT_DEG, rotateY: nx * MAX_HOVER_TILT_DEG };
}

/**
 * Điểm thẻ bay tới khi rời sân khấu (góc xoay đi theo x qua `rotationFor`, tối đa 12°).
 * 'static' chỉ mờ đi tại chỗ (cross-fade).
 */
export function exitTarget(
  liked: boolean | null,
  tier: MotionTier,
  travelPx: number,
): { opacity: number; x?: number } {
  if (tier === 'static' || liked === null) return { opacity: 0 };
  return { x: (liked ? 1 : -1) * travelPx, opacity: 0 };
}

/** Phím tắt: → Thích, ← Thôi; đang gõ trong ô nhập thì bỏ qua (mũi tên để di chuyển con trỏ chữ). */
export function keyToVote(key: string, target: EventTarget | null): ThrowResult {
  const el = target as HTMLElement | null;
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''))) return null;
  if (key === 'ArrowRight') return true;
  if (key === 'ArrowLeft') return false;
  return null;
}

/**
 * Chống kẹt kéo (giữ luật T-49): chỉ một con trỏ sở hữu cử chỉ; ngón thứ hai bị bỏ qua;
 * pointercancel / blur cửa sổ trả cử chỉ về trạng thái rảnh.
 */
export function createPointerGuard() {
  let active: number | null = null;
  return {
    /** true nếu con trỏ này được bắt đầu kéo. */
    down(pointerId: number): boolean {
      if (active !== null && active !== pointerId) return false;
      active = pointerId;
      return true;
    },
    owns(pointerId: number): boolean {
      return active === pointerId;
    },
    /** Nhả con trỏ đang sở hữu; trả true nếu đúng là nó. */
    release(pointerId: number): boolean {
      if (active !== pointerId) return false;
      active = null;
      return true;
    },
    reset(): void {
      active = null;
    },
    isActive(): boolean {
      return active !== null;
    },
  };
}

export type PointerGuard = ReturnType<typeof createPointerGuard>;

/** Số "+1" ẩn danh cần bay vào khi số người xong tăng (VOTE_UPDATED/DECISION_PROGRESS không có id người). */
export function newlyDone(prevCount: number, nextCount: number): number {
  return nextCount > prevCount ? nextCount - prevCount : 0;
}
