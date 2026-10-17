import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Place } from '../../types';
import { CATEGORY_COLORS } from './PoiLayer';

export const ROOM_PLACES_SOURCE = 'room-places';
export const ROOM_PLACES_LAYER = 'room-places-circles';
const ROOM_PLACES_SCORE_LAYER = 'room-places-score';

const colorExpression = [
  'match',
  ['get', 'category'],
  ...Object.entries(CATEGORY_COLORS).flat(),
  CATEGORY_COLORS.OTHER,
] as unknown as import('maplibre-gl').ExpressionSpecification;

export const formatScore = (score: number) => (score > 0 ? `+${score}` : String(score));

export function placesToGeoJSON(places: Place[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: places
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude as number, p.latitude as number] },
        properties: {
          id: p.id,
          name: p.name,
          category: p.category,
          score: formatScore(p.score),
        },
      })),
  };
}

export function installRoomPlacesLayer(
  map: MapLibreMap,
  onSelect: (placeId: string) => void,
): void {
  map.addSource(ROOM_PLACES_SOURCE, { type: 'geojson', data: placesToGeoJSON([]) });

  // Viền đậm để phân biệt với POI chưa chọn
  map.addLayer({
    id: ROOM_PLACES_LAYER,
    type: 'circle',
    source: ROOM_PLACES_SOURCE,
    paint: {
      'circle-color': colorExpression,
      'circle-radius': 13,
      'circle-stroke-width': 3.5,
      'circle-stroke-color': '#0f172a',
    },
  });

  // Badge điểm vote
  map.addLayer({
    id: ROOM_PLACES_SCORE_LAYER,
    type: 'symbol',
    source: ROOM_PLACES_SOURCE,
    layout: {
      'text-field': ['get', 'score'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  map.on('click', ROOM_PLACES_LAYER, (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (id) onSelect(id);
  });
  map.on('mouseenter', ROOM_PLACES_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', ROOM_PLACES_LAYER, () => (map.getCanvas().style.cursor = ''));
}

export function updateRoomPlacesSource(map: MapLibreMap, places: Place[]): void {
  (map.getSource(ROOM_PLACES_SOURCE) as GeoJSONSource | undefined)?.setData(
    placesToGeoJSON(places),
  );
}
