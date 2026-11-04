// T-79: CalendarColumn (lưới, ô quán 3 mức, chồng giờ, ngoài khung, lịch trống, vạch "bây giờ") + logic thuần của
// useCalendarDrag (bản nháp khi kéo, bàn phím, cuộn tự động). Môi trường test là node: chỉ markup tĩnh + hàm thuần.
import '../i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { CalendarColumn } from '../components/schedule/CalendarColumn';
import { gridRange, PX_PER_MIN } from '../room/calendar';
import {
  AUTOSCROLL_EDGE_PX,
  autoScrollStep,
  dragPreview,
  keyboardSlot,
} from '../room/useCalendarDrag';
import { mockPlaces, mockRoom, mockScheduleItems } from '../mocks/mockData';
import { vi as viLocale } from '../i18n/locales/vi';
import { en as enLocale } from '../i18n/locales/en';
import type { Room, ScheduleItem } from '../types';

const room: Room = { ...mockRoom, start_minute: 1020, end_minute: 1380 };
const item = (id: string, start: number, end: number, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  ...mockScheduleItems[0],
  id,
  place_id: mockPlaces[0].id,
  place_name: `Quán ${id}`,
  start_minute: start,
  end_minute: end,
  order_index: 0,
  day_offset: 0,
  note: null,
  ...over,
});
const render = (items: ScheduleItem[], extra: Partial<React.ComponentProps<typeof CalendarColumn>> = {}) =>
  renderToStaticMarkup(
    <CalendarColumn roomId={room.id} room={room} items={items} places={mockPlaces} conflicts={[]} {...extra} />,
  );
/** Thuộc tính style của ô quán theo id (top/height/left/width). */
const eventTag = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="calendar-event-${id}"[^>]*>`))?.[0] ?? '';

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-79: lưới lịch', () => {
  it('khung 17–23: nhãn mỗi giờ 17:00 → 23:00, cao 6 × 64px, không có vùng ngoài khung', () => {
    const html = render([item('a', 1080, 1140)]);
    for (const h of ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00']) expect(html).toContain(`>${h}<`);
    expect(html).toContain('data-grid-start="1020"');
    expect(html).toContain('data-grid-end="1380"');
    expect(html).toMatch(/data-testid="calendar-grid"[^>]*style="height:384px"/);
    expect(html).not.toContain('data-testid="calendar-outside"');
    // Kẻ nửa giờ nét đứt: 17:30 … 22:30 = 6 vạch
    expect(html.match(/border-dashed border-line\/50/g)?.length).toBe(6);
    expect(html).toContain('Lịch tối nay · 17:00 – 23:00');
  });

  it('mục ngoài khung mở rộng lưới tới giờ chẵn + tô sọc "Ngoài khung giờ"', () => {
    const html = render([item('early', 975, 1035), item('late', 1370, 1410)]);
    // 16:15 → lưới từ 16:00; 23:30 → tới 24:00 nhưng backend dừng ở 23:59
    expect(html).toContain('data-grid-start="960"');
    expect(html).toContain('data-grid-end="1439"');
    expect(html.match(/data-testid="calendar-outside"/g)?.length).toBe(2);
    expect(html).toContain('Ngoài khung giờ');
    expect(html).toContain('>16:00<');
  });

  it('ô quán: top/height theo 16px mỗi 15 phút, khe 2px', () => {
    const html = render([item('a', 1080, 1140)]);
    const tag = eventTag(html, 'a');
    // 18:00 − 17:00 = 60' → 64px; 60' → 64 − 2 = 62px
    expect(tag).toContain('top:64px');
    expect(tag).toContain('height:62px');
  });

  it('3 mức chiều cao: ≥48px đủ (tên + giờ + ghi chú khi ≥80px), 24–47px một dòng, <24px chỉ tên', () => {
    const html = render([
      item('long', 1080, 1170, { note: 'Đặt bàn trước' }),
      item('mid', 1200, 1230),
      item('short', 1260, 1275),
    ]);
    expect(eventTag(html, 'long')).toContain('data-density="full"');
    expect(html).toContain('18:00 – 19:30');
    expect(html).toContain('Đặt bàn trước');
    expect(eventTag(html, 'mid')).toContain('data-density="compact"');
    expect(html).toMatch(/Quán mid<\/span><span[^>]*>\u00a0·\u00a020:00<\/span>/);
    expect(eventTag(html, 'short')).toContain('data-density="tiny"');
    // Ghi chú chỉ ở ô ≥80px
    const noteMid = render([item('mid2', 1200, 1260, { note: 'Ghi chú ngắn' })]);
    expect(noteMid).not.toContain('Ghi chú ngắn');
  });

  it('chồng giờ: 2 ô chia đôi bề ngang, ô sớm hơn bên trái', () => {
    const html = render([item('a', 1080, 1200), item('b', 1140, 1260)]);
    expect(eventTag(html, 'a')).toMatch(/left:0%;width:calc\(50% - 2px\)/);
    expect(eventTag(html, 'b')).toMatch(/left:50%;width:calc\(50% - 2px\)/);
    // Thứ tự DOM (Tab) theo giờ bắt đầu
    expect(html.indexOf('calendar-event-a')).toBeLessThan(html.indexOf('calendar-event-b'));
  });

  it('cụm > 3 cột: 2 cột thật + nút "+N" ở cột thứ 3', () => {
    const html = render([item('a', 1080, 1200), item('b', 1080, 1200), item('c', 1080, 1200), item('d', 1080, 1200)]);
    expect(html.match(/data-testid="calendar-event-/g)?.length).toBe(2);
    expect(html).toContain('data-testid="calendar-more"');
    expect(html).toContain('>+2<');
    expect(html).toContain('aria-expanded="false"');
  });

  it('lịch trống: lưới vẫn vẽ đủ + gợi ý kéo thả; chân cột là "Xếp lịch tự động"', () => {
    const html = render([], { room: { ...room, budget_limit: null } });
    expect(html).toContain('data-testid="calendar-grid"');
    expect(html).toContain('data-testid="calendar-empty"');
    expect(html).toContain('Kéo quán đã chốt từ bên trái thả vào đây');
    expect(html).toContain('data-testid="plan-footer-empty"');
    expect(html).toContain('Xếp lịch tự động');
    expect(html).not.toContain('data-testid="budget-meter"');
  });

  it('vạch "bây giờ" chỉ khi ngày phòng là hôm nay và giờ nằm trong lưới', () => {
    const today = new Date(2026, 10, 4, 19, 30);
    const withNow = render([item('a', 1080, 1140)], {
      room: { ...room, event_date: '2026-11-04' },
      now: today,
    });
    // 19:30 − 17:00 = 150' → 160px
    expect(withNow).toMatch(/data-testid="calendar-now"[^>]*style="top:160px"/);
    const otherDay = render([item('a', 1080, 1140)], { room: { ...room, event_date: '2026-11-05' }, now: today });
    expect(otherDay).not.toContain('data-testid="calendar-now"');
  });

  it('EN: nhãn giờ dạng 12h "6 PM", tiêu đề "Tonight"', async () => {
    await i18n.changeLanguage('en');
    const html = render([item('a', 1080, 1140)]);
    expect(html).toContain('>6 PM<');
    expect(html).toContain('>11 PM<');
    expect(html).toContain('Tonight · 5 – 11 PM');
    expect(html).toContain('6:00 PM – 7:00 PM');
  });

  it('khoá i18n `calendar` có đủ ở VI và EN', () => {
    const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
    expect(keys(enLocale.calendar)).toEqual(keys(viLocale.calendar));
  });
});

describe('T-79: logic kéo thả thuần (useCalendarDrag)', () => {
  const grid = gridRange(room, []);
  const s1800 = { start_minute: 1080, end_minute: 1140 };

  it('di: snap theo con trỏ trừ độ lệch chỗ cầm, không theo mép ô', () => {
    // Cầm ở giữa ô (lệch 30'), kéo xuống 3 nấc (48px = 45')
    const grab = 30;
    const pointer = 1080 + grab + 48 / PX_PER_MIN;
    expect(dragPreview('move', s1800, pointer, grab, grid)).toEqual({ start_minute: 1125, end_minute: 1185 });
    // Lệch 7' → về chỗ cũ, 8' → nhảy 15'
    expect(dragPreview('move', s1800, 1080 + grab + 7, grab, grid).start_minute).toBe(1080);
    expect(dragPreview('move', s1800, 1080 + grab + 8, grab, grid).start_minute).toBe(1095);
  });

  it('di: kẹp trong lưới hiện tại (không tự mở rộng)', () => {
    expect(dragPreview('move', s1800, 2000, 0, grid)).toEqual({ start_minute: 1320, end_minute: 1380 });
    expect(dragPreview('move', s1800, 0, 0, grid)).toEqual({ start_minute: 1020, end_minute: 1080 });
  });

  it('kéo dãn mép dưới: tới 19:30, tối thiểu 15\'', () => {
    // Cầm sát mép dưới (lệch −2')
    expect(dragPreview('resize', s1800, 1170 - 2, -2, grid)).toEqual({ start_minute: 1080, end_minute: 1170 });
    expect(dragPreview('resize', s1800, 1000, 0, grid)).toEqual({ start_minute: 1080, end_minute: 1095 });
  });

  it('cuộn giữa chừng không lệch: phút chỉ phụ thuộc toạ độ trong lưới, không phụ thuộc độ cuộn', () => {
    // Cùng vị trí trong lưới (y = 128px) dù khung đã cuộn 200px: clientY − gridTop như nhau
    const minuteAt = (clientY: number, gridTop: number) => grid.start + (clientY - gridTop) / PX_PER_MIN;
    expect(minuteAt(400, 272)).toBe(minuteAt(200, 72));
  });

  it('bàn phím: ↑/↓ dời 15\', Shift đổi giờ kết thúc, phím khác → null, chạm biên giữ nguyên', () => {
    expect(keyboardSlot(s1800, 'ArrowDown', false, grid)).toEqual({ start_minute: 1095, end_minute: 1155 });
    expect(keyboardSlot(s1800, 'ArrowUp', false, grid)).toEqual({ start_minute: 1065, end_minute: 1125 });
    expect(keyboardSlot(s1800, 'ArrowDown', true, grid)).toEqual({ start_minute: 1080, end_minute: 1155 });
    expect(keyboardSlot(s1800, 'ArrowUp', true, grid)).toEqual({ start_minute: 1080, end_minute: 1125 });
    expect(keyboardSlot(s1800, 'Enter', false, grid)).toBeNull();
    const top = { start_minute: 1020, end_minute: 1080 };
    expect(keyboardSlot(top, 'ArrowUp', false, grid)).toEqual(top);
    const short = { start_minute: 1080, end_minute: 1095 };
    expect(keyboardSlot(short, 'ArrowUp', true, grid)).toEqual(short);
  });

  it('cuộn tự động: chỉ khi cách mép < 48px, càng sát càng nhanh, đúng chiều', () => {
    expect(autoScrollStep(300, 100, 700)).toBe(0);
    expect(autoScrollStep(100 + AUTOSCROLL_EDGE_PX + 1, 100, 700)).toBe(0);
    expect(autoScrollStep(110, 100, 700)).toBeLessThan(0);
    expect(autoScrollStep(690, 100, 700)).toBeGreaterThan(0);
    expect(Math.abs(autoScrollStep(101, 100, 700))).toBeGreaterThan(Math.abs(autoScrollStep(140, 100, 700)));
    // Khung quá thấp: không cuộn (tránh giật)
    expect(autoScrollStep(110, 100, 180)).toBe(0);
  });
});
