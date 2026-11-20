// Biên đạo của quả cầu theo mốc tải (T-113, PLAN gđ9 §4.1–§4.3). Hàm thuần, không đụng DOM/canvas ⇒ test được.
// `spin` (xoay đều) → `style` ⇒ `seek` (giảm tốc, quay về TP.HCM) → `parked` → `tiles` ⇒ `pin` (ghim nảy, 4 chấm bạn bè bay
// về, gợn sóng lặp) → `ready` ⇒ `done` (hết chuyện, HeroGlobe cho cầu rời sân khấu). Đồng hồ chung (`clock.ts`) giữ một
// trạng thái này cho cả hai instance cầu.
import { GLOBE_HCM } from './projection';

export type ChoreoPhase = 'spin' | 'seek' | 'parked' | 'pin' | 'done';

/** Mốc đã tới (gộp dồn: `ready` kéo theo `tiles` kéo theo `style`, xem `advance`). */
export interface ChoreoEvents {
  style: boolean;
  tiles: boolean;
  ready: boolean;
}

/** Một lượt quay về: nội suy Hermite theo u = t/dur ∈ [0, 1], vận tốc đầu = vận tốc lúc bắt đầu, vận tốc cuối = 0. */
export interface Seek {
  fromLon: number;
  fromLat: number;
  /** Quãng quay (độ, ≥ 0), luôn theo chiều kinh độ tâm nhìn giảm (như Trái Đất quay). */
  dist: number;
  durMs: number;
  /** Tiếp tuyến Hermite ở u = 0 (độ trên một đơn vị u) = vận tốc đầu (độ/s) × dur (s). */
  m0: number;
  p: number;
}

export interface ChoreoState {
  phase: ChoreoPhase;
  /** Kinh độ tâm nhìn (độ, không chuẩn hoá; vẽ thì dùng `normLon`) và vĩ độ tâm nhìn (= độ nghiêng). */
  lon: number;
  lat: number;
  /** Tốc độ xoay đều (độ/s, dương = kinh độ tâm nhìn giảm). */
  speed: number;
  seek: Seek | null;
  /** Thời gian (ms) trong cảnh ghim; tăng ×`RUSH` khi bản đồ đã xong. */
  pinT: number;
  /** false = nhánh mạng rất nhanh: không ghim nảy, không chấm bạn bè, không gợn sóng. */
  friends: boolean;
  /** Bản đồ đã `ready`: phần chuyện còn lại chạy nhanh. */
  rush: boolean;
}

/** Điểm dừng: TP.HCM (106,7°E / 10,8°N). */
export const GLOBE_PARK = { lon: GLOBE_HCM.lon, lat: GLOBE_HCM.lat } as const;
/** Quãng quay về tối thiểu (độ) và khung thời lượng `clamp(0,8 + dist/360, 1,1, 2,0)` s. */
export const SEEK_MIN_DIST = 100;
export const SEEK_MIN_MS = 1100;
export const SEEK_MAX_MS = 2000;
/** Nhánh mạng rất nhanh (PLAN §4.2): `ready` tới khi chưa quay về xong ⇒ phần còn lại ≤ 500 ms. */
export const FAST_SEEK_MS = 500;
/** Hệ số tăng tốc phần chuyện còn lại sau `ready` (mock). */
export const RUSH = 2.6;
/** Cảnh ghim (ms): ghim nảy 0–350, 4 chấm bay 650 ms mỗi chấm, chấm đầu ở 150, mỗi chấm sau lệch 90 ⇒ xong 1 070 → 1 150. */
export const PIN_POP_MS = 350;
export const FRIEND_START_MS = 150;
export const FRIEND_STAGGER_MS = 90;
export const FRIEND_FLY_MS = 650;
export const PIN_TOTAL = 1150;
/** Vệt chấm bạn bè mờ dần 1 100 → 1 500 ms. */
export const TRAIL_FADE_FROM = 1100;
export const TRAIL_FADE_MS = 400;
/** Gợn sóng: 2 vòng lệch nửa chu kỳ, chu kỳ 1,6 s. */
export const RIPPLE_MS = 1600;

/** Vị trí xuất phát của 4 chấm bạn bè: độ lệch cố định theo bán kính cầu (hình minh hoạ, KHÔNG phải dữ liệu phòng). */
export const FRIENDS: readonly (readonly [number, number])[] = [
  [-0.62, -0.5],
  [0.66, -0.36],
  [-0.5, 0.52],
  [0.58, 0.5],
];

export const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Kinh độ về [−180, 180). */
export const normLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

export function initialChoreo(lon: number, lat: number, speed: number): ChoreoState {
  return { phase: 'spin', lon, lat, speed, seek: null, pinT: 0, friends: true, rush: false };
}

/** Quãng quay (độ) từ `lon` tới TP.HCM theo chiều kinh độ giảm; dưới `minDist` thì thêm một vòng. */
export function seekDistance(lon: number, minDist: number = SEEK_MIN_DIST): number {
  const d = (((lon - GLOBE_PARK.lon) % 360) + 360) % 360;
  return d < minDist ? d + 360 : d;
}

export const seekDurationMs = (dist: number): number => Math.min(SEEK_MAX_MS, Math.max(SEEK_MIN_MS, 800 + (dist / 360) * 1000));

// Hermite: lon(u) = from − (h10·m0 + h01·dist). Với dist ≥ m0/2 thì đạo hàm ≥ 0 trên [0, 1] ⇒ không bao giờ quay ngược.
const h10 = (u: number) => u * u * u - 2 * u * u + u;
const h01 = (u: number) => -2 * u * u * u + 3 * u * u;
const dh10 = (u: number) => 3 * u * u - 4 * u + 1;
const dh01 = (u: number) => 6 * u - 6 * u * u;

/**
 * Lập lượt quay về từ (lon, lat) với vận tốc đầu `v` (độ/s). Thường: quãng ≥ 100°, thời lượng theo `seekDurationMs`.
 * `fast`: quãng không thêm vòng, thời lượng ≤ 500 ms và ≤ 2·dist/v (điều kiện để không quay ngược).
 */
export function planSeek(lon: number, lat: number, v: number, fast: boolean, dist?: number): Seek {
  const d = dist ?? seekDistance(lon, fast ? 0 : SEEK_MIN_DIST);
  const durMs = fast ? Math.min(FAST_SEEK_MS, v > 0 ? (2000 * d) / v : FAST_SEEK_MS) : seekDurationMs(d);
  return { fromLon: lon, fromLat: lat, dist: d, durMs, m0: (v * durMs) / 1000, p: 0 };
}

/** Quãng đã quay (độ) của lượt quay về tại tiến độ p. */
export const seekTravel = (s: Seek, p: number): number => h10(p) * s.m0 + h01(p) * s.dist;

/** Vị trí tâm nhìn tại tiến độ p. */
export function seekAt(s: Seek, p: number): { lon: number; lat: number } {
  return { lon: s.fromLon - seekTravel(s, p), lat: s.fromLat + (GLOBE_PARK.lat - s.fromLat) * easeInOut(p) };
}

/** Vận tốc (độ/s, dương = kinh độ giảm) tại tiến độ p. */
export const seekVelocity = (s: Seek, p: number): number =>
  s.durMs > 0 ? ((dh10(p) * s.m0 + dh01(p) * s.dist) * 1000) / s.durMs : 0;

/** Mốc đã tới, gộp dồn (bản đồ `ready` ⇒ chắc chắn đã có kiểu và tiles). */
const normEvents = (ev: ChoreoEvents): ChoreoEvents => ({
  ready: ev.ready,
  tiles: ev.tiles || ev.ready,
  style: ev.style || ev.tiles || ev.ready,
});

/** Vào chỗ dừng: đặt đúng TP.HCM (bỏ sai số tích luỹ), giữ kinh độ không chuẩn hoá liền với khung trước (không nhảy 360°). */
const park = (s: ChoreoState): ChoreoState => ({
  ...s,
  phase: 'parked',
  lon: s.lon - normLon(s.lon - GLOBE_PARK.lon),
  lat: GLOBE_PARK.lat,
  seek: null,
});

/**
 * Tiến trạng thái thêm `dt` ms với các mốc `ev`. Mỗi lần gọi đổi tối đa một pha (khung sau đi tiếp), trừ khi `dt` = 0 thì
 * chỉ xét chuyển pha. Không đổi object đầu vào.
 */
export function advance(state: ChoreoState, dt: number, events: ChoreoEvents): ChoreoState {
  const ev = normEvents(events);
  const s: ChoreoState = { ...state };
  switch (s.phase) {
    case 'spin': {
      s.lon -= (s.speed * dt) / 1000;
      if (!ev.style) return s;
      // Mạng rất nhanh: `ready` tới trước khi kịp quay về ⇒ quay nhanh ≤ 500 ms, bỏ chấm bạn bè.
      return { ...s, phase: 'seek', seek: planSeek(s.lon, s.lat, s.speed, ev.ready), friends: !ev.ready, rush: ev.ready };
    }
    case 'seek': {
      let seek = s.seek as Seek;
      if (ev.ready && !s.rush) {
        s.rush = true;
        s.friends = false;
        // Còn quá 500 ms thì lập lại từ chỗ đang đứng, giữ vận tốc hiện tại (không khựng), quãng còn lại đúng như cũ.
        if ((1 - seek.p) * seek.durMs > FAST_SEEK_MS) {
          const v = seekVelocity(seek, seek.p);
          seek = planSeek(s.lon, s.lat, v, true, Math.max(0, seek.dist - seekTravel(seek, seek.p)));
        }
      }
      const p = seek.durMs > 0 ? clamp01(seek.p + dt / seek.durMs) : 1;
      if (p >= 1) return park(s);
      const at = seekAt(seek, p);
      return { ...s, seek: { ...seek, p }, lon: at.lon, lat: at.lat };
    }
    case 'parked': {
      if (!s.friends && ev.ready) return { ...s, phase: 'done', pinT: PIN_TOTAL };
      if (!ev.tiles) return s;
      return { ...s, phase: 'pin', pinT: 0, rush: ev.ready };
    }
    case 'pin': {
      const rush = s.rush || ev.ready;
      const pinT = s.pinT + dt * (rush ? RUSH : 1);
      if (ev.ready && pinT >= PIN_TOTAL) return { ...s, phase: 'done', pinT, rush };
      return { ...s, pinT, rush };
    }
    case 'done':
      // pinT vẫn tăng để vệt chấm bạn bè mờ hết trong lúc cầu rời sân khấu.
      return { ...s, pinT: s.pinT + dt * RUSH };
  }
}

/** Khung tĩnh (vẽ lại cũng y hệt) ⇒ GlobeCanvas bỏ vẽ, chỉ tiến trạng thái. */
export function isStill(s: ChoreoState, slow: boolean): boolean {
  if (s.phase === 'parked') return true;
  if (s.phase === 'done' && !s.friends) return true;
  if (s.phase === 'pin' || s.phase === 'done') {
    // lite/reduced không có gợn sóng và vệt: sau cảnh ghim là đứng yên. full: còn gợn sóng (pin) / vệt đang mờ (done).
    if (slow) return s.pinT >= PIN_TOTAL;
    return s.phase === 'done' && s.pinT >= TRAIL_FADE_FROM + TRAIL_FADE_MS;
  }
  return false;
}

/** Hình ghim theo thời gian cảnh ghim: độ nảy (px ở R bất kỳ), hệ số chiều cao 0..1, nhịp phồng khi chấm bạn bè tới. */
export function pinPose(pinT: number, slow: boolean): { bounce: number; lift: number; pulse: number } {
  if (slow) return { bounce: 0, lift: 1, pulse: 1 };
  const u = clamp01(pinT / PIN_POP_MS);
  const arrive = clamp01((pinT - 800) / 350);
  return { bounce: Math.sin(u * Math.PI) * (1 - u) * 10, lift: easeOutCubic(u), pulse: 1 + 0.35 * Math.sin(arrive * Math.PI) };
}

/** Chấm bạn bè thứ i: u = tiến độ bay (0 = chưa bay, 1 = đã tới ghim), e = vị trí trên cung sau easing. */
export function friendPose(i: number, pinT: number, slow: boolean): { u: number; e: number } {
  const u = clamp01((pinT - FRIEND_START_MS - i * FRIEND_STAGGER_MS) / FRIEND_FLY_MS);
  return { u, e: slow ? 1 : easeInOut(u) };
}

export const trailAlpha = (pinT: number): number => 0.85 * (1 - clamp01((pinT - TRAIL_FADE_FROM) / TRAIL_FADE_MS));

/** Pha (0..1) của 2 vòng gợn sóng. */
export const ripplePhases = (pinT: number): [number, number] => [
  (pinT % RIPPLE_MS) / RIPPLE_MS,
  ((pinT + RIPPLE_MS / 2) % RIPPLE_MS) / RIPPLE_MS,
];
