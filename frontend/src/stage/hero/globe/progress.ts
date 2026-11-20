// Mốc tải của quả cầu (T-112, PLAN gđ9 §4.1). Hàm thuần, không đụng DOM: HeroGlobe vẽ vòng tiến độ bằng CSS transition
// (không rAF thứ hai, không polling), test kiểm số ở đây.

/**
 * `loading` = bắt đầu (fallback của Hero, chunk HeroScroll chưa về); `code` = HeroScroll đã mount; `style` = `map.on('load')`;
 * `tiles` = prewarm xong; `ready` = bản đồ `idle`; `failed` = bản đồ lỗi/quá chậm.
 */
export type GlobeState = 'loading' | 'code' | 'style' | 'tiles' | 'ready' | 'failed';

/** Mốc mà HeroMap báo lên (hai mốc giữa; `code` do HeroScroll mount, `ready` đã có `onReady`). */
export type MapStage = 'style' | 'tiles';

/** Thứ tự mốc: dùng để không bao giờ lùi mốc khi callback tới lệch thứ tự. */
export const GLOBE_STAGE_ORDER: readonly GlobeState[] = ['loading', 'code', 'style', 'tiles', 'ready'];

/** Phần vòng tiến độ ĐÃ ĐẠT khi tới mốc (PLAN §4.1). `loading` = 0. */
export const STAGE_PROGRESS: Record<Exclude<GlobeState, 'failed'>, number> = {
  loading: 0,
  code: 0.22,
  style: 0.48,
  tiles: 0.76,
  ready: 1,
};

/** Giữa hai mốc, vòng nhích tối đa 70 % khoảng tới mốc kế: không bao giờ tự đạt mốc kế. */
export const CREEP_SHARE = 0.7;
/** Thời gian nhích (ms): CSS ease-out thay cho `1 − e^(−t/1,8 s)` của mock (xấp xỉ đủ, không cần rAF). */
export const CREEP_MS = 5000;
/** Thời gian vòng nhảy từ chỗ đang nhích lên mốc mới. */
export const SNAP_MS = 450;

/** Mốc kế tiếp (không có sau `ready`). */
export function nextStage(state: GlobeState): GlobeState | null {
  const i = GLOBE_STAGE_ORDER.indexOf(state);
  return i < 0 || i >= GLOBE_STAGE_ORDER.length - 1 ? null : GLOBE_STAGE_ORDER[i + 1];
}

/**
 * Tiến độ (0..1) của vòng. `creeping=false`: đúng mốc vừa tới; `true`: đã nhích về phía mốc kế (≤ 70 % khoảng cách).
 * `failed` coi như 0 (vòng gỡ cùng cả cầu).
 */
export function ringProgress(state: GlobeState, creeping: boolean): number {
  if (state === 'failed') return 0;
  const base = STAGE_PROGRESS[state];
  const next = nextStage(state);
  if (!creeping || !next || next === 'failed') return base;
  return base + (STAGE_PROGRESS[next as Exclude<GlobeState, 'failed'>] - base) * CREEP_SHARE;
}

/** Khoá i18n của dòng trạng thái theo mốc. `failed` không có dòng (cầu bị gỡ). */
export type GlobeStatusKey = 'hero.globe.start' | 'hero.globe.code' | 'hero.globe.style' | 'hero.globe.tiles' | 'hero.globe.ready';
export function statusKey(state: GlobeState): GlobeStatusKey {
  return state === 'loading' || state === 'failed' ? 'hero.globe.start' : (`hero.globe.${state}` as GlobeStatusKey);
}

/** Mốc còn đang chờ bản đồ (cầu cần có mặt, tính cả giai đoạn trước khi hiện). */
export const isPendingStage = (s: GlobeState): boolean => s === 'loading' || s === 'code' || s === 'style' || s === 'tiles';

/** Gộp mốc mới vào mốc hiện tại: chỉ đi tới, `ready`/`failed` là cuối. */
export function advanceStage(current: GlobeState, incoming: MapStage): GlobeState {
  if (current === 'ready' || current === 'failed') return current;
  return GLOBE_STAGE_ORDER.indexOf(incoming) > GLOBE_STAGE_ORDER.indexOf(current) ? incoming : current;
}
