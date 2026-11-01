// T-73: ngân sách cả buổi, chip mức giá, .ics cả lịch, cột trái ③④, chân cột Kế hoạch.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  PRICE_TIERS,
  formatBudgetShort,
  otherScheduleSpent,
  placeOverBudget,
  planBudget,
  remainingForNewPlace,
  splitLockedPlaces,
  tierForCost,
} from '../room/budget';
import { isOverBudget } from '../room/placeView';
import { remainingBudget } from '../room/discovery';
import { BudgetMeter, LockedPlaces, ScheduleTimeline } from '../components/schedule';
import { buildScheduleIcs, foldIcsLine } from '../stage/reveal/actions';
import { mockPlaces, mockRoom, mockScheduleItems } from '../mocks/mockData';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';
import type { Place, ScheduleItem } from '../types';

const sched = (placeId: string, order: number, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  ...mockScheduleItems[0],
  id: `s-${placeId}-${order}`,
  place_id: placeId,
  place_name: `Quán ${placeId}`,
  order_index: order,
  day_offset: 0,
  ...over,
});
const pl = (id: string, cost: number, over: Partial<Place> = {}): Place => ({
  ...mockPlaces[0],
  id,
  name: `Quán ${id}`,
  estimated_cost: cost,
  ...over,
});

describe('T-73: planBudget', () => {
  it('đủ giá: tổng, còn dư, đoạn theo thứ tự lịch, quán đắt nhất', () => {
    const places = [pl('a', 100000), pl('b', 195000)];
    const b = planBudget({ schedule: [sched('b', 1), sched('a', 0)], places, budgetLimit: 400000 });
    expect(b.spent).toBe(295000);
    expect(b.limit).toBe(400000);
    expect(b.remaining).toBe(105000);
    expect(b.over).toBe(false);
    expect(b.unknownCount).toBe(0);
    expect(b.segments.map((s) => s.placeId)).toEqual(['a', 'b']);
    expect(b.priciest?.placeId).toBe('b');
  });

  it('thiếu giá (0/null) không coi là miễn phí: đếm vào unknownCount', () => {
    const places = [pl('a', 100000), pl('b', 0), pl('c', undefined as unknown as number)];
    const b = planBudget({ schedule: [sched('a', 0), sched('b', 1), sched('c', 2)], places, budgetLimit: 400000 });
    expect(b.spent).toBe(100000);
    expect(b.unknownCount).toBe(2);
    expect(b.segments.map((s) => s.cost)).toEqual([100000, null, null]);
  });

  it('một quán xếp hai lần chỉ tính một lần', () => {
    const b = planBudget({
      schedule: [sched('a', 0), sched('a', 1)],
      places: [pl('a', 120000)],
      budgetLimit: 500000,
    });
    expect(b.spent).toBe(120000);
    expect(b.segments).toHaveLength(1);
  });

  it('vượt ngân sách: over, remaining âm, priciest để chỉ quán đắt nhất', () => {
    const places = [pl('a', 300000), pl('b', 200000)];
    const b = planBudget({ schedule: [sched('a', 0), sched('b', 1)], places, budgetLimit: 400000 });
    expect(b.over).toBe(true);
    expect(b.remaining).toBe(-100000);
    expect(b.priciest?.placeId).toBe('a');
  });

  it('không có ngân sách (null/0/âm): không vượt, remaining null, chỉ có tổng', () => {
    for (const limit of [null, undefined, 0, -5]) {
      const b = planBudget({ schedule: [sched('a', 0)], places: [pl('a', 999999)], budgetLimit: limit });
      expect(b.limit).toBeNull();
      expect(b.remaining).toBeNull();
      expect(b.over).toBe(false);
      expect(b.spent).toBe(999999);
    }
  });

  it('lịch rỗng: tất cả bằng 0, priciest null', () => {
    const b = planBudget({ schedule: [], places: [pl('a', 1000)], budgetLimit: 100000 });
    expect(b).toMatchObject({ spent: 0, remaining: 100000, unknownCount: 0, over: false, priciest: null });
  });

  it('dùng tên mục lịch khi quán không còn trong danh sách', () => {
    const b = planBudget({ schedule: [sched('gone', 0)], places: [], budgetLimit: 100 });
    expect(b.segments[0]).toMatchObject({ name: 'Quán gone', cost: null });
    expect(b.unknownCount).toBe(1);
  });
});

describe('T-73: placeOverBudget / otherScheduleSpent', () => {
  const places = [pl('a', 150000), pl('b', 200000), pl('c', 120000)];
  const schedule = [sched('a', 0)];

  it('giá quán > ngân sách − tổng các quán khác trong lịch', () => {
    // còn 400k − 150k = 250k: b (200k) vừa, c (120k) vừa
    expect(placeOverBudget(places[1], { schedule, places, budgetLimit: 400000 })).toBe(false);
    // còn 300k − 150k = 150k: b (200k) vượt, c vừa
    expect(placeOverBudget(places[1], { schedule, places, budgetLimit: 300000 })).toBe(true);
    expect(placeOverBudget(places[2], { schedule, places, budgetLimit: 300000 })).toBe(false);
  });

  it('quán đã trong lịch không bị trừ chính nó', () => {
    expect(otherScheduleSpent('a', schedule, places)).toBe(0);
    expect(placeOverBudget(places[0], { schedule, places, budgetLimit: 150000 })).toBe(false);
    expect(placeOverBudget(places[0], { schedule, places, budgetLimit: 149000 })).toBe(true);
  });

  it('thiếu giá hoặc không có ngân sách thì không vượt', () => {
    expect(placeOverBudget(pl('z', 0), { schedule, places, budgetLimit: 100 })).toBe(false);
    expect(placeOverBudget(places[1], { schedule, places, budgetLimit: null })).toBe(false);
  });

  it('isOverBudget (placeView) nhận phần đã chi, mặc định 0 như cũ', () => {
    expect(isOverBudget({ estimated_cost: 150000 }, 200000)).toBe(false);
    expect(isOverBudget({ estimated_cost: 150000 }, 200000, 100000)).toBe(true);
  });

  it('remainingBudget / remainingForNewPlace không âm, null khi không giới hạn', () => {
    expect(remainingBudget({ budget_limit: 300000 }, 100000)).toBe(200000);
    expect(remainingBudget({ budget_limit: 300000 }, 500000)).toBe(0);
    expect(remainingBudget({ budget_limit: null }, 1)).toBeNull();
    expect(remainingForNewPlace({ schedule, places, budgetLimit: 400000 })).toBe(250000);
    expect(remainingForNewPlace({ schedule, places, budgetLimit: 100000 })).toBe(0);
    expect(remainingForNewPlace({ schedule, places, budgetLimit: null })).toBeNull();
  });

  it('formatBudgetShort', () => {
    expect(formatBudgetShort(295000)).toBe('295k');
    expect(formatBudgetShort(0)).toBeNull();
    expect(formatBudgetShort(500)).toBe('500');
  });
});

describe('T-73: chip mức giá', () => {
  it('giá lưu nằm giữa khoảng của chính mức đó', () => {
    for (const tier of PRICE_TIERS) {
      expect(tier.value).toBeGreaterThanOrEqual(tier.min);
      if (tier.max !== null) expect(tier.value).toBeLessThan(tier.max);
      expect(tierForCost(tier.value)?.id).toBe(tier.id);
    }
  });

  it('các khoảng liền nhau, biên dưới gồm biên trên loại; giá lạ → null', () => {
    expect(tierForCost(49999)?.id).toBe('under50');
    expect(tierForCost(50000)?.id).toBe('50to150');
    expect(tierForCost(300000)?.id).toBe('over300');
    expect(tierForCost(0)).toBeNull();
    expect(tierForCost(null)).toBeNull();
  });
});

describe('T-73: .ics cả lịch', () => {
  const room = { id: 'r1', title: 'Tối thứ 6', event_date: '2026-10-30' };
  const items = [
    sched('b', 1, { id: 'i2', start_minute: 1140, end_minute: 1260, place_name: 'Quán B', place_address: null }),
    sched('a', 0, { id: 'i1', start_minute: 1020, end_minute: 1110, place_name: 'Quán A, Q1', place_address: '1 Lê Lợi; Q1', note: null }),
    sched('c', 2, { id: 'i3', start_minute: 1380, end_minute: 60, place_name: 'Quán C', place_address: null, note: 'Mang áo khoác' }),
    sched('d', 0, { id: 'i4', day_offset: 1, start_minute: 600, end_minute: 660, place_name: 'Quán D', place_address: null }),
  ];
  const ics = buildScheduleIcs({
    room,
    items,
    places: [{ id: 'b', address: '9 Hai Bà Trưng' }],
    url: 'https://x/rooms/r1',
    now: new Date('2026-10-28T00:00:00Z'),
  });
  const events = ics.split('BEGIN:VEVENT').slice(1);

  it('mỗi mục một VEVENT, đúng thứ tự (ngày, order_index)', () => {
    expect(events).toHaveLength(4);
    expect(events.map((e) => /UID:r1-(\w+)@didau/.exec(e)?.[1])).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('giờ địa phương "trôi" theo ngày phòng, qua nửa đêm và day_offset sang ngày sau', () => {
    expect(events[0]).toContain('DTSTART:20261030T170000');
    expect(events[0]).toContain('DTEND:20261030T183000');
    expect(events[2]).toContain('DTSTART:20261030T230000');
    expect(events[2]).toContain('DTEND:20261031T010000');
    expect(events[3]).toContain('DTSTART:20261031T100000');
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('thoát ký tự đặc biệt, địa chỉ dự phòng từ quán, ghi chú thành DESCRIPTION', () => {
    expect(events[0]).toContain('SUMMARY:Quán A\\, Q1 · Tối thứ 6');
    expect(events[0]).toContain('LOCATION:1 Lê Lợi\\; Q1');
    expect(events[1]).toContain('LOCATION:9 Hai Bà Trưng');
    expect(events[2]).toContain('DESCRIPTION:Mang áo khoác');
    expect(events[3]).not.toContain('LOCATION');
  });

  it('dòng dài được gập ≤75 octet và dòng tiếp bắt đầu bằng dấu cách', () => {
    const long = `SUMMARY:${'Đ'.repeat(60)}`;
    const folded = foldIcsLine(long).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded[1].startsWith(' ')).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });
});

describe('T-73: splitLockedPlaces / LockedPlaces', () => {
  const places = [
    pl('a', 100000, { status: 'ACCEPTED', score: 3 }),
    pl('b', 90000, { status: 'ACCEPTED', score: 5 }),
    pl('c', 80000, { status: 'PROPOSED', score: 1 }),
    pl('d', 70000, { status: 'REJECTED', score: 0 }),
    pl('e', 60000, { status: 'PROPOSED', score: 0 }),
  ];

  it('chính = ACCEPTED điểm cao nhất; đi kèm theo lịch rồi ACCEPTED; dự bị = chưa loại còn lại', () => {
    const r = splitLockedPlaces(places, [sched('c', 0)]);
    expect(r.main?.id).toBe('b');
    expect(r.companions.map((p) => p.id)).toEqual(['c', 'a']);
    expect(r.backups.map((p) => p.id)).toEqual(['e']);
  });

  it('chưa có ACCEPTED thì lấy quán của mục lịch đầu; không có gì → main null', () => {
    const noAccepted = places.map((p) => ({ ...p, status: 'PROPOSED' as const }));
    expect(splitLockedPlaces(noAccepted, [sched('e', 0)]).main?.id).toBe('e');
    expect(splitLockedPlaces(noAccepted, []).main).toBeNull();
  });

  it('render: ảnh lớn, hàng đi kèm, liên kết "Xem lại N quán dự bị"', () => {
    const html = renderToStaticMarkup(
      <LockedPlaces places={places} schedule={[sched('c', 0)]} onOpenPlace={() => {}} onReviewBackups={() => {}} />,
    );
    expect(html).toContain('Quán đã chốt');
    expect(html).toContain('Quán b');
    expect(html).toContain('Đi kèm');
    expect(html).toContain('Xem lại 1 quán dự bị');
    expect(html).toContain('data-testid="locked-cover"');
  });

  it('không quán nào chốt thì có trạng thái trống', () => {
    const html = renderToStaticMarkup(
      <LockedPlaces places={[]} schedule={[]} onOpenPlace={() => {}} onReviewBackups={() => {}} />,
    );
    expect(html).toContain('data-testid="locked-empty"');
  });
});

describe('T-73: BudgetMeter', () => {
  it('đủ ngân sách: "x / y", còn dư, điểm chưa rõ giá', () => {
    const budget = planBudget({
      schedule: [sched('a', 0), sched('b', 1)],
      places: [pl('a', 295000), pl('b', 0)],
      budgetLimit: 400000,
    });
    const html = renderToStaticMarkup(<BudgetMeter budget={budget} />);
    expect(html).toContain('data-over="false"');
    expect(html).toContain('295.000');
    expect(html).toContain('400.000');
    expect(html).toContain('Còn dư');
    expect(html).toContain('1 điểm chưa rõ giá');
  });

  it('vượt: chuyển warning và chỉ quán đắt nhất', () => {
    const budget = planBudget({
      schedule: [sched('a', 0), sched('b', 1)],
      places: [pl('a', 300000), pl('b', 200000)],
      budgetLimit: 400000,
    });
    const html = renderToStaticMarkup(<BudgetMeter budget={budget} />);
    expect(html).toContain('data-over="true"');
    expect(html).toContain('text-warning');
    expect(html).toContain('đắt nhất: Quán a');
  });

  it('không có ngân sách: chỉ hiện tổng', () => {
    const budget = planBudget({ schedule: [sched('a', 0)], places: [pl('a', 50000)], budgetLimit: null });
    const html = renderToStaticMarkup(<BudgetMeter budget={budget} />);
    expect(html).toContain('Tổng');
    expect(html).not.toContain(' / ');
    expect(html).not.toContain('Còn dư');
  });
});

describe('T-73: chân cột Kế hoạch', () => {
  const props = {
    roomId: mockRoom.id,
    items: mockScheduleItems,
    places: mockPlaces,
    conflicts: [],
  };

  it('có lịch + room: nút chính "Gửi kế hoạch cho nhóm", "Thêm vào lịch", "Xếp lại tự động"', () => {
    const html = renderToStaticMarkup(<ScheduleTimeline {...props} room={mockRoom} />);
    expect(html).toContain('data-testid="send-plan-btn"');
    expect(html).toContain('Gửi kế hoạch cho nhóm');
    expect(html).toContain('data-testid="add-to-calendar-btn"');
    expect(html).toContain('Xếp lại tự động');
    expect(html).toContain('data-testid="budget-meter"');
  });

  it('chưa có lịch: không có chân cột, nút chính là xếp lịch tự động', () => {
    const html = renderToStaticMarkup(<ScheduleTimeline {...props} items={[]} room={mockRoom} />);
    expect(html).not.toContain('data-testid="plan-footer"');
    expect(html).toContain('Lên lịch giúp tôi');
  });
});

describe('T-73: i18n', () => {
  it('khoá budget/plan có đủ ở VI và EN', () => {
    const keys = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
      );
    const pick = (m: unknown, k: string) => keys((m as Record<string, unknown>)[k]).sort();
    for (const group of ['budget', 'plan']) expect(pick(en, group)).toEqual(pick(vi, group));
  });
});
