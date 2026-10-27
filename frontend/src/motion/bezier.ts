// Đánh giá đường cong `cubic-bezier(...)` trong JS để camera hero dùng đúng easing token CSS
// (vd. --ease-camera) thay vì viết công thức easing rời.
import { EASING_FALLBACK, type EasingToken } from './tokens';

export type EasingFn = (t: number) => number;

/** Tách 4 số từ chuỗi `cubic-bezier(x1, y1, x2, y2)`; chuỗi hỏng trả null. */
export function parseCubicBezier(css: string): [number, number, number, number] | null {
  const m = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(css.trim());
  if (!m) return null;
  const nums = m.slice(1, 5).map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums as [number, number, number, number];
}

/** Hàm easing từ 4 điểm điều khiển: giải x(s) = t bằng Newton rồi chia đôi, trả y(s). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      if (sampleX(s) < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

/** Easing JS của một token (đọc giá trị dự phòng; token CSS và bảng dự phòng được test canh khớp). */
export function easingFn(token: EasingToken): EasingFn {
  const p = parseCubicBezier(EASING_FALLBACK[token]);
  return p ? cubicBezier(...p) : (t) => t;
}
