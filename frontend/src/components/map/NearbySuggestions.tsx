import { useMemo } from 'react';
import type { Poi, Room } from '../../types';
import { useMapStore } from '../../store/useMapStore';
import { NEARBY_LIMIT, pickNearby, railOrigin, type LatLng } from '../../room/discovery';

/**
 * Lấy dữ liệu "quán gần điểm hẹn" cho dải gợi ý (T-72; UI thẻ nổi cũ trên bản đồ đã bỏ, dải nằm ở `GatherPanel`).
 * Đọc POI mà bản đồ đã tải vào `useMapStore` (bản đồ luôn mounted, tự tải theo khung nhìn quanh điểm hẹn):
 *  - `pending`: bản đồ chưa tải xong lần nào → dải hiện skeleton;
 *  - `ready`: có quán; `empty`: đã tải mà không có quán nào → dải bị ẩn.
 */
export type NearbyStatus = 'pending' | 'ready' | 'empty';

export interface NearbyPois {
  pois: Poi[];
  status: NearbyStatus;
  origin: LatLng;
  /** Phòng đã đặt điểm hẹn chưa; chưa thì `origin` là tâm thành phố. */
  hasOrigin: boolean;
}

export function useNearbyPois(
  room: Pick<Room, 'origin_lat' | 'origin_lng' | 'city'>,
  limit = NEARBY_LIMIT,
): NearbyPois {
  const poisById = useMapStore((s) => s.poisById);
  const isLoading = useMapStore((s) => s.isLoading);
  const hasError = useMapStore((s) => s.error !== null);
  const loadedCellCount = useMapStore((s) => Object.keys(s.loadedCells).length);
  const { origin, hasOrigin } = useMemo(
    () => railOrigin({ origin_lat: room.origin_lat, origin_lng: room.origin_lng, city: room.city }),
    [room.origin_lat, room.origin_lng, room.city],
  );

  const pois = useMemo(() => pickNearby(Object.values(poisById), origin, limit), [poisById, origin, limit]);

  const status: NearbyStatus =
    pois.length > 0 ? 'ready' : !hasError && (isLoading || loadedCellCount === 0) ? 'pending' : 'empty';

  return { pois, status, origin, hasOrigin };
}
