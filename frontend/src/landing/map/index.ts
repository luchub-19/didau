// Module bản đồ chung của landing (gđ11, PLAN §4.6; T-125 tạo, T-128 dùng lại cho bản đồ hoà phiếu).
// - `loadMap()` nạp maplibre-gl LƯỜI (chunk riêng ./maplibre.ts), chunk chính trang chủ không chứa thư viện bản đồ.
// - `createLandingMap()` dựng map với style app (`MAP_STYLE_URL`), lỗi style trước khi tải xong → lùi
//   `FALLBACK_MAP_STYLE` đúng một lần; `tidyStyle` ẩn poi/transit/bus/rail/aeroway/housenum.
// - `placePin()` gắn marker HTML (bọc một lớp để class của MapLibre không bị ghi đè — bẫy mock v3).
// - `snapshotAndRelease()` chờ `idle` → chép canvas WebGL sang canvas 2D + giữ toạ độ ghim đã `project` → `remove()`
//   (remove gọi WEBGL_lose_context): sau hero không còn WebGL context nào sống (tối đa 1 context cả trang).
// - `fitProject()` thuần: chiếu Web Mercator như `fitBounds`, dùng khi bản đồ hỏng hẳn (nền giấy, ghim vẫn đúng chỗ).
import type { LngLatBoundsLike, Map as MlMap, MapOptions, Marker, StyleSpecification } from 'maplibre-gl';
import { FALLBACK_MAP_STYLE, MAP_STYLE_URL } from '../../config';
import type { LngLat } from '../logic/types';

export type MapLib = typeof import('./maplibre').default;

let pending: Promise<MapLib> | null = null;

/** Nạp maplibre-gl (một lần, dùng chung). Lỗi mạng thì lần gọi sau thử lại. */
export function loadMap(): Promise<MapLib> {
  if (!pending) {
    pending = import('./maplibre')
      .then((m) => m.default)
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Lớp nền bị ẩn trên bản đồ landing: chỉ để lại đường, nước, chữ tên đường/quận cho ghim quán nổi lên. */
export const HIDDEN_LAYER_RE = /poi|transit|bus|rail|aeroway|housenum/i;

type StyleHost = Pick<MlMap, 'getStyle' | 'setLayoutProperty'>;

/** Ẩn các lớp khớp `HIDDEN_LAYER_RE`. Trả về số lớp đã ẩn (để test/đo). */
export function tidyStyle(map: StyleHost): number {
  let n = 0;
  for (const layer of map.getStyle()?.layers ?? []) {
    if (HIDDEN_LAYER_RE.test(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
      n += 1;
    }
  }
  return n;
}

export interface LandingMapHandle {
  map: MlMap;
  /** Đã phải lùi sang style dự phòng (raster OSM). */
  usedFallback: () => boolean;
}

export interface CreateLandingMapOptions extends Omit<MapOptions, 'container' | 'style'> {
  container: HTMLElement;
  /** Gọi khi bản đồ không dựng được cả với style dự phòng. */
  onFail?: (reason: string) => void;
}

/**
 * Dựng map với style của app; `error` trước khi style tải xong → `setStyle(FALLBACK_MAP_STYLE)` một lần, lần nữa → `onFail`.
 * Ném lỗi (không có WebGL…) thì gọi `onFail` và trả `null`.
 */
export function createLandingMap(ml: MapLib, { container, onFail, ...rest }: CreateLandingMapOptions): LandingMapHandle | null {
  let map: MlMap;
  try {
    map = new ml.Map({ container, style: MAP_STYLE_URL, ...rest });
  } catch (err) {
    onFail?.(String(err));
    return null;
  }
  let fellBack = false;
  let failed = false;
  map.on('error', (e: { error?: { message?: string } }) => {
    if (map.isStyleLoaded() || failed) return;
    if (!fellBack) {
      fellBack = true;
      map.setStyle(FALLBACK_MAP_STYLE as StyleSpecification);
      return;
    }
    failed = true;
    onFail?.(e.error?.message ?? 'style error');
  });
  map.on('style.load', () => tidyStyle(map));
  liveMaps.add(map);
  map.once('remove', () => {
    liveMaps.delete(map);
    if (liveMaps.size === 0) waiters.splice(0).forEach((f) => f());
  });
  return { map, usedFallback: () => fellBack };
}

// Cổng "một context WebGL": map đang sống (chưa `remove`). Bản đồ hoà phiếu chờ bản đồ hero nhả xong rồi mới dựng, kể cả khi
// người xem cuộn thẳng xuống ngay sau khi tải (T-130 đo: không có cổng thì 2 context cùng sống ~1,6 s).
const liveMaps = new Set<MlMap>();
const waiters: Array<() => void> = [];

/** Giải quyết khi không còn map nào sống; quá `maxWaitMs` (hero kẹt, chụp tối đa 15 s) thì cứ dựng — thà 2 context còn hơn mất bản đồ. */
export function whenMapsReleased(maxWaitMs = 20000): Promise<void> {
  if (liveMaps.size === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, maxWaitMs);
    function done(): void {
      clearTimeout(timer);
      const i = waiters.indexOf(done);
      if (i >= 0) waiters.splice(i, 1);
      resolve();
    }
    waiters.push(done);
  });
}

/** Gắn marker HTML. `el` được bọc trong một div riêng: MapLibre ghi class lên div bọc, class của ghim do mình giữ. */
export function placePin(ml: MapLib, map: MlMap, el: HTMLElement, ll: LngLat, anchor: 'center' | 'bottom' = 'center'): Marker {
  const wrap = document.createElement('div');
  wrap.appendChild(el);
  return new ml.Marker({ element: wrap, anchor }).setLngLat([ll[0], ll[1]]).addTo(map);
}

/** Toạ độ điểm (px, góc trên trái của khung) sau khi chiếu. */
export type PointMap = Record<string, readonly [number, number]>;

export interface Snapshot {
  /** Kích thước CSS của khung bản đồ lúc chụp. */
  width: number;
  height: number;
  points: PointMap;
  /** false = không chép được ảnh (canvas bẩn, lỗi 2D): ghim vẫn dùng được trên nền giấy. */
  drawn: boolean;
  /** true = hết giờ chờ `idle` (ảnh có thể thiếu ô). */
  timedOut: boolean;
}

export interface SnapshotOptions {
  /** Chờ `idle` tối đa bấy nhiêu ms rồi chụp cái đang có (mạng chậm vẫn trả context). */
  timeoutMs?: number;
}

export const SNAPSHOT_TIMEOUT_MS = 15000;

/**
 * Khi map `idle` (style + ô đã vẽ xong): chép canvas WebGL vào `target` (canvas 2D, không phải WebGL), chiếu `points`,
 * rồi `map.remove()`. Map phải tạo với `preserveDrawingBuffer: true` để drawImage đọc được khung đã vẽ.
 * Canvas 2D (không phải <img>) để ảnh chụp không thành ứng viên LCP: LCP phải là tiêu đề hero (PLAN §4.6).
 */
export function snapshotAndRelease(
  map: MlMap,
  target: HTMLCanvasElement,
  points: Record<string, LngLat>,
  { timeoutMs = SNAPSHOT_TIMEOUT_MS }: SnapshotOptions = {},
): Promise<Snapshot> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const container = map.getContainer();
      const width = container.clientWidth;
      const height = container.clientHeight;
      const src = map.getCanvas();
      let drawn = false;
      try {
        target.width = src.width;
        target.height = src.height;
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.drawImage(src, 0, 0);
          drawn = true;
        }
      } catch {
        drawn = false;
      }
      const out: Record<string, readonly [number, number]> = {};
      for (const [id, ll] of Object.entries(points)) {
        const p = map.project([ll[0], ll[1]]);
        out[id] = [p.x, p.y];
      }
      map.remove();
      resolve({ width, height, points: out, drawn, timedOut });
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    // Không tin `loaded()` lúc vừa `load`: ô của khung nhìn chưa được yêu cầu nên nó vẫn báo xong → ảnh trống.
    // Ép vẽ một khung rồi chờ `idle` (phát khi style + mọi ô đã vẽ, không còn chuyển cảnh).
    map.once('idle', () => finish(false));
    map.triggerRepaint();
  });
}

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Web Mercator, đơn vị "thế giới" 0…1. */
export function mercator(ll: LngLat): [number, number] {
  const x = (ll[0] + 180) / 360;
  const phi = (ll[1] * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2;
  return [x, y];
}

/**
 * Chiếu `points` vào khung `width × height` như `fitBounds(bounds, {padding})` (không xoay, không nghiêng):
 * tỉ lệ lớn nhất để bounds nằm trong vùng trừ padding, tâm bounds ở tâm vùng đó.
 */
export function fitProject(
  points: Record<string, LngLat>,
  bounds: readonly [LngLat, LngLat],
  width: number,
  height: number,
  pad: Padding,
): PointMap {
  const [ax, ay] = mercator(bounds[0]);
  const [bx, by] = mercator(bounds[1]);
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  const innerW = Math.max(1, width - pad.left - pad.right);
  const innerH = Math.max(1, height - pad.top - pad.bottom);
  const scale = Math.min(innerW / Math.max(maxX - minX, 1e-12), innerH / Math.max(maxY - minY, 1e-12));
  const cx = pad.left + innerW / 2;
  const cy = pad.top + innerH / 2;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const out: Record<string, readonly [number, number]> = {};
  for (const [id, ll] of Object.entries(points)) {
    const [x, y] = mercator(ll);
    out[id] = [cx + (x - mx) * scale, cy + (y - my) * scale];
  }
  return out;
}

/** Khung nhìn bản đồ mini ở hero: ôm 3 quán của ca demo (mock v3 `fitBounds`). */
export const HERO_MAP_BOUNDS: readonly [LngLat, LngLat] = [
  [106.7, 10.722],
  [106.728, 10.835],
];
// Đáy chừa chỗ cho chip "Trung tâm nhóm" (cao ~30px, cách đáy 12px), đỉnh chừa toast hiện diện
export const HERO_MAP_PADDING: Padding = { top: 64, bottom: 92, left: 36, right: 36 };

/** Tuỳ chọn map hero: không tương tác, không attribution control (ghi công nằm trong khung + footer). */
export function heroMapOptions(): Omit<MapOptions, 'container' | 'style'> {
  return {
    bounds: HERO_MAP_BOUNDS as unknown as LngLatBoundsLike,
    fitBoundsOptions: { padding: HERO_MAP_PADDING },
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    preserveDrawingBuffer: true,
  };
}
