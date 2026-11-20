// Đồng hồ chung của quả cầu (T-110, PLAN gđ9 §4.4). Cầu hiện ở hai instance nối nhau (fallback Suspense của Hero rồi
// HeroScroll), nên góc xoay là trạng thái module: instance mới đọc tiếp góc của instance cũ thay vì quay về 0.
// T-113: thêm biên đạo theo mốc tải (`choreo.ts`) cũng ở module này: `signalGlobe` ghi mốc, `globeFrame` trả khung hiện tại.
import { advance, initialChoreo, normLon, type ChoreoEvents, type ChoreoState } from './choreo';
import { GLOBE_STAGE_ORDER, type GlobeState } from './progress';

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
  return normLon(lon);
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

// ——— Biên đạo (T-113) ———
let run: ChoreoState | null = null;
let runT = 0;
let events: ChoreoEvents = { style: false, tiles: false, ready: false };
let maxStage = 0;
/** Khung dài nhất được tính một lần (tab ẩn / IO dừng rAF rồi chạy lại ⇒ đi tiếp từ chỗ dừng, không nhảy cóc). */
const MAX_DT = 100;

/**
 * Ghi mốc tải (HeroGlobe gọi mỗi khi `state` đổi; gọi cả khi cầu chưa hiện để khung đầu tiên biết mốc). Mốc lùi
 * (vd. quay lại trang chủ: `loading` sau `ready`) ⇒ lượt tải mới: xoay lại từ góc đang đứng.
 */
export function signalGlobe(stage: GlobeState, t: number = now()): void {
  const i = GLOBE_STAGE_ORDER.indexOf(stage);
  if (i < 0) return; // failed: cầu bị gỡ, giữ nguyên
  if (i < maxStage) {
    if (run && run.phase !== 'spin') state = { t0: t, lon0: normLon(run.lon), speed: state?.speed ?? GLOBE_SPEED_FULL };
    run = null;
    events = { style: false, tiles: false, ready: false };
  }
  maxStage = i;
  events = { style: i >= 2, tiles: i >= 3, ready: i >= 4 };
}

/**
 * Khung hiện tại (tâm nhìn + pha + thời gian cảnh ghim). Khi còn `spin` thì góc lấy từ đồng hồ giải tích ở trên (nối hai
 * instance, đổi tốc độ không giật); từ `seek` trở đi thì tiến theo thời gian thật giữa hai lần gọi (cả hai instance cùng gọi
 * cũng không đếm trùng).
 */
export function globeFrame(t: number = now()): ChoreoState {
  if (!run || run.phase === 'spin') {
    const lon = globeLonAt(t);
    const speed = (state as ClockState).speed;
    run = run ? { ...run, lon, speed } : initialChoreo(lon, GLOBE_TILT_DEG, speed);
    runT = t;
    if (events.style || events.ready) run = advance(run, 0, events);
    return run;
  }
  const dt = Math.min(MAX_DT, Math.max(0, t - runT));
  runT = Math.max(runT, t);
  run = advance(run, dt, events);
  return run;
}

/** Chỉ cho test. */
export function resetGlobeClock(): void {
  state = null;
  onScreen = 0;
  run = null;
  runT = 0;
  events = { style: false, tiles: false, ready: false };
  maxStage = 0;
}
