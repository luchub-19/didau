// Cảnh "bạn là người thứ 5" (PLAN §4.1 phần 5): gộp 4 bạn của ca demo + (tuỳ chọn) điểm của người xem,
// xếp quán bằng OMP thật (hoặc tổng km), sinh KHOÁ câu kết luận (chữ nằm ở i18n, không sinh chữ ở đây).
// Xếp hạng dùng km (đúng app); số phút hiển thị lấy từ dữ liệu.
import type { DistrictCode } from '../cast';
import { tripFrom } from './grid';
import { rankByOmp, rankBySum, type RankedRow } from './omp';
import type { DemoCaseData, GridData, LngLat, PlaceId, TripResult, WhoId } from './types';

/** 'far' = "Ưu tiên người xa nhất" (OMP λ=1, k=2); 'sum' = "Cộng tổng km". */
export type ExploreMode = 'far' | 'sum';

/** Toạ độ đại diện của 12 chip quận (tâm quận, không phải nhà ai). */
export const DISTRICT_CENTERS: Record<DistrictCode, LngLat> = {
  q1: [106.7004, 10.7757],
  q7: [106.7215, 10.734],
  gv: [106.6653, 10.8387],
  btn: [106.6037, 10.7653],
  td: [106.7537, 10.8494],
  nb: [106.7046, 10.6955],
  bt: [106.7091, 10.8105],
  q12: [106.6413, 10.8672],
  pn: [106.68, 10.799],
  tb: [106.6527, 10.8015],
  q3: [106.6844, 10.7843],
  q5: [106.6634, 10.754],
};

export type SentenceKey = 'waiting' | 'farYou' | 'farOther' | 'sum';

export interface Sentence {
  key: SentenceKey;
  /** Biến cho chuỗi i18n; `who` là tên nhân vật hoặc 'you'. */
  vars: { place: string; who?: WhoId; min?: number; yourMin?: number; km?: number };
  /** Có khi hai chế độ đề xuất khác quán (và chưa ở trạng thái `waiting`). */
  diff?: { place: string; who: WhoId; min: number };
}

export interface ExploreRow {
  placeId: PlaceId;
  /** Phút của người xa nhất (đi + về). */
  far: number;
  farWho: WhoId;
  /** Tổng km cả nhóm (có người xem nếu có). */
  total: number;
  yourMin: number | null;
}

export interface ExploreResult {
  rows: ExploreRow[];
  pickId: PlaceId;
  /** Quán mà chế độ còn lại sẽ chọn. */
  otherPickId: PlaceId;
  sentence: Sentence;
  /** true nếu số của người xem là ước lượng (ngoài lưới) ở bất kỳ quán nào. */
  estimated: boolean;
  /** Bảng xếp hạng OMP/tổng km của chế độ đang chọn (đã xếp tốt → kém). */
  ranking: RankedRow[];
}

export function farOfPlace(demo: DemoCaseData, placeId: PlaceId): { far: number; farWho: WhoId } {
  let far = -1;
  let farWho: WhoId = demo.members[0].id;
  for (const m of demo.members) {
    const min = demo.trips[m.id][placeId].min;
    if (min > far) {
      far = min;
      farWho = m.id;
    }
  }
  return { far, farWho };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function evaluate(demo: DemoCaseData, grid: GridData, you: LngLat | null | undefined, mode: ExploreMode): ExploreResult {
  const yourTrips = new Map<PlaceId, TripResult>();
  if (you) for (const p of demo.places) yourTrips.set(p.id, tripFrom(you, p.id, grid));

  const rows: ExploreRow[] = demo.places.map((p) => {
    let { far, farWho } = farOfPlace(demo, p.id);
    const y = yourTrips.get(p.id);
    if (y && y.min > far) {
      far = y.min;
      farWho = 'you';
    }
    const total = demo.members.reduce((s, m) => s + demo.trips[m.id][p.id].km, 0) + (y ? y.km : 0);
    return { placeId: p.id, far, farWho, total, yourMin: y ? y.min : null };
  });

  const inputs = demo.places.map((p) => ({
    id: p.id,
    km: [...demo.members.map((m) => demo.trips[m.id][p.id].km), ...(yourTrips.has(p.id) ? [yourTrips.get(p.id)!.km] : [])],
  }));
  const byFar = rankByOmp(inputs);
  const bySum = rankBySum(inputs);
  const ranking = mode === 'far' ? byFar : bySum;
  const pickId = ranking[0].id;
  const otherPickId = (mode === 'far' ? bySum : byFar)[0].id;

  const rowOf = (id: PlaceId) => rows.find((r) => r.placeId === id)!;
  const nameOf = (id: PlaceId) => demo.places.find((p) => p.id === id)!.name;
  const pick = rowOf(pickId);
  const other = rowOf(otherPickId);

  let sentence: Sentence;
  if (mode === 'far' && !you) {
    sentence = { key: 'waiting', vars: { place: nameOf(pickId) } };
  } else if (mode === 'far') {
    sentence =
      pick.farWho === 'you'
        ? { key: 'farYou', vars: { place: nameOf(pickId), min: pick.far } }
        : { key: 'farOther', vars: { place: nameOf(pickId), who: pick.farWho, min: pick.far, yourMin: pick.yourMin ?? 0 } };
  } else {
    sentence = { key: 'sum', vars: { place: nameOf(pickId), km: round1(pick.total), who: pick.farWho, min: pick.far } };
  }
  if (sentence.key !== 'waiting' && pickId !== otherPickId) {
    sentence.diff = { place: nameOf(otherPickId), who: other.farWho, min: other.far };
  }

  return {
    rows,
    pickId,
    otherPickId,
    sentence,
    estimated: [...yourTrips.values()].some((t) => t.source === 'estimate'),
    ranking,
  };
}
