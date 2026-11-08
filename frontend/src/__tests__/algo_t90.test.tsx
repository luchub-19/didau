// T-90: ALGO-04 (nhãn + thứ tự ưu tiên) và ALGO-03 (dải di chuyển + cảnh báo pastel trên lịch).
// `room/travel.ts` chạy chung `docs/phase6/algo-fixtures.json` với pytest: phải ra cùng từng số.
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup as renderRaw } from 'react-dom/server';
import type React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import i18n from '../i18n';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { MOCK_HOST_TOKEN, mockPlaces, mockRoom } from '../mocks/mockData';
import { tokenStorage } from '../services/storage/tokenStorage';
import { usePlaceStore } from '../store/usePlaceStore';
import { useAlgoStore } from '../store/useAlgoStore';
import { useRoomStore } from '../store/useRoomStore';
import {
  BUFFER_MIN,
  assessLeg,
  dismissKey,
  estimateFeasibility,
  estimateLeg,
  isPeak,
  loadDismissed,
  marginFor,
  pickLeg,
  planSummary,
  planTotals,
  riskFor,
  saveDismissed,
  stripLayout,
  stripVisible,
  toExportPlan,
  type LatLng,
} from '../room/travel';
import { hasPriority, maxEtaOf, primaryLabel, sortByPriority } from '../room/placeView';
import { PlaceRow } from '../components/places';
import { PlaceList } from '../components/places/PlaceList';
import { TravelStrip, TravelWhy } from '../components/schedule/TravelStrip';
import { CalendarColumn } from '../components/schedule';
import { ItemView } from '../components/schedule/CalendarItemPopover';
import { buildPlanText } from '../stage/card/planText';
import { PX_PER_MIN } from '../room/calendar';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';
import type { FeasibilityLeg, Place, PlacePriority, ScheduleItem } from '../types';

const renderToStaticMarkup = (node: React.ReactElement) => renderRaw(node).split('&#x27;').join("'");

/* eslint-disable @typescript-eslint/no-explicit-any */
const fixtures = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/phase6/algo-fixtures.json'), 'utf8'));
const pt = (ref: string | LatLng): LatLng => (typeof ref === 'string' ? fixtures.points[ref] : ref);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  await i18n.changeLanguage('vi');
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  usePlaceStore.getState().reset();
  useAlgoStore.getState().reset();
  useRoomStore.getState().reset();
});
afterAll(() => server.close());

/* ---------- room/travel.ts ↔ algo-fixtures.json ---------- */

describe('T-90: room/travel.ts khớp fixture từng số', () => {
  it('hằng số sao chép đúng algo_config.py (qua fixture)', () => {
    expect(BUFFER_MIN).toBe(fixtures._meta.constants.BUFFER_MIN);
  });

  it.each(fixtures.estimate.map((c: any) => [c.id, c]) as [string, any][])('ước lượng %s', (_id, c: any) => {
    const leg = estimateLeg(pt(c.from), pt(c.to));
    expect(leg.minutes).toBe(c.expect.minutes);
    expect(Math.abs(leg.distance_km - c.expect.distance_km)).toBeLessThanOrEqual(fixtures._meta.tolerance.distance_km);
    expect(leg.source).toBe(c.expect.source);
  });

  it.each(fixtures.margin.cases.map((c: any) => [c.id, c]) as [string, any][])('biên dự phòng %s', (_id, c: any) => {
    expect(marginFor(c.eta_min, c.end_curr_min, c.date)).toBe(c.expect_margin);
  });

  it('cao điểm nửa mở [16:30, 19:30), chỉ thứ Hai–Sáu, không biết ngày → không', () => {
    expect(isPeak(990, '2026-11-09')).toBe(true);
    expect(isPeak(1169, '2026-11-09')).toBe(true);
    expect(isPeak(1170, '2026-11-09')).toBe(false);
    expect(isPeak(989, '2026-11-09')).toBe(false);
    expect(isPeak(1080, '2026-11-07')).toBe(false); // thứ Bảy
    expect(isPeak(1080, '2026-11-08')).toBe(false); // Chủ nhật
    expect(isPeak(1080, undefined)).toBe(false);
    expect(isPeak(1080, '2026-11-08', 1)).toBe(true); // ngày phòng Chủ nhật + 1 = thứ Hai
  });

  it.each(fixtures.slack.cases.map((c: any) => [c.id, c]) as [string, any][])('slack cặp mục %s', (_id, c: any) => {
    const required = c.eta_min + c.margin_min + BUFFER_MIN;
    const slack = c.gap_min - required;
    expect(required).toBe(c.expect.required_min);
    expect(slack).toBe(c.expect.slack_min);
    expect(riskFor(c.gap_min, c.eta_min, slack)).toBe(c.expect.risk);
  });

  it('assessLeg dựng đủ một chặng (ví dụ "Vì sao?" §7: 12′ + 6′ + 5′, khe 15′ → thiếu 8′)', () => {
    const curr = { id: 'a', start_minute: 1020, end_minute: 1080, order_index: 0 };
    const next = { id: 'b', start_minute: 1095, end_minute: 1155, order_index: 1 };
    const leg = assessLeg(curr, next, { minutes: 12, distance_km: 3.2 }, '2026-11-09');
    expect(leg).toMatchObject({ eta_min: 12, margin_min: 6, buffer_min: 5, gap_min: 15, slack_min: -8, risk: 'SOFT_CONFLICT', peak: true });
    // Cùng một chỗ: không biên, không gửi xe
    const still = assessLeg(curr, { ...next, start_minute: 1080 }, { minutes: 0, distance_km: 0 }, '2026-11-09');
    expect(still).toMatchObject({ margin_min: 0, buffer_min: 0, slack_min: 0, risk: 'SAFE' });
  });

  it('tổng kế hoạch plan-total', () => {
    const f = fixtures.slack.feasibility;
    const legs = f.legs.map((l: any) => ({ eta_min: l.eta, margin_min: l.margin, buffer_min: BUFFER_MIN, risk: 'SAFE' as const }));
    const out = planTotals(f.window, f.durations_min, legs);
    expect(out.required_total_min).toBe(f.expect.required_total_min);
    expect(out.buffer_total_min).toBe(f.expect.buffer_total_min);
    expect(out.is_feasible).toBe(f.expect.is_feasible);
  });

  it.each(fixtures.slack.doc_tc05_tc06.cases.map((c: any) => [c.id, c]) as [string, any][])('phân loại mức %s', (_id, c: any) => {
    const slack = c.gap_min - c.required_min;
    expect(slack).toBe(c.expect.slack_min);
    expect(riskFor(c.gap_min, c.eta_min, slack)).toBe(c.expect.risk);
  });

  it('biên của ALGO-04 (priority.required_cases) dùng cùng hàm', () => {
    for (const c of fixtures.priority.required_cases.filter((x: any) => x.expect.margin_min != null)) {
      expect(marginFor(c.max_eta_min, c.room.start_minute, c.room.date)).toBe(c.expect.margin_min);
    }
  });

  it('estimateFeasibility: cặp ngày phòng theo (giờ, order_index), thiếu toạ độ → unknown, ngày khác bỏ', () => {
    const coords: Record<string, LatLng | null> = { a: pt('ben_thanh'), b: pt('nha_tho'), c: null, d: pt('bao') };
    const items = [
      { id: 'b', start_minute: 1110, end_minute: 1170, order_index: 1 },
      { id: 'a', start_minute: 1020, end_minute: 1080, order_index: 0 },
      { id: 'c', start_minute: 1200, end_minute: 1260, order_index: 2 },
      { id: 'd', start_minute: 1020, end_minute: 1080, order_index: 3, day_offset: 1 },
    ];
    const out = estimateFeasibility({
      items,
      coordOf: (i) => coords[i.id] ?? null,
      eventDate: '2026-11-07',
      window: { start_minute: 1020, end_minute: 1380 },
    });
    expect(out.item_count).toBe(3);
    expect(out.unknown_leg_count).toBe(1);
    expect(out.legs).toHaveLength(1);
    // Bến Thành → Nhà thờ: 3′, thứ Bảy → biên sàn 5′, gửi xe 5′, khe 30′ → dư 17′
    expect(out.legs[0]).toMatchObject({ from_item_id: 'a', to_item_id: 'b', eta_min: 3, margin_min: 5, gap_min: 30, slack_min: 17 });
    expect(out.required_total_min).toBe(180 + 13);
    expect(out.buffer_total_min).toBe(360 - 193);
  });

  it('pickLeg: số backend chỉ khi đúng cặp + đúng khe (đang kéo → ước lượng)', () => {
    const local = assessLeg(
      { id: 'a', start_minute: 1020, end_minute: 1080, order_index: 0 },
      { id: 'b', start_minute: 1095, end_minute: 1155, order_index: 1 },
      { minutes: 12, distance_km: 3.2 },
      '2026-11-09',
    );
    const google: FeasibilityLeg = { ...local, eta_min: 9, slack_min: -5, source: 'GOOGLE' };
    const server = { legs: [google] } as any;
    expect(pickLeg(local, server)).toBe(google);
    expect(pickLeg({ ...local, gap_min: 30 }, server).source).toBe('ESTIMATE');
    expect(pickLeg(local, null)).toBe(local);
  });
});

/* ---------- "Bỏ qua" + tổng đầu cột ---------- */

const leg = (over: Partial<FeasibilityLeg> = {}): FeasibilityLeg => ({
  from_item_id: 'i1',
  to_item_id: 'i2',
  eta_min: 12,
  margin_min: 6,
  buffer_min: 5,
  gap_min: 15,
  slack_min: -8,
  distance_km: 3.2,
  risk: 'SOFT_CONFLICT',
  peak: true,
  source: 'ESTIMATE',
  ...over,
});

describe('T-90: khoá "Bỏ qua" cảnh báo (theo người xem)', () => {
  const memStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('khoá gồm cặp mục + slack; slack đổi (dời giờ) → không còn bỏ qua', () => {
    const st = memStorage();
    expect(dismissKey(leg())).toBe('i1:i2:-8');
    const saved = saveDismissed('room-1', new Set(), dismissKey(leg()), st);
    expect(saved.has('i1:i2:-8')).toBe(true);
    const reloaded = loadDismissed('room-1', st);
    expect(reloaded.has(dismissKey(leg()))).toBe(true);
    expect(reloaded.has(dismissKey(leg({ gap_min: 10, slack_min: -13 })))).toBe(false);
    expect(loadDismissed('room-2', st).size).toBe(0);
  });

  it('storage hỏng/bị chặn → không ném lỗi', () => {
    const bad = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
    expect(loadDismissed('r', bad).size).toBe(0);
    expect(saveDismissed('r', new Set(), 'k', bad).has('k')).toBe(true);
    expect(loadDismissed('r', null).size).toBe(0);
  });

  it('tổng đầu cột: thiếu (chưa bỏ qua) > dài hơn khung > dư', () => {
    expect(planSummary({ buffer_total_min: 65 }, [leg()], new Set())).toEqual({ kind: 'short', count: 1 });
    expect(planSummary({ buffer_total_min: 65 }, [leg()], new Set([dismissKey(leg())]))).toEqual({ kind: 'spare', minutes: 65 });
    expect(planSummary({ buffer_total_min: -20 }, [leg({ slack_min: 2, risk: 'SAFE' })], new Set())).toEqual({ kind: 'over', minutes: 20 });
    expect(planSummary({ buffer_total_min: 65 }, [], new Set())).toBeNull();
    // chồng giờ (gap < 0) không tính là thiếu ở dải
    expect(planSummary({ buffer_total_min: 65 }, [leg({ gap_min: -15, slack_min: -38, risk: 'HIGH_RISK' })], new Set())).toEqual({
      kind: 'spare',
      minutes: 65,
    });
  });
});

/* ---------- Dải di chuyển (markup) ---------- */

describe('T-90: TravelStrip', () => {
  const strip = (l: FeasibilityLeg, extra: Partial<React.ComponentProps<typeof TravelStrip>> = {}) =>
    renderToStaticMarkup(<TravelStrip leg={l} fromName="Quán A" toName="Quán B" top={64} pxPerMin={PX_PER_MIN} {...extra} />);

  it('đủ giờ: dải sọc "12′ · 3,2 km", không nhận con trỏ, cao đúng thời gian đi', () => {
    const html = strip(leg({ gap_min: 30, slack_min: 7, risk: 'SAFE' }));
    expect(html).toContain('data-testid="travel-strip"');
    expect(html).toContain('data-risk="SAFE"');
    expect(html).toContain("12' · 3,2 km");
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('cal-outside');
    expect(html).not.toContain('Thiếu');
    expect(stripLayout(leg({ eta_min: 20, gap_min: 30 }), PX_PER_MIN)).toEqual({ mode: 'band', height: 20 * PX_PER_MIN });
    // tối thiểu 16px (12′ = 12,8px)
    expect(stripLayout(leg({ gap_min: 30 }), PX_PER_MIN).height).toBe(16);
  });

  it('thiếu (SOFT): nền pastel vàng "Thiếu 8′" + icon, có nút "Vì sao?", không đỏ', () => {
    const html = strip(leg());
    expect(html).toContain('data-risk="SOFT_CONFLICT"');
    expect(html).toContain("Thiếu 8'");
    expect(html).toContain('bg-warning-soft');
    expect(html).toContain('data-testid="travel-why-link"');
    expect(html).toMatch(/aria-label="Đi từ Quán A tới Quán B thiếu 8'. Vì sao\?"/);
    expect(html).not.toMatch(/danger/);
  });

  it('HIGH_RISK (khe < thời gian đi): nhãn nối có viền warning, không đỏ', () => {
    const html = strip(leg({ gap_min: 10, slack_min: -13, risk: 'HIGH_RISK' }));
    expect(html).toContain('data-mode="seam"');
    expect(html).toContain('data-risk="HIGH_RISK"');
    expect(html).toContain('border-warning');
    expect(html).toContain("Thiếu 13'");
    expect(html).not.toMatch(/danger/);
  });

  it('khe 0: vẫn có nhãn nối; đã bỏ qua → ẩn hẳn', () => {
    const l = leg({ gap_min: 0, slack_min: -23, risk: 'HIGH_RISK' });
    expect(strip(l)).toContain('data-mode="seam"');
    expect(strip(l, { dismissed: true })).toBe('');
    // khe đủ chỗ + đã bỏ qua → về dải yên
    const soft = strip(leg(), { dismissed: true });
    expect(soft).toContain('data-risk="SAFE"');
    expect(soft).not.toContain('Thiếu');
  });

  it('chồng giờ hoặc cùng một chỗ → không vẽ dải', () => {
    expect(stripVisible(leg({ gap_min: -15 }))).toBe(false);
    expect(stripVisible(leg({ eta_min: 0, distance_km: 0 }))).toBe(false);
    expect(strip(leg({ gap_min: -15 }))).toBe('');
  });

  it('"Vì sao?" có công thức đầy đủ + gợi ý + "Bỏ qua"', () => {
    const html = renderToStaticMarkup(<TravelWhy leg={leg()} fromName="Quán A" toName="Quán B" onDismiss={() => {}} />);
    expect(html).toContain("Đi ~12' + dự phòng 6' (giờ cao điểm, 50%) + gửi xe 5' = 23'.");
    expect(html).toContain("Khe giữa hai điểm 15' → thiếu 8'.");
    expect(html).toContain("Dời Quán B xuống muộn hơn 8'");
    expect(html).toContain('Chọn quán gần Quán A hơn');
    expect(html).toContain('Rút ngắn thời gian ở Quán A');
    expect(html).toContain('data-testid="travel-dismiss"');
    // ngoài cao điểm, eta nhỏ → biên sàn
    const floor = renderToStaticMarkup(
      <TravelWhy leg={leg({ eta_min: 3, margin_min: 5, peak: false, gap_min: 10, slack_min: -3 })} fromName="A" toName="B" />,
    );
    expect(floor).toContain('tối thiểu 5 phút');
  });

  it('EN: "8′ short", không trộn tiếng Việt', async () => {
    await i18n.changeLanguage('en');
    const html = strip(leg());
    expect(html).toContain("8' short");
    expect(html).not.toContain('Thiếu');
    const why = renderToStaticMarkup(<TravelWhy leg={leg()} fromName="A" toName="B" />);
    expect(why).toContain("Travel ~12' + buffer 6' (rush hour, 50%) + parking 5' = 23'.");
  });
});

/* ---------- Lịch: dải giữa các ô + tổng đầu cột + popup ---------- */

describe('T-90: CalendarColumn vẽ dải từ ước lượng tức thì', () => {
  const placeAt = (id: string, p: LatLng | null, over: Partial<Place> = {}): Place => ({
    ...mockPlaces[0],
    id,
    name: `Quán ${id}`,
    latitude: p?.lat ?? null,
    longitude: p?.lng ?? null,
    ...over,
  });
  const item = (id: string, placeId: string, s: number, e: number, order: number): ScheduleItem => ({
    id,
    room_id: mockRoom.id,
    place_id: placeId,
    place_name: `Quán ${placeId}`,
    day_offset: 0,
    start_minute: s,
    end_minute: e,
    order_index: order,
    note: null,
  });
  const room = { ...mockRoom, start_minute: 1020, end_minute: 1380, event_date: '2026-11-09' };
  const places = [placeAt('A', pt('bao')), placeAt('B', pt('nam')), placeAt('C', null)];

  it('đủ giờ: dải "18′ · 7,3 km" + "Còn dư … dự phòng (ước lượng)"', () => {
    const items = [item('i1', 'A', 1020, 1080, 0), item('i2', 'B', 1140, 1200, 1)];
    const html = renderToStaticMarkup(<CalendarColumn roomId={room.id} room={room} items={items} places={places} conflicts={[]} />);
    expect(html).toContain('data-testid="travel-strip"');
    expect(html).toContain("18' · 7,3 km");
    // 360 − (120 + 18 + 9 (cao điểm 18:00, 50%) + 5) = 208
    expect(html).toContain("Còn dư 208' dự phòng");
    expect(html).toContain('(ước lượng)');
    expect(html).toContain('data-kind="spare"');
  });

  it('thiếu giờ: dải pastel + "Thiếu thời gian ở 1 đoạn"; xung đột TRAVEL_TIME không viền đỏ, không vào chip đỏ', () => {
    const items = [item('i1', 'A', 1020, 1080, 0), item('i2', 'B', 1095, 1155, 1)];
    const conflicts = [
      {
        id: 'c1',
        rule_code: 'TRAVEL_TIME',
        level: 'WARNING' as const,
        message: '',
        params: { from_item_id: 'i1', to_item_id: 'i2', eta_min: 18, gap_min: 15 },
        entity_type: 'SCHEDULE' as const,
        entity_ids: ['i1', 'i2'],
        resolved: false,
        created_at: '2026-11-09T00:00:00Z',
      },
    ];
    const html = renderToStaticMarkup(<CalendarColumn roomId={room.id} room={room} items={items} places={places} conflicts={conflicts} />);
    expect(html).toContain('data-risk="HIGH_RISK"');
    expect(html).toContain('Thiếu thời gian ở 1 đoạn');
    expect(html).toContain('data-kind="short"');
    expect(html).not.toContain('data-testid="calendar-conflicts"');
    expect(html).not.toContain('data-conflict="true"');
  });

  it('quán không toạ độ → không có dải, không dòng tổng', () => {
    const items = [item('i1', 'A', 1020, 1080, 0), item('i2', 'C', 1095, 1155, 1)];
    const html = renderToStaticMarkup(<CalendarColumn roomId={room.id} room={room} items={items} places={places} conflicts={[]} />);
    expect(html).not.toContain('data-testid="travel-strip"');
    expect(html).not.toContain('data-testid="calendar-feasibility"');
  });

  it('popup ô: dòng cảnh báo pastel + "Vì sao?" (không đỏ)', () => {
    const it0 = item('i2', 'B', 1095, 1155, 1);
    const html = renderToStaticMarkup(
      <ItemView
        item={it0}
        info={{ name: 'Quán B', category: 'FOOD', placeId: 'B' } as any}
        travelNotes={[{ leg: leg({ from_item_id: 'i1', to_item_id: 'i2' }), fromName: 'Quán A', toName: 'Quán B', direction: 'in' }]}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain('data-testid="popover-travel-line"');
    expect(html).toContain("Đi từ Quán A tới đây thiếu 8'");
    expect(html).toContain('data-testid="popover-travel-why"');
    expect(html).toContain('bg-warning-soft');
    expect(html).not.toContain('popover-conflicts');
  });
});

/* ---------- Xuất kế hoạch có số liệu ---------- */

describe('T-90: planText nhận legs/feasibility từ lịch', () => {
  const items = [
    { id: 'i1', place_id: 'A', place_name: 'Quán A', place_address: null, day_offset: 0, start_minute: 1020, end_minute: 1080, order_index: 0 },
    { id: 'i2', place_id: 'B', place_name: 'Quán B', place_address: null, day_offset: 0, start_minute: 1140, end_minute: 1200, order_index: 1 },
  ];
  const room = { title: 'Đi chơi', event_date: '2026-11-09', start_minute: 1020, end_minute: 1380 };

  it('dư giờ: dòng 🛵 + 💡 "(ước lượng)"', () => {
    const plan = toExportPlan([leg({ gap_min: 60, slack_min: 37, risk: 'SAFE' })], { buffer_total_min: 208 });
    const text = buildPlanText({ room, items, members: [], url: 'https://x', lang: 'vi', t: i18n.t, ...plan });
    expect(text).toContain('🛵 Di chuyển: ~12 phút (3,2 km) (ước lượng)');
    expect(text).toContain('💡');
    expect(text).toContain('208');
  });

  it('thiếu giờ: ⚠️ nêu đoạn thiếu nhiều nhất', () => {
    const plan = toExportPlan([leg(), leg({ from_item_id: 'i2', to_item_id: 'i3', slack_min: -2 })], { buffer_total_min: 100 });
    expect(plan.feasibility?.shortfall).toEqual({ fromId: 'i1', toId: 'i2', minutes: 8 });
    const text = buildPlanText({ room, items, members: [], url: 'https://x', lang: 'vi', t: i18n.t, ...plan });
    expect(text).toContain('⚠️ Đoạn Quán A → Quán B thiếu 8 phút');
  });

  it('Google: không ghi "(ước lượng)"; chặng cùng chỗ bỏ', () => {
    const plan = toExportPlan([leg({ source: 'GOOGLE', slack_min: 3, risk: 'SAFE', gap_min: 26 }), leg({ eta_min: 0, distance_km: 0, margin_min: 0, buffer_min: 0, slack_min: 15, risk: 'SAFE', from_item_id: 'x' })], {
      buffer_total_min: 30,
    });
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].estimated).toBe(false);
    expect(plan.feasibility).toEqual({ spareMinutes: 30, estimated: false });
  });
});

/* ---------- ALGO-04: nhãn + thứ tự ---------- */

const prio = (over: Partial<PlacePriority> = {}): PlacePriority => ({
  rank: 1,
  risk: 'SAFE',
  slack_min: 85,
  max_eta_min: 25,
  labels: [],
  estimated: true,
  hours_unknown: false,
  eta_unknown: false,
  ...over,
});

describe('T-90: nhãn ưu tiên', () => {
  it('4 nhãn của server; "Đã chốt" thắng; quán loại không nhãn; không nhãn ưu tiên → nhãn gđ5', () => {
    for (const label of ['RECOMMENDED', 'MOST_VOTED', 'SCHEDULE_SAFE', 'MOST_VOTED_RISKY'] as const) {
      expect(primaryLabel({ status: 'PROPOSED', priority: prio({ labels: [label] }) }, 'leading')).toEqual({ kind: 'priority', label });
    }
    expect(primaryLabel({ status: 'ACCEPTED', priority: prio({ labels: ['RECOMMENDED'] }) }, null)).toEqual({ kind: 'badge', badge: 'accepted' });
    expect(primaryLabel({ status: 'REJECTED', priority: null }, 'leading')).toBeNull();
    expect(primaryLabel({ status: 'PROPOSED', priority: prio() }, 'overBudget')).toEqual({ kind: 'badge', badge: 'overBudget' });
    expect(primaryLabel({ status: 'PROPOSED', priority: undefined }, null)).toBeNull();
  });

  it('meta "người xa nhất" chỉ khi biết thời gian đi', () => {
    expect(maxEtaOf({ priority: prio() })).toBe(25);
    expect(maxEtaOf({ priority: prio({ eta_unknown: true, max_eta_min: 0 }) })).toBeNull();
    expect(maxEtaOf({ priority: null })).toBeNull();
  });

  it('thứ tự = rank của server (TC-08), quán chưa có priority sau, bị loại cuối; ổn định', () => {
    const p = (id: string, rank: number | null, created: string, status: Place['status'] = 'PROPOSED') => ({
      id,
      status,
      created_at: created,
      priority: rank == null ? null : prio({ rank }),
    });
    const list = [
      p('dinh_doc_lap', 3, '2026-11-01T03:00:00Z'),
      p('rejected', null, '2026-11-01T00:00:00Z', 'REJECTED'),
      p('new', null, '2026-11-01T09:00:00Z'),
      p('van_hanh_mall', 1, '2026-11-01T01:00:00Z'),
      p('saigon_centre', 2, '2026-11-01T02:00:00Z'),
    ];
    expect(sortByPriority(list).map((x) => x.id)).toEqual(['van_hanh_mall', 'saigon_centre', 'dinh_doc_lap', 'new', 'rejected']);
    // Phiếu đổi mà server không đổi rank → thứ tự giữ nguyên (FE không tự sắp theo phiếu)
    const votesChanged = list.map((x) => (x.id === 'dinh_doc_lap' ? { ...x, upvotes: 99 } : x));
    expect(sortByPriority(votesChanged).map((x) => x.id)).toEqual(sortByPriority(list).map((x) => x.id));
    expect(hasPriority(list)).toBe(true);
    expect(hasPriority([{ priority: null }])).toBe(false);
  });

  it('PlaceRow: chip "Nhiều phiếu nhưng khó kịp" pastel + icon, bấm được ("Vì sao?"), meta "người xa nhất ~32′"', () => {
    const place: Place = { ...mockPlaces[0], status: 'PROPOSED', priority: prio({ labels: ['MOST_VOTED_RISKY'], risk: 'SOFT_CONFLICT', slack_min: -30, max_eta_min: 32 }) };
    const html = renderToStaticMarkup(<PlaceRow place={place} roomId={mockRoom.id} />);
    expect(html).toContain('Nhiều phiếu nhưng khó kịp');
    expect(html).toContain('data-testid="priority-MOST_VOTED_RISKY-link"');
    expect(html).toContain('bg-warning-soft');
    expect(html).toContain("người xa nhất ~32'");
    expect(html).not.toContain('data-testid="badge-leading"');
    // Không lồng nút trong nút: nút mở thẻ là lớp phủ rỗng
    expect(html).toMatch(/data-testid="place-row-open"[^>]*><\/button>/);
  });

  it('PlaceRow: "Đề xuất" nền accent; quán đã chốt chỉ "Đã chốt"', () => {
    const rec: Place = { ...mockPlaces[0], status: 'PROPOSED', priority: prio({ labels: ['RECOMMENDED'] }) };
    const html = renderToStaticMarkup(<PlaceRow place={rec} roomId={mockRoom.id} />);
    expect(html).toContain('Đề xuất');
    expect(html).toContain('bg-accent text-ink');
    const acc = renderToStaticMarkup(<PlaceRow place={{ ...rec, status: 'ACCEPTED' }} roomId={mockRoom.id} />);
    expect(acc).toContain('data-testid="badge-accepted"');
    expect(acc).not.toContain('priority-RECOMMENDED');
  });

  it('PlaceList: mặc định thứ tự server, có nút ⋯ sắp xếp khi có priority (dù ≤8 quán)', () => {
    const mk = (id: string, name: string, rank: number, upvotes: number): Place => ({
      ...mockPlaces[0],
      id,
      name,
      upvotes,
      score: upvotes,
      status: 'PROPOSED',
      priority: prio({ rank }),
    });
    const places = [mk('p1', 'Nhiều phiếu mà xa', 3, 9), mk('p2', 'Hạng nhất', 1, 2), mk('p3', 'Hạng nhì', 2, 5)];
    const html = renderToStaticMarkup(
      <PlaceList places={places} roomId={mockRoom.id} selectedCategory="ALL" onOpenAddModal={() => {}} onDeletePlace={() => {}} />,
    );
    const order = ['Hạng nhất', 'Hạng nhì', 'Nhiều phiếu mà xa'].map((n) => html.indexOf(n));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html).toContain('data-testid="list-tools-trigger"');
    // server cũ (không priority) + ít quán → không có nút ⋯, sắp theo phiếu như trước
    const legacy = places.map((p) => ({ ...p, priority: undefined }));
    const old = renderToStaticMarkup(
      <PlaceList places={legacy} roomId={mockRoom.id} selectedCategory="ALL" onOpenAddModal={() => {}} onDeletePlace={() => {}} />,
    );
    expect(old).not.toContain('data-testid="list-tools-trigger"');
    expect(old.indexOf('Nhiều phiếu mà xa')).toBeLessThan(old.indexOf('Hạng nhì'));
  });
});

/* ---------- store + API qua MSW ---------- */

describe('T-90: store (MSW)', () => {
  it('fetchPlaces gọi ?sort=priority → quán có priority theo rank', async () => {
    await usePlaceStore.getState().fetchPlaces(mockRoom.id);
    const places = usePlaceStore.getState().places;
    const ranked = places.filter((p) => p.priority);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.map((p) => p.priority!.rank)).toEqual([...ranked.map((p) => p.priority!.rank)].sort((a, b) => a - b));
  });

  it('applyPriorities (PRIORITY_UPDATED): gắn priority theo place_id, quán vắng mặt → null', () => {
    usePlaceStore.getState().setPlaces([
      { ...mockPlaces[0], id: 'a', priority: prio({ rank: 2 }) },
      { ...mockPlaces[0], id: 'b', priority: prio({ rank: 1 }) },
    ]);
    usePlaceStore.getState().applyPriorities([{ place_id: 'a', ...prio({ rank: 1, labels: ['RECOMMENDED'] }) }]);
    const [a, b] = usePlaceStore.getState().places;
    expect(a.priority?.rank).toBe(1);
    expect(a.priority?.labels).toEqual(['RECOMMENDED']);
    expect(b.priority).toBeNull();
  });

  it('fetchFeasibility lấy số backend (mock)', async () => {
    await useAlgoStore.getState().fetchFeasibility(mockRoom.id);
    const f = useAlgoStore.getState().feasibility;
    expect(f).not.toBeNull();
    expect(typeof f!.buffer_total_min).toBe('number');
    expect(Array.isArray(f!.legs)).toBe(true);
  });
});

/* ---------- i18n ---------- */

describe('T-90: i18n', () => {
  const keys = (o: any, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`]));
  it('algo.priority / algo.travel đủ VI + EN', () => {
    for (const ns of ['priority', 'travel'] as const) {
      expect(keys((vi as any).algo[ns]).sort()).toEqual(keys((en as any).algo[ns]).sort());
    }
    expect((vi as any).place.sortPriority).toBeTruthy();
    expect((en as any).place.sortPriority).toBeTruthy();
  });
});
