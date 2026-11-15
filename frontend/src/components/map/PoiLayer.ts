import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapMouseEvent,
} from 'maplibre-gl';
import type { Poi, PlaceCategory } from '../../types';
import { useMapStore, type BrandFocus } from '../../store/useMapStore';
import {
  DOT_SIZE,
  ICON_SIZE,
  PIN_H,
  PIN_W,
  poiDotImage,
  poiIconImage,
  poiIconKey,
  poiPinImage,
  registerPoiImages,
} from './poiIcons';

/*
 * Lớp quán của mình (T-101, MAP-POI §4): không gom cụm; ba lớp symbol trên một nguồn GeoJSON.
 *  - poi-dot: quán sắp tới `minzoom` (≤ zoom + 2) → chấm nhỏ không chữ, không chiếm chỗ chữ; từ z14.
 *  - poi-icon: zoom ≥ `minzoom` → vòng màu loại + icon theo kind + tên; chật thì bỏ chữ, quán điểm cao thắng.
 *  - poi-brand: chi nhánh của chuỗi đang xem ("Xem N chi nhánh", T-102) → icon + tên, bỏ qua `minzoom`, icon được
 *    chồng nhau để hiện ĐỦ mọi chi nhánh (chữ vẫn tránh va chạm).
 *  - poi-selected: quán đang chọn → ghim giọt nước, luôn hiện.
 * POI nền của style (lớp `source-layer = poi`) bị ẩn đúng các class mình có dữ liệu thay thế.
 */
export const POI_SOURCE = 'pois';
export const POI_DOT_LAYER = 'poi-dot';
export const POI_ICON_LAYER = 'poi-icon';
export const POI_BRAND_LAYER = 'poi-brand';
export const POI_SELECTED_LAYER = 'poi-selected';
const POI_LAYERS = [POI_SELECTED_LAYER, POI_BRAND_LAYER, POI_ICON_LAYER, POI_DOT_LAYER];

/** Quán thiếu `minzoom` (snapshot cũ) coi như chỉ hiện từ z17. */
const DEFAULT_MINZOOM = 17;
/** Chấm nhỏ hiện trước `minzoom` tối đa bấy nhiêu mức zoom, và không hiện dưới mức này. */
const DOT_LEAD_ZOOM = 2;
const DOT_MIN_ZOOM = 14;
/** Vùng đệm (px) quanh điểm bấm: chấm chỉ 7px, ngón tay to hơn nhiều. */
const HIT_PADDING = 8;
/** Bán kính hình vẽ (px) và độ lệch tâm so với toạ độ quán (ghim neo ở mũi nên tâm đầu ghim nằm cao hơn). */
const HIT_SHAPE: Record<string, { r: number; dy: number }> = {
  [POI_SELECTED_LAYER]: { r: PIN_W / 2, dy: -(PIN_H - PIN_W / 2) },
  [POI_ICON_LAYER]: { r: ICON_SIZE / 2, dy: 0 },
  [POI_BRAND_LAYER]: { r: ICON_SIZE / 2, dy: 0 },
  [POI_DOT_LAYER]: { r: DOT_SIZE / 2, dy: 0 },
};

/**
 * Class/subclass của lớp `poi` (OpenMapTiles, style Liberty của OpenFreeMap) mà dữ liệu của mình thay thế.
 * Đọc từ tile thật 2026-11-15 (Q1, Q3, Thủ Đức, Q7, Tân Bình, Hoàn Kiếm — ghi ở MAP-POI §9). Giữ lại: chợ
 * (`grocery/marketplace`), bệnh viện, trường, tôn giáo, giao thông, khách sạn, ngân hàng, nhà hát, điểm tham quan,
 * sân chơi trẻ em, cửa hàng tiện lợi… làm mốc định hướng.
 */
export const BASEMAP_HIDDEN_POI_CLASSES = [
  'restaurant',
  'fast_food',
  'cafe',
  'bar',
  'beer',
  'ice_cream',
  'bakery',
  'cinema',
  'park',
  'museum',
  'theme_park',
  'water_park',
];
export const BASEMAP_HIDDEN_POI_SUBCLASSES = [
  'mall',
  'department_store',
  'supermarket',
  'coffee',
  'tea',
  'beverages',
  'pastry',
  'gallery',
  'arts_centre',
  'karaoke',
  'karaoke_box',
  'bowling_alley',
  'amusement_arcade',
  'escape_game',
];

/** Điều kiện giữ một POI nền: class/subclass không nằm trong nhóm mình thay thế. */
export const BASEMAP_POI_KEEP_FILTER: ExpressionSpecification = [
  '!',
  [
    'any',
    ['match', ['coalesce', ['get', 'class'], ''], BASEMAP_HIDDEN_POI_CLASSES, true, false],
    ['match', ['coalesce', ['get', 'subclass'], ''], BASEMAP_HIDDEN_POI_SUBCLASSES, true, false],
  ],
];

/** Lớp nền đã gắn điều kiện ẩn (mỗi map một lần; style mới = map mới ở MapView nên tự áp lại). */
const hiddenApplied = new WeakMap<MapLibreMap, Set<string>>();

/** Ẩn POI nền nhóm mình thay thế. Trả về id các lớp đã sửa. Style raster dự phòng không có lớp nào. */
export function hideBasemapPois(map: MapLibreMap): string[] {
  const done = hiddenApplied.get(map) ?? new Set<string>();
  hiddenApplied.set(map, done);
  const changed: string[] = [];
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== 'symbol' || layer['source-layer'] !== 'poi' || done.has(layer.id)) continue;
    const orig = map.getFilter(layer.id);
    try {
      map.setFilter(
        layer.id,
        (orig ? ['all', orig, BASEMAP_POI_KEEP_FILTER] : BASEMAP_POI_KEEP_FILTER) as FilterSpecification,
      );
      done.add(layer.id);
      changed.push(layer.id);
    } catch (err) {
      console.warn('[PoiLayer] khong an duoc POI nen', layer.id, err);
    }
  }
  return changed;
}

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

export function buildColorExpression(): ExpressionSpecification {
  const dynamicColors = getDynamicCategoryColors();
  return [
    'match',
    ['get', 'category'],
    ...Object.entries(dynamicColors).flat(),
    dynamicColors.OTHER,
  ] as unknown as ExpressionSpecification;
}

const KNOWN_CATEGORIES = new Set<string>(Object.keys(CATEGORY_COLORS));

export function poisToGeoJSON(pois: Poi[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => {
      const category: PlaceCategory = KNOWN_CATEGORIES.has(p.category) ? p.category : 'OTHER';
      const key = poiIconKey(p.kind, category);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.external_id,
          name: p.name,
          category,
          score: p.score ?? 0,
          minzoom: p.minzoom ?? DEFAULT_MINZOOM,
          icon: poiIconImage(key),
          pin: poiPinImage(key),
          dot: poiDotImage(category),
        },
      };
    }),
  };
}

/**
 * Bộ lọc bốn lớp theo quán đang chọn + chi nhánh của chuỗi đang xem. Mỗi quán chỉ vẽ ở một lớp: đang chọn → ghim;
 * chi nhánh → lớp chuỗi (bỏ qua `minzoom`); còn lại theo `minzoom` (icon hoặc chấm).
 */
export function poiLayerFilters(
  selectedId: string | null,
  brandIds: readonly string[] = [],
): Record<string, FilterSpecification> {
  const id = selectedId ?? '';
  const notSelected: ExpressionSpecification = ['!=', ['get', 'id'], id];
  const inBrand: ExpressionSpecification = ['in', ['get', 'id'], ['literal', [...brandIds]]];
  const notBrand: ExpressionSpecification = ['!', inBrand];
  return {
    [POI_ICON_LAYER]: ['all', ['>=', ['zoom'], ['get', 'minzoom']], notSelected, notBrand],
    [POI_DOT_LAYER]: [
      'all',
      ['<', ['zoom'], ['get', 'minzoom']],
      ['<=', ['get', 'minzoom'], ['+', ['zoom'], DOT_LEAD_ZOOM]],
      notSelected,
      notBrand,
    ],
    [POI_BRAND_LAYER]: ['all', inBrand, notSelected],
    [POI_SELECTED_LAYER]: ['==', ['get', 'id'], id],
  };
}

/** Trạng thái lọc của từng map (quán chọn đến từ MapView, chuỗi đến từ store — hai nguồn ghép một bộ lọc). */
const layerState = new WeakMap<MapLibreMap, { selected: string | null; brandIds: string[] }>();

function applyFilters(map: MapLibreMap): void {
  const st = layerState.get(map) ?? { selected: null, brandIds: [] };
  const filters = poiLayerFilters(st.selected, st.brandIds);
  for (const layer of POI_LAYERS) {
    if (map.getLayer(layer)) map.setFilter(layer, filters[layer]);
  }
}

/** Khung bao các chi nhánh; null khi không có quán nào. */
export function brandBounds(pois: readonly Pick<Poi, 'lat' | 'lng'>[]): [[number, number], [number, number]] | null {
  if (pois.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of pois) {
    minLng = Math.min(minLng, p.lng);
    minLat = Math.min(minLat, p.lat);
    maxLng = Math.max(maxLng, p.lng);
    maxLat = Math.max(maxLat, p.lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/** Đổi chuỗi đang xem: lọc lại các lớp và lia bản đồ bao trọn mọi chi nhánh (T-102). */
export function showBrandOnMap(map: MapLibreMap, focus: BrandFocus | null): void {
  const st = layerState.get(map) ?? { selected: null, brandIds: [] };
  st.brandIds = focus ? focus.pois.map((p) => p.external_id) : [];
  layerState.set(map, st);
  applyFilters(map);
  const bounds = focus ? brandBounds(focus.pois) : null;
  if (!bounds) return;
  const el = map.getContainer();
  const narrow = el.clientWidth < 640;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  try {
    map.fitBounds(bounds, {
      // Trên: ô tìm nổi trên bản đồ; màn hẹp: danh sách/sheet che nửa dưới
      padding: { top: 120, left: 40, right: 40, bottom: narrow ? Math.round(el.clientHeight * 0.45) : 60 },
      maxZoom: 16,
      duration: reduce ? 0 : 800,
    });
  } catch (err) {
    console.warn('[PoiLayer] khong lia duoc toi chuoi', err);
  }
}

/**
 * Màu lớp quán trên bản đồ: LUÔN bảng màu sáng (màu loại đậm, glyph + viền chữ trắng) ở cả hai theme — nền Liberty
 * không đổi theo theme nên chữ sáng viền tối ở theme tối trông nặng (người dùng chốt "giữ trắng" 2026-11-15).
 */
const MAP_COLORS = { category: CATEGORY_COLORS, surface: '#FFFFFF' };

/** Màu chữ tên quán theo category (bảng sáng cố định). */
function mapTextColor(): ExpressionSpecification {
  return [
    'match',
    ['get', 'category'],
    ...Object.entries(CATEGORY_COLORS).flat(),
    CATEGORY_COLORS.OTHER,
  ] as unknown as ExpressionSpecification;
}

export interface InstallPoiLayerOptions {
  /** Lớp nằm trên (quán của phòng): bấm trúng lớp này thì nhường, không mở thẻ POI. */
  yieldTo?: string[];
}

export function installPoiLayer(
  map: MapLibreMap,
  onSelect: (externalId: string) => void,
  options: InstallPoiLayerOptions = {},
): void {
  hideBasemapPois(map);
  const colors = MAP_COLORS;
  registerPoiImages(map, colors);

  map.addSource(POI_SOURCE, { type: 'geojson', data: poisToGeoJSON([]) });
  const filters = poiLayerFilters(null);
  const textColor = mapTextColor();

  map.addLayer({
    id: POI_DOT_LAYER,
    type: 'symbol',
    source: POI_SOURCE,
    minzoom: DOT_MIN_ZOOM,
    filter: filters[POI_DOT_LAYER],
    layout: {
      'icon-image': ['get', 'dot'],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  map.addLayer({
    id: POI_ICON_LAYER,
    type: 'symbol',
    source: POI_SOURCE,
    filter: filters[POI_ICON_LAYER],
    layout: {
      'symbol-sort-key': ['-', 0, ['get', 'score']],
      'icon-image': ['get', 'icon'],
      'icon-padding': 1,
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['step', ['zoom'], 12, 16, 13],
      'text-max-width': 8,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 1.05,
      'text-justify': 'auto',
      'text-padding': 2,
      'text-optional': true,
    },
    paint: {
      'text-color': textColor,
      'text-halo-color': colors.surface,
      'text-halo-width': 1.5,
    },
  });

  map.addLayer({
    id: POI_BRAND_LAYER,
    type: 'symbol',
    source: POI_SOURCE,
    filter: filters[POI_BRAND_LAYER],
    layout: {
      'symbol-sort-key': ['-', 0, ['get', 'score']],
      'icon-image': ['get', 'icon'],
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-max-width': 8,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 1.05,
      'text-justify': 'auto',
      'text-padding': 2,
      'text-optional': true,
    },
    paint: {
      'text-color': textColor,
      'text-halo-color': colors.surface,
      'text-halo-width': 1.5,
    },
  });

  map.addLayer({
    id: POI_SELECTED_LAYER,
    type: 'symbol',
    source: POI_SOURCE,
    filter: filters[POI_SELECTED_LAYER],
    layout: {
      'icon-image': ['get', 'pin'],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 14,
      'text-max-width': 10,
      'text-anchor': 'left',
      // Tên bên phải đầu ghim (ghim 30×38, neo ở mũi)
      'text-offset': [1.15, -1.35],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': textColor,
      'text-halo-color': colors.surface,
      'text-halo-width': 2,
    },
  });

  const yieldTo = options.yieldTo ?? [];
  const hitAt = (e: MapMouseEvent): string | undefined => {
    const layers = POI_LAYERS.filter((l) => map.getLayer(l));
    if (layers.length === 0) return undefined;
    const { x, y } = e.point;
    const box: [[number, number], [number, number]] = [
      [x - HIT_PADDING, y - HIT_PADDING],
      [x + HIT_PADDING, y + HIT_PADDING],
    ];
    const hits = map.queryRenderedFeatures(box, { layers });
    if (hits.length === 0) return undefined;
    // Chọn hình gần điểm bấm nhất tính tới MÉP hình (icon to thắng chấm khi bấm trúng icon, nhưng bấm sát chấm
    // cạnh một icon thì ra chấm); hoà thì ghim > icon > chấm
    const rank = (layer: string) => POI_LAYERS.indexOf(layer);
    const gap = (f: (typeof hits)[number]) => {
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      const p = map.project([lng, lat]);
      const shape = HIT_SHAPE[f.layer.id] ?? { r: 0, dy: 0 };
      return Math.max(0, Math.hypot(p.x - x, p.y + shape.dy - y) - shape.r);
    };
    hits.sort((a, b) => gap(a) - gap(b) || rank(a.layer.id) - rank(b.layer.id));
    return hits[0].properties?.id as string | undefined;
  };

  map.on('click', (e) => {
    const above = yieldTo.filter((l) => map.getLayer(l));
    if (above.length > 0 && map.queryRenderedFeatures(e.point, { layers: above }).length > 0) return;
    const id = hitAt(e);
    if (id) onSelect(id);
  });

  // Chuỗi đang xem nằm trong store (ô tìm bật/tắt); lớp tự theo dõi để không cần nối qua MapView
  layerState.set(map, { selected: null, brandIds: [] });
  let lastFocus = useMapStore.getState().brandFocus;
  if (lastFocus) showBrandOnMap(map, lastFocus);
  const unsubscribe = useMapStore.subscribe((state) => {
    if (state.brandFocus === lastFocus) return;
    lastFocus = state.brandFocus;
    showBrandOnMap(map, lastFocus);
  });
  map.on('remove', unsubscribe);

  let hovering = false;
  map.on('mousemove', (e) => {
    const over = hitAt(e) !== undefined;
    if (over === hovering) return;
    hovering = over;
    map.getCanvas().style.cursor = over ? 'pointer' : '';
  });
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
  const st = layerState.get(map) ?? { selected: null, brandIds: [] };
  st.selected = externalId;
  layerState.set(map, st);
  applyFilters(map);
}

/**
 * Đổi giao diện sáng/tối: lớp quán giữ bảng màu sáng cố định (`MAP_COLORS`) nên không có gì để đổi. Giữ hàm để
 * MapView gọi chung với các lớp khác; nếu sau này nền bản đồ có bản tối thì dựng lại ảnh + màu chữ ở đây.
 */
export function updatePoiLayerTheme(map: MapLibreMap): void {
  void map;
}
