// Lớp đường đi thật trên bản đồ (CR-15 mục 37/38, PLAN gđ7 quyết định 13 "(b)"):
//  - đường của MÌNH: nhà mình → quán đề xuất (đậm) và quán → nhà mình (nhạt), luôn hiện khi có đề xuất (§5.4);
//  - đường giữa các mục liên tiếp trên lịch, tự hiện khi lịch có ≥ 2 mục (§5.5).
// Không bao giờ vẽ đường xuất phát từ nhà người khác (CR-11): server chỉ trả đường của người gọi, và FE chỉ dùng toạ
// độ của chính mình (`currentMember`) cho nét ước lượng. `shape: null` (ước lượng) → nét đứt thẳng, không giả đường cong.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { getCssColor } from '../map/PoiLayer';
import { ROOM_PLACES_LAYER } from '../map/RoomPlacesLayer';
import type { LatLng, MyRoutes, ScheduleRouteLeg } from '../../types';
import { decodePolyline } from './polyline';

export const ALGO_ROUTE_SOURCE = 'algo-routes';
export const ALGO_ROUTE_CASING = 'algo-routes-casing';
export const ALGO_ROUTE_LINE = 'algo-routes-line';
export const ALGO_ROUTE_DASHED = 'algo-routes-dashed';
export const ALGO_ROUTE_HOME = 'algo-routes-home';

export type RouteKind = 'mine-to' | 'mine-home' | 'schedule';

export interface MyRouteInput {
  routes: MyRoutes;
  /** Toạ độ của chính mình (chỉ để vẽ nét ước lượng khi chưa có `shape`). */
  origin: LatLng | null;
  place: LatLng | null;
}

export interface ScheduleRouteInput {
  legs: readonly ScheduleRouteLeg[];
  /** Toạ độ quán của từng mục lịch (cho nét ước lượng). */
  itemCoords: ReadonlyMap<string, LatLng>;
}

type Props = { kind: RouteKind; real: boolean };
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const line = (coordinates: [number, number][], props: Props): GeoJSON.Feature<GeoJSON.LineString, Props> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: props,
});

const straight = (a: LatLng | null | undefined, b: LatLng | null | undefined): [number, number][] | null =>
  a && b ? [[a.lng, a.lat], [b.lng, b.lat]] : null;

const decoded = (shape: string | null): [number, number][] | null => {
  if (!shape) return null;
  const pts = decodePolyline(shape);
  return pts.length >= 2 ? pts : null;
};

/** Hàm thuần: dựng GeoJSON cho mọi đường (test được không cần MapLibre). */
export function buildRouteFeatures(mine: readonly MyRouteInput[], schedule: ScheduleRouteInput | null): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  let homeAdded = false;
  for (const m of mine) {
    const to = decoded(m.routes.to_place.shape);
    if (to) features.push(line(to, { kind: 'mine-to', real: true }));
    else {
      const s = straight(m.origin, m.place);
      if (s) features.push(line(s, { kind: 'mine-to', real: false }));
    }
    // Chiều về chỉ vẽ khi có đường thật — nét thẳng ước lượng sẽ trùng chiều đi
    const back = decoded(m.routes.to_home.shape);
    if (back) features.push(line(back, { kind: 'mine-home', real: true }));
    if (m.origin && !homeAdded) {
      homeAdded = true;
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.origin.lng, m.origin.lat] }, properties: { kind: 'home' } });
    }
  }
  for (const leg of schedule?.legs ?? []) {
    const real = decoded(leg.shape);
    if (real) features.push(line(real, { kind: 'schedule', real: true }));
    else {
      const s = straight(schedule?.itemCoords.get(leg.from_item_id), schedule?.itemCoords.get(leg.to_item_id));
      if (s) features.push(line(s, { kind: 'schedule', real: false }));
    }
  }
  return { type: 'FeatureCollection', features };
}

function colors() {
  return {
    mine: getCssColor('--color-accent', '#FF6B4A'),
    schedule: getCssColor('--color-info', '#2563EB'),
    casing: getCssColor('--color-surface', '#FFFFFF'),
  };
}

const colorExpr = (c: ReturnType<typeof colors>): import('maplibre-gl').ExpressionSpecification => [
  'match',
  ['get', 'kind'],
  'schedule',
  c.schedule,
  c.mine,
];

const isLine = (real: boolean): import('maplibre-gl').FilterSpecification => [
  'all',
  ['==', ['geometry-type'], 'LineString'],
  ['==', ['get', 'real'], real],
];

function install(map: MapLibreMap): void {
  if (map.getSource(ALGO_ROUTE_SOURCE)) return;
  map.addSource(ALGO_ROUTE_SOURCE, { type: 'geojson', data: EMPTY });
  const c = colors();
  // Dưới ghim quán để đường không che ghim
  const before = map.getLayer(ROOM_PLACES_LAYER) ? ROOM_PLACES_LAYER : undefined;
  map.addLayer(
    {
      id: ALGO_ROUTE_CASING,
      type: 'line',
      source: ALGO_ROUTE_SOURCE,
      filter: isLine(true),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': c.casing, 'line-width': ['match', ['get', 'kind'], 'mine-home', 5, 7.5], 'line-opacity': 0.9 },
    },
    before,
  );
  map.addLayer(
    {
      id: ALGO_ROUTE_LINE,
      type: 'line',
      source: ALGO_ROUTE_SOURCE,
      filter: isLine(true),
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': colorExpr(c),
        'line-width': ['match', ['get', 'kind'], 'mine-home', 2.5, 4.5],
        'line-opacity': ['match', ['get', 'kind'], 'mine-home', 0.55, 0.95],
      },
    },
    before,
  );
  map.addLayer(
    {
      id: ALGO_ROUTE_DASHED,
      type: 'line',
      source: ALGO_ROUTE_SOURCE,
      filter: isLine(false),
      layout: { 'line-cap': 'butt' },
      paint: { 'line-color': colorExpr(c), 'line-width': 3, 'line-opacity': 0.85, 'line-dasharray': [1.5, 1.5] },
    },
    before,
  );
  map.addLayer(
    {
      id: ALGO_ROUTE_HOME,
      type: 'circle',
      source: ALGO_ROUTE_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 6, 'circle-color': c.mine, 'circle-stroke-width': 2.5, 'circle-stroke-color': c.casing },
    },
    before,
  );
}

/** Cài (lần đầu) + đặt dữ liệu + cập nhật màu theo theme. An toàn khi gọi lại nhiều lần. */
export function syncAlgoRoutes(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  install(map);
  (map.getSource(ALGO_ROUTE_SOURCE) as GeoJSONSource | undefined)?.setData(data);
  const c = colors();
  if (map.getLayer(ALGO_ROUTE_LINE)) map.setPaintProperty(ALGO_ROUTE_LINE, 'line-color', colorExpr(c));
  if (map.getLayer(ALGO_ROUTE_DASHED)) map.setPaintProperty(ALGO_ROUTE_DASHED, 'line-color', colorExpr(c));
  if (map.getLayer(ALGO_ROUTE_CASING)) map.setPaintProperty(ALGO_ROUTE_CASING, 'line-color', c.casing);
  if (map.getLayer(ALGO_ROUTE_HOME)) {
    map.setPaintProperty(ALGO_ROUTE_HOME, 'circle-color', c.mine);
    map.setPaintProperty(ALGO_ROUTE_HOME, 'circle-stroke-color', c.casing);
  }
}
