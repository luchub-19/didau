// Cảnh "bạn là người thứ 5" (gđ11 T-128, PLAN §4.1 phần 5): trạng thái + mô hình hiển thị THUẦN (không React, không DOM,
// không maplibre). Tính đề xuất dùng `evaluate` của logic/explore.ts (OMP thật / tổng km); file này chỉ lo
// - reducer của người xem: chip quận, bấm/kéo trên bản đồ, phím mũi tên (bước 0,005°), đổi chế độ;
// - phép chiếu Web Mercator khi CHƯA có / KHÔNG có bản đồ thật (nền giấy), kèm phép ngược cho kéo/bấm;
// - mô hình bảng "người xa nhất" (thang chung, hàng được chọn) và các khoá câu kết luận (chữ nằm ở i18n).
// Điểm của người xem chỉ sống trong state React: không gửi đi đâu, không lưu (PLAN §3 mục 8, CR-11).
import { DISTRICT_CODES, type DistrictCode } from '../cast';
import { DISTRICT_CENTERS, type ExploreMode, type ExploreResult } from '../logic/explore';
import type { DemoCaseData, LngLat, PlaceId, WhoId } from '../logic/types';
import { mercator, type Padding } from '../map';

/** Thứ tự chip: trộn gần/xa như mock v3 (Q1, Q7, Gò Vấp, Bình Tân…), không theo bảng chữ cái. */
export const CHIP_ORDER = Object.keys(DISTRICT_CENTERS) as DistrictCode[];

/** Mỗi lần nhấn phím mũi tên khi điểm "Bạn" đang focus (PLAN §4.7). */
export const ARROW_STEP = 0.005;

/** Vùng được đặt điểm: TP.HCM rộng (ngoài lưới vẫn tính được bằng ước lượng, xa hơn nữa thì vô nghĩa). */
export const YOU_LIMIT: readonly [number, number, number, number] = [106.4, 10.45, 107.05, 11.15];

export interface TieState {
  you: LngLat | null;
  /** Chip đang chọn; null khi điểm đến từ bấm/kéo/phím. */
  area: DistrictCode | null;
  mode: ExploreMode;
  /** Tăng mỗi lần ĐẶT MỚI (chip, bấm bản đồ) → điểm rơi xuống 520 ms một lần. Kéo/phím không tăng. */
  drop: number;
}

export type TieAction =
  | { type: 'chip'; area: DistrictCode }
  | { type: 'place'; ll: LngLat }
  | { type: 'drag'; ll: LngLat }
  | { type: 'nudge'; key: string }
  | { type: 'mode'; mode: ExploreMode };

export const initialTie = (): TieState => ({ you: null, area: null, mode: 'far', drop: 0 });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function clampYou(ll: LngLat): LngLat {
  return [round6(clamp(ll[0], YOU_LIMIT[0], YOU_LIMIT[2])), round6(clamp(ll[1], YOU_LIMIT[1], YOU_LIMIT[3]))];
}

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export const isArrowKey = (key: string): boolean => key in ARROWS;

/** Dời điểm một bước theo phím mũi tên; phím khác → giữ nguyên (trả lại đúng object cũ). */
export function nudge(ll: LngLat, key: string, step = ARROW_STEP): LngLat {
  const d = ARROWS[key];
  if (!d) return ll;
  return clampYou([ll[0] + d[0] * step, ll[1] + d[1] * step]);
}

export function tieReducer(s: TieState, a: TieAction): TieState {
  switch (a.type) {
    case 'chip':
      if (!DISTRICT_CODES.includes(a.area)) return s;
      return { ...s, you: DISTRICT_CENTERS[a.area], area: a.area, drop: s.drop + 1 };
    case 'place':
      return { ...s, you: clampYou(a.ll), area: null, drop: s.drop + 1 };
    case 'drag':
      return { ...s, you: clampYou(a.ll), area: null };
    case 'nudge': {
      if (!s.you || !isArrowKey(a.key)) return s;
      return { ...s, you: nudge(s.you, a.key), area: null };
    }
    case 'mode':
      return a.mode === s.mode ? s : { ...s, mode: a.mode };
    default:
      return s;
  }
}

/** Phím ←/→ trên công tắc: ← = "Cộng tổng km" (nút trái), → = "Ưu tiên người xa nhất" (nút phải). */
export function modeForKey(key: string): ExploreMode | null {
  if (key === 'ArrowLeft') return 'sum';
  if (key === 'ArrowRight') return 'far';
  return null;
}

// ---------- Khung nhìn + phép chiếu ----------

export type Bounds = readonly [LngLat, LngLat];

/** Ôm các điểm (thêm lề `margin` độ cho vùng mờ của quận khỏi bị cắt). */
export function boundsOf(points: readonly LngLat[], margin = 0): Bounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of points) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [
    [w - margin, s - margin],
    [e + margin, n + margin],
  ];
}

/** Khung đầu: 4 quận (toạ độ đại diện) + 3 quán, lề 0,012° (~1,3 km) cho vùng mờ. */
export function baseBounds(demo: DemoCaseData): Bounds {
  return boundsOf([...demo.members.map((m) => m.ll), ...demo.places.map((p) => p.ll)], 0.012);
}

/** Lề khung nhìn: đỉnh chừa hộp "Bạn ở quận nào?", đáy chừa dòng riêng tư + nút +/−. */
export function tiePadding(width: number): Padding {
  return width < 520 ? { top: 150, bottom: 84, left: 28, right: 28 } : { top: 150, bottom: 76, left: 48, right: 64 };
}

export interface Projector {
  project: (ll: LngLat) => readonly [number, number];
  unproject: (pt: readonly [number, number]) => LngLat;
}

function inverseMercator(x: number, y: number): LngLat {
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lng, lat];
}

/**
 * Phép chiếu "như fitBounds" cho nền giấy (không bản đồ): cùng công thức với `fitProject` của landing/map,
 * thêm phép ngược để bấm/kéo trên nền giấy vẫn ra toạ độ.
 */
export function paperProjector(bounds: Bounds, width: number, height: number, pad: Padding): Projector {
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
  return {
    project: (ll) => {
      const [x, y] = mercator(ll);
      return [cx + (x - mx) * scale, cy + (y - my) * scale];
    },
    unproject: ([px, py]) => inverseMercator(mx + (px - cx) / scale, my + (py - cy) / scale),
  };
}

/** Điểm có nằm trong vùng nhìn thấy (trừ lề) không. */
/** Khoảng đệm khi xét "còn trong khung": avatar 44px + nhãn "Bạn" phải thấy trọn, không chỉ tâm điểm. */
export const VIEW_INSET = 36;

/** Điểm có nằm trong vùng nhìn thấy (trừ lề và `inset`) không. */
export function insideView(
  pt: readonly [number, number],
  width: number,
  height: number,
  pad: Padding,
  inset = VIEW_INSET,
): boolean {
  return (
    pt[0] >= pad.left + inset &&
    pt[0] <= width - pad.right - inset &&
    pt[1] >= pad.top + inset &&
    pt[1] <= height - pad.bottom - inset
  );
}

/**
 * Nhãn quán chìa về phía nào: ngược phía người bạn gần nhất, để ghim quán không đè avatar của bạn ấy
 * (Pizza sát Nobita, Dookki sát Xeko ở ca demo).
 */
export function labelSide(place: LngLat, friends: readonly LngLat[]): 'left' | 'right' {
  let best: LngLat | null = null;
  let bestD = Infinity;
  for (const f of friends) {
    const d = (f[0] - place[0]) ** 2 + (f[1] - place[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best && best[0] > place[0] ? 'left' : 'right';
}

/** Bán kính vùng mờ của một quận, độ vĩ (~3,3 km): đủ để chỉ "vùng", không chỉ một nhà (CR-11). */
export const AREA_RADIUS_DEG = 0.03;

export function areaRadiusPx(p: Projector, ll: LngLat): number {
  const a = p.project(ll);
  const b = p.project([ll[0], ll[1] + AREA_RADIUS_DEG]);
  return Math.abs(a[1] - b[1]);
}

// ---------- Bảng "người xa nhất" ----------

export interface BoardRow {
  placeId: PlaceId;
  name: string;
  /** Tổng km cả nhóm, làm tròn 0,1. */
  km: number;
  far: number;
  farWho: WhoId;
  /** Bề rộng thanh, % của thang chung. */
  pct: number;
  selected: boolean;
}

export interface BoardModel {
  /** Thang chung (phút): ≥ 110, luôn hơn người xa nhất 10′ để nhãn avatar không chạm mép. */
  scale: number;
  rows: BoardRow[];
  selIndex: number;
}

export function boardModel(demo: DemoCaseData, r: ExploreResult): BoardModel {
  const scale = Math.max(110, Math.max(...r.rows.map((x) => x.far)) + 10);
  const rows = r.rows.map((x) => ({
    placeId: x.placeId,
    name: demo.places.find((p) => p.id === x.placeId)?.name ?? x.placeId,
    km: Math.round(x.total * 10) / 10,
    far: x.far,
    farWho: x.farWho,
    pct: Math.round((x.far / scale) * 1000) / 10,
    selected: x.placeId === r.pickId,
  }));
  return {
    scale,
    rows,
    selIndex: Math.max(
      0,
      rows.findIndex((x) => x.selected),
    ),
  };
}

// ---------- Lời kết luận ----------

/** Một dòng của lời kết luận: khoá con của `landing.tie.verdict.*` + biến thô (component dịch tên/định dạng số). */
export interface VerdictLine {
  key: 'waitPick' | 'waitWhy' | 'farPick' | 'farYou' | 'farOther' | 'sumPick' | 'sumWhy' | 'sumWhyYou' | 'diff' | 'diffFar';
  vars: { name?: string; who?: WhoId; min?: number; yours?: number; km?: number };
}

export interface VerdictModel {
  pick: VerdictLine;
  why: VerdictLine;
  /** Chỉ có khi hai chế độ chọn khác quán (và người xem đã vào phòng hoặc đang ở chế độ tổng km). */
  diff?: VerdictLine;
  /** Đổi giá trị = dòng chính diễn lại (đổi quán / đổi chế độ / vừa vào phòng), kéo trong cùng quán thì không. */
  swapKey: string;
}

export function verdictModel(r: ExploreResult, mode: ExploreMode): VerdictModel {
  const s = r.sentence;
  const pickRow = r.rows.find((x) => x.placeId === r.pickId)!;
  const name = s.vars.place;
  let pick: VerdictLine;
  let why: VerdictLine;
  switch (s.key) {
    case 'waiting':
      pick = { key: 'waitPick', vars: { name } };
      why = { key: 'waitWhy', vars: { who: pickRow.farWho, min: pickRow.far } };
      break;
    case 'farYou':
      pick = { key: 'farPick', vars: { name } };
      why = { key: 'farYou', vars: { min: s.vars.min } };
      break;
    case 'farOther':
      pick = { key: 'farPick', vars: { name } };
      why = { key: 'farOther', vars: { who: s.vars.who, min: s.vars.min, yours: s.vars.yourMin } };
      break;
    default:
      pick = { key: 'sumPick', vars: { name } };
      why = {
        key: s.vars.who === 'you' ? 'sumWhyYou' : 'sumWhy',
        vars: { km: s.vars.km, who: s.vars.who, min: s.vars.min },
      };
  }
  // `s.diff` luôn là quán của chế độ KIA: chế độ "ưu tiên người xa nhất" kể điều chế độ tổng km sẽ làm, và ngược lại
  // (T-130: dùng chung một câu "nếu chỉ cộng tổng km" làm câu sai khi người xem đang ở chế độ tổng km).
  const diff: VerdictLine | undefined = s.diff
    ? { key: mode === 'far' ? 'diff' : 'diffFar', vars: { name: s.diff.place, who: s.diff.who, min: s.diff.min } }
    : undefined;
  return { pick, why, diff, swapKey: `${r.pickId}:${mode}:${s.key === 'waiting' ? 0 : 1}` };
}

/** Phút của người xem tới từng quán (nhãn giữa đường nét đứt); null khi chưa đặt điểm. */
export function legMinutes(r: ExploreResult): Record<PlaceId, number | null> {
  return Object.fromEntries(r.rows.map((x) => [x.placeId, x.yourMin]));
}
