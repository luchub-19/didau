// Ngân sách cả buổi (DESIGN gđ5 §8): mỗi người, cộng giá của các quán trong lịch, mỗi quán một lần.
// Logic thuần, không đụng store/React để test bằng dữ liệu giả.
import type { Place, PlaceCategory, ScheduleItem } from '../types';

/** Một điểm trong thanh ngân sách. `cost` null = chưa rõ giá (không coi là miễn phí). */
export interface BudgetSegment {
  placeId: string;
  name: string;
  cost: number | null;
  category?: PlaceCategory;
}

export interface PlanBudget {
  /** Tổng giá các quán đã rõ giá (VND/người, cả buổi). */
  spent: number;
  /** Ngân sách của phòng; null khi không đặt (0/null/âm). */
  limit: number | null;
  /** `limit − spent`, âm khi vượt; null khi không có `limit`. */
  remaining: number | null;
  /** Số quán trong lịch chưa rõ giá. */
  unknownCount: number;
  /** Từng quán theo thứ tự lịch (ngày, rồi order_index), mỗi quán một lần. */
  segments: BudgetSegment[];
  over: boolean;
  /** Quán đắt nhất (có giá); null khi chưa quán nào rõ giá. */
  priciest: BudgetSegment | null;
}

export interface PlanBudgetInput {
  schedule: readonly Pick<ScheduleItem, 'place_id' | 'place_name' | 'day_offset' | 'order_index'>[];
  places: readonly (Pick<Place, 'id' | 'name' | 'estimated_cost'> & Partial<Pick<Place, 'category'>>)[];
  budgetLimit?: number | null;
}

/** Giá hợp lệ: số dương hữu hạn; 0/null/âm/NaN = chưa rõ. */
function knownCost(cost: number | null | undefined): number | null {
  return typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : null;
}

function normalizeLimit(limit: number | null | undefined): number | null {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
}

export function planBudget({ schedule, places, budgetLimit }: PlanBudgetInput): PlanBudget {
  const byId = new Map(places.map((p) => [p.id, p]));
  const ordered = [...schedule].sort((a, b) => a.day_offset - b.day_offset || a.order_index - b.order_index);

  const seen = new Set<string>();
  const segments: BudgetSegment[] = [];
  for (const item of ordered) {
    if (seen.has(item.place_id)) continue; // cùng một quán xếp hai lần vẫn chỉ tính một lần
    seen.add(item.place_id);
    const place = byId.get(item.place_id);
    segments.push({
      placeId: item.place_id,
      name: place?.name ?? item.place_name,
      cost: knownCost(place?.estimated_cost),
      category: place?.category,
    });
  }

  const spent = segments.reduce((sum, s) => sum + (s.cost ?? 0), 0);
  const unknownCount = segments.filter((s) => s.cost === null).length;
  const limit = normalizeLimit(budgetLimit);
  const priciest = segments.reduce<BudgetSegment | null>(
    (best, s) => (s.cost !== null && (best === null || s.cost > (best.cost ?? 0)) ? s : best),
    null,
  );

  return {
    spent,
    limit,
    remaining: limit === null ? null : limit - spent,
    unknownCount,
    segments,
    over: limit !== null && spent > limit,
    priciest,
  };
}

/** Tổng giá các quán khác đã trong lịch (không tính `placeId`). */
export function otherScheduleSpent(
  placeId: string,
  schedule: PlanBudgetInput['schedule'],
  places: PlanBudgetInput['places'],
): number {
  return planBudget({ schedule, places })
    .segments.filter((s) => s.placeId !== placeId)
    .reduce((sum, s) => sum + (s.cost ?? 0), 0);
}

/**
 * "Vượt ngân sách" trên một quán = giá quán > ngân sách − tổng các quán khác đã trong lịch.
 * Giá 0/thiếu hoặc không có ngân sách → không vượt.
 */
export function placeOverBudget(
  place: Pick<Place, 'id' | 'estimated_cost'>,
  { schedule, places, budgetLimit }: PlanBudgetInput,
): boolean {
  const limit = normalizeLimit(budgetLimit);
  const cost = knownCost(place.estimated_cost);
  if (limit === null || cost === null) return false;
  return cost > limit - otherScheduleSpent(place.id, schedule, places);
}

/** Số tiền rút gọn cho dải thu gọn: "295k" (làm tròn nghìn); 0 → null (chưa có gì để hiện). */
export function formatBudgetShort(vnd: number): string | null {
  if (!Number.isFinite(vnd) || vnd <= 0) return null;
  return vnd >= 1000 ? `${Math.round(vnd / 1000)}k` : String(Math.round(vnd));
}

/** Ngân sách còn lại cho một quán mới (null = không giới hạn); không âm. */
export function remainingForNewPlace(input: PlanBudgetInput): number | null {
  const { remaining } = planBudget(input);
  return remaining === null ? null : Math.max(0, remaining);
}

/** Mức giá chọn nhanh khi thêm quán (DESIGN §8): lưu giá giữa khoảng. */
export interface PriceTier {
  id: 'under50' | '50to150' | '150to300' | 'over300';
  /** Giá lưu (VND/người). */
  value: number;
  min: number;
  max: number | null;
}

export const PRICE_TIERS: readonly PriceTier[] = [
  { id: 'under50', value: 30000, min: 0, max: 50000 },
  { id: '50to150', value: 100000, min: 50000, max: 150000 },
  { id: '150to300', value: 225000, min: 150000, max: 300000 },
  { id: 'over300', value: 400000, min: 300000, max: null },
];

/** Mức giá chứa `cost` (cận dưới gồm, cận trên loại); null khi 0/thiếu. */
export function tierForCost(cost: number | null | undefined): PriceTier | null {
  const c = knownCost(cost);
  if (c === null) return null;
  return PRICE_TIERS.find((tier) => c >= tier.min && (tier.max === null || c < tier.max)) ?? null;
}

/**
 * Cột trái ở giai đoạn ③④: quán chốt chính, các điểm đi kèm, quán dự bị (DESIGN gđ5 §3).
 * - chính = quán ACCEPTED điểm cao nhất (hoà thì quán đứng trước); chưa có ACCEPTED (lịch xếp tay) thì quán của mục lịch đầu tiên;
 * - đi kèm = các quán ACCEPTED/trong lịch còn lại, theo thứ tự lịch rồi tới thứ tự danh sách;
 * - dự bị = quán chưa bị loại, không thuộc hai nhóm trên.
 */
export function splitLockedPlaces<P extends Pick<Place, 'id' | 'status' | 'score'>>(
  places: readonly P[],
  schedule: readonly Pick<ScheduleItem, 'place_id' | 'day_offset' | 'order_index'>[],
): { main: P | null; companions: P[]; backups: P[] } {
  const byId = new Map(places.map((p) => [p.id, p]));
  const ordered = [...schedule].sort((a, b) => a.day_offset - b.day_offset || a.order_index - b.order_index);
  const accepted = places.filter((p) => p.status === 'ACCEPTED');
  const topAccepted = accepted.reduce<P | null>((best, p) => (best === null || (p.score ?? 0) > (best.score ?? 0) ? p : best), null);
  const main = topAccepted ?? (ordered[0] ? byId.get(ordered[0].place_id) ?? null : null);

  const used = new Set<string>(main ? [main.id] : []);
  const companions: P[] = [];
  const add = (p: P | undefined) => {
    if (p && !used.has(p.id)) {
      used.add(p.id);
      companions.push(p);
    }
  };
  ordered.forEach((item) => add(byId.get(item.place_id)));
  accepted.forEach(add);

  const backups = places.filter((p) => p.status !== 'REJECTED' && !used.has(p.id));
  return { main, companions, backups };
}
