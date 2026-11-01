// Logic thuần cho thẻ quán ngang (PlaceRow), thanh "x/y đã chọn" và khối hoà phiếu (DESIGN gđ5 §5, §8).
// Không đụng store/React để test được bằng dữ liệu giả.
import type { DeciderHint, Member, Place, PlaceCategory, Room } from '../types';
import { curatedLoaded, curatedPhotos, findCurated, type CuratedData, type CuratedEntry } from './curated';

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

/**
 * Ảnh thu nhỏ từ bộ tuyển chọn (T-71 nối, dữ liệu T-70) khi `loadCurated()` đã xong và quán khớp + có ảnh;
 * còn lại là minh hoạ danh mục. Chưa nạp xong thì cũng là minh hoạ (thẻ vẽ lại khi có dữ liệu).
 */
export function placeThumb(
  place: Pick<Place, 'category'> & Partial<Pick<Place, 'name' | 'external_id' | 'latitude' | 'longitude'>>,
  data: CuratedData | null = curatedLoaded(),
): PlaceThumb {
  const entry = data ? findCurated({ ...place, name: place.name ?? '' }, data) : null;
  const first = entry ? curatedPhotos(entry, data)[0] : undefined;
  return { src: first?.thumb ?? null, category: place.category };
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

// ── Trang chi tiết quán (T-71, DESIGN gđ5 §6) ────────────────────────────────────────────────────

const DAY = 1440;

export type HoursFit =
  /** Mở trước giờ bắt đầu và đóng sau giờ kết thúc của phòng → xanh. */
  | { kind: 'fits'; close: number }
  /** Đóng trước `end_minute` của phòng → cam. */
  | { kind: 'closesEarly'; close: number }
  /** Mở sau `start_minute` của phòng (vẫn còn mở lúc phòng kết thúc) → cam. */
  | { kind: 'opensLate'; open: number };

/**
 * So giờ mở cửa với khung giờ của phòng (mặc định 17:00–23:00). Giờ đóng ≤ giờ mở = qua đêm (vd. 17:00–02:00).
 * Thiếu giờ → null (ẩn dòng). Giờ trả về đã quy về 0–1439 để định dạng.
 */
export function hoursFit(
  place: Pick<Place, 'open_minute' | 'close_minute'>,
  room: Pick<Room, 'start_minute' | 'end_minute'> | null | undefined,
): HoursFit | null {
  const open = place.open_minute;
  const close = place.close_minute;
  if (open == null || close == null) return null;
  const start = room?.start_minute ?? 1020;
  let end = room?.end_minute ?? 1380;
  if (end <= start) end += DAY;
  // Mở cả ngày (00:00–00:00 hoặc mở = đóng)
  if (open === close) return { kind: 'fits', close: close % DAY };
  let o = open;
  let c = close <= open ? close + DAY : close;
  // Quán qua đêm mà phòng bắt đầu sau nửa đêm (vd. 00:30): dời khung quán lùi 1 ngày cho cùng trục
  if (c > DAY && start + DAY <= c && start < o) {
    o -= DAY;
    c -= DAY;
  }
  if (o > start) return { kind: 'opensLate', open: open % DAY };
  if (c < end) return { kind: 'closesEarly', close: close % DAY };
  return { kind: 'fits', close: close % DAY };
}

/** Trạng thái tải thẻ Google Places UI Kit (tầng 2). */
export type UiKitStatus = 'pending' | 'ready' | 'failed';

export interface DetailTiers {
  /** Tầng 1: ảnh/giới thiệu/nên thử/giá từ bộ tuyển chọn. */
  curated: CuratedEntry | null;
  /** Bộ ảnh: ảnh tuyển chọn hay minh hoạ danh mục đầy khung. */
  photos: 'curated' | 'illustration';
  /** Thử tầng 2 (render GooglePlaceCard): có key và có đủ dữ liệu để khớp. */
  tryUiKit: boolean;
  /** Tầng 3: iframe Maps Embed khi có key mà tầng 2 không thành (lỗi, quá 4 s, không khớp). */
  embed: boolean;
}

/**
 * Ghép tầng dữ liệu cho trang chi tiết: tuyển chọn → UI Kit → Embed → OSM (luôn có, không cần cờ).
 * Không có key → bỏ hẳn tầng 2–3, không báo lỗi.
 */
export function detailTiers(input: {
  curated: CuratedEntry | null;
  curatedPhotoCount: number;
  hasKey: boolean;
  /** Có `external_id` + toạ độ (để khớp Google) hoặc đã có `google_place_id`. */
  canMatchGoogle: boolean;
  /** Có toạ độ hoặc tên để đặt ghim trong iframe. */
  canEmbed: boolean;
  uiKit: UiKitStatus;
}): DetailTiers {
  const tryUiKit = input.hasKey && input.canMatchGoogle;
  const uiKitFailed = !tryUiKit || input.uiKit === 'failed';
  return {
    curated: input.curated,
    photos: input.curated && input.curatedPhotoCount > 0 ? 'curated' : 'illustration',
    tryUiKit,
    embed: input.hasKey && input.canEmbed && uiKitFailed,
  };
}

/**
 * URL iframe Maps Embed API, chế độ `place` (miễn phí, cần key). Ưu tiên `place_id`, không thì tên + địa chỉ,
 * kèm toạ độ làm tâm. Không key hoặc không có gì để tìm → null.
 */
export function mapEmbedUrl(
  key: string,
  place: Pick<Place, 'name'> & Partial<Pick<Place, 'address' | 'latitude' | 'longitude' | 'google_place_id'>>,
  lang: string,
): string | null {
  if (!key) return null;
  const hasCoords = place.latitude != null && place.longitude != null;
  let q: string;
  if (place.google_place_id) q = `place_id:${place.google_place_id}`;
  else if (place.name) q = [place.name, place.address].filter(Boolean).join(', ');
  else if (hasCoords) q = `${place.latitude},${place.longitude}`;
  else return null;
  const params = new URLSearchParams({ key, q, language: lang === 'en' ? 'en' : 'vi', zoom: '16' });
  if (hasCoords) params.set('center', `${place.latitude},${place.longitude}`);
  return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
}

/** ↑ ↓ trong panel chi tiết: quán trước/sau theo thứ tự danh sách; ở đầu/cuối thì đứng yên (null). */
export function adjacentPlaceId(order: readonly string[], currentId: string, delta: 1 | -1): string | null {
  const i = order.indexOf(currentId);
  if (i < 0) return null;
  return order[i + delta] ?? null;
}

export type DetailKeyAction = { kind: 'close' } | { kind: 'move'; delta: 1 | -1 } | null;

/**
 * Phím trong trang chi tiết: Esc đóng (mọi lúc, trừ khi có hộp thoại khác đang mở);
 * ↑ ↓ chỉ khi focus nằm trong panel và không ở ô nhập (ô nhập cần ↑ ↓ để di con trỏ).
 */
export function detailKeyAction(
  key: string,
  ctx: { focusInPanel: boolean; inTextField: boolean; otherDialogOpen: boolean; modified?: boolean },
): DetailKeyAction {
  if (ctx.otherDialogOpen || ctx.modified) return null;
  if (key === 'Escape') return { kind: 'close' };
  if (!ctx.focusInPanel || ctx.inTextField) return null;
  if (key === 'ArrowDown') return { kind: 'move', delta: 1 };
  if (key === 'ArrowUp') return { kind: 'move', delta: -1 };
  return null;
}

/** Bấm "Muốn đi"/"Không" ở thanh đáy: bấm lại đúng lựa chọn đang có = rút phiếu. */
export function detailVoteAction(current: -1 | 0 | 1, pressed: 1 | -1): { kind: 'cast'; value: 1 | -1 } | { kind: 'retract' } {
  return current === pressed ? { kind: 'retract' } : { kind: 'cast', value: pressed };
}
