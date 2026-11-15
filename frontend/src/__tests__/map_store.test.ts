import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { mockPois } from '../mocks/mockData';
import { roomApi } from '../services/api';
import { tokenStorage } from '../services/storage/tokenStorage';
import { MOCK_HOST_TOKEN, mockRoom } from '../mocks/mockData';
import {
  BLOCK_CELLS,
  GRID_DEG,
  bboxParam,
  cellsForBounds,
  distanceKm,
  mergePois,
  planFetches,
  useMapStore,
} from '../store/useMapStore';

// Khung nhìn quanh Q.1 (HCM)
const Q1 = { minLat: 10.765, minLng: 106.69, maxLat: 10.785, maxLng: 106.71 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => useMapStore.getState().reset());
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
});
afterAll(() => server.close());

describe('T-27: lưới cache bbox', () => {
  it('bboxParam theo thứ tự min_lat,min_lng,max_lat,max_lng', () => {
    expect(bboxParam(Q1)).toBe('10.765,106.69,10.785,106.71');
  });

  it('cellsForBounds phủ kín khung nhìn', () => {
    const cells = cellsForBounds(Q1);
    expect(cells.length).toBeGreaterThanOrEqual(1);
    const minIx = Math.min(...cells.map((c) => c.ix));
    const maxIx = Math.max(...cells.map((c) => c.ix));
    expect(minIx * GRID_DEG).toBeLessThanOrEqual(Q1.minLng);
    expect((maxIx + 1) * GRID_DEG).toBeGreaterThanOrEqual(Q1.maxLng);
  });

  it('planFetches: bbox snap ra ô lưới, ≤ 0,2° và không trùng ô đã tải', () => {
    const plans = planFetches(Q1, {});
    expect(plans).toHaveLength(1);
    const { bbox } = plans[0];
    expect(bbox.minLat).toBeLessThanOrEqual(Q1.minLat);
    expect(bbox.maxLat).toBeGreaterThanOrEqual(Q1.maxLat);
    expect(bbox.maxLat - bbox.minLat).toBeLessThanOrEqual(0.2);

    const loaded = Object.fromEntries(plans[0].cellKeys.map((k) => [k, true as const]));
    expect(planFetches(Q1, loaded)).toHaveLength(0);
  });

  it('planFetches: khung nhìn rộng được tách thành nhiều request ≤ 0,2°', () => {
    const wide = { minLat: 10.6, minLng: 106.5, maxLat: 10.95, maxLng: 106.9 };
    const plans = planFetches(wide, {});
    expect(plans.length).toBeGreaterThan(1);
    for (const { bbox } of plans) {
      expect(bbox.maxLat - bbox.minLat).toBeLessThanOrEqual(BLOCK_CELLS * GRID_DEG + 1e-9);
      expect(bbox.maxLng - bbox.minLng).toBeLessThanOrEqual(BLOCK_CELLS * GRID_DEG + 1e-9);
    }
    const total = plans.reduce((n, p) => n + p.cellKeys.length, 0);
    expect(total).toBe(cellsForBounds(wide).length);
  });
});

describe('T-27: useMapStore', () => {
  it('mergePois gộp theo external_id, bản mới ghi đè', () => {
    const a = mockPois[0];
    const merged = mergePois({ [a.external_id]: a }, [{ ...a, name: 'Tên mới' }, mockPois[1]]);
    expect(Object.keys(merged)).toHaveLength(2);
    expect(merged[a.external_id].name).toBe('Tên mới');
  });

  it('loadBounds tải POI, đánh dấu ô đã tải và không gọi lại khi pan trong vùng đã có', async () => {
    await useMapStore.getState().loadBounds(Q1);
    const first = useMapStore.getState();
    expect(Object.keys(first.poisById).length).toBeGreaterThan(0);
    expect(Object.keys(first.loadedCells).length).toBeGreaterThan(0);

    let calls = 0;
    server.events.on('request:start', () => calls++);
    await useMapStore.getState().loadBounds(Q1);
    expect(calls).toBe(0);
    server.events.removeAllListeners();
  });

  it('search lưu kết quả vào cache POI', async () => {
    const results = await useMapStore.getState().search('cà phê', { lat: 10.7769, lng: 106.7009 });
    const s = useMapStore.getState();
    expect(s.searchResults).toEqual(results);
    for (const p of results) expect(s.poisById[p.external_id]).toBeDefined();
  });

  it('T-102: search lấy cả chuỗi; showBrand nạp mọi chi nhánh vào cache, gõ tiếp thì tắt', async () => {
    const near = { lat: 10.7725, lng: 106.699 };
    await useMapStore.getState().search('phuc long', near);
    const brand = useMapStore.getState().brandResults[0];
    expect(brand).toMatchObject({ brand_key: 'phuc-long', count: 3 });

    const pois = await useMapStore.getState().showBrand(brand, near);
    let s = useMapStore.getState();
    expect(pois.map((p) => p.external_id)).toEqual([
      'ovt:mock-phuclong-1',
      'ovt:mock-phuclong-2',
      'ovt:mock-phuclong-3',
    ]);
    expect(s.brandFocus?.pois).toEqual(pois);
    expect(s.isLoadingBrand).toBe(false);
    for (const p of pois) expect(s.poisById[p.external_id]).toBeDefined();

    await useMapStore.getState().search('vincom', near);
    s = useMapStore.getState();
    expect(s.brandFocus).toBeNull();
    expect(s.brandResults).toEqual([]);

    await useMapStore.getState().showBrand(brand, near);
    useMapStore.getState().clearSearch();
    expect(useMapStore.getState().brandFocus).toBeNull();
  });

  it('T-102: truy vấn 1 ký tự không hỏi chuỗi; lỗi /brands không làm mất kết quả quán', async () => {
    await useMapStore.getState().search('p');
    expect(useMapStore.getState().brandResults).toEqual([]);
    server.use(http.get('*/api/v1/pois/brands', () => HttpResponse.json({}, { status: 500 })));
    const results = await useMapStore.getState().search('phuc long');
    expect(results.length).toBeGreaterThan(0);
    expect(useMapStore.getState().searchResults).toEqual(results);
    expect(useMapStore.getState().brandResults).toEqual([]);
  });

  it('chọn POI / quán rồi bỏ chọn', () => {
    const s = useMapStore.getState();
    s.selectPoi('osm:node/1');
    expect(useMapStore.getState().selection).toEqual({ kind: 'poi', id: 'osm:node/1' });
    s.selectPlace('p1');
    expect(useMapStore.getState().selection).toEqual({ kind: 'place', id: 'p1' });
    s.selectPoi(null);
    expect(useMapStore.getState().selection).toBeNull();
  });

  it('distanceKm: ~1,1 km cho 0,01° vĩ độ', () => {
    expect(distanceKm(10.77, 106.7, 10.78, 106.7)).toBeCloseTo(1.11, 1);
  });
});

describe('T-27: PATCH room (CR-03)', () => {
  it('Host đổi điểm hẹn qua roomApi.updateRoom', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    const room = await roomApi.updateRoom(mockRoom.id, { origin_lat: 10.78, origin_lng: 106.7 });
    expect(room.origin_lat).toBe(10.78);
    expect(room.origin_lng).toBe(106.7);
  });
});
