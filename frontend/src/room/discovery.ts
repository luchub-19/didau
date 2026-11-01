// Logic thuần cho giai đoạn ① (DESIGN gđ5 §7): chọn quán cho 4 dải gợi ý. Không đụng store/React để test được.
import type { Member, Place, PlaceCategory, Poi, Room } from '../types';
import { CITY_CENTER } from '../config';
import { avatarStack, viewersByPlace, type PeerMap } from '../stage/presence/rules';
import {
  curatedByCollection,
  curatedPhotos,
  distanceM,
  findCurated,
  normalizeName,
  MATCH_RADIUS_M,
  type CollectionCode,
  type CuratedData,
  type CuratedEntry,
} from './curated';
import { hoursFit, haversineMeters } from './placeView';

/** Một thẻ gợi ý: quán chưa (hoặc đã) trong danh sách, đủ dữ liệu để mở trang chi tiết và thêm một chạm. */
export interface DiscoveryItem {
  /** Khoá ổn định: `external_id` của POI. */
  key: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  /** POI để mở `PlaceDetail poi=` và `addPlaceFromPoi`. */
  poi: Poi;
  curated: CuratedEntry | null;
  /** Giá/người (VND) từ bộ tuyển chọn; không có thì null (không đoán). */
  priceVnd: number | null;
  /** Khoảng cách tới điểm hẹn (km); null nếu không tính được. */
  distanceKm: number | null;
  /** Ảnh thu nhỏ thật; null → thẻ vẽ minh hoạ danh mục. */
  thumb: string | null;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** Số quán tối đa mỗi dải. */
export const RAIL_LIMIT = 10;
/** Số quán gần điểm hẹn tối đa trong dải 1. */
export const NEARBY_LIMIT = 10;

/** Điểm hẹn của phòng; chưa đặt thì tâm thành phố (kèm cờ để hiện dòng nhắc). */
export function railOrigin(room: Pick<Room, 'origin_lat' | 'origin_lng' | 'city'>): { origin: LatLng; hasOrigin: boolean } {
  if (room.origin_lat != null && room.origin_lng != null) {
    return { origin: { lat: room.origin_lat, lng: room.origin_lng }, hasOrigin: true };
  }
  const center = CITY_CENTER[room.city ?? 'HCM'] ?? CITY_CENTER.HCM;
  return { origin: { lat: center.lat, lng: center.lng }, hasOrigin: false };
}

/**
 * Ngân sách còn lại cho một quán mới (VND/người, cả buổi). Ở giai đoạn ① chưa có quán nào trong lịch nên bằng
 * `budget_limit`; null = không giới hạn. T-73 thay bằng ngân sách thực (trừ phần đã xếp).
 */
export function remainingBudget(room: Pick<Room, 'budget_limit'>): number | null {
  const b = room.budget_limit;
  return b != null && b > 0 ? b : null;
}

/** Quán đã trong danh sách phòng? Khớp `external_id`, không có thì tên chuẩn hoá + toạ độ ≤ 50 m. */
export function findAddedPlace(poi: Pick<Poi, 'external_id' | 'name' | 'lat' | 'lng'>, places: readonly Place[]): Place | null {
  const byId = places.find((p) => p.external_id && p.external_id === poi.external_id);
  if (byId) return byId;
  const name = normalizeName(poi.name);
  if (!name) return null;
  return (
    places.find(
      (p) =>
        p.latitude != null &&
        p.longitude != null &&
        normalizeName(p.name) === name &&
        distanceM(p.latitude, p.longitude, poi.lat, poi.lng) <= MATCH_RADIUS_M,
    ) ?? null
  );
}

export function isAdded(poi: Pick<Poi, 'external_id' | 'name' | 'lat' | 'lng'>, places: readonly Place[]): boolean {
  return findAddedPlace(poi, places) !== null;
}

/**
 * POI dựng từ một mục tuyển chọn. `loaded` (POI cùng `external_id` đã tải từ bản đồ) cho giờ mở cửa và món;
 * bộ tuyển chọn tự nó không có giờ có cấu trúc.
 */
export function curatedToPoi(entry: CuratedEntry, loaded?: Poi | null): Poi {
  return {
    ...(loaded ?? {}),
    external_id: entry.external_id ?? loaded?.external_id ?? `curated:${entry.id}`,
    name: entry.name,
    category: entry.category,
    lat: entry.lat,
    lng: entry.lng,
    address: entry.address || loaded?.address || null,
  };
}

/** Dựng thẻ từ một POI (dải 1). Có mục tuyển chọn khớp thì lấy giá + ảnh. */
export function itemFromPoi(poi: Poi, origin: LatLng, data: CuratedData | null): DiscoveryItem {
  const curated = findCurated({ name: poi.name, external_id: poi.external_id, latitude: poi.lat, longitude: poi.lng }, data);
  const photo = curated ? curatedPhotos(curated, data)[0] : undefined;
  return {
    key: poi.external_id,
    name: poi.name,
    category: poi.category,
    lat: poi.lat,
    lng: poi.lng,
    poi,
    curated,
    priceVnd: curated && curated.price_per_person > 0 ? curated.price_per_person : null,
    distanceKm: haversineMeters(origin.lat, origin.lng, poi.lat, poi.lng) / 1000,
    thumb: photo?.thumb ?? null,
  };
}

/** Dựng thẻ từ mục tuyển chọn (dải 2, 3); `poisById` bổ sung giờ mở cửa nếu bản đồ đã tải quán đó. */
export function itemFromCurated(
  entry: CuratedEntry,
  origin: LatLng,
  data: CuratedData | null,
  poisById: Record<string, Poi> = {},
): DiscoveryItem {
  const loaded = entry.external_id ? poisById[entry.external_id] : undefined;
  const poi = curatedToPoi(entry, loaded);
  const photo = curatedPhotos(entry, data)[0];
  return {
    key: poi.external_id,
    name: entry.name,
    category: entry.category,
    lat: entry.lat,
    lng: entry.lng,
    poi,
    curated: entry,
    priceVnd: entry.price_per_person > 0 ? entry.price_per_person : null,
    distanceKm: haversineMeters(origin.lat, origin.lng, entry.lat, entry.lng) / 1000,
    thumb: photo?.thumb ?? null,
  };
}

/**
 * Dải 1 — gần điểm hẹn: sắp theo khoảng cách, ưu tiên đa dạng danh mục (mỗi danh mục một quán trước), tối đa `limit`.
 * Giữ nguyên thuật toán của `NearbySuggestions` cũ nhưng dài hơn (dải cuộn ngang).
 */
export function pickNearby(pois: readonly Poi[], origin: LatLng, limit = NEARBY_LIMIT): Poi[] {
  if (pois.length === 0 || limit <= 0) return [];
  const sorted = pois
    .map((poi) => ({ poi, dist: haversineMeters(origin.lat, origin.lng, poi.lat, poi.lng) }))
    .sort((a, b) => a.dist - b.dist);
  const picked: Poi[] = [];
  const usedCategories = new Set<string>();
  for (const { poi } of sorted) {
    if (picked.length >= limit) break;
    if (!usedCategories.has(poi.category)) {
      picked.push(poi);
      usedCategories.add(poi.category);
    }
  }
  if (picked.length < limit) {
    const ids = new Set(picked.map((p) => p.external_id));
    for (const { poi } of sorted) {
      if (picked.length >= limit) break;
      if (!ids.has(poi.external_id)) {
        picked.push(poi);
        ids.add(poi.external_id);
      }
    }
  }
  // Trả theo thứ tự gần → xa cho dễ đọc
  return picked.sort(
    (a, b) =>
      haversineMeters(origin.lat, origin.lng, a.lat, a.lng) - haversineMeters(origin.lat, origin.lng, b.lat, b.lng),
  );
}

/** Dải 2 — bộ sưu tập: các chủ đề có ít nhất một quán (giữ thứ tự cố định của `COLLECTION_CODES`). */
export function nonEmptyCollections(codes: readonly CollectionCode[], data: CuratedData | null): CollectionCode[] {
  return codes.filter((c) => curatedByCollection(c, data).length > 0);
}

export function collectionItems(
  code: CollectionCode,
  origin: LatLng,
  data: CuratedData | null,
  poisById: Record<string, Poi> = {},
  limit = RAIL_LIMIT,
): DiscoveryItem[] {
  return curatedByCollection(code, data)
    .map((e) => itemFromCurated(e, origin, data, poisById))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);
}

/**
 * Dải 3 — hợp giờ và ngân sách. Giữ quán mà:
 *  - giờ mở cửa **đã biết** và phủ khung giờ phòng (`hoursFit` = fits) — thiếu giờ thì không khẳng định, bỏ;
 *  - có ngân sách: giá **đã biết** và ≤ ngân sách còn lại — thiếu giá thì bỏ. Không có ngân sách thì không lọc giá.
 */
export function fitsRoomAndBudget(
  items: readonly DiscoveryItem[],
  room: Pick<Room, 'start_minute' | 'end_minute' | 'budget_limit'>,
  limit = RAIL_LIMIT,
): DiscoveryItem[] {
  const budget = remainingBudget(room);
  return items
    .filter((it) => {
      const fit = hoursFit(
        { open_minute: it.poi.open_minute, close_minute: it.poi.close_minute },
        room,
      );
      if (!fit || fit.kind !== 'fits') return false;
      if (budget !== null && (it.priceVnd === null || it.priceVnd > budget)) return false;
      return true;
    })
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);
}

/** Dải 4 — một quán nhóm đang xem. */
export interface WatchedPlace {
  place: Place;
  /** Thành viên đang xem (đến trước xếp trước), không gồm mình. */
  viewers: Member[];
  /** Tối đa 3 avatar + "+N". */
  shown: Member[];
  extra: number;
}

export interface GroupWatching {
  /** Số người đang online (mình + người có hiện diện chưa hết hạn). */
  online: number;
  items: WatchedPlace[];
}

/**
 * Quán bạn bè đang mở xem (presence). Chỉ hiện khi có ≥2 người online (mình + ít nhất một người khác);
 * hiện diện chỉ biết `place_id` của quán trong phòng nên đây là quán đã trong danh sách.
 */
export function groupWatching(
  peers: PeerMap,
  meId: string | null | undefined,
  places: readonly Place[],
  members: readonly Member[],
): GroupWatching {
  const others = Object.keys(peers).filter((id) => id !== meId);
  const online = 1 + others.length;
  if (online < 2) return { online, items: [] };
  const byPlace = viewersByPlace(peers, meId);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const items: WatchedPlace[] = [];
  for (const place of places) {
    const ids = byPlace[place.id];
    if (!ids?.length) continue;
    const viewers = ids.map((id) => memberById.get(id)).filter((m): m is Member => Boolean(m));
    if (viewers.length === 0) continue;
    const { shown, extra } = avatarStack(viewers);
    items.push({ place, viewers, shown, extra });
  }
  // Nhiều người xem nhất lên trước
  items.sort((a, b) => b.viewers.length - a.viewers.length);
  return { online, items };
}
