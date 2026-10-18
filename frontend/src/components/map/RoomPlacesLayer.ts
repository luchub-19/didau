import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Place } from '../../types';
import { getCssColor } from './PoiLayer';

export const ROOM_PLACES_SOURCE = 'room-places';
export const ROOM_PLACES_LAYER = 'room-places-circles';
const ROOM_PLACES_SCORE_LAYER = 'room-places-score';

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
          is_accepted: p.status === 'ACCEPTED',
        },
      })),
  };
}

export function installRoomPlacesLayer(
  map: MapLibreMap,
  onSelect: (placeId: string) => void,
): void {
  map.addSource(ROOM_PLACES_SOURCE, { type: 'geojson', data: placesToGeoJSON([]) });

  const accentColor = getCssColor('--color-accent', '#FF6B4A');
  const successColor = getCssColor('--color-success', '#047857');
  const inkColor = getCssColor('--color-ink', '#1C1917');
  const surfaceColor = getCssColor('--color-surface', '#FFFFFF');

  // Quan da chot = pin success, quan them vao phong = pin coral (accent)
  map.addLayer({
    id: ROOM_PLACES_LAYER,
    type: 'circle',
    source: ROOM_PLACES_SOURCE,
    paint: {
      'circle-color': [
        'case',
        ['==', ['get', 'is_accepted'], true],
        successColor,
        accentColor,
      ],
      'circle-radius': 13,
      'circle-stroke-width': 3,
      'circle-stroke-color': surfaceColor,
    },
  });

  // Badge diem vote: chu ink tren coral (tranh chu trang tren coral), chu trang tren success
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
    paint: {
      'text-color': [
        'case',
        ['==', ['get', 'is_accepted'], true],
        surfaceColor,
        inkColor,
      ],
    },
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

/**
 * Cập nhật màu các layer quán trong phòng theo CSS variables khi đổi giao diện sáng/tối.
 */
export function updateRoomPlacesLayerTheme(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  const accentColor = getCssColor('--color-accent', '#FF6B4A');
  const successColor = getCssColor('--color-success', '#047857');
  const inkColor = getCssColor('--color-ink', '#1C1917');
  const surfaceColor = getCssColor('--color-surface', '#FFFFFF');

  if (map.getLayer(ROOM_PLACES_LAYER)) {
    map.setPaintProperty(ROOM_PLACES_LAYER, 'circle-color', [
      'case',
      ['==', ['get', 'is_accepted'], true],
      successColor,
      accentColor,
    ]);
    map.setPaintProperty(ROOM_PLACES_LAYER, 'circle-stroke-color', surfaceColor);
  }
  if (map.getLayer(ROOM_PLACES_SCORE_LAYER)) {
    map.setPaintProperty(ROOM_PLACES_SCORE_LAYER, 'text-color', [
      'case',
      ['==', ['get', 'is_accepted'], true],
      surfaceColor,
      inkColor,
    ]);
  }
}
