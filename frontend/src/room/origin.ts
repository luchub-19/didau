// Logic thuần cho "Xuất phát từ đâu?" (DESIGN gđ6 §8, CR-11). Không đụng store/React.
import type { Member } from '../types';
import { CITY_CENTER } from '../config';

export type OriginStatus = 'none' | 'shared';

/** Mình đã chia sẻ nơi xuất phát chưa. Đọc cờ `has_origin` (toạ độ chỉ dùng để gửi lên, không hiển thị). */
export function originStatus(me: Pick<Member, 'has_origin'> | null | undefined): OriginStatus {
  return me?.has_origin ? 'shared' : 'none';
}

export type GeoFailure = 'denied' | 'unavailable';

/** Lấy vị trí hiện tại một lần. Từ chối quyền → `denied`; không hỗ trợ/hết giờ/lỗi khác → `unavailable`. */
export function locateOnce(timeoutMs = 10000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject('unavailable' satisfies GeoFailure);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject((err.code === 1 ? 'denied' : 'unavailable') satisfies GeoFailure),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

/** Tâm tìm kiếm địa điểm: điểm hẹn của phòng, không có thì tâm thành phố. */
export function searchCenter(room: { origin_lat?: number | null; origin_lng?: number | null; city?: string }): {
  lat: number;
  lng: number;
} {
  if (room.origin_lat != null && room.origin_lng != null) return { lat: room.origin_lat, lng: room.origin_lng };
  const c = CITY_CENTER[room.city ?? 'HCM'] ?? CITY_CENTER.HCM;
  return { lat: c.lat, lng: c.lng };
}
