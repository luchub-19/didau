import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  BASEMAP_POI_KEEP_FILTER,
  POI_BRAND_LAYER,
  POI_DOT_LAYER,
  POI_ICON_LAYER,
  POI_SELECTED_LAYER,
  hideBasemapPois,
  highlightPoi,
  brandBounds,
  installPoiLayer,
  poiLayerFilters,
  poisToGeoJSON,
} from '../components/map/PoiLayer';
import { useMapStore } from '../store/useMapStore';
import { KIND_CATEGORY, KIND_GLYPH, poiIconKey } from '../components/map/poiIcons';
import type { Poi } from '../types';

// T-101: lớp quán icon + tên theo minzoom, ẩn POI nền nhóm mình thay thế

const poi = (over: Partial<Poi> = {}): Poi => ({
  external_id: 'ovt:1',
  name: 'Phúc Long',
  category: 'DRINK',
  lat: 10.77,
  lng: 106.7,
  kind: 'cafe',
  score: 80,
  minzoom: 15,
  ...over,
});

/** Chạy filter của style như MapLibre (zoom nguyên, thuộc tính feature). */
function passes(filter: unknown, zoom: number, properties: Record<string, unknown>): boolean {
  return featureFilter(filter).filter({ zoom }, { type: 1, properties, geometry: [] } as never);
}

describe('poisToGeoJSON', () => {
  it('gắn ảnh theo kind, minzoom/score mặc định khi thiếu', () => {
    const fc = poisToGeoJSON([
      poi(),
      poi({ external_id: 'osm:node/1', kind: null, category: 'FOOD', score: undefined, minzoom: undefined }),
      poi({ external_id: 'x', category: 'WEIRD' as never, kind: 'spaceship' as never }),
    ]);
    expect(fc.features[0].properties).toMatchObject({
      id: 'ovt:1',
      icon: 'poi-icon-cafe',
      pin: 'poi-pin-cafe',
      dot: 'poi-dot-DRINK',
      minzoom: 15,
      score: 80,
    });
    // Snapshot cũ không có kind/minzoom: icon theo category, chỉ hiện từ z17
    expect(fc.features[1].properties).toMatchObject({ icon: 'poi-icon-c-FOOD', minzoom: 17, score: 0 });
    // Giá trị lạ không làm thiếu ảnh
    expect(fc.features[2].properties).toMatchObject({ category: 'OTHER', icon: 'poi-icon-c-OTHER' });
  });

  it('mọi kind có icon và category khớp backend', () => {
    expect(Object.keys(KIND_GLYPH).sort()).toEqual(Object.keys(KIND_CATEGORY).sort());
    expect(poiIconKey('mall', 'SHOPPING')).toBe('mall');
    expect(KIND_CATEGORY.karaoke).toBe('ENTERTAINMENT');
  });
});

describe('bộ lọc ba lớp theo zoom', () => {
  const f = poiLayerFilters(null);
  const props = { id: 'a', minzoom: 15 };

  it('icon từ minzoom, chấm nhỏ trong 2 mức trước đó', () => {
    expect(passes(f[POI_ICON_LAYER], 14, props)).toBe(false);
    expect(passes(f[POI_ICON_LAYER], 15, props)).toBe(true);
    expect(passes(f[POI_ICON_LAYER], 18, props)).toBe(true);
    expect(passes(f[POI_DOT_LAYER], 12, props)).toBe(false);
    expect(passes(f[POI_DOT_LAYER], 13, props)).toBe(true);
    expect(passes(f[POI_DOT_LAYER], 14, props)).toBe(true);
    expect(passes(f[POI_DOT_LAYER], 15, props)).toBe(false);
  });

  it('quán đang chọn chỉ vẽ ở lớp ghim, bỏ qua minzoom', () => {
    const sel = poiLayerFilters('a');
    expect(passes(sel[POI_SELECTED_LAYER], 12, props)).toBe(true);
    expect(passes(sel[POI_ICON_LAYER], 16, props)).toBe(false);
    expect(passes(sel[POI_DOT_LAYER], 14, props)).toBe(false);
    expect(passes(sel[POI_SELECTED_LAYER], 16, { id: 'b', minzoom: 12 })).toBe(false);
  });
});

describe('chi nhánh của chuỗi đang xem (T-102)', () => {
  const props = { id: 'a', minzoom: 17 };

  it('chi nhánh vẽ ở lớp chuỗi ở mọi zoom, không ở lớp icon/chấm', () => {
    const f = poiLayerFilters(null, ['a', 'b']);
    expect(passes(f[POI_BRAND_LAYER], 11, props)).toBe(true);
    expect(passes(f[POI_ICON_LAYER], 17, props)).toBe(false);
    expect(passes(f[POI_DOT_LAYER], 16, props)).toBe(false);
    // Quán khác giữ luật minzoom
    expect(passes(f[POI_BRAND_LAYER], 17, { id: 'c', minzoom: 12 })).toBe(false);
    expect(passes(f[POI_ICON_LAYER], 17, { id: 'c', minzoom: 12 })).toBe(true);
  });

  it('chi nhánh đang chọn chỉ vẽ ở lớp ghim', () => {
    const f = poiLayerFilters('a', ['a', 'b']);
    expect(passes(f[POI_SELECTED_LAYER], 12, props)).toBe(true);
    expect(passes(f[POI_BRAND_LAYER], 12, props)).toBe(false);
    expect(passes(f[POI_BRAND_LAYER], 12, { id: 'b', minzoom: 17 })).toBe(true);
  });

  it('brandBounds bao trọn mọi chi nhánh', () => {
    expect(brandBounds([])).toBeNull();
    expect(
      brandBounds([
        { lat: 10.77, lng: 106.7 },
        { lat: 10.8, lng: 106.66 },
        { lat: 10.75, lng: 106.74 },
      ]),
    ).toEqual([
      [106.66, 10.75],
      [106.74, 10.8],
    ]);
  });
});

describe('ẩn POI nền', () => {
  const keep = (cls: string, subclass?: string) => passes(BASEMAP_POI_KEEP_FILTER, 16, { class: cls, subclass });

  it('ẩn nhóm mình thay thế, giữ mốc định hướng', () => {
    for (const [c, s] of [
      ['restaurant', 'restaurant'],
      ['cafe', 'cafe'],
      ['fast_food', 'food_court'],
      ['shop', 'mall'],
      ['shop', 'coffee'],
      ['grocery', 'supermarket'],
      ['grocery', 'department_store'],
      ['alcohol_shop', 'beverages'],
      ['cinema', 'cinema'],
      ['park', 'park'],
      ['art_gallery', 'gallery'],
    ]) {
      expect(keep(c, s), `${c}/${s}`).toBe(false);
    }
    for (const [c, s] of [
      ['grocery', 'marketplace'],
      ['hospital', 'hospital'],
      ['school', 'school'],
      ['place_of_worship', 'buddhist'],
      ['bus', 'bus_stop'],
      ['lodging', 'hotel'],
      ['bank', 'bank'],
      ['theatre', 'theatre'],
      ['shop', 'convenience'],
      ['art_gallery', 'artwork'],
    ]) {
      expect(keep(c, s), `${c}/${s}`).toBe(true);
    }
    // Feature thiếu subclass không làm lỗi biểu thức
    expect(keep('hospital')).toBe(true);
  });

  it('gộp vào filter gốc của lớp poi, mỗi lớp một lần', () => {
    const filters: Record<string, unknown> = { poi_r1: ['>=', ['get', 'rank'], 1], poi_transit: undefined };
    const map = {
      getStyle: () => ({
        layers: [
          { id: 'poi_r1', type: 'symbol', 'source-layer': 'poi' },
          { id: 'poi_transit', type: 'symbol', 'source-layer': 'poi' },
          { id: 'road_label', type: 'symbol', 'source-layer': 'transportation_name' },
        ],
      }),
      getFilter: (id: string) => filters[id],
      setFilter: vi.fn((id: string, f: unknown) => (filters[id] = f)),
    } as unknown as MapLibreMap;
    expect(hideBasemapPois(map)).toEqual(['poi_r1', 'poi_transit']);
    expect(filters.poi_r1).toEqual(['all', ['>=', ['get', 'rank'], 1], BASEMAP_POI_KEEP_FILTER]);
    expect(filters.poi_transit).toEqual(BASEMAP_POI_KEEP_FILTER);
    expect(hideBasemapPois(map)).toEqual([]);
  });
});

/** Map giả đủ cho installPoiLayer: ghi lớp, handler và kết quả queryRenderedFeatures theo lớp. */
function fakeMap(rendered: Record<string, { id: string; at: [number, number] }[]>) {
  const layers: Record<string, { type: string; filter?: unknown }> = {};
  const handlers: Record<string, ((e: unknown) => void)[]> = {};
  const canvas = { style: { cursor: '' } };
  const map = {
    getStyle: () => ({ layers: [] }),
    hasImage: () => false,
    addImage: vi.fn(),
    updateImage: vi.fn(),
    addSource: vi.fn(),
    addLayer: (l: { id: string; type: string; filter?: unknown }) => (layers[l.id] = l),
    getLayer: (id: string) => layers[id] ?? (rendered[id] ? { id } : undefined),
    setFilter: (id: string, f: unknown) => (layers[id].filter = f),
    on: (ev: string, fn: (e: unknown) => void) => (handlers[ev] ??= []).push(fn),
    getCanvas: () => canvas,
    project: ([x, y]: [number, number]) => ({ x, y }),
    queryRenderedFeatures: (_g: unknown, opts: { layers: string[] }) =>
      opts.layers.flatMap((l) =>
        (rendered[l] ?? []).map((r) => ({
          layer: { id: l },
          properties: { id: r.id },
          geometry: { type: 'Point', coordinates: r.at },
        })),
      ),
  };
  const fire = (ev: string, x: number, y: number) => handlers[ev]?.forEach((h) => h({ point: { x, y } }));
  liveMaps.push(() => fire('remove', 0, 0));
  return { map: map as unknown as MapLibreMap, layers, fire, canvas };
}

// installPoiLayer theo dõi store tới khi map 'remove' — gỡ map giả của test trước để không nhận thay đổi store
const liveMaps: (() => void)[] = [];
afterEach(() => liveMaps.splice(0).forEach((remove) => remove()));

describe('installPoiLayer', () => {
  it('bốn lớp symbol (chấm, icon, chuỗi, ghim), không còn circle/gom cụm', () => {
    const { map, layers } = fakeMap({});
    installPoiLayer(map, vi.fn());
    expect(Object.keys(layers)).toEqual([POI_DOT_LAYER, POI_ICON_LAYER, POI_BRAND_LAYER, POI_SELECTED_LAYER]);
    expect(Object.values(layers).every((l) => l.type === 'symbol')).toBe(true);
  });

  it('màu cố định bảng sáng (chữ viền trắng) dù theme tối', () => {
    // Theme tối: mọi CSS variable trả màu tối — lớp quán không được đọc theo
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '31 29 26' }));
    try {
      const { map, layers } = fakeMap({});
      installPoiLayer(map, vi.fn());
      const icon = layers[POI_ICON_LAYER] as unknown as { paint: Record<string, unknown> };
      expect(icon.paint['text-halo-color']).toBe('#FFFFFF');
      expect(JSON.stringify(icon.paint['text-color'])).toContain('#C2410C');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('bấm: chấm sát điểm bấm thắng icon bên cạnh; icon thắng khi bấm trúng icon', () => {
    const { map, fire } = fakeMap({
      [POI_ICON_LAYER]: [{ id: 'icon', at: [100, 100] }],
      [POI_DOT_LAYER]: [{ id: 'dot', at: [114, 100] }],
    });
    const onSelect = vi.fn();
    installPoiLayer(map, onSelect);
    fire('click', 115, 100);
    expect(onSelect).toHaveBeenLastCalledWith('dot');
    fire('click', 104, 100);
    expect(onSelect).toHaveBeenLastCalledWith('icon');
  });

  it('nhường lớp quán của phòng nằm trên', () => {
    const { map, fire } = fakeMap({
      [POI_ICON_LAYER]: [{ id: 'icon', at: [100, 100] }],
      'room-places-circles': [{ id: 'place', at: [100, 100] }],
    });
    const onSelect = vi.fn();
    installPoiLayer(map, onSelect, { yieldTo: ['room-places-circles'] });
    fire('click', 100, 100);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('con trỏ tay khi rê lên quán; highlightPoi đổi filter cả ba lớp', () => {
    const { map, fire, canvas, layers } = fakeMap({ [POI_ICON_LAYER]: [{ id: 'icon', at: [50, 50] }] });
    installPoiLayer(map, vi.fn());
    fire('mousemove', 50, 50);
    expect(canvas.style.cursor).toBe('pointer');
    highlightPoi(map, 'icon');
    expect(layers[POI_SELECTED_LAYER].filter).toEqual(['==', ['get', 'id'], 'icon']);
    expect(JSON.stringify(layers[POI_ICON_LAYER].filter)).toContain('"icon"');
  });

  it('bật chuỗi trong store: lọc lại các lớp + fitBounds; tắt thì bỏ', () => {
    useMapStore.getState().reset();
    const { map, layers } = fakeMap({});
    const fitBounds = vi.fn();
    Object.assign(map, { fitBounds, getContainer: () => ({ clientWidth: 1280, clientHeight: 800 }) });
    installPoiLayer(map, vi.fn());
    const brand = { brand_key: 'phuc-long', name: 'Phúc Long', count: 2, nearest_km: 0.4 };
    useMapStore.setState({ brandFocus: { brand, pois: [] } });
    expect(fitBounds).not.toHaveBeenCalled(); // đang tải chi nhánh
    useMapStore.setState({
      brandFocus: { brand, pois: [poi({ external_id: 'p1' }), poi({ external_id: 'p2', lat: 10.8, lng: 106.65 })] },
    });
    expect(JSON.stringify(layers[POI_BRAND_LAYER].filter)).toContain('"p1","p2"');
    expect(fitBounds).toHaveBeenCalledTimes(1);
    expect(fitBounds.mock.calls[0][0]).toEqual([
      [106.65, 10.77],
      [106.7, 10.8],
    ]);
    useMapStore.getState().clearBrand();
    expect(JSON.stringify(layers[POI_BRAND_LAYER].filter)).not.toContain('"p1"');
    expect(fitBounds).toHaveBeenCalledTimes(1);
  });
});
