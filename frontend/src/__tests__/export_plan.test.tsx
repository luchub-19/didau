// T-82: xuất kế hoạch — routeSketch, planText, cắt danh sách, tên tệp, markup tĩnh TripCard VI/EN, mô tả `.ics` có chặng.
// Môi trường test là node: chỉ hàm thuần + markup tĩnh (dựng PNG thật kiểm bằng Chrome, xem PROGRESS).
import '../i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { mockRoom, mockScheduleItems } from '../mocks/mockData';
import { routeSketch } from '../stage/card/routeSketch';
import {
  buildPlanText,
  describeLongDate,
  limitList,
  shortAddress,
  sortPlanItems,
  type PlanLeg,
} from '../stage/card/planText';
import { cardFileName } from '../stage/card/exportCard';
import { MAX_CARD_AVATARS, MAX_CARD_STOPS, TripCard } from '../stage/card/TripCard';
import { buildScheduleIcs } from '../stage/reveal/actions';
import type { Member, ScheduleItem } from '../types';

const URL_ROOM = 'https://didau.test/rooms/r1?code=ABC123';
const room = { ...mockRoom, title: 'Tối thứ Bảy', event_date: '2026-11-07', start_minute: 1080, end_minute: 1350, code: 'ABC123' };

const item = (n: number, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  ...mockScheduleItems[0],
  id: `it-${n}`,
  place_id: `p-${n}`,
  place_name: `Quán ${n}`,
  place_address: `${n} Nguyễn Huệ, Quận 1, TP.HCM`,
  day_offset: 0,
  start_minute: 1080 + n * 70,
  end_minute: 1080 + n * 70 + 60,
  order_index: n,
  note: null,
  ...over,
});
const items = (count: number) => Array.from({ length: count }, (_, i) => item(i));
const member = (n: number): Member => ({
  id: `m-${n}`,
  room_id: 'r1',
  nickname: `Bạn ${n}`,
  avatar_url: null,
  role: 'MEMBER',
  is_active: true,
  joined_at: '2026-11-01T00:00:00Z',
});
const members = (count: number) => Array.from({ length: count }, (_, i) => member(i));
const places = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`,
    category: 'FOOD' as const,
    latitude: 10.77 + i * 0.01,
    longitude: 106.69 + (i % 2) * 0.01,
  }));

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-82: routeSketch', () => {
  it('1 điểm hoặc không điểm nào có toạ độ → null', () => {
    expect(routeSketch([{ lat: 10.7, lng: 106.7 }], 400, 100)).toBeNull();
    expect(routeSketch([{ lat: null, lng: null }, {}], 400, 100)).toBeNull();
    expect(routeSketch([], 400, 100)).toBeNull();
  });

  it('2 điểm: nằm trong khung, bắc ở trên, giữ thứ tự', () => {
    const s = routeSketch([{ lat: 10.78, lng: 106.69 }, { lat: 10.76, lng: 106.71 }], 400, 100, 10)!;
    expect(s.nodes).toHaveLength(2);
    expect(s.nodes[0].y).toBeLessThan(s.nodes[1].y); // điểm đầu ở phía bắc → y nhỏ hơn
    for (const n of s.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(10);
      expect(n.x).toBeLessThanOrEqual(390);
      expect(n.y).toBeGreaterThanOrEqual(10);
      expect(n.y).toBeLessThanOrEqual(90);
    }
    expect(s.points.split(' ')).toHaveLength(2);
  });

  it('trùng toạ độ: không NaN, đặt giữa khung', () => {
    const s = routeSketch([{ lat: 10.77, lng: 106.7 }, { lat: 10.77, lng: 106.7 }], 400, 100)!;
    for (const n of s.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBe(200);
      expect(n.y).toBe(50);
    }
  });

  it('thiếu toạ độ ở giữa: bỏ điểm đó, các điểm còn lại giữ index gốc', () => {
    const s = routeSketch([{ lat: 10.78, lng: 106.69 }, {}, { lat: 10.76, lng: 106.71 }], 400, 100)!;
    expect(s.nodes.map((n) => n.index)).toEqual([0, 2]);
  });

  it('trải dọc theo một trục: không chia cho 0', () => {
    const s = routeSketch([{ lat: 10.77, lng: 106.69 }, { lat: 10.77, lng: 106.72 }], 400, 100)!;
    expect(s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
    expect(s.nodes[0].y).toBe(s.nodes[1].y);
    expect(s.nodes[0].x).toBeLessThan(s.nodes[1].x);
  });
});

describe('T-82: cắt danh sách, tên tệp, địa chỉ', () => {
  it('limitList', () => {
    expect(limitList([1, 2, 3], 6)).toEqual({ shown: [1, 2, 3], extra: 0 });
    expect(limitList([1, 2, 3, 4, 5, 6, 7, 8], MAX_CARD_STOPS)).toEqual({ shown: [1, 2, 3, 4, 5, 6], extra: 2 });
    expect(limitList([], 6)).toEqual({ shown: [], extra: 0 });
  });

  it('cardFileName: hangoutplanner-<mã>.png, mã lạ được làm sạch', () => {
    expect(cardFileName('ABC123')).toBe('hangoutplanner-abc123.png');
    expect(cardFileName(' a/b?c ')).toBe('hangoutplanner-abc.png');
    expect(cardFileName('')).toBe('hangoutplanner-plan.png');
  });

  it('shortAddress: hai đoạn đầu, cắt dài, rỗng', () => {
    expect(shortAddress('12 Lê Lợi, Quận 1, TP.HCM')).toBe('12 Lê Lợi, Quận 1');
    expect(shortAddress(null)).toBe('');
    expect(shortAddress('')).toBe('');
    expect(shortAddress('x'.repeat(80)).length).toBeLessThanOrEqual(48);
    expect(shortAddress('x'.repeat(80)).endsWith('…')).toBe(true);
  });

  it('sortPlanItems theo ngày rồi giờ', () => {
    const sorted = sortPlanItems([item(2, { day_offset: 1 }), item(1, { start_minute: 1300 }), item(0, { start_minute: 1000 })]);
    expect(sorted.map((i) => i.id)).toEqual(['it-0', 'it-1', 'it-2']);
  });

  it('describeLongDate VI/EN', () => {
    expect(describeLongDate('2026-11-07', 'vi')).toBe('Thứ Bảy (07/11/2026)');
    expect(describeLongDate('2026-11-07', 'en')).toBe('Saturday (Nov 7, 2026)');
    expect(describeLongDate('bad', 'vi')).toBe('');
  });
});

describe('T-82: planText', () => {
  const base = { room, members: members(2), url: URL_ROOM };

  it('VI không có số liệu: không có dòng 🛵/💡', () => {
    const text = buildPlanText({ ...base, items: items(2), lang: 'vi', t: i18n.getFixedT('vi') });
    const lines = text.split('\n');
    expect(lines[0]).toBe('🎉 KẾ HOẠCH ĐI CHƠI: Tối thứ Bảy');
    expect(lines[1]).toBe('📅 Thứ Bảy (07/11/2026) | Khung giờ: 18:00 – 22:30');
    expect(lines[2]).toBe('📍 18:00 – 19:00: Quán 0 (0 Nguyễn Huệ, Quận 1)');
    expect(lines.filter((l) => l.startsWith('📍'))).toHaveLength(2);
    expect(text).not.toContain('🛵');
    expect(text).not.toContain('💡');
    expect(lines.at(-2)).toBe('👥 Bạn 0, Bạn 1');
    expect(lines.at(-1)).toBe(`👉 ${URL_ROOM}`);
  });

  it('EN dùng giờ 12h và nhãn tiếng Anh', () => {
    const text = buildPlanText({ ...base, items: items(1), lang: 'en', t: i18n.getFixedT('en') });
    expect(text).toContain('🎉 PLAN FOR THE OUTING: Tối thứ Bảy');
    expect(text).toContain('📅 Saturday (Nov 7, 2026) | Time window: 6 – 10:30 PM');
    expect(text).toMatch(/📍 6 – 7 PM: Quán 0/);
  });

  it('có legs + feasibility: dòng 🛵 giữa hai điểm, 💡 còn dư, "(ước lượng)"', () => {
    const legs: PlanLeg[] = [{ fromId: 'it-0', toId: 'it-1', minutes: 20, km: 3.2, estimated: true }];
    const text = buildPlanText({
      ...base,
      items: items(2),
      lang: 'vi',
      t: i18n.getFixedT('vi'),
      legs,
      feasibility: { spareMinutes: 65, estimated: true },
    });
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.startsWith('🛵'));
    expect(lines[at]).toBe('🛵 Di chuyển: ~20 phút (3,2 km) (ước lượng)');
    expect(lines[at - 1].startsWith('📍')).toBe(true);
    expect(lines[at + 1].startsWith('📍')).toBe(true);
    expect(text).toContain('💡 Lịch hợp lý, còn dư 65 phút dự phòng. (ước lượng)');
  });

  it('thiếu giờ: ⚠️ nêu tên hai quán; chặng không liền kề thì bỏ', () => {
    const text = buildPlanText({
      ...base,
      items: items(3),
      lang: 'vi',
      t: i18n.getFixedT('vi'),
      legs: [{ fromId: 'it-0', toId: 'it-2', minutes: 10 }], // không liền kề → bỏ
      feasibility: { shortfall: { fromId: 'it-0', toId: 'it-1', minutes: 8 } },
    });
    expect(text).toContain('⚠️ Đoạn Quán 0 → Quán 1 thiếu 8 phút');
    expect(text).not.toContain('🛵');
    expect(text).not.toContain('💡');
  });

  it('thiếu địa chỉ: không in ngoặc trống', () => {
    const text = buildPlanText({
      ...base,
      items: [item(0, { place_address: null })],
      lang: 'vi',
      t: i18n.getFixedT('vi'),
    });
    expect(text).toContain('📍 18:00 – 19:00: Quán 0\n');
    expect(text).not.toContain('()');
  });

  it('hơn 6 thành viên: 6 tên + (+N); không thành viên thì bỏ dòng 👥', () => {
    const t = i18n.getFixedT('vi');
    const text = buildPlanText({ ...base, members: members(9), items: items(1), lang: 'vi', t });
    expect(text).toContain('👥 Bạn 0, Bạn 1, Bạn 2, Bạn 3, Bạn 4, Bạn 5 (+3)');
    expect(buildPlanText({ ...base, members: [], items: items(1), lang: 'vi', t })).not.toContain('👥');
  });
});

describe('T-82: TripCard markup tĩnh', () => {
  const render = (over: Partial<Parameters<typeof TripCard>[0]> = {}) =>
    renderToStaticMarkup(
      <TripCard
        room={room}
        items={items(3)}
        places={places(3)}
        members={members(2)}
        palette="light"
        lang="vi"
        {...over}
      />,
    );

  it('kích thước 540×675 và palette theo prop', () => {
    const html = render();
    expect(html).toMatch(/data-palette="light"/);
    expect(html).toMatch(/width:540px;height:675px/);
    expect(render({ palette: 'dark' })).toMatch(/data-palette="dark"/);
    expect(render({ palette: 'dark' })).toContain('--c-paper:26 20 32');
  });

  it('VI: tên buổi, ngày, giờ bắt đầu, chân thẻ có mã phòng, có phác thảo tuyến', () => {
    const html = render();
    expect(html).toContain('Tối thứ Bảy');
    expect(html).toContain('Thứ Bảy (07/11/2026)');
    expect(html).toContain('19:10'); // giờ bắt đầu điểm thứ hai
    expect(html).toContain('Mã phòng ABC123');
    expect(html).toContain('aria-label="Hangoutplanner"');
    expect(html).toContain('data-testid="trip-card-sketch"');
    expect(html).not.toContain('trip-card-more');
  });

  it('EN: giờ 12h, chân thẻ tiếng Anh', async () => {
    await i18n.changeLanguage('en');
    const html = render({ lang: 'en' });
    expect(html).toContain('Saturday (Nov 7, 2026)');
    expect(html).toContain('7:10 PM');
    expect(html).toContain('Room code ABC123');
  });

  it('hơn 6 điểm: chỉ 6 hàng + "+N điểm nữa"; hơn 8 avatar: +N; một điểm → không có phác thảo', () => {
    const html = render({ items: items(9), places: places(9), members: members(12) });
    expect(html.match(/<li /g)).toHaveLength(MAX_CARD_STOPS);
    expect(html).toContain('+3 điểm nữa');
    expect(html.match(/<img /g)).toHaveLength(MAX_CARD_AVATARS);
    expect(html).toContain('+4'); // 12 − 8 avatar
    const one = render({ items: items(1), places: places(1) });
    expect(one).not.toContain('trip-card-sketch');
  });

  it('có legs: dòng chặng và "Còn dư"; thiếu thì bỏ', () => {
    const withLegs = render({
      legs: [{ fromId: 'it-0', toId: 'it-1', minutes: 12, km: 3.2 }],
      feasibility: { spareMinutes: 65 },
    });
    expect(withLegs).toContain('~12′ · 3,2 km');
    expect(withLegs).toContain('Còn dư 65′ dự phòng');
    expect(render()).not.toContain('Còn dư');
  });
});

describe('T-82: buildScheduleIcs có chặng di chuyển', () => {
  const ics = (legs?: { fromItemId: string; text: string }[], note: string | null = null) =>
    buildScheduleIcs({
      room: { id: 'r1', title: 'Tối', event_date: '2026-11-07' },
      items: [item(0, { note }), item(1)],
      legs,
      url: URL_ROOM,
      now: new Date('2026-11-01T00:00:00Z'),
    }).replace(/\r\n /g, ''); // bỏ gập dòng để so chuỗi

  it('không có legs: không DESCRIPTION (khi không ghi chú)', () => {
    expect(ics()).not.toContain('DESCRIPTION');
  });

  it('có legs: mô tả của mục trước có dòng chặng, ghi chú đứng trước', () => {
    const out = ics([{ fromItemId: 'it-0', text: 'Đi tiếp tới Quán 1: ~20 phút' }], 'Mang áo khoác');
    expect(out).toContain('DESCRIPTION:Mang áo khoác\\nĐi tiếp tới Quán 1: ~20 phút');
    expect(out.match(/DESCRIPTION/g)).toHaveLength(1);
  });
});
