// Logic thuần cho thẻ quán ngang (PlaceRow), thanh "x/y đã chọn" và khối hoà phiếu (DESIGN gđ5 §5, §8).
// Không đụng store/React để test được bằng dữ liệu giả.
import type { DeciderHint, Member, Place, PlaceCategory, Room } from '../types';

/** Quán ACCEPTED/REJECTED không còn trong cuộc đua phiếu. */
const isAlive = (p: Pick<Place, 'status'>) => p.status !== 'REJECTED';

export type PlaceBadge = 'accepted' | 'leading' | 'overBudget';

/** Nhãn ưu tiên (tối đa 1): Đã chốt > Đang dẫn > Vượt ngân sách. */
export function pickBadge(flags: { accepted: boolean; leading: boolean; overBudget: boolean }): PlaceBadge | null {
  if (flags.accepted) return 'accepted';
  if (flags.leading) return 'leading';
  if (flags.overBudget) return 'overBudget';
  return null;
}

/**
 * Tạm (T-69): giá quán > ngân sách của phòng. T-73 thay bằng ngân sách còn lại
 * (`budget_limit − tổng các quán khác đã trong lịch`, DESIGN §8). Giá 0/thiếu = "chưa rõ giá", không vượt.
 */
export function isOverBudget(place: Pick<Place, 'estimated_cost'>, budgetLimit: number | null | undefined): boolean {
  const cost = place.estimated_cost ?? 0;
  return budgetLimit != null && budgetLimit > 0 && cost > budgetLimit;
}

/** Các quán đang dẫn: điểm cao nhất và > 0, chỉ tính quán chưa bị loại. Hoà thì dẫn chung. */
export function leadingPlaceIds(places: readonly Pick<Place, 'id' | 'status' | 'score'>[]): Set<string> {
  const alive = places.filter(isAlive);
  const top = Math.max(0, ...alive.map((p) => p.score ?? 0));
  if (top <= 0) return new Set();
  return new Set(alive.filter((p) => (p.score ?? 0) === top).map((p) => p.id));
}

export function badgeFor(
  place: Pick<Place, 'id' | 'status' | 'estimated_cost'>,
  leading: ReadonlySet<string>,
  budgetLimit: number | null | undefined,
): PlaceBadge | null {
  if (place.status === 'REJECTED') return null;
  return pickBadge({
    accepted: place.status === 'ACCEPTED',
    leading: leading.has(place.id),
    overBudget: isOverBudget(place, budgetLimit),
  });
}

// ── Khoảng cách tới điểm hẹn ──────────────────────────────────────────────────────────────────────

/** Khoảng cách đường chim bay (mét) giữa hai toạ độ — haversine. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mét tới điểm hẹn; null khi thiếu điểm hẹn hoặc toạ độ quán. */
export function distanceToOrigin(
  place: Pick<Place, 'latitude' | 'longitude'>,
  room: Pick<Room, 'origin_lat' | 'origin_lng'> | null | undefined,
): number | null {
  if (!room || room.origin_lat == null || room.origin_lng == null) return null;
  if (place.latitude == null || place.longitude == null) return null;
  return haversineMeters(room.origin_lat, room.origin_lng, place.latitude, place.longitude);
}

/** "350 m" / "1,2 km" (VI dùng dấu phẩy) — luôn chữ số, đơn vị giống nhau ở hai ngôn ngữ. */
export function formatDistance(meters: number, lang: string): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = Math.round(meters / 100) / 10;
  const text = lang === 'vi' ? String(km).replace('.', ',') : String(km);
  return `${text} km`;
}

/** Giá ngắn "~45k"; 0/thiếu → null (hiện "chưa rõ giá" ở nơi cần, không coi là miễn phí). */
export function formatPriceShort(cost: number | null | undefined): string | null {
  if (!cost || cost <= 0) return null;
  if (cost >= 1000) {
    const k = Math.round(cost / 1000);
    return `~${k}k`;
  }
  return `~${cost}`;
}

// ── Ảnh đại diện ────────────────────────────────────────────────────────────────────────────────

export interface PlaceThumb {
  /** Ảnh thật (T-70 nối ảnh tuyển chọn); null → vẽ minh hoạ theo danh mục. */
  src: string | null;
  category: PlaceCategory;
}

/** Tạm (T-69): chưa có ảnh nên luôn là minh hoạ danh mục. T-70 trả `src` từ bộ dữ liệu tuyển chọn. */
export function placeThumb(place: Pick<Place, 'category'>): PlaceThumb {
  return { src: null, category: place.category };
}

// ── Người đã chọn ───────────────────────────────────────────────────────────────────────────────

/** Mảnh nhỏ của `usePresenceStore.pulses` mà logic cần. */
export type PulseMap = Record<string, { placeId: string }>;

/**
 * Thành viên (ngoài mình) đã bỏ phiếu quán này, theo VOTE_UPDATED.voter_id thấy trong phiên.
 * Server chỉ gửi người vừa vote, không gửi hướng +1/−1 → chỉ lấy khi quán còn upvote, và không hơn số upvote
 * (trừ phần của mình). Danh sách đầy đủ cần backend (BACKEND-NOTES #2).
 */
export function likersOf(
  place: Pick<Place, 'id' | 'upvotes' | 'current_user_vote'>,
  pulses: PulseMap,
  meId: string | undefined,
): string[] {
  const room = Math.max(0, (place.upvotes ?? 0) - (place.current_user_vote === 1 ? 1 : 0));
  if (room === 0) return [];
  return Object.entries(pulses)
    .filter(([memberId, p]) => p.placeId === place.id && memberId !== meId)
    .map(([memberId]) => memberId)
    .sort()
    .slice(0, room);
}

export interface PickProgress {
  done: number;
  total: number;
}

/**
 * "x/y đã chọn": y = thành viên đang hoạt động; x = người đã vote ≥1 quán theo dữ liệu thấy được
 * (mình: có quán `current_user_vote ≠ 0`; người khác: đã có VOTE_UPDATED trong phiên). x không vượt y.
 */
export function pickProgress(
  places: readonly Pick<Place, 'current_user_vote'>[],
  members: readonly Pick<Member, 'id' | 'is_active'>[],
  pulses: PulseMap,
  meId: string | undefined,
): PickProgress {
  const active = members.filter((m) => m.is_active !== false);
  const total = active.length;
  const voted = new Set<string>();
  if (meId && places.some((p) => p.current_user_vote !== 0)) voted.add(meId);
  for (const m of active) if (m.id !== meId && pulses[m.id]) voted.add(m.id);
  return { done: Math.min(voted.size, total), total };
}

// ── Hoà phiếu ───────────────────────────────────────────────────────────────────────────────────

export interface TieInfo {
  count: number;
  votes: number;
  names: string[];
}

/** Quán đang hoà ở đầu: lấy từ `hints[0].candidate_place_ids`, thiếu thì các quán chung điểm cao nhất. */
export function tieInfo(hints: readonly DeciderHint[], places: readonly Place[]): TieInfo | null {
  const alive = places.filter(isAlive);
  const ids = hints[0]?.candidate_place_ids ?? [];
  let tied = ids.length >= 2 ? alive.filter((p) => ids.includes(p.id)) : [];
  if (tied.length < 2) {
    const top = Math.max(...alive.map((p) => p.score ?? 0));
    tied = alive.filter((p) => (p.score ?? 0) === top);
  }
  if (tied.length < 2) return null;
  return {
    count: tied.length,
    votes: Math.max(...tied.map((p) => p.upvotes ?? 0)),
    names: tied.map((p) => p.name),
  };
}

/** Kiểu trọng tài mặc định khi bấm "Để trọng tài chọn" — chốt tạm SMART theo đề xuất G1 câu (a). */
export const DEFAULT_TIE_MODE = 'SMART' as const;

/** "Để trọng tài chọn": vào thẳng kiểu mặc định và chạy luôn. */
export const TIE_RUN_INTENT = { mode: DEFAULT_TIE_MODE } as const;
/** "Đổi cách chọn": mở bảng ở bước chọn kiểu như cũ. */
export const TIE_CHOOSE_INTENT = { chooseMode: true } as const;

/** Lọc/sắp xếp/tìm thu vào nút ⋯ khi danh sách dài (G1 câu e, đề xuất giữ). */
export const LIST_TOOLS_THRESHOLD = 8;
export const hasListTools = (count: number) => count > LIST_TOOLS_THRESHOLD;
