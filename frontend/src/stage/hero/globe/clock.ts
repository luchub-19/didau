// Đồng hồ chung của quả cầu (T-110, PLAN gđ9 §4.4). Cầu hiện ở hai instance nối nhau (fallback Suspense của Hero rồi
// HeroScroll), nên góc xoay là trạng thái module: instance mới đọc tiếp góc của instance cũ thay vì quay về 0.

/** Góc khởi đầu: tâm nhìn ở Phi/Âu (20°E), nghiêng 22° (như mock). */
export const GLOBE_START_LON = 20;
export const GLOBE_TILT_DEG = 22;
/** Độ/giây: 8 s một vòng (`full`) hoặc 20 s (`lite` / reduced-motion). */
export const GLOBE_SPEED_FULL = 45;
export const GLOBE_SPEED_SLOW = 18;

interface ClockState {
  /** Thời điểm mốc (ms, performance.now) và kinh độ tâm nhìn tại mốc. */
  t0: number;
  lon0: number;
  speed: number;
}

let state: ClockState | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Kinh độ tâm nhìn (độ, ∈ [−180, 180)) tại `t`. Cầu quay như Trái Đất thật: kinh độ tâm nhìn giảm dần. */
export function globeLonAt(t: number = now()): number {
  if (!state) state = { t0: t, lon0: GLOBE_START_LON, speed: GLOBE_SPEED_FULL };
  const lon = state.lon0 - (state.speed * Math.max(0, t - state.t0)) / 1000;
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Đổi tốc độ mà không giật: lấy góc hiện tại làm mốc mới. Lần đầu gọi thì đồng hồ bắt đầu tại `t`. */
export function setGlobeSpeed(speed: number, t: number = now()): void {
  if (state && state.speed === speed) return;
  const lon0 = state ? globeLonAt(t) : GLOBE_START_LON;
  state = { t0: t, lon0, speed };
}

// Số instance cầu đang hiện. Instance mới render TRƯỚC khi instance cũ gỡ (cùng một commit của Suspense), nên đọc được
// > 0 ⇒ hiện ngay, khỏi chờ 300 ms (nếu không cầu sẽ chớp mất lúc chunk HeroScroll về).
let onScreen = 0;

/** Đánh dấu một instance cầu đang hiện; trả hàm huỷ (gọi ở cleanup của effect). */
export function markGlobeOnScreen(): () => void {
  onScreen++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    onScreen = Math.max(0, onScreen - 1);
  };
}

export function isGlobeOnScreen(): boolean {
  return onScreen > 0;
}

/** Chỉ cho test. */
export function resetGlobeClock(): void {
  state = null;
  onScreen = 0;
}
