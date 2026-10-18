import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import type { Poi, PlaceCategory } from '../../types';

export const POI_SOURCE = 'pois';
export const POI_CLUSTER_LAYER = 'poi-clusters';
export const POI_POINT_LAYER = 'poi-points';
const POI_COUNT_LAYER = 'poi-cluster-count';
const POI_SELECTED_LAYER = 'poi-selected';

/** Gom cum khi zoom < 15. */
const CLUSTER_MAX_ZOOM = 14;

export function getCssColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!val) return fallback;
  if (/^\d+\s+\d+\s+\d+$/.test(val)) {
    return `rgb(${val})`;
  }
  return val;
}

export const CATEGORY_COLORS: Record<PlaceCategory, string> = {
  FOOD: '#C2410C',
  DRINK: '#047857',
  ENTERTAINMENT: '#7E22CE',
  SIGHTSEEING: '#1D4ED8',
  ACCOMMODATION: '#BE123C',
  SHOPPING: '#0F766E',
  OTHER: '#57534E',
};

export function getDynamicCategoryColors(): Record<PlaceCategory, string> {
  return {
    FOOD: getCssColor('--cat-food', '#C2410C'),
    DRINK: getCssColor('--cat-drink', '#047857'),
    ENTERTAINMENT: getCssColor('--cat-entertainment', '#7E22CE'),
    SIGHTSEEING: getCssColor('--cat-sightseeing', '#1D4ED8'),
    ACCOMMODATION: getCssColor('--cat-accommodation', '#BE123C'),
    SHOPPING: getCssColor('--cat-shopping', '#0F766E'),
    OTHER: getCssColor('--cat-other', '#57534E'),
  };
}

export function buildColorExpression(): import('maplibre-gl').ExpressionSpecification {
  const dynamicColors = getDynamicCategoryColors();
  return [
    'match',
    ['get', 'category'],
    ...Object.entries(dynamicColors).flat(),
    dynamicColors.OTHER,
  ] as unknown as import('maplibre-gl').ExpressionSpecification;
}

export function poisToGeoJSON(pois: Poi[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.external_id, name: p.name, category: p.category },
    })),
  };
}

export function installPoiLayer(
  map: MapLibreMap,
  onSelect: (externalId: string) => void,
): void {
  map.addSource(POI_SOURCE, {
    type: 'geojson',
    data: poisToGeoJSON([]),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: 50,
  });

  const colorExpression = buildColorExpression();
  const infoColor = getCssColor('--color-info', '#0369A1');
  const inkColor = getCssColor('--color-ink', '#1C1917');

  map.addLayer({
    id: POI_CLUSTER_LAYER,
    type: 'circle',
    source: POI_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#0284c7', 25, infoColor, 100, '#075985'],
      'circle-radius': ['step', ['get', 'point_count'], 16, 25, 20, 100, 26],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: POI_COUNT_LAYER,
    type: 'symbol',
    source: POI_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
    },
    paint: { 'text-color': '#ffffff' },
  });

  map.addLayer({
    id: POI_POINT_LAYER,
    type: 'circle',
    source: POI_SOURCE,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': colorExpression,
      'circle-radius': 7,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: POI_SELECTED_LAYER,
    type: 'circle',
    source: POI_SOURCE,
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-color': colorExpression,
      'circle-radius': 11,
      'circle-stroke-width': 3,
      'circle-stroke-color': inkColor,
    },
  });

  map.on('click', POI_CLUSTER_LAYER, async (e) => {
    const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
    const clusterId = feature?.properties?.cluster_id as number | undefined;
    if (!feature || clusterId === undefined) return;
    const source = map.getSource(POI_SOURCE) as GeoJSONSource;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
  });

  map.on('click', POI_POINT_LAYER, (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (id) onSelect(id);
  });

  for (const layer of [POI_CLUSTER_LAYER, POI_POINT_LAYER]) {
    map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
  }
}

/** Cap nhat du lieu POI; bo cac POI da nam trong phong (lop quan cua phong ve thay). */
export function updatePoiSource(
  map: MapLibreMap,
  pois: Poi[],
  excludeExternalIds: ReadonlySet<string>,
): void {
  const source = map.getSource(POI_SOURCE) as GeoJSONSource | undefined;
  source?.setData(poisToGeoJSON(pois.filter((p) => !excludeExternalIds.has(p.external_id))));
}

export function highlightPoi(map: MapLibreMap, externalId: string | null): void {
  if (!map.getLayer(POI_SELECTED_LAYER)) return;
  map.setFilter(POI_SELECTED_LAYER, ['==', ['get', 'id'], externalId ?? '']);
}
