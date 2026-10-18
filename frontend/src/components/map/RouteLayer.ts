import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { getCssColor } from './PoiLayer';

export const ROUTE_SOURCE = 'route-polyline';
export const ROUTE_LAYER = 'route-polyline-line';
export const ROUTE_CASING_LAYER = 'route-polyline-casing';

export function coordinatesToRouteGeoJSON(
  coordinates: [number, number][],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  if (coordinates.length < 2) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: {},
      },
    ],
  };
}

export function installRouteLayer(map: MapLibreMap): void {
  map.addSource(ROUTE_SOURCE, {
    type: 'geojson',
    data: coordinatesToRouteGeoJSON([]),
  });

  const casingColor = getCssColor('--color-ink', '#1C1917');
  const accentColor = getCssColor('--color-accent', '#FF6B4A');

  // Duong vien (casing)
  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': casingColor,
      'line-width': 5,
      'line-opacity': 0.4,
    },
  });

  // Duong chinh (polyline)
  map.addLayer({
    id: ROUTE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': accentColor,
      'line-width': 3.5,
      'line-dasharray': [2, 1],
    },
  });
}

export function updateRouteSource(
  map: MapLibreMap,
  coordinates: [number, number][],
): void {
  const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
  if (source) {
    source.setData(coordinatesToRouteGeoJSON(coordinates));
  }
}
