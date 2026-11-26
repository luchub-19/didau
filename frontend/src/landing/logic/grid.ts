// Tra km/phút từ lưới Valhalla tính sẵn (PLAN §4.3, §4.4). Hàm thuần.
// Trong lưới: nội suy song tuyến 4 góc; góc null thì chia lại trọng số cho các góc còn lại.
// Ngoài lưới / cả 4 góc null: ước lượng chim bay × 1,3 + hệ số hiệu chỉnh từ chính lưới (`grid.estimate`).
import type { GridData, LngLat, TripResult } from './types';

export const DETOUR_FACTOR = 1.3;
const SNAP = 1e-9;
/** Sàn trọng số khi có góc null: điểm đúng một nút null vẫn cần trọng số > 0 ở các góc còn lại. */
const FLOOR = 1e-6;

/** Khoảng cách chim bay (km), haversine. */
export function haversineKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Ước lượng khi không có số lưới: `km = 2 · chim bay × 1,3`, `min = a · (chim bay × 1,3) + b`. */
export function estimateTrip(ll: LngLat, placeLl: LngLat, est: { a: number; b: number }): TripResult {
  const oneWay = haversineKm(ll, placeLl) * DETOUR_FACTOR;
  return { km: 2 * oneWay, min: Math.max(0, Math.round(est.a * oneWay + est.b)), source: 'estimate' };
}

function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < SNAP ? r : v;
}

/** km + phút đi–về từ `ll` (người xem) tới quán `placeId`. */
export function tripFrom(ll: LngLat, placeId: string, grid: GridData): TripResult {
  const p = grid.places.indexOf(placeId);
  if (p < 0) throw new Error(`unknown place id: ${placeId}`);
  const fallback = () => estimateTrip(ll, grid.placeLl[p], grid.estimate);

  const [west, south] = grid.bbox;
  const x = snap((ll[0] - west) / grid.step);
  const y = snap((ll[1] - south) / grid.step);
  if (!(x >= 0 && x <= grid.cols - 1 && y >= 0 && y <= grid.rows - 1)) return fallback();

  const c0 = Math.min(Math.floor(x), grid.cols - 2);
  const r0 = Math.min(Math.floor(y), grid.rows - 2);
  const tx = x - c0;
  const ty = y - r0;

  const corners: { km: number; min: number; w: number }[] = [];
  let nulls = 0;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]] as const) {
    const i = (r0 + dr) * grid.cols + (c0 + dc);
    const km = grid.km[p][i];
    const min = grid.min[p][i];
    const w = (dc ? tx : 1 - tx) * (dr ? ty : 1 - ty);
    if (km == null || min == null) {
      nulls++;
      continue;
    }
    corners.push({ km, min, w });
  }
  if (corners.length === 0) return fallback();

  const weights = corners.map((c) => (nulls ? Math.max(c.w, FLOOR) : c.w));
  const sum = weights.reduce((s, w) => s + w, 0);
  let km = 0;
  let min = 0;
  corners.forEach((c, i) => {
    km += (weights[i] / sum) * c.km;
    min += (weights[i] / sum) * c.min;
  });
  return { km, min: Math.round(min), source: 'grid' };
}
