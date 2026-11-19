// T-96: thẻ đề xuất OMP theo loại (CR-15, PLAN gđ7 §5) + "Vì sao?" + vẽ đường (b). Thay algo_t89 (kiểu ALGO-02 cũ).
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup as renderRaw } from 'react-dom/server';
import type React from 'react';
import { http, HttpResponse } from 'msw';
import i18n from '../i18n';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { MOCK_HOST_TOKEN, MOCK_MEMBER_TOKEN, mockPlaces, mockRoom } from '../mocks/mockData';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useAlgoStore } from '../store/useAlgoStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { TieBlock } from '../components/decide/TieBlock';
import { TieSuggestionView, TieWhyBody, type TieSuggestionViewProps } from '../components/algo/TieSuggestion';
import {
  TIE_RESOLVE_PAYLOAD,
  activeRecommendedIds,
  buildCompareRows,
  buildWhyRows,
  formatMinutes,
  hasRecommendation,
  lockTarget,
  tieDelta,
  tieRefreshKey,
} from '../components/algo/tieSuggestionLogic';
import { decodePolyline, encodePolyline } from '../components/algo/polyline';
import { buildRouteFeatures } from '../components/algo/RouteLayer';
import { scheduleRoutesKey } from '../components/algo/useAlgoRoutes';
import { TIE_CHOOSE_INTENT } from '../room/placeView';
import type { CategoryTieSuggestion, MyRoutes, Place, ScheduleRoutes, TieSuggestion } from '../types';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

// Markup tĩnh mã hoá dấu nháy đơn (8' → 8&#x27;): giải mã để so chuỗi như người dùng đọc
const renderToStaticMarkup = (node: React.ReactElement) => renderRaw(node).split('&#x27;').join("'");

/* ---------- Dữ liệu mẫu: TC-04 (km khứ hồi ước lượng, ALGORITHMS gđ7 §8) ---------- */

const food = (over: Partial<CategoryTieSuggestion> = {}): CategoryTieSuggestion => ({
  category: 'FOOD',
  candidates: [
    { place_id: 'p1', name: 'Dinh Độc Lập', upvotes: 7, downvotes: 0, score: 7 },
    { place_id: 'p2', name: 'Saigon Centre', upvotes: 7, downvotes: 0, score: 7 },
    { place_id: 'p3', name: 'Vạn Hạnh Mall', upvotes: 7, downvotes: 0, score: 7 },
  ],
  recommended_place_id: 'p3',
  ranking: [
    { place_id: 'p3', rank: 1, psi: 50.278, max_km: 17.066, total_km: 37.647, max_min: 42 },
    { place_id: 'p1', rank: 2, psi: 51.457, max_km: 20.1, total_km: 36.9, max_min: 50 },
    { place_id: 'p2', rank: 3, psi: 54.122, max_km: 22, total_km: 38.5, max_min: 54 },
  ],
  members: [
    { member_id: 'm1', nickname: 'Bảo', km: 4.19, minutes: 12, rank: 1, weight: 1 },
    { member_id: 'm2', nickname: 'Lan', km: 16.391, minutes: 40, rank: 2, weight: 1.25 },
    { member_id: 'm3', nickname: 'Hà', km: 17.066, minutes: 42, rank: 3, weight: 1.5 },
  ],
  runner_up_psi: 51.457,
  excluded_member_count: 0,
  estimated: true,
  source: 'ESTIMATE',
  params: { lambda: 0.5, k: 1 },
  ...over,
});

const drink = (over: Partial<CategoryTieSuggestion> = {}): CategoryTieSuggestion =>
  food({
    category: 'DRINK',
    candidates: [
      { place_id: 'd1', name: 'Cộng Cà Phê', upvotes: 3, downvotes: 0, score: 3 },
      { place_id: 'd2', name: 'Phúc Long', upvotes: 3, downvotes: 0, score: 3 },
    ],
    recommended_place_id: 'd2',
    ranking: [
      { place_id: 'd2', rank: 1, psi: 20, max_km: 8, total_km: 18, max_min: 22 },
      { place_id: 'd1', rank: 2, psi: 21, max_km: 8, total_km: 19.4, max_min: 22 },
    ],
    source: 'VALHALLA',
    estimated: false,
    ...over,
  });

const tie = (suggestions: CategoryTieSuggestion[] = [food()], over: Partial<TieSuggestion> = {}): TieSuggestion => ({
  available: true,
  reason: null,
  suggestions,
  ...over,
});

const LOCK_P3 = { placeId: 'p3', name: 'Vạn Hạnh Mall' };

const viewProps = (over: Partial<TieSuggestionViewProps> = {}): TieSuggestionViewProps => ({
  suggestion: tie(),
  loading: false,
  error: false,
  isHost: true,
  iShared: true,
  showNudge: false,
  lock: LOCK_P3,
  myMemberId: 'm2',
  onConfirm: () => {},
  onOther: () => {},
  onShareOrigin: () => {},
  onRetry: () => {},
  onDismissNudge: () => {},
  ...over,
});

const html = (over: Partial<TieSuggestionViewProps> = {}) => renderToStaticMarkup(<TieSuggestionView {...viewProps(over)} />);
const count = (out: string, needle: string) => out.split(needle).length - 1;

type P = Pick<Place, 'id' | 'name' | 'score' | 'category' | 'status'>;
const place = (id: string, category: Place['category'], score: number, status: Place['status'] = 'VOTING'): P => ({
  id,
  name: id,
  score,
  category,
  status,
});

beforeAll(async () => {
  await i18n.changeLanguage('vi');
});

beforeEach(() => {
  useAlgoStore.getState().reset();
});

/* ---------- Hàm thuần ---------- */

describe('tieSuggestionLogic', () => {
  it('tieDelta: người xa nhất bớt phút so với hạng 2; bằng nhau thì cả nhóm bớt km; không bớt / một quán → null', () => {
    expect(tieDelta(food())).toEqual({ kind: 'max', minutes: 8 });
    expect(tieDelta(drink())).toEqual({ kind: 'total', km: 1.4 });
    expect(tieDelta(food({ ranking: [food().ranking[0]] }))).toBeNull();
    const same = food().ranking.map((r) => ({ ...r, max_min: 42, total_km: 37.647 }));
    expect(tieDelta(food({ ranking: same }))).toBeNull();
  });

  it('buildWhyRows xa → gần (T-108), đánh dấu chính mình; buildCompareRows theo hạng + số quán thiếu toạ độ', () => {
    const rows = buildWhyRows(food({ members: [...food().members].reverse() }), 'm2');
    expect(rows.map((r) => r.nickname)).toEqual(['Hà', 'Lan', 'Bảo']);
    expect(rows.map((r) => r.me)).toEqual([false, true, false]);
    const { rows: cmp, unranked } = buildCompareRows(
      food({ candidates: [...food().candidates, { place_id: 'p4', name: 'X', upvotes: 7, downvotes: 0, score: 7 }] }),
    );
    expect(cmp.map((c) => c.name)).toEqual(['Vạn Hạnh Mall', 'Dinh Độc Lập', 'Saigon Centre']);
    expect(cmp.map((c) => c.recommended)).toEqual([true, false, false]);
    expect(unranked).toBe(1);
  });

  it('định dạng phút theo locale; payload chốt chỉ có chiến lược', () => {
    expect(formatMinutes(1234, 'vi')).toBe("1.234'");
    expect(TIE_RESOLVE_PAYLOAD).toEqual({ strategy: 'TRAVEL_TIME', max_accepted_places: 1 });
  });

  it('hasRecommendation: cần quán đề xuất nằm trong ranking', () => {
    expect(hasRecommendation(food())).toBe(true);
    expect(hasRecommendation(food({ recommended_place_id: null, ranking: [] }))).toBe(false);
    expect(hasRecommendation(food({ recommended_place_id: 'zz' }))).toBe(false);
    expect(hasRecommendation(undefined)).toBe(false);
  });

  it('lockTarget: như backend — nhóm (điểm, loại) lớn nhất; loại so theo tên giảm dần', () => {
    const s = [food({ candidates: [], recommended_place_id: 'p3' }), drink()];
    // FOOD hoà 7–7, DRINK hoà 3–3 → FOOD (điểm cao hơn)
    expect(lockTarget([place('p1', 'FOOD', 7), place('p3', 'FOOD', 7), place('d1', 'DRINK', 3), place('d2', 'DRINK', 3)], [food(), drink()]))
      .toMatchObject({ placeId: 'p3', category: 'FOOD' });
    // DRINK hoà 3–3, FOOD một quán 3 điểm → nhóm (3, FOOD) đứng trước: chốt quán FOOD đó, không thẻ nào có nút
    expect(lockTarget([place('f9', 'FOOD', 3), place('d1', 'DRINK', 3), place('d2', 'DRINK', 3)], [drink()]))
      .toMatchObject({ placeId: 'f9', name: 'f9' });
    // DRINK điểm cao hơn → DRINK
    expect(lockTarget([place('f9', 'FOOD', 2), place('d1', 'DRINK', 3), place('d2', 'DRINK', 3)], [drink()]))
      .toMatchObject({ placeId: 'd2' });
    // Quán REJECTED không tính
    expect(lockTarget([place('f9', 'FOOD', 9, 'REJECTED'), place('d1', 'DRINK', 3), place('d2', 'DRINK', 3)], s))
      .toMatchObject({ placeId: 'd2' });
    // Loại đầu đang hoà nhưng chưa có đề xuất (chưa ai chia sẻ vị trí) → null
    expect(lockTarget([place('d1', 'DRINK', 3), place('d2', 'DRINK', 3)], [drink({ recommended_place_id: null, ranking: [] })])).toBeNull();
    expect(lockTarget([], [])).toBeNull();
  });

  it('activeRecommendedIds: bỏ loại đã có quán ACCEPTED và quán đề xuất đã bị loại', () => {
    const t = tie([food(), drink()]);
    const ps = [place('p3', 'FOOD', 7), place('d2', 'DRINK', 3)];
    expect(activeRecommendedIds(t, ps)).toEqual(['p3', 'd2']);
    expect(activeRecommendedIds(t, [...ps, place('x', 'FOOD', 1, 'ACCEPTED')])).toEqual(['d2']);
    expect(activeRecommendedIds(t, [place('p3', 'FOOD', 7, 'REJECTED'), place('d2', 'DRINK', 3)])).toEqual(['d2']);
    expect(activeRecommendedIds(null, ps)).toEqual([]);
  });

  it('tieRefreshKey đổi khi phiếu / điểm / loại / vị trí đổi, không đổi vì dữ liệu không liên quan', () => {
    const places = [{ id: 'a', upvotes: 2, score: 2, category: 'FOOD' as const, status: 'PROPOSED' as const }];
    const members = [{ id: 'm1', has_origin: false }];
    const room = { origin_lat: null, origin_lng: null };
    const base = tieRefreshKey(places, members, room, null);
    expect(tieRefreshKey([{ ...places[0], score: 1 }], members, room, null)).not.toBe(base);
    expect(tieRefreshKey([{ ...places[0], category: 'DRINK' }], members, room, null)).not.toBe(base);
    expect(tieRefreshKey(places, [{ id: 'm1', has_origin: true }], room, null)).not.toBe(base);
    expect(tieRefreshKey(places, members, room, { origin_lat: 10.7, origin_lng: 106.6 })).not.toBe(base);
    expect(tieRefreshKey([...places], [...members], { ...room }, null)).toBe(base);
  });
});

/* ---------- Polyline + lớp đường ---------- */

describe('polyline độ chính xác 6', () => {
  // Ví dụ chuẩn của Google: ở độ chính xác 5 ra (38.5,-120.2) …; cùng chuỗi đọc ở 6 phải nhỏ hơn 10 lần
  const SAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

  it('giải đúng hệ số: 1e5 → toạ độ mẫu Google, 1e6 (mặc định, Valhalla) → chia 10', () => {
    const p5 = decodePolyline(SAMPLE, 5);
    expect(p5[0][0]).toBeCloseTo(-120.2, 5);
    expect(p5[0][1]).toBeCloseTo(38.5, 5);
    expect(p5[2][1]).toBeCloseTo(43.252, 5);
    const p6 = decodePolyline(SAMPLE);
    expect(p6[0][1]).toBeCloseTo(3.85, 6);
    expect(p6[0][0]).toBeCloseTo(-12.02, 6);
  });

  it('mã hoá ↔ giải mã khép kín ở TP.HCM (sai < 1e-6), chuỗi cụt không ném lỗi', () => {
    const pts: [number, number][] = [[106.682, 10.7626], [106.7018, 10.7781], [106.7218, 10.795]];
    const back = decodePolyline(encodePolyline(pts));
    back.forEach(([lng, lat], i) => {
      expect(Math.abs(lng - pts[i][0])).toBeLessThan(1e-6);
      expect(Math.abs(lat - pts[i][1])).toBeLessThan(1e-6);
    });
    const enc = encodePolyline(pts);
    expect(() => decodePolyline(enc.slice(0, enc.length - 3))).not.toThrow();
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('buildRouteFeatures', () => {
  const me = { lat: 10.7626, lng: 106.682 };
  const vhm = { lat: 10.7702, lng: 106.6698 };
  const shape = encodePolyline([[106.682, 10.7626], [106.675, 10.766], [106.6698, 10.7702]]);
  const routes = (s: string | null): MyRoutes => ({
    place_id: 'p3',
    to_place: { km: 3.1, minutes: 8, shape: s, source: s ? 'VALHALLA' : 'ESTIMATE' },
    to_home: { km: 3.3, minutes: 8, shape: s, source: s ? 'VALHALLA' : 'ESTIMATE' },
  });
  type F = { geometry: { type: string; coordinates: unknown }; properties: { kind: string; real?: boolean } };
  const feats = (fc: GeoJSON.FeatureCollection) => fc.features as unknown as F[];

  it('có shape: vẽ đi (đậm) + về (nhạt) bằng đường thật, ghim nhà mình một lần', () => {
    const fs = feats(buildRouteFeatures([{ routes: routes(shape), origin: me, place: vhm }], null));
    expect(fs.map((f) => [f.properties.kind, f.properties.real ?? null])).toEqual([
      ['mine-to', true],
      ['mine-home', true],
      ['home', null],
    ]);
    expect((fs[0].geometry.coordinates as number[][]).length).toBe(3);
  });

  it('shape null (ước lượng): một nét đứt thẳng nhà mình → quán, không vẽ chiều về', () => {
    const fs = feats(buildRouteFeatures([{ routes: routes(null), origin: me, place: vhm }], null));
    expect(fs.filter((f) => f.geometry.type === 'LineString').map((f) => [f.properties.kind, f.properties.real])).toEqual([['mine-to', false]]);
    expect(fs[0].geometry.coordinates).toEqual([[me.lng, me.lat], [vhm.lng, vhm.lat]]);
  });

  it('đường lịch: shape → thật, null → nét thẳng giữa hai quán; thiếu toạ độ thì bỏ', () => {
    const legs: ScheduleRoutes['legs'] = [
      { from_item_id: 'i1', to_item_id: 'i2', km: 1, minutes: 3, shape, source: 'VALHALLA' },
      { from_item_id: 'i2', to_item_id: 'i3', km: 1, minutes: 3, shape: null, source: 'ESTIMATE' },
      { from_item_id: 'i3', to_item_id: 'i9', km: 1, minutes: 3, shape: null, source: 'ESTIMATE' },
    ];
    const itemCoords = new Map([['i1', me], ['i2', vhm], ['i3', { lat: 10.78, lng: 106.7 }]]);
    const fs = feats(buildRouteFeatures([], { legs, itemCoords }));
    expect(fs.map((f) => [f.properties.kind, f.properties.real])).toEqual([['schedule', true], ['schedule', false]]);
  });

  it('scheduleRoutesKey đổi khi giờ / toạ độ quán đổi, bỏ qua mục ngày khác', () => {
    const items = [
      { id: 'i1', place_id: 'a', start_minute: 1080, end_minute: 1140, day_offset: 0 },
      { id: 'i2', place_id: 'b', start_minute: 1200, end_minute: 1260, day_offset: 1 },
    ] as unknown as Parameters<typeof scheduleRoutesKey>[0];
    const ps = [{ id: 'a', latitude: 10.7, longitude: 106.6 }];
    const base = scheduleRoutesKey(items, ps);
    expect(scheduleRoutesKey([{ ...items[0], start_minute: 1090 }, items[1]], ps)).not.toBe(base);
    expect(scheduleRoutesKey(items, [{ id: 'a', latitude: 10.71, longitude: 106.6 }])).not.toBe(base);
    expect(scheduleRoutesKey([items[0], { ...items[1], start_minute: 0 }], ps)).toBe(base);
  });
});

/* ---------- Markup các trạng thái ---------- */

describe('TieSuggestionView', () => {
  it('host + thẻ chốt thật: câu ngắn kèm số, nút Chốt, Cách khác, Vì sao?; không có chữ Ψ', () => {
    const out = html();
    expect(out).toContain('Ăn uống đang hoà');
    expect(out).toContain('Chọn Vạn Hạnh Mall sẽ tốt hơn');
    expect(out).toContain("người xa nhất bớt 8'");
    expect(out).toContain('data-testid="tie-cta"');
    expect(out).toContain('Chốt Vạn Hạnh Mall');
    expect(out).toContain('data-testid="tie-change"');
    expect(out).toContain('data-testid="tie-why-panel-link"');
    expect(out).not.toContain('tie-waiting');
    expect(out).not.toMatch(/Ψ|psi/i);
  });

  it('thành viên: thấy đề xuất + "Đang chờ chủ phòng chốt" + Vì sao?, KHÔNG có nút chốt/Cách khác', () => {
    const out = html({ isHost: false });
    expect(out).toContain('Chọn Vạn Hạnh Mall sẽ tốt hơn');
    expect(out).toContain('Đang chờ chủ phòng chốt');
    expect(out).toContain('data-testid="tie-why-panel-link"');
    expect(out).not.toContain('tie-cta');
    expect(out).not.toContain('tie-change');
  });

  it('nhiều loại cùng hoà (§5.1): mỗi loại một thẻ; chỉ thẻ chốt thật có nút, thẻ còn lại nói rõ nút giữ quán nào', () => {
    const out = html({ suggestion: tie([food(), drink()]) });
    expect(count(out, 'data-testid="tie-card"')).toBe(2);
    expect(out).toContain('data-category="FOOD"');
    expect(out).toContain('data-category="DRINK"');
    expect(out).toContain('Cà phê đang hoà');
    expect(out).toContain('Chọn Phúc Long sẽ tốt hơn');
    expect(out).toContain('cả nhóm bớt 1,4 km');
    expect(count(out, 'data-testid="tie-cta"')).toBe(1);
    expect(count(out, 'data-testid="tie-lock-elsewhere"')).toBe(1);
    expect(out).toContain('nút chốt sẽ giữ Vạn Hạnh Mall');
    // "Cách khác" chỉ một lần cho cả khối
    expect(count(out, 'data-testid="tie-change"')).toBe(1);
  });

  it('nút chốt sẽ giữ một quán không hoà (lock ngoài các thẻ): không thẻ nào có nút', () => {
    const out = html({ suggestion: tie([drink()]), lock: { placeId: 'f9', name: 'Cơm Tấm Ba Ghiền' } });
    expect(out).not.toContain('tie-cta');
    expect(out).toContain('nút chốt sẽ giữ Cơm Tấm Ba Ghiền');
  });

  it('một loại có đề xuất, loại kia thiếu toạ độ hết: thẻ thứ hai giải thích, không có câu đề xuất', () => {
    const out = html({ suggestion: tie([food(), drink({ recommended_place_id: null, ranking: [], members: [] })]) });
    expect(out).toContain('data-ready="false"');
    expect(out).toContain('data-testid="tie-card-no-coords"');
    expect(count(out, 'data-testid="tie-recommended"')).toBe(1);
  });

  it('NO_ORIGINS: nhắc chia sẻ (khi mình chưa chia sẻ), không có nút chốt, không còn "đặt điểm hẹn"', () => {
    const s = tie([food({ recommended_place_id: null, ranking: [], members: [], excluded_member_count: 3 })], {
      available: false,
      reason: 'NO_ORIGINS',
    });
    const host = html({ suggestion: s, iShared: false });
    expect(host).toContain('data-reason="NO_ORIGINS"');
    expect(host).toContain('Chưa ai chia sẻ vị trí');
    expect(host).toContain('data-testid="tie-share-origin"');
    expect(host).toContain('data-testid="tie-change"');
    expect(host).not.toContain('tie-cta');
    expect(host).not.toContain('tie-set-meeting');
    expect(html({ suggestion: s, iShared: true })).not.toContain('tie-share-origin');
    const member = html({ suggestion: s, iShared: false, isHost: false });
    expect(member).toContain('data-testid="tie-share-origin"');
    expect(member).not.toContain('tie-change');
  });

  it('NO_PLACE_COORDS và NO_TIE (giai đoạn hoà do NEAR_TIE): giải thích + Cách khác', () => {
    const coords = html({ suggestion: tie([food({ recommended_place_id: null, ranking: [] })], { available: false, reason: 'NO_PLACE_COORDS' }) });
    expect(coords).toContain('chưa có toạ độ nên chưa tính được quãng đường');
    expect(coords).toContain('data-testid="tie-change"');
    const noTie = html({ suggestion: { available: false, reason: 'NO_TIE', suggestions: [] } });
    expect(noTie).toContain('data-testid="tie-no-tie"');
    expect(noTie).toContain('data-testid="tie-change"');
  });

  it('đang tải lần đầu: skeleton role=status; đã có bản cũ thì giữ nguyên + aria-busy', () => {
    const first = html({ suggestion: null, loading: true });
    expect(first).toContain('data-testid="tie-loading"');
    expect(first).toContain('role="status"');
    expect(first).toContain('data-testid="tie-change"');
    const refresh = html({ loading: true });
    expect(refresh).not.toContain('tie-loading');
    expect(refresh).toContain('Chọn Vạn Hạnh Mall sẽ tốt hơn');
    expect(refresh).toContain('aria-busy="true"');
  });

  it('lỗi: câu báo + Thử lại + Cách khác; có bản cũ thì giữ bản cũ và báo nhỏ', () => {
    const out = html({ suggestion: null, error: true });
    expect(out).toContain('data-testid="tie-error"');
    expect(out).toContain('role="alert"');
    expect(out).toContain('data-testid="tie-retry"');
    const stale = html({ error: true });
    expect(stale).toContain('Chọn Vạn Hạnh Mall sẽ tốt hơn');
    expect(stale).toContain('data-testid="tie-refresh-error"');
  });

  it('lời nhắc chia sẻ vị trí: chỉ khi mình chưa chia sẻ và chưa nhắc', () => {
    expect(html({ iShared: false, showNudge: true })).toContain('Chia sẻ vị trí để bạn được tính vào');
    expect(html({ iShared: true, showNudge: true })).not.toContain('tie-nudge');
    expect(html({ iShared: false, showNudge: false })).not.toContain('tie-nudge');
  });

  it('lỗi chốt hiện dưới nút (role=alert) và nút khoá khi đang chốt', () => {
    const out = html({ resolveError: 'Không chốt được', confirming: true });
    expect(out).toContain('Không chốt được');
    expect(out).toContain('Đang chốt…');
    expect(out).toMatch(/data-testid="tie-cta"[^>]*disabled|disabled[^>]*data-testid="tie-cta"/);
  });

  it('EN: câu đề xuất, số, nút chốt, chờ host, "Vì sao?"', async () => {
    await i18n.changeLanguage('en');
    try {
      const host = html({ suggestion: tie([food(), drink()]) });
      expect(host).toContain(`${en.category.food.replace('&', '&amp;')} is tied`);
      expect(host).toContain('Picking Vạn Hạnh Mall works better');
      expect(host).toContain("farthest person saves 8'");
      expect(host).toContain('group travels 1.4 km less');
      expect(host).toContain('Lock in Vạn Hạnh Mall');
      expect(host).toContain('Other ways');
      expect(html({ isHost: false })).toContain('Waiting for the host to lock it in');
      const why = renderToStaticMarkup(<TieWhyBody suggestion={food()} myMemberId="m2" />);
      expect(why).toContain('(you)');
      expect(why).toContain('4.2 km');
      expect(why).toContain('If we only added up the km');
    } finally {
      await i18n.changeLanguage('vi');
    }
  });
});

describe('TieWhyBody ("Vì sao?") — chi tiết ở algo_t108', () => {
  it('nhãn nguồn giữ như cũ + thêm Valhalla / lẫn (§5.6)', () => {
    expect(vi.algo.why.sourceEstimate).toBe('Ước lượng · xe máy');
    expect(vi.algo.why.sourceValhalla).toBe('Valhalla · xe máy');
    expect(en.algo.why.sourceValhalla).toBe('Valhalla · motorbike');
    expect(en.algo.why.sourceGoogle).toBe('Google Maps');
  });
});

/* ---------- TieBlock ---------- */

describe('TieBlock + TieSuggestionCard', () => {
  const tied = [
    { ...mockPlaces[1], id: 'p1', name: 'Dinh Độc Lập', upvotes: 7, score: 7 },
    { ...mockPlaces[1], id: 'p3', name: 'Vạn Hạnh Mall', upvotes: 7, score: 7 },
  ];
  const hints = [{ type: 'TIE_AT_TOP' as const, category: 'FOOD' as const, candidate_place_ids: ['p1', 'p3'] }];
  const render = (source: Parameters<typeof TieBlock>[0]['suggestionSource']) =>
    renderToStaticMarkup(<TieBlock phase="tie" hints={hints} places={tied} onDecide={() => {}} suggestionSource={source} />);

  it('thẻ vẽ tiêu đề + đề xuất kèm ảnh nhỏ, không tự mở modal', () => {
    const out = render({ suggestion: tie(), loading: false, error: false, isHost: true, iShared: true, showNudge: false, lock: LOCK_P3 });
    expect(out).toContain('Chọn Vạn Hạnh Mall sẽ tốt hơn');
    expect(out).toContain('data-testid="tie-thumb"');
    expect(out).toContain('data-testid="tie-cta"');
    expect(out).not.toContain('role="dialog"');
  });

  it('chỉ ở giai đoạn tie; "Cách khác" mở ở bước chọn kiểu', () => {
    for (const phase of ['gather', 'vote', 'lock', 'send'] as const) {
      expect(renderToStaticMarkup(<TieBlock phase={phase} hints={hints} places={tied} onDecide={() => {}} />)).toBe('');
    }
    expect(TIE_CHOOSE_INTENT).toEqual({ chooseMode: true });
  });
});

/* ---------- Store + MSW (CR-15) ---------- */

describe('store + MSW: đề xuất, đường của mình, đường lịch', () => {
  const BASE = `http://localhost/api/v1/rooms/${mockRoom.id}`;
  const HOST_HOME = { lat: 10.7626123, lng: 106.6820456 };
  const GUEST_HOME = { lat: 10.7950789, lng: 106.7218321 };
  const auth = (token: string) => ({ 'X-Member-Token': token, 'Content-Type': 'application/json' });
  const share = async (token: string, o: { lat: number; lng: number }) => {
    const r = await fetch(`${BASE}/members/me`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ origin_lat: o.lat, origin_lng: o.lng }) });
    expect(r.status).toBe(200);
  };
  const near = (a: [number, number], b: { lat: number; lng: number }) => Math.abs(a[0] - b.lng) < 1e-5 && Math.abs(a[1] - b.lat) < 1e-5;

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    resetMockDb();
    tokenStorage.clearAll();
  });
  afterAll(() => server.close());

  it('fetchTieSuggestion: lưu kiểu CR-15 (suggestions theo loại); lỗi giữ bản cũ + bật cờ lỗi', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    await useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    const st = useAlgoStore.getState();
    expect(st.tieLoading).toBe(false);
    expect(st.tieSuggestion?.suggestions.map((x) => x.category)).toEqual(['FOOD']);
    const old = st.tieSuggestion;
    server.use(http.get('*/api/v1/rooms/:roomId/tie-break/suggestion', () => HttpResponse.json({ detail: 'x' }, { status: 500 })));
    await useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    expect(useAlgoStore.getState().tieSuggestion).toBe(old);
    expect(useAlgoStore.getState().tieError).toBe(true);
  });

  it('fetchMyRoutes: chưa chia sẻ → NO_ORIGIN (nhắc chia sẻ); đã chia sẻ → shape bắt đầu ở nhà MÌNH', async () => {
    tokenStorage.setToken(MOCK_MEMBER_TOKEN);
    const placeId = mockPlaces[1].id;
    await useAlgoStore.getState().fetchMyRoutes(mockRoom.id, [placeId]);
    expect(useAlgoStore.getState().myRoutesNoOrigin).toBe(true);
    expect(useAlgoStore.getState().myRoutes).toEqual({});

    await share(MOCK_MEMBER_TOKEN, GUEST_HOME);
    await useAlgoStore.getState().fetchMyRoutes(mockRoom.id, [placeId]);
    const r = useAlgoStore.getState().myRoutes[placeId];
    expect(useAlgoStore.getState().myRoutesNoOrigin).toBe(false);
    const to = decodePolyline(r.to_place.shape!);
    expect(near(to[0], GUEST_HOME)).toBe(true);
    expect(near(to[to.length - 1], { lat: mockPlaces[1].latitude!, lng: mockPlaces[1].longitude! })).toBe(true);
    const home = decodePolyline(r.to_home.shape!);
    expect(near(home[home.length - 1], GUEST_HOME)).toBe(true);
    useAlgoStore.getState().clearMyRoutes();
    expect(useAlgoStore.getState().myRoutes).toEqual({});
  });

  it('quét payload (CR-11): đề xuất / routes/me / schedule/routes không lộ toạ độ người khác, đường không chạm nhà người khác', async () => {
    await share(MOCK_HOST_TOKEN, HOST_HOME);
    await share(MOCK_MEMBER_TOKEN, GUEST_HOME);
    // Thêm mục thứ hai vào lịch để có một chặng
    const add = await fetch(`${BASE}/schedule`, {
      method: 'POST',
      headers: auth(MOCK_HOST_TOKEN),
      body: JSON.stringify({ place_id: mockPlaces[1].id, day_offset: 0, start_minute: 1200, end_minute: 1260 }),
    });
    expect(add.status).toBe(201);

    const asGuest = async (path: string) => {
      const res = await fetch(`${BASE}${path}`, { headers: auth(MOCK_MEMBER_TOKEN) });
      expect(res.status).toBe(200);
      return res.json();
    };
    const sugg = await asGuest('/tie-break/suggestion');
    const mine = (await asGuest(`/routes/me?place_id=${mockPlaces[1].id}`)) as MyRoutes;
    const sched = (await asGuest('/schedule/routes')) as ScheduleRoutes;
    expect(sched.legs).toHaveLength(1);

    const dump = JSON.stringify([sugg, mine, sched]);
    for (const v of [HOST_HOME.lat, HOST_HOME.lng, GUEST_HOME.lat, GUEST_HOME.lng]) {
      expect(dump).not.toContain(String(v));
      expect(dump).not.toContain(v.toFixed(4));
    }
    expect(dump).not.toMatch(/"(lat|lng|latitude|longitude|origin_lat|origin_lng|origin)"/);
    // Giải mã mọi shape: không điểm nào ở nhà chủ phòng (người khác)
    const shapes = [mine.to_place.shape, mine.to_home.shape, ...sched.legs.map((l) => l.shape)].filter((x): x is string => !!x);
    expect(shapes.length).toBe(3);
    for (const s of shapes) expect(decodePolyline(s).some((pt) => near(pt, HOST_HOME))).toBe(false);
  });

  it('fetchScheduleRoutes lưu chặng; lỗi giữ bản cũ', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    await useAlgoStore.getState().fetchScheduleRoutes(mockRoom.id);
    const first = useAlgoStore.getState().scheduleRoutes;
    expect(first).toEqual({ legs: [], unknown_leg_count: 0 });
    server.use(http.get('*/api/v1/rooms/:roomId/schedule/routes', () => HttpResponse.json({}, { status: 500 })));
    await useAlgoStore.getState().fetchScheduleRoutes(mockRoom.id);
    expect(useAlgoStore.getState().scheduleRoutes).toBe(first);
  });

  it('chốt: POST /voting/resolve đúng chiến lược TRAVEL_TIME, không kèm số nào từ client', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/v1/rooms/:roomId/voting/resolve', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ resolved_places: [], strategy: 'TRAVEL_TIME', tie_break_applied: true, room_status: 'FINALIZED' });
      }),
    );
    usePlaceStore.setState({ places: [] });
    await usePlaceStore.getState().resolveVoting(mockRoom.id, TIE_RESOLVE_PAYLOAD);
    expect(body).toEqual({ strategy: 'TRAVEL_TIME', max_accepted_places: 1 });
  });
});

/* ---------- i18n ---------- */

describe('i18n algo.tie / algo.route / algo.why', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  for (const group of ['tie', 'route', 'why'] as const) {
    it(`${group}: đủ khoá ở VI và EN, không chuỗi rỗng, cùng biến nội suy`, () => {
      const vg = vi.algo[group] as unknown as Record<string, string>;
      const eg = en.algo[group] as unknown as Record<string, string>;
      const vk = keys(vg).sort();
      expect(keys(eg).sort()).toEqual(vk);
      for (const k of vk) {
        expect(vg[k].length).toBeGreaterThan(0);
        expect(eg[k].length).toBeGreaterThan(0);
        const vars = (x: string) => (x.match(/{{\w+}}/g) ?? []).sort().join();
        expect(vars(eg[k])).toBe(vars(vg[k]));
      }
    });
  }
});
