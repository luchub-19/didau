// Nối store ↔ API cho lớp đường (T-96): đường của mình tới quán đề xuất đang hiệu lực + đường giữa các mục lịch.
// Gọi lại khi đề xuất / vị trí của mình / lịch / toạ độ quán đổi (thay cho sự kiện WS SCHEDULE_UPDATED, PLACE_UPDATED:
// các sự kiện đó đã cập nhật store nên chữ ký đổi theo).
import { useEffect, useMemo } from 'react';
import { useAlgoStore } from '../../store/useAlgoStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { useScheduleStore } from '../../store/useScheduleStore';
import type { LatLng, MyRoutes, Place, ScheduleItem } from '../../types';
import { activeRecommendedIds } from './tieSuggestionLogic';
import type { MyRouteInput, ScheduleRouteInput } from './RouteLayer';

/** Lịch cần ≥ 2 mục ở ngày phòng mới có đường giữa quán (§5.5, cùng phạm vi mục 38). */
export const MIN_SCHEDULE_ITEMS = 2;

const coordOf = (p: Pick<Place, 'latitude' | 'longitude'> | undefined): LatLng | null =>
  p && p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;

export const dayItems = (items: readonly ScheduleItem[]) => items.filter((i) => i.day_offset === 0);

/** Chữ ký lịch: đổi giờ / thứ tự / quán của mục → tải lại; kèm toạ độ quán (PLACE_UPDATED đổi toạ độ). */
export function scheduleRoutesKey(items: readonly ScheduleItem[], places: readonly Pick<Place, 'id' | 'latitude' | 'longitude'>[]): string {
  const byId = new Map(places.map((p) => [p.id, p]));
  return JSON.stringify(
    dayItems(items).map((i) => [i.id, i.place_id, i.start_minute, i.end_minute, byId.get(i.place_id)?.latitude ?? null, byId.get(i.place_id)?.longitude ?? null]),
  );
}

export interface AlgoRoutesView {
  /** Quán đề xuất còn hiệu lực (có thể > 1 khi nhiều loại cùng hoà). */
  recommendedIds: string[];
  mine: (MyRouteInput & { name: string })[];
  schedule: ScheduleRouteInput | null;
  /** Có đề xuất mà mình chưa chia sẻ vị trí → nhắc chia sẻ. */
  needShare: boolean;
}

export function useAlgoRoutes(roomId: string | undefined): AlgoRoutesView {
  const tie = useAlgoStore((s) => s.tieSuggestion);
  const myRoutes = useAlgoStore((s) => s.myRoutes);
  const noOrigin = useAlgoStore((s) => s.myRoutesNoOrigin);
  const scheduleRoutes = useAlgoStore((s) => s.scheduleRoutes);
  const places = usePlaceStore((s) => s.places);
  const items = useScheduleStore((s) => s.items);
  const me = useRoomStore((s) => s.currentMember);

  const recommendedIds = useMemo(() => activeRecommendedIds(tie, places), [tie, places]);
  const recKey = recommendedIds.join(',');
  const myOrigin = useMemo<LatLng | null>(
    () => (me?.has_origin && me.origin_lat != null && me.origin_lng != null ? { lat: me.origin_lat, lng: me.origin_lng } : null),
    [me?.has_origin, me?.origin_lat, me?.origin_lng],
  );
  const originKey = myOrigin ? `${myOrigin.lat},${myOrigin.lng}` : '';

  // Đường của mình: chỉ gọi khi mình đã chia sẻ (chưa chia sẻ thì server cũng trả NO_ORIGIN)
  useEffect(() => {
    if (!roomId) return;
    const st = useAlgoStore.getState();
    if (!originKey || !recKey) {
      st.clearMyRoutes();
      return;
    }
    const timer = setTimeout(() => void st.fetchMyRoutes(roomId, recKey.split(',')), 150);
    return () => clearTimeout(timer);
  }, [roomId, recKey, originKey]);

  // Đường giữa các mục lịch
  const sKey = useMemo(() => scheduleRoutesKey(items, places), [items, places]);
  const enoughItems = dayItems(items).length >= MIN_SCHEDULE_ITEMS;
  useEffect(() => {
    if (!roomId || !enoughItems) return;
    const timer = setTimeout(() => void useAlgoStore.getState().fetchScheduleRoutes(roomId), 300);
    return () => clearTimeout(timer);
  }, [roomId, sKey, enoughItems]);

  const mine = useMemo(() => {
    if (!myOrigin) return [];
    const byId = new Map(places.map((p) => [p.id, p]));
    return recommendedIds.flatMap((id) => {
      const r: MyRoutes | undefined = myRoutes[id];
      const p = byId.get(id);
      return r && p ? [{ routes: r, origin: myOrigin, place: coordOf(p), name: p.name }] : [];
    });
  }, [recommendedIds, myRoutes, myOrigin, places]);

  const schedule = useMemo<ScheduleRouteInput | null>(() => {
    if (!enoughItems || !scheduleRoutes) return null;
    const byId = new Map(places.map((p) => [p.id, p]));
    const itemCoords = new Map<string, LatLng>();
    for (const i of dayItems(items)) {
      const c = coordOf(byId.get(i.place_id));
      if (c) itemCoords.set(i.id, c);
    }
    // Chỉ giữ chặng mà cả hai mục còn trên lịch (bản cũ trong lúc chờ tải lại)
    const legs = scheduleRoutes.legs.filter((l) => itemCoords.has(l.from_item_id) && itemCoords.has(l.to_item_id));
    return { legs, itemCoords };
  }, [enoughItems, scheduleRoutes, items, places]);

  return {
    recommendedIds,
    mine,
    schedule,
    needShare: recommendedIds.length > 0 && (!myOrigin || noOrigin),
  };
}
