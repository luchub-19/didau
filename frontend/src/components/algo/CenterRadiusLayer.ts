// Vòng tròn bán kính mờ quanh tâm nhóm trên bản đồ (ALGO-01, "Xem quán gần đây"). Không vẽ vị trí từng người.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { getCssColor } from '../map/PoiLayer';
import { ROOM_PLACES_LAYER } from '../map/RoomPlacesLayer';
import { CENTER_RADIUS_KM, circlePolygon } from '../../room/groupCenter';
import type { LatLng } from '../../types';

export const CENTER_RADIUS_SOURCE = 'group-center-radius';
export const CENTER_RADIUS_FILL = 'group-center-radius-fill';
export const CENTER_RADIUS_LINE = 'group-center-radius-line';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Bật/tắt/dời vòng tròn. `center = null` → gỡ hẳn lớp. An toàn khi gọi lại nhiều lần (đổi theme, đổi tâm). */
export function syncCenterRadius(map: MapLibreMap, center: LatLng | null): void {
  if (!center) {
    for (const id of [CENTER_RADIUS_LINE, CENTER_RADIUS_FILL]) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(CENTER_RADIUS_SOURCE)) map.removeSource(CENTER_RADIUS_SOURCE);
    return;
  }
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [circlePolygon(center, CENTER_RADIUS_KM)],
  };
  const accent = getCssColor('--color-accent', '#FF6B4A');
  const existing = map.getSource(CENTER_RADIUS_SOURCE) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
  } else {
    map.addSource(CENTER_RADIUS_SOURCE, { type: 'geojson', data: EMPTY });
    (map.getSource(CENTER_RADIUS_SOURCE) as GeoJSONSource).setData(data);
  }
  // Dưới ghim quán của phòng để vòng tròn không che ghim
  const before = map.getLayer(ROOM_PLACES_LAYER) ? ROOM_PLACES_LAYER : undefined;
  if (!map.getLayer(CENTER_RADIUS_FILL)) {
    map.addLayer(
      { id: CENTER_RADIUS_FILL, type: 'fill', source: CENTER_RADIUS_SOURCE, paint: { 'fill-color': accent, 'fill-opacity': 0.16 } },
      before,
    );
  }
  if (!map.getLayer(CENTER_RADIUS_LINE)) {
    map.addLayer(
      {
        id: CENTER_RADIUS_LINE,
        type: 'line',
        source: CENTER_RADIUS_SOURCE,
        paint: { 'line-color': accent, 'line-width': 2.5, 'line-opacity': 0.85, 'line-dasharray': [2, 2] },
      },
      before,
    );
  }
  map.setPaintProperty(CENTER_RADIUS_FILL, 'fill-color', accent);
  map.setPaintProperty(CENTER_RADIUS_LINE, 'line-color', accent);
}
