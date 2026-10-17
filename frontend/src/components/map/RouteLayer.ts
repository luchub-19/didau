import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

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

  // Đường viền (casing)
  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#0f172a',
      'line-width': 6,
      'line-opacity': 0.6,
    },
  });

  // Đường chính (polyline)
  map.addLayer({
    id: ROUTE_LAYER,
    type: 'line',
    source: ROUTE_SOURCE,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#0ea5e9', // Sky-500
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
