// Kiểu dùng chung của logic thuần landing (gđ11, T-123). Không React, không maplibre, không DOM.
// Khớp schema PLAN §4.3: `data/demoCase.json` + `data/grid.json` (T-122 sinh bằng scripts/build_landing_data.py).
import type { CastId, DistrictCode } from '../cast';

/** [kinh độ, vĩ độ] — cùng thứ tự với GeoJSON/MapLibre. */
export type LngLat = readonly [number, number];

export type PlaceId = string;

/** Người xem được gọi là 'you' trong dữ liệu logic; nhãn hiển thị lấy ở i18n `landing.you`. */
export type WhoId = CastId | 'you';

/** Một lượt đi + về, đơn vị km và phút. */
export interface TripValue {
  km: number;
  min: number;
}

export type TripSource = 'grid' | 'estimate';

export interface TripResult extends TripValue {
  source: TripSource;
}

export interface DemoMember {
  id: CastId;
  district: DistrictCode;
  /** Toạ độ quận đại diện, KHÔNG phải nhà (CR-11). */
  ll: LngLat;
}

export interface DemoPlace {
  id: PlaceId;
  name: string;
  short: string;
  address: string;
  ll: LngLat;
}

export interface OmpExpectedRow {
  placeId: PlaceId;
  psi: number;
  maxKm: number;
  sumKm: number;
}

export interface SumExpectedRow {
  placeId: PlaceId;
  sumKm: number;
}

/** `data/demoCase.json`. Mọi km/phút là đi + về (khứ hồi). */
export interface DemoCaseData {
  /** true = fixture tạm của T-123, chưa phải đo Valhalla (T-122 bỏ cờ này). */
  provisional?: boolean;
  measuredAt: string;
  source: string;
  members: DemoMember[];
  places: DemoPlace[];
  /** trips[memberId][placeId]. */
  trips: Record<string, Record<PlaceId, TripValue>>;
  totals: Record<PlaceId, number>;
  /** Kết quả `ordered_median` của backend trên đúng km ở trên (λ=1, k=2), đã xếp tốt → kém. */
  expected: { omp: OmpExpectedRow[]; sum: SumExpectedRow[] };
}

/**
 * `data/grid.json`: lưới đều bước `step` độ. Điểm thứ `row * cols + col`; hàng 0 = vĩ độ nhỏ nhất (south),
 * cột 0 = kinh độ nhỏ nhất (west). `km[p][i]`/`min[p][i]` là đi + về tới quán `places[p]`, `null` nếu Valhalla không tới.
 * Ước lượng khi ngoài lưới: `min = a · (chim bay × 1,3 một chiều) + b`, `km = 2 · chim bay × 1,3`.
 */
export interface GridData {
  provisional?: boolean;
  /** [west, south, east, north]. */
  bbox: readonly [number, number, number, number];
  step: number;
  rows: number;
  cols: number;
  places: PlaceId[];
  /** Toạ độ quán, song song với `places` (cần cho đường lùi ước lượng). */
  placeLl: LngLat[];
  km: (number | null)[][];
  min: (number | null)[][];
  estimate: { a: number; b: number };
}
