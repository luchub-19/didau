// ALGO-03 phía trình duyệt (T-90): bản TS CHỈ phần ước lượng của thời gian di chuyển (ALGORITHMS §2, §5) để vẽ
// dải di chuyển tức thì khi kéo ô trên lịch. Backend (`GET /schedule/feasibility`) là nguồn thật; sau khi lưu, số
// của backend (có thể là Google) thay số ở đây. Hai bên chạy chung `docs/phase6/algo-fixtures.json`.
// Hàm thuần: không React/store/DOM.
import type { FeasibilityLeg, FeasibilityRisk, ScheduleFeasibility, ScheduleItem, TravelSource } from '../types';

// ── Hằng số: SAO CHÉP từ `backend/app/core/algo_config.py` (đổi ở đó thì đổi ở đây + fixture) ──────────────
/** Đường thực / chim bay (`DETOUR_FACTOR`). */
export const DETOUR_FACTOR = 1.3;
/** Xe máy nội thành TP.HCM, km/h (`MOTORBIKE_KMH`). */
export const MOTORBIKE_KMH = 25;
/** Gửi xe, đi bộ, ổn định (`BUFFER_MIN`) — không cộng vào `minutes` của chặng. */
export const BUFFER_MIN = 5;
/** Biên dự phòng tối thiểu (`MARGIN_MIN`). */
export const MARGIN_MIN = 5;
/** Tỉ lệ biên giờ cao điểm ngày thường / còn lại (`PEAK_MARGIN_RATIO`, `OFFPEAK_MARGIN_RATIO`). */
export const PEAK_MARGIN_RATIO = 0.5;
export const OFFPEAK_MARGIN_RATIO = 0.25;
/** Giờ cao điểm nửa mở [16:30, 19:30) (`PEAK_START_MIN`, `PEAK_END_MIN`; quyết định T-87). */
export const PEAK_START_MIN = 16 * 60 + 30;
export const PEAK_END_MIN = 19 * 60 + 30;
/** Bán kính Trái Đất (km) như `haversine_distance_km` ở `domain/patterns/itinerary/travel.py`. */
const EARTH_RADIUS_KM = 6371.0;
const DAY_MIN = 24 * 60;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface EstimatedLeg {
  minutes: number;
  distance_km: number;
  source: 'ESTIMATE';
}

/** `round(x, 6)` của Python: chặn `ceil` nhảy +1 vì sai số float (vd. 12 × 0,25 hay quãng đường bội đúng vận tốc). */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const rad = (d: number) => (d * Math.PI) / 180;

/** Khoảng cách chim bay (km), cùng công thức `haversine_distance_km` của backend. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dPhi = rad(b.lat - a.lat);
  const dLambda = rad(b.lng - a.lng);
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLambda / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** `minutes = ceil(haversine × DETOUR / KMH × 60)`, `distance_km = haversine × DETOUR` (§2). */
export function estimateLeg(a: LatLng, b: LatLng): EstimatedLeg {
  const distance = haversineKm(a, b) * DETOUR_FACTOR;
  return { minutes: Math.ceil(round6((distance / MOTORBIKE_KMH) * 60)), distance_km: distance, source: 'ESTIMATE' };
}

/** Thứ trong tuần (0 = Chủ nhật) của `YYYY-MM-DD` + `dayOffset`; ngày hỏng → `null`. */
function weekdayOf(eventDate: string | null | undefined, dayOffset = 0): number | null {
  const m = eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset);
  return isNaN(d.getTime()) ? null : d.getDay();
}

/** Rời đi trong [16:30, 19:30) của một ngày thứ Hai–Sáu. Không biết ngày → không cao điểm (như backend). */
export function isPeak(departMinute: number, eventDate: string | null | undefined, dayOffset = 0): boolean {
  const wd = weekdayOf(eventDate, dayOffset);
  if (wd === null || wd === 0 || wd === 6) return false;
  const m = ((departMinute % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return m >= PEAK_START_MIN && m < PEAK_END_MIN;
}

/** Biên dự phòng = max(MARGIN_MIN, ceil(eta × 50% cao điểm ngày thường | 25% còn lại)) (§5). */
export function marginFor(etaMin: number, departMinute: number, eventDate: string | null | undefined, dayOffset = 0): number {
  const ratio = isPeak(departMinute, eventDate, dayOffset) ? PEAK_MARGIN_RATIO : OFFPEAK_MARGIN_RATIO;
  return Math.max(MARGIN_MIN, Math.ceil(round6(etaMin * ratio)));
}

/** SAFE (slack ≥ 0) · SOFT_CONFLICT (thiếu nhưng còn đủ thời gian đi thường) · HIGH_RISK (gap < eta). */
export function riskFor(gapMin: number, etaMin: number, slackMin: number): FeasibilityRisk {
  if (slackMin >= 0) return 'SAFE';
  if (gapMin >= etaMin) return 'SOFT_CONFLICT';
  return 'HIGH_RISK';
}

type LegItem = Pick<ScheduleItem, 'id' | 'start_minute' | 'end_minute' | 'order_index'> & { day_offset?: number };

/**
 * Đánh giá một cặp mục liên tiếp như `assess_leg` của backend: eta khởi hành lúc `end_curr`; hai mục cùng chỗ
 * (eta 0 và quãng 0) không có biên/gửi xe. Kết quả cùng dạng `FeasibilityLeg` của API.
 */
export function assessLeg(
  curr: LegItem,
  next: LegItem,
  leg: { minutes: number; distance_km: number; source?: TravelSource },
  eventDate: string | null | undefined,
): FeasibilityLeg {
  const gap = next.start_minute - curr.end_minute;
  const day = curr.day_offset ?? 0;
  const eta = Math.trunc(leg.minutes);
  const still = eta <= 0 && leg.distance_km <= 0;
  const margin = still ? 0 : marginFor(eta, curr.end_minute, eventDate, day);
  const buffer = still ? 0 : BUFFER_MIN;
  const slack = gap - (eta + margin + buffer);
  return {
    from_item_id: curr.id,
    to_item_id: next.id,
    eta_min: eta,
    margin_min: margin,
    buffer_min: buffer,
    gap_min: gap,
    slack_min: slack,
    distance_km: leg.distance_km,
    risk: riskFor(gap, eta, slack),
    peak: isPeak(curr.end_minute, eventDate, day),
    source: leg.source ?? 'ESTIMATE',
  };
}

/** Các cặp liên tiếp của NGÀY PHÒNG (`day_offset = 0`), sắp theo (giờ bắt đầu, `order_index`) như backend. */
export function consecutivePairs<T extends LegItem>(items: readonly T[]): [T, T][] {
  const day0 = items
    .filter((i) => (i.day_offset ?? 0) === 0)
    .sort((a, b) => a.start_minute - b.start_minute || a.order_index - b.order_index);
  const pairs: [T, T][] = [];
  for (let i = 0; i + 1 < day0.length; i++) pairs.push([day0[i], day0[i + 1]]);
  return pairs;
}

/** Độ dài khung phòng; khung qua nửa đêm (end ≤ start) cộng 24h (như `window_minutes`). */
export function windowMinutes(startMinute: number, endMinute: number): number {
  return endMinute > startMinute ? endMinute - startMinute : endMinute + DAY_MIN - startMinute;
}

/**
 * Tổng kế hoạch (§5): `required_total = Σ thời lượng + Σ (eta + biên + gửi xe)`, `buffer_total = window − required`,
 * khả thi khi dư ≥ 0 và không chặng nào HIGH_RISK (như `plan_feasibility` của backend).
 */
export function planTotals(
  window: { start_minute: number; end_minute: number },
  durations: readonly number[],
  legs: readonly Pick<FeasibilityLeg, 'eta_min' | 'margin_min' | 'buffer_min' | 'risk'>[],
): Pick<ScheduleFeasibility, 'window_min' | 'required_total_min' | 'buffer_total_min' | 'is_feasible'> {
  const windowMin = windowMinutes(window.start_minute, window.end_minute);
  const required =
    durations.reduce((acc, d) => acc + Math.max(0, d), 0) +
    legs.reduce((acc, l) => acc + l.eta_min + l.margin_min + l.buffer_min, 0);
  return {
    window_min: windowMin,
    required_total_min: required,
    buffer_total_min: windowMin - required,
    is_feasible: windowMin - required >= 0 && legs.every((l) => l.risk !== 'HIGH_RISK'),
  };
}

/**
 * Bản ước lượng của `GET /schedule/feasibility` (ngày phòng): mọi cặp liên tiếp có đủ toạ độ → chặng; thiếu toạ độ
 * → đếm `unknown_leg_count`. `required_total = Σ thời lượng + Σ (eta + biên + gửi xe)`.
 */
export function estimateFeasibility(input: {
  items: readonly LegItem[];
  coordOf: (item: LegItem) => LatLng | null;
  eventDate: string | null | undefined;
  window: { start_minute: number; end_minute: number };
}): ScheduleFeasibility {
  const day0 = input.items.filter((i) => (i.day_offset ?? 0) === 0);
  const legs: FeasibilityLeg[] = [];
  let unknown = 0;
  for (const [a, b] of consecutivePairs(day0)) {
    const ca = input.coordOf(a);
    const cb = input.coordOf(b);
    if (!ca || !cb) {
      unknown += 1;
      continue;
    }
    legs.push(assessLeg(a, b, estimateLeg(ca, cb), input.eventDate));
  }
  const totals = planTotals(
    input.window,
    day0.map((i) => i.end_minute - i.start_minute),
    legs,
  );
  return {
    ...totals,
    legs,
    estimated: legs.length > 0,
    item_count: day0.length,
    unknown_leg_count: unknown,
  };
}

/**
 * Chặng hiển thị: số của backend khi nó tính đúng cặp này VỚI ĐÚNG khe hiện tại (đã lưu xong), không thì số ước
 * lượng tức thì (đang kéo, chưa lưu, hoặc backend chưa trả lời). Nhờ vậy dải không giật về số cũ khi đang kéo.
 */
export function pickLeg(local: FeasibilityLeg, server: ScheduleFeasibility | null | undefined): FeasibilityLeg {
  const s = server?.legs.find((l) => l.from_item_id === local.from_item_id && l.to_item_id === local.to_item_id);
  return s && s.gap_min === local.gap_min ? s : local;
}

/** Chặng thiếu giờ (cần cảnh báo) — chỉ khi khe ≥ 0; chồng giờ (`gap < 0`) để `TIME_OVERLAP` báo (CR-07). */
export const isShortLeg = (l: Pick<FeasibilityLeg, 'gap_min' | 'slack_min'>) => l.gap_min >= 0 && l.slack_min < 0;

// ── Bố cục dải di chuyển trên lịch (DESIGN gđ6 §8) ─────────────────────────────────────────────────────

/** Chiều cao tối thiểu của dải (15 phút = 16px). */
export const STRIP_MIN_PX = 16;
/** Chiều cao nhãn nối khi khe quá hẹp cho dải. */
export const SEAM_PX = 20;

/** Bố cục dải: `band` nằm gọn trong khe; `seam` = nhãn nhỏ trên đường nối (khe hẹp hơn dải). */
export function stripLayout(
  leg: Pick<FeasibilityLeg, 'eta_min' | 'gap_min'>,
  pxPerMin: number,
): { mode: 'band' | 'seam'; height: number } {
  const height = Math.max(STRIP_MIN_PX, leg.eta_min * pxPerMin);
  return height <= leg.gap_min * pxPerMin ? { mode: 'band', height } : { mode: 'seam', height: SEAM_PX };
}

/** Chặng có cần vẽ dải không: khe ≥ 0 (chồng giờ để TIME_OVERLAP báo) và có di chuyển thật (khác chỗ). */
export const stripVisible = (leg: Pick<FeasibilityLeg, 'gap_min' | 'eta_min' | 'distance_km'>) =>
  leg.gap_min >= 0 && !(leg.eta_min <= 0 && leg.distance_km <= 0);

// ── "Bỏ qua" cảnh báo: theo người xem, localStorage (§5: khoá `room:item_pair:slack`) ───────────────────────

const DISMISS_PREFIX = 'didau.travelDismiss.';
/** Giữ tối đa bấy nhiêu khoá mỗi phòng (khoá cũ tự rơi khi số liệu đổi nhiều lần). */
const DISMISS_MAX = 50;

/** Khoá bỏ qua: cặp mục + giá trị slack. Slack đổi (dời giờ, đổi quán, Google trả số khác) → cảnh báo hiện lại. */
export const dismissKey = (l: Pick<FeasibilityLeg, 'from_item_id' | 'to_item_id' | 'slack_min'>) =>
  `${l.from_item_id}:${l.to_item_id}:${l.slack_min}`;

/** Đọc danh sách khoá đã bỏ qua của phòng. Không có storage (chế độ riêng tư, SSR) → rỗng. */
export function loadDismissed(roomId: string, storage: Pick<Storage, 'getItem'> | null = safeStorage()): Set<string> {
  try {
    const raw = storage?.getItem(DISMISS_PREFIX + roomId);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Thêm một khoá và lưu; trả tập mới (giữ `DISMISS_MAX` khoá mới nhất). */
export function saveDismissed(
  roomId: string,
  current: ReadonlySet<string>,
  key: string,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): Set<string> {
  const list = [...current].filter((k) => k !== key);
  list.push(key);
  const next = new Set(list.slice(-DISMISS_MAX));
  try {
    storage?.setItem(DISMISS_PREFIX + roomId, JSON.stringify([...next]));
  } catch {
    // Không ghi được (hết chỗ, bị chặn): vẫn ẩn trong phiên này
  }
  return next;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ── Tổng đầu cột ─────────────────────────────────────────────────────────────────────────────────────────

/** Dòng tổng đầu cột: thiếu ở N đoạn (chưa bỏ qua) > kế hoạch dài hơn khung > còn dư X' > không có gì để nói. */
export type PlanSummary =
  | { kind: 'short'; count: number }
  | { kind: 'over'; minutes: number }
  | { kind: 'spare'; minutes: number }
  | null;

export function planSummary(
  feasibility: Pick<ScheduleFeasibility, 'buffer_total_min'> | null,
  legs: readonly FeasibilityLeg[],
  dismissed: ReadonlySet<string>,
): PlanSummary {
  if (!feasibility || legs.length === 0) return null;
  const short = legs.filter((l) => isShortLeg(l) && !dismissed.has(dismissKey(l))).length;
  if (short > 0) return { kind: 'short', count: short };
  if (feasibility.buffer_total_min < 0) return { kind: 'over', minutes: -feasibility.buffer_total_min };
  return { kind: 'spare', minutes: feasibility.buffer_total_min };
}

// ── Nối sang xuất kế hoạch (T-82: `PlanLeg`/`PlanFeasibility` của `stage/card/planText.ts`) ─────────────────

export interface ExportLeg {
  fromId: string;
  toId: string;
  minutes: number;
  km?: number | null;
  estimated?: boolean;
}

export interface ExportFeasibility {
  spareMinutes?: number;
  shortfall?: { fromId: string; toId: string; minutes: number };
  estimated?: boolean;
}

/** Chặng → dòng 🛵; chặng cùng chỗ (0') bỏ. Đoạn thiếu nhiều nhất → ⚠️, không thì dư → 💡. */
export function toExportPlan(
  legs: readonly FeasibilityLeg[],
  feasibility: Pick<ScheduleFeasibility, 'buffer_total_min'> | null,
): { legs: ExportLeg[]; feasibility: ExportFeasibility | null } {
  const out = legs
    .filter((l) => l.eta_min > 0 && l.gap_min >= 0)
    .map((l) => ({
      fromId: l.from_item_id,
      toId: l.to_item_id,
      minutes: l.eta_min,
      km: l.distance_km,
      estimated: l.source === 'ESTIMATE',
    }));
  if (!feasibility || legs.length === 0) return { legs: out, feasibility: null };
  // Chặng cùng chỗ (0′, 0 km) không có gì để ước lượng
  const estimated = legs.some((l) => l.source === 'ESTIMATE' && (l.eta_min > 0 || l.distance_km > 0));
  const worst = legs.filter(isShortLeg).sort((a, b) => a.slack_min - b.slack_min)[0];
  if (worst) {
    return {
      legs: out,
      feasibility: {
        shortfall: { fromId: worst.from_item_id, toId: worst.to_item_id, minutes: -worst.slack_min },
        estimated,
      },
    };
  }
  return {
    legs: out,
    feasibility: feasibility.buffer_total_min >= 0 ? { spareMinutes: feasibility.buffer_total_min, estimated } : null,
  };
}
