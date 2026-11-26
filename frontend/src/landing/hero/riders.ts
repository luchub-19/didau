// "Bốn bạn hội tụ" (PLAN §4.5, mock v3 `slots/placeRiders`): phần thuần, không React, test được không cần DOM thật.
// Xe chạy vào từ hai mép (chẵn từ trái, lẻ từ phải), dừng thành hàng dưới tâm cửa sổ phòng mẫu (màn > 960px)
// hoặc giữa màn (≤ 960px). Chạy MỘT LẦN mỗi lượt tải trang; mức static đứng sẵn ở chỗ dừng, không gọi animate.
import type { MotionTier } from '../../motion/useMotionTier';

/** Bề rộng một xe (px), khớp `.hero-rider` trong hero.css. */
export const RIDER_W = 92;
/** Ngưỡng màn rộng: trên ngưỡng này xe dừng dưới cửa sổ app (PLAN §4.7). */
export const WIDE_MIN = 961;

/** Nhịp mở màn (PLAN §4.5): 1500–1860 ms, so le 90 ms, nhãn tên hiện sau 2050 ms. */
export const ARRIVAL = {
  baseMs: 1500,
  stepMs: 120,
  delayMs: 300,
  staggerMs: 90,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  /** Xe ra khỏi mép thêm bấy nhiêu px trước khi chạy vào. */
  offscreenPx: 140,
  tagsAtMs: 2050,
} as const;

export interface SlotInput {
  /** Bề rộng lớp xe (px). */
  width: number;
  /** Tâm cửa sổ app theo trục x, tính từ mép trái lớp xe; null = không có cửa sổ. */
  anchorCenterX: number | null;
  viewportWidth: number;
}

/** Toạ độ `left` (px) của 4 xe. */
export function riderSlots({ width, anchorCenterX, viewportWidth }: SlotInput): number[] {
  const cx = viewportWidth >= WIDE_MIN && anchorCenterX !== null ? anchorCenterX : width / 2;
  const gap = Math.min(120, width / 4.4);
  return [-1.5, -0.5, 0.5, 1.5].map((k) => Math.round(cx + k * gap - RIDER_W / 2));
}

export interface Animatable {
  animate: (keyframes: Keyframe[], options: KeyframeAnimationOptions) => unknown;
}

/** Khoảng chạy vào (px) của xe thứ i: chẵn từ ngoài mép trái, lẻ từ ngoài mép phải. */
export function arrivalOffset(i: number, left: number, width: number): number {
  return i % 2 === 0 ? -(left + ARRIVAL.offscreenPx) : width - left + ARRIVAL.offscreenPx;
}

export function arrivalTiming(i: number): { duration: number; delay: number } {
  return { duration: ARRIVAL.baseMs + i * ARRIVAL.stepMs, delay: ARRIVAL.delayMs + i * ARRIVAL.staggerMs };
}

/** Thời điểm xe cuối dừng hẳn (ms từ lúc bắt đầu). */
export function arrivalEndMs(n = 4): number {
  const t = arrivalTiming(n - 1);
  return t.delay + t.duration;
}

/**
 * Cho các xe chạy vào chỗ dừng bằng WAAPI (`fill: backwards` để khung đầu đã ở ngoài mép).
 * Mức `static`: không gọi `animate` (xe đứng sẵn). Trả về số animation đã tạo.
 */
export function runArrival(els: readonly Animatable[], slots: readonly number[], width: number, tier: MotionTier): number {
  if (tier === 'static') return 0;
  els.forEach((el, i) => {
    const dx = arrivalOffset(i, slots[i] ?? 0, width);
    const { duration, delay } = arrivalTiming(i);
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
      duration,
      delay,
      easing: ARRIVAL.easing,
      fill: 'backwards',
    });
  });
  return els.length;
}

/** Mốc bắt đầu mở màn trong lượt tải này (cấp module = một lần mỗi lượt tải); null = chưa chạy; -Infinity = đứng sẵn. */
export const arrival: { startedAt: number | null } = { startedAt: null };

/** Chỉ dùng trong test: cho phép mở màn chạy lại. */
export function resetArrivalForTest(): void {
  arrival.startedAt = null;
}
