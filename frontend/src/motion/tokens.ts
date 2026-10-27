// Token chuyển động dùng chung CSS ↔ JS. Nguồn sự thật là CSS var trong `styles/tokens.css`;
// bảng dưới chỉ là giá trị dự phòng khi chưa có DOM (test, SSR) và phải khớp file CSS.
import { getTimeScale } from './debug';

export const DURATION_FALLBACK = {
  press: 120,
  hover: 160,
  ui: 220,
  sheet: 320,
  moment: 600,
  swipe: 280,
  tab: 260,
  fly: 520,
  shot: 1400,
  reveal: 1800,
} as const;

export type DurationToken = keyof typeof DURATION_FALLBACK;

export const EASING_FALLBACK = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  inOut: 'cubic-bezier(0.76, 0, 0.24, 1)',
  camera: 'cubic-bezier(0.65, 0, 0.35, 1)',
  throw: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const;

export type EasingToken = keyof typeof EASING_FALLBACK;

const EASING_VAR: Record<EasingToken, string> = {
  out: '--ease-out',
  inOut: '--ease-in-out',
  camera: '--ease-camera',
  throw: '--ease-throw',
};

function readCssVar(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Đổi chuỗi CSS ('280ms', '1.4s') sang mili giây; chuỗi hỏng trả null. */
export function parseCssDuration(raw: string): number | null {
  const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 's' ? n * 1000 : n;
}

/** Thời lượng (ms) của token, đã nhân hệ số `?motion=slow`. */
export function duration(token: DurationToken): number {
  const fromCss = parseCssDuration(readCssVar(`--t-${token}`));
  return (fromCss ?? DURATION_FALLBACK[token]) * getTimeScale();
}

/** Chuỗi easing CSS của token (dùng được cho WAAPI, GSAP 'CustomEase' hoặc style inline). */
export function easing(token: EasingToken): string {
  return readCssVar(EASING_VAR[token]) || EASING_FALLBACK[token];
}
