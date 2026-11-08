// Logic thuần của widget tâm nhóm (ALGO-01, DESIGN gđ6 §8). Không đụng store/React/bản đồ.
import type { GroupCenterResponse, LatLng } from '../types';

/** Bán kính "quán gần tâm" (km) — khớp `CENTER_RADIUS_KM` ở backend (ALGORITHMS §3). */
export const CENTER_RADIUS_KM = 2;

/** Widget chỉ hiện khi server có tâm: ≥2 người đã chia sẻ vị trí (điểm hẹn của host không tính). */
export function centerVisible(c: GroupCenterResponse | null | undefined): c is GroupCenterResponse & { center: LatLng } {
  return Boolean(c && c.available && c.center && c.member_count >= 2);
}

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Vòng tròn bán kính `radiusKm` quanh `center` thành đa giác `steps` đỉnh (GeoJSON, [lng, lat], vòng khép kín).
 * Xấp xỉ cầu: đủ chính xác cho bán kính vài km.
 */
export function circlePolygon(center: LatLng, radiusKm: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const lat = (center.lat * Math.PI) / 180;
  const lng = (center.lng * Math.PI) / 180;
  const d = radiusKm / EARTH_RADIUS_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * (i % steps)) / steps;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brg));
    const lng2 =
      lng +
      Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}
