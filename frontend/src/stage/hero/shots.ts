// Kịch bản camera của hero trang chủ là DỮ LIỆU (PLAN §6, DESIGN §6). Không đụng WebGL:
// `cameraAt(progress)` là hàm thuần, test được bằng unit test.
import { cubicBezier } from '../../motion/bezier';
import stopsData from './stops.json';

export type LngLat = [number, number];

export interface HeroShot {
  id: 'overview' | 'market' | 'walkingStreet' | 'stops' | 'night';
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  /** Khoá i18n của chú thích cảnh. */
  captionKey: 'stage.tagline' | `stage.shots.${Exclude<HeroShot['id'], 'overview'>}`;
  /** Khoá i18n dòng phụ dưới chú thích (cảnh 2–4); cảnh 1 dùng stage.subline, cảnh 5 hiện lịch 3 chặng. */
  detailKey?: `hero.detail.${'market' | 'walkingStreet' | 'stops'}`;
  /** Trọng số độ dài cuộn của cảnh (tương đối). */
  durationWeight: number;
}

export interface HeroStop {
  id: 'eat' | 'coffee' | 'after';
  externalId: string;
  /** Tên quán giữ nguyên dữ liệu OSM (không dịch). */
  name: string;
  address: string;
  lat: number;
  lng: number;
  startMinute: number;
  endMinute: number;
  /** Nhãn nằm phía nào của ghim (theo bearing cảnh 4–5) để 3 nhãn không đè nhau. */
  labelSide: 'top' | 'left' | 'right';
}

export interface Camera {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
}

/** 3 chặng một buổi tối có thật trong `pois_hcm.json.gz`: chỗ ăn → cà phê → chỗ đi tiếp. */
export const HERO_STOPS = stopsData.stops as HeroStop[];

/** Nhãn i18n của từng chặng. */
export const STOP_LABEL_KEY = {
  eat: 'stage.stops.eat',
  coffee: 'stage.stops.coffee',
  after: 'stage.stops.after',
} as const satisfies Record<HeroStop['id'], string>;

const stopsCenter: LngLat = [
  HERO_STOPS.reduce((s, p) => s + p.lng, 0) / HERO_STOPS.length,
  HERO_STOPS.reduce((s, p) => s + p.lat, 0) / HERO_STOPS.length,
];

// Toạ độ: 1 toàn cảnh Q1, 2 Chợ Bến Thành, 3 Phố đi bộ Nguyễn Huệ, 4–5 quanh 3 chặng.
// Cảnh 5 dùng zoom 15.6 thay vì 14 của PLAN: ở zoom 14 ba chặng chỉ cách nhau ~30–50px, đường nối không đọc được.
// Bearing cảnh 4–5 ≈ −60°: cà phê và đi tiếp nằm ngang hai bên, chỗ ăn ở trên (khớp `labelSide`).
export const HERO_SHOTS: readonly HeroShot[] = [
  { id: 'overview', center: [106.7005, 10.7745], zoom: 13, pitch: 0, bearing: 0, captionKey: 'stage.tagline', durationWeight: 1 },
  { id: 'market', center: [106.698, 10.7725], zoom: 16, pitch: 60, bearing: -20, captionKey: 'stage.shots.market', detailKey: 'hero.detail.market', durationWeight: 1 },
  { id: 'walkingStreet', center: [106.7035, 10.7745], zoom: 16.5, pitch: 60, bearing: 30, captionKey: 'stage.shots.walkingStreet', detailKey: 'hero.detail.walkingStreet', durationWeight: 1 },
  { id: 'stops', center: stopsCenter, zoom: 16.2, pitch: 65, bearing: -55, captionKey: 'stage.shots.stops', detailKey: 'hero.detail.stops', durationWeight: 1.2 },
  { id: 'night', center: stopsCenter, zoom: 15.6, pitch: 45, bearing: -65, captionKey: 'stage.shots.night', durationWeight: 0.8 },
];

/** Phần đầu mỗi đoạn cảnh mà camera đứng yên ở cảnh đó (để kịp đọc chữ) trước khi bay sang cảnh sau.
 *  Giữ ngắn: đứng lâu thì phần bay bị dồn lại, cuộn thấy "đứng – lao – đứng". */
export const SHOT_HOLD = 0.15;

// Đường cong cho camera bám cuộn: mềm hơn --ease-camera (tốc độ đỉnh ~1,6× trung bình thay vì ~2,9×),
// vì tay người cuộn đã là "easing"; --ease-camera vẫn dùng cho flyTo ở mức 'lite'.
const ease = cubicBezier(0.45, 0, 0.55, 1);

/** Mốc bắt đầu (0..1) của từng cảnh trên trục tiến độ cuộn, theo `durationWeight`. */
export function shotStarts(shots: readonly HeroShot[] = HERO_SHOTS): number[] {
  const total = shots.reduce((s, x) => s + x.durationWeight, 0);
  const starts: number[] = [];
  let acc = 0;
  for (const s of shots) {
    starts.push(acc / total);
    acc += s.durationWeight;
  }
  return starts;
}

function clamp01(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** Cảnh đang hiện ở tiến độ `progress` (đã kẹp vào 0..1). */
export function shotIndexAt(progress: number, shots: readonly HeroShot[] = HERO_SHOTS): number {
  const p = clamp01(progress);
  const starts = shotStarts(shots);
  let idx = 0;
  for (let i = 0; i < starts.length; i++) if (p >= starts[i]) idx = i;
  return idx;
}

/**
 * Tiến độ dịch tâm khi zoom đổi từ z0 sang z0+dz theo t tuyến tính: chọn sao cho tâm trôi trên màn hình
 * với tốc độ đều (tốc độ pixel ∝ 2^zoom nên tâm phải đi nhanh lúc zoom thấp, chậm lúc zoom cao).
 */
export function panProgress(t: number, dz: number): number {
  if (Math.abs(dz) < 1e-6) return t;
  return (1 - Math.pow(2, -dz * t)) / (1 - Math.pow(2, -dz));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Nội suy góc theo đường ngắn nhất (−170° → 170° đi qua 180°, không quay vòng). */
function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

/** Camera tại tiến độ cuộn `progress` (0 = đầu phim, 1 = cảnh cuối). Ngoài khoảng thì kẹp. */
export function cameraAt(progress: number, shots: readonly HeroShot[] = HERO_SHOTS): Camera {
  const p = clamp01(progress);
  const starts = shotStarts(shots);
  const i = shotIndexAt(p, shots);
  const from = shots[i];
  const to = shots[i + 1];
  if (!to) return { center: [...from.center], zoom: from.zoom, pitch: from.pitch, bearing: from.bearing };

  const span = starts[i + 1] - starts[i];
  const local = (p - starts[i]) / span;
  const t = ease(Math.max(0, (local - SHOT_HOLD) / (1 - SHOT_HOLD)));
  const u = panProgress(t, to.zoom - from.zoom);
  return {
    center: [lerp(from.center[0], to.center[0], u), lerp(from.center[1], to.center[1], u)],
    zoom: lerp(from.zoom, to.zoom, t),
    pitch: lerp(from.pitch, to.pitch, t),
    bearing: lerpAngle(from.bearing, to.bearing, t),
  };
}

/** Đường nối 3 chặng cho cảnh 5 (GeoJSON LineString). */
export function stopsRoute(stops: readonly HeroStop[] = HERO_STOPS): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: stops.map((s) => [s.lng, s.lat]) },
  };
}
