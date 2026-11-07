// T-81: popup ô quán — `validateEdit`, hình học định vị, dữ liệu hiển thị, markup tĩnh hai chế độ,
// và lưu giờ + ghi chú qua store (MSW). Môi trường test là node: chỉ markup tĩnh + hàm thuần.
import '../i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { mockGuestMember, mockHostMember, mockPlaces, mockRoom, mockScheduleItems } from '../mocks/mockData';
import { scheduleApi } from '../services/api';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useScheduleStore } from '../store/useScheduleStore';
import { ItemEdit, ItemView, UndoRemoveBar, buildItemInfo, placePopover } from '../components/schedule/CalendarItemPopover';
import {
  NOTE_MAX,
  minuteToInput,
  parseTimeInput,
  validateEdit,
} from '../room/calendar';
import type { CuratedData, CuratedEntry } from '../room/curated';
import { vi as viLocale } from '../i18n/locales/vi';
import { en as enLocale } from '../i18n/locales/en';
import type { Place, ScheduleItem } from '../types';

const WINDOW = { start_minute: 1080, end_minute: 1320 }; // 18:00 – 22:00
const item = (over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  ...mockScheduleItems[0],
  id: 'it-1',
  place_id: mockPlaces[0].id,
  place_name: mockPlaces[0].name,
  start_minute: 1080,
  end_minute: 1140,
  order_index: 0,
  day_offset: 0,
  note: null,
  ...over,
});
const form = (over: Partial<{ start: string; end: string; note: string }> = {}) => ({
  start: '18:00',
  end: '19:00',
  note: '',
  ...over,
});
/** Thẻ mở (cả thuộc tính) của phần tử có `data-testid` — không phụ thuộc thứ tự thuộc tính. */
const tag = (html: string, testid: string) =>
  html.match(new RegExp(`<[a-z0-9]+[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';
const ctx = (others: { id: string; start_minute: number; end_minute: number }[] = []) => ({
  itemId: 'it-1',
  window: WINDOW,
  others,
});

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-81: validateEdit', () => {
  it('hợp lệ: không lỗi, không nhắc, đọc đúng giờ', () => {
    const v = validateEdit(form(), ctx());
    expect(v).toMatchObject({ errors: [], notices: [], canSave: true, slot: { start_minute: 1080, end_minute: 1140 } });
  });

  it('kết thúc ≤ bắt đầu → chặn Lưu (bằng nhau cũng chặn)', () => {
    expect(validateEdit(form({ end: '18:00' }), ctx())).toMatchObject({ canSave: false, errors: ['endNotAfterStart'] });
    expect(validateEdit(form({ end: '17:30' }), ctx()).errors).toEqual(['endNotAfterStart']);
    // Đã chặn thì không nhắc thêm
    expect(validateEdit(form({ end: '17:30' }), ctx()).notices).toEqual([]);
  });

  it('giờ trống/sai định dạng → timeInvalid, slot null', () => {
    for (const bad of ['', '25:00', '18:60', 'abc']) {
      const v = validateEdit(form({ start: bad }), ctx());
      expect(v.errors).toEqual(['timeInvalid']);
      expect(v.slot).toBeNull();
      expect(v.canSave).toBe(false);
    }
  });

  it('ngoài khung giờ của nhóm → vẫn cho lưu, chỉ nhắc', () => {
    expect(validateEdit(form({ start: '17:00', end: '18:30' }), ctx())).toMatchObject({
      canSave: true,
      notices: ['outsideWindow'],
    });
    expect(validateEdit(form({ start: '21:30', end: '22:30' }), ctx()).notices).toEqual(['outsideWindow']);
    // Chạm mép khung thì không nhắc
    expect(validateEdit(form({ start: '18:00', end: '22:00' }), ctx()).notices).toEqual([]);
  });

  it('trùng giờ mục khác → nhắc + nêu id; mục chính nó và mục chạm đầu mút không tính', () => {
    const others = [
      { id: 'it-1', start_minute: 1080, end_minute: 1140 }, // chính nó
      { id: 'x', start_minute: 1110, end_minute: 1170 }, // chồng 18:30–19:00
      { id: 'y', start_minute: 1140, end_minute: 1200 }, // chạm đầu mút 19:00
    ];
    const v = validateEdit(form(), ctx(others));
    expect(v.notices).toEqual(['overlap']);
    expect(v.overlapIds).toEqual(['x']);
    expect(v.canSave).toBe(true);
  });

  it('mục ngày khác không tính là trùng', () => {
    const other = { id: 'z', start_minute: 1080, end_minute: 1140, day_offset: 1 };
    expect(validateEdit(form(), ctx([other])).notices).toEqual([]);
  });

  it('ghi chú: 500 ký tự qua, 501 bị chặn; cắt khoảng trắng hai đầu trước khi đếm', () => {
    expect(validateEdit(form({ note: 'a'.repeat(NOTE_MAX) }), ctx())).toMatchObject({ canSave: true, noteLength: 500 });
    const over = validateEdit(form({ note: 'a'.repeat(NOTE_MAX + 1) }), ctx());
    expect(over).toMatchObject({ canSave: false, errors: ['noteTooLong'], noteLength: 501 });
    expect(validateEdit(form({ note: `  ${'a'.repeat(NOTE_MAX)}  ` }), ctx()).canSave).toBe(true);
  });

  it('ghi chú đếm theo ký tự, không theo đơn vị UTF-16 (emoji = 1)', () => {
    expect(validateEdit(form({ note: '🍜'.repeat(NOTE_MAX) }), ctx()).canSave).toBe(true);
    expect(validateEdit(form({ note: '🍜'.repeat(NOTE_MAX + 1) }), ctx()).errors).toEqual(['noteTooLong']);
  });

  it('giờ tự nhập không bị ép bội 15 phút', () => {
    expect(validateEdit(form({ start: '18:10', end: '19:07' }), ctx()).slot).toEqual({ start_minute: 1090, end_minute: 1147 });
  });

  it('lỗi giờ và lỗi ghi chú cùng lúc được báo cả hai', () => {
    const v = validateEdit(form({ end: '17:00', note: 'a'.repeat(501) }), ctx());
    expect(v.errors).toEqual(['endNotAfterStart', 'noteTooLong']);
  });
});

describe('T-81: parseTimeInput / minuteToInput', () => {
  it('đọc "HH:MM" và ghi lại 24 giờ', () => {
    expect(parseTimeInput('18:10')).toBe(1090);
    expect(parseTimeInput('0:05')).toBe(5);
    expect(parseTimeInput('23:59')).toBe(1439);
    expect(parseTimeInput('24:00')).toBeNull();
    expect(parseTimeInput('18:1')).toBeNull();
    expect(minuteToInput(1090)).toBe('18:10');
    expect(minuteToInput(5)).toBe('00:05');
    expect(minuteToInput(5000)).toBe('23:59');
    expect(parseTimeInput(minuteToInput(777))).toBe(777);
  });
});

describe('T-81: placePopover (không tràn viewport)', () => {
  const vp = { w: 1440, h: 900 };
  const size = { w: 360, h: 420 };
  const anchor = (left: number, top: number, w = 200, h = 64) => ({ left, right: left + w, top, height: h });

  it('ưu tiên bên TRÁI ô, cách 12px, căn giữa ô theo chiều dọc', () => {
    const p = placePopover(anchor(1000, 400), size, vp);
    expect(p).toMatchObject({ side: 'left', left: 1000 - 12 - 360 });
    expect(p.top).toBe(400 + 32 - 210);
    expect(p.arrowTop).toBe(210); // mũi tên đúng giữa ô
  });

  it('ô ở đỉnh lưới: dịch xuống để không tràn mép trên; mũi tên vẫn chỉ vào ô', () => {
    const p = placePopover(anchor(1000, 0), size, vp);
    expect(p.top).toBe(8);
    expect(p.arrowTop).toBeGreaterThanOrEqual(20);
    expect(p.arrowTop).toBeLessThanOrEqual(size.h - 20);
    expect(p.arrowTop).toBe(32 - 8);
  });

  it('ô ở đáy: dịch lên để không tràn mép dưới', () => {
    const p = placePopover(anchor(1000, 880, 200, 64), size, vp);
    expect(p.top + size.h).toBeLessThanOrEqual(vp.h - 8);
    expect(p.top).toBe(900 - 420 - 8);
    expect(p.arrowTop).toBeLessThanOrEqual(size.h - 20);
  });

  it('không đủ chỗ bên trái → lật sang phải', () => {
    const p = placePopover(anchor(100, 300), size, vp);
    expect(p.side).toBe('right');
    expect(p.left).toBe(100 + 200 + 12);
  });

  it('không đủ chỗ hai bên → đè lên ô, vẫn nằm trong viewport, không mũi tên', () => {
    const narrow = { w: 640, h: 900 };
    const p = placePopover(anchor(200, 300, 300), size, narrow);
    expect(p.side).toBe('over');
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 360).toBeLessThanOrEqual(narrow.w - 8);
  });

  it('popover cao hơn viewport: bị kẹp, vẫn bắt đầu ở mép trên', () => {
    const p = placePopover(anchor(1000, 400), { w: 360, h: 2000 }, { w: 1440, h: 600 });
    expect(p.top).toBe(8);
  });

  it('1024: cột Kế hoạch ở mép phải → popover nằm gọn trong viewport', () => {
    const p = placePopover(anchor(700, 500, 280), size, { w: 1024, h: 768 });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 360).toBeLessThanOrEqual(1024 - 8);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + size.h).toBeLessThanOrEqual(768 - 8);
  });
});

describe('T-81: buildItemInfo', () => {
  const place: Place = { ...mockPlaces[0] };
  const members = [mockHostMember, mockGuestMember];
  const entry: CuratedEntry = {
    id: 'c1',
    wave: 1,
    external_id: null,
    name: place.name,
    address: place.address ?? '',
    lat: place.latitude ?? 0,
    lng: place.longitude ?? 0,
    category: 'DRINK',
    price_per_person: 50000,
    collections: [],
    intro: { vi: 'Giới thiệu VI', en: 'Intro EN' },
    try: { vi: [], en: [] },
    photos: [{ file: 'c1.webp', kind: 'cover', source: 'test' }],
  };
  const data: CuratedData = { places: [entry], files: new Set(['c1.webp']) };

  it('quán tuyển chọn có ảnh: ảnh + giới thiệu theo ngôn ngữ + người đề xuất + số muốn đi', () => {
    const vi = buildItemInfo(item(), place, members, data, 'vi');
    expect(vi).toMatchObject({
      name: place.name,
      photo: '/curated/c1.webp',
      intro: 'Giới thiệu VI',
      wantCount: place.upvotes,
      submitter: { name: 'HoangNam', seed: mockHostMember.id },
      price: '~55k', // giá nhóm ghi thắng giá tuyển chọn
    });
    expect(buildItemInfo(item(), place, members, data, 'en').intro).toBe('Intro EN');
  });

  it('thiếu ảnh: không có ảnh/giới thiệu (hiện minh hoạ danh mục)', () => {
    const info = buildItemInfo(item(), place, members, null, 'vi');
    expect(info.photo).toBeNull();
    expect(info.intro).toBeNull();
  });

  it('thiếu thành viên trong danh sách: dùng tên người đề xuất đi kèm quán; không có gì thì null', () => {
    expect(buildItemInfo(item(), place, [], null, 'vi').submitter).toEqual({
      name: 'HoangNam',
      avatarUrl: undefined,
      seed: undefined,
    });
    const anon: Place = { ...place, submitted_by_nickname: undefined };
    expect(buildItemInfo(item(), anon, [], null, 'vi').submitter).toBeNull();
  });

  it('không có quán (đã xoá khỏi phòng): vẫn dựng được từ mục lịch, có địa chỉ thì có chỉ đường', () => {
    const info = buildItemInfo(item({ place_address: '12 Lê Lợi' }), null, members, null, 'vi');
    expect(info).toMatchObject({ name: place.name, address: '12 Lê Lợi', wantCount: 0, placeId: null });
    expect(info.directionsHref).toContain('google.com/maps/dir');
    expect(buildItemInfo(item({ place_address: null }), null, members, null, 'vi').directionsHref).toBeNull();
  });
});

describe('T-81: markup tĩnh — chế độ xem', () => {
  const place = mockPlaces[0];
  const members = [mockHostMember];
  const view = (over: Partial<ScheduleItem> = {}, conflict: string[] = [], data = null as CuratedData | null) =>
    renderToStaticMarkup(
      <ItemView
        item={item(over)}
        info={buildItemInfo(item(over), place, members, data, 'vi')}
        conflictMessages={conflict}
        titleId="t"
        onClose={() => {}}
        onEdit={() => {}}
        onRemove={() => {}}
        onOpenPlace={() => {}}
      />,
    );

  it('đủ: hàng nút Sửa · Bỏ · Đóng đều có nhãn, tên là heading, giờ + thời lượng, người đề xuất, địa chỉ + Chỉ đường', () => {
    const html = view();
    expect(html).toContain('aria-label="Sửa giờ và ghi chú"');
    expect(html).toContain('aria-label="Bỏ khỏi lịch"');
    expect(html).toContain('aria-label="Đóng"');
    expect(html).toMatch(/<h2 id="t"[^>]*>Cà Phê Trứng 3T<\/h2>/);
    expect(html).toContain('18:00 – 19:00 · 1 giờ');
    expect(html).toContain('Do HoangNam đề xuất');
    expect(html).toContain('4 người muốn đi');
    expect(html).toContain('data-testid="popover-address"');
    expect(html).toContain('>Chỉ đường<');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Xem chi tiết quán');
    // Nút đầu nhận focus khi mở
    expect(tag(html, 'popover-edit')).toContain('data-autofocus');
  });

  it('thứ tự nội dung: ảnh → tên → giờ → người đề xuất → địa chỉ', () => {
    const html = view({ note: 'Đặt bàn trước' }, ['Trùng giờ với Quán B']);
    const order = ['popover-photo', 'popover-time', 'popover-submitter', 'popover-address', 'popover-note', 'popover-conflicts', 'popover-open-place'].map(
      (id) => html.indexOf(`data-testid="${id}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf('<h2')).toBeGreaterThan(order[0]);
    expect(html.indexOf('<h2')).toBeLessThan(order[1]);
  });

  it('thiếu ảnh → minh hoạ danh mục; có ảnh tuyển chọn → <img> 16:9', () => {
    expect(view()).toContain('data-photo="illustration"');
    expect(view()).toContain('aspect-video');
    const entry: CuratedEntry = {
      id: 'c1', wave: 1, name: place.name, address: '', lat: place.latitude ?? 0, lng: place.longitude ?? 0,
      category: 'DRINK', price_per_person: 0, collections: [], intro: { vi: 'Quán view sông', en: 'River view' },
      try: { vi: [], en: [] }, photos: [{ file: 'c1.webp', kind: 'cover', source: 't' }],
    };
    const html = view({}, [], { places: [entry], files: new Set(['c1.webp']) });
    expect(html).toContain('data-photo="image"');
    expect(html).toContain('src="/curated/c1.webp"');
    expect(html).toContain('Quán view sông');
    // Giới thiệu ngắn thì không cần "Xem thêm"
    expect(html).not.toContain('Xem thêm');
  });

  it('giới thiệu dài có nút "Xem thêm" (aria-expanded)', () => {
    const entry: CuratedEntry = {
      id: 'c1', wave: 1, name: place.name, address: '', lat: place.latitude ?? 0, lng: place.longitude ?? 0,
      category: 'DRINK', price_per_person: 0, collections: [], intro: { vi: 'x'.repeat(200), en: 'y' },
      try: { vi: [], en: [] }, photos: [],
    };
    const html = view({}, [], { places: [entry], files: new Set() });
    expect(html).toContain('line-clamp-3');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Xem thêm');
  });

  it('thiếu người đề xuất → không có dòng đề xuất', () => {
    const anon = { ...place, submitted_by_nickname: undefined, submitted_by_id: 'ai-do' };
    const html = renderToStaticMarkup(
      <ItemView item={item()} info={buildItemInfo(item(), anon, [], null, 'vi')} onEdit={() => {}} onRemove={() => {}} />,
    );
    expect(html).not.toContain('popover-submitter');
    expect(html).not.toContain('đề xuất');
  });

  it('có ghi chú → khối nền surface-2; không ghi chú → không có khối', () => {
    expect(view({ note: 'Đặt bàn trước 18:00' })).toMatch(/data-testid="popover-note"[^>]*class="[^"]*bg-surface-2/);
    expect(view({ note: 'Đặt bàn trước 18:00' })).toContain('Đặt bàn trước 18:00');
    expect(view()).not.toContain('popover-note');
  });

  it('có xung đột → mỗi câu một chip danger đầy đủ, có icon + chữ (không chỉ màu)', () => {
    const html = view({}, ['Quán đóng cửa lúc 18:30', 'Trùng giờ với Quán B']);
    expect(html).toContain('data-testid="popover-conflicts"');
    expect(html).toContain('Quán đóng cửa lúc 18:30');
    expect(html).toContain('Trùng giờ với Quán B');
    expect(html).toContain('bg-danger-soft');
    expect(html).toContain('<svg');
    expect(view()).not.toContain('popover-conflicts');
  });

  it('dùng trong Sheet: không vẽ lại tiêu đề, không có nút Đóng thứ hai', () => {
    const html = renderToStaticMarkup(
      <ItemView item={item()} info={buildItemInfo(item(), place, members, null, 'vi')} showTitle={false} onEdit={() => {}} onRemove={() => {}} />,
    );
    expect(html).not.toContain('<h2');
    expect(html).not.toContain('popover-close');
  });

  it('EN: giờ 12 giờ và thời lượng tiếng Anh', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(
      <ItemView item={item()} info={buildItemInfo(item(), place, members, null, 'en')} onEdit={() => {}} onRemove={() => {}} />,
    );
    expect(html).toContain('6:00 PM – 7:00 PM · 1 h');
    expect(html).toContain('Suggested by HoangNam');
    expect(html).toContain('4 people want to go');
    expect(html).toContain('aria-label="Edit time and note"');
  });
});

describe('T-81: markup tĩnh — chế độ sửa', () => {
  const edit = (over: Partial<ScheduleItem> = {}, others: ScheduleItem[] = [], saving = false) =>
    renderToStaticMarkup(
      <ItemEdit
        item={item(over)}
        name="Cà Phê Trứng 3T"
        window={WINDOW}
        items={[item(over), ...others]}
        saving={saving}
        titleId="t"
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );

  it('tiêu đề "Sửa · Tên", nút ←, hai ô giờ type=time step=60 với giờ hiện có, 4 chip thời lượng', () => {
    const html = edit({ start_minute: 1090, end_minute: 1150 });
    expect(html).toContain('Sửa · Cà Phê Trứng 3T');
    expect(html).toContain('aria-label="Quay lại"');
    expect(html.match(/type="time"/g)?.length).toBe(2);
    expect(html.match(/step="60"/g)?.length).toBe(2);
    expect(html).toContain('value="18:10"');
    expect(html).toContain('value="19:10"');
    for (const c of ['30 phút', '1 giờ', '1,5 giờ', '2 giờ']) expect(html).toContain(`>${c}<`);
    // Thời lượng hiện tại 60' → chip "1 giờ" được nhấn
    expect(tag(html, 'popover-chip-60')).toContain('aria-pressed="true"');
    expect(tag(html, 'popover-chip-30')).toContain('aria-pressed="false"');
  });

  it('hợp lệ: nút Lưu bật, không lỗi, không nhắc, ô giờ đầu nhận focus', () => {
    const html = edit();
    expect(tag(html, 'popover-save')).not.toContain('disabled');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('popover-notices');
    expect(tag(html, 'popover-start')).toContain('data-autofocus');
  });

  it('có ghi chú sẵn thì điền vào textarea; dưới 400 ký tự không hiện bộ đếm', () => {
    const html = edit({ note: 'Gọi món trước' });
    expect(html).toMatch(/<textarea[^>]*>Gọi món trước<\/textarea>/);
    expect(html).not.toContain('/500');
  });

  it('ghi chú > 400 hiện bộ đếm; 501 → lỗi đỏ và khoá Lưu', () => {
    expect(edit({ note: 'a'.repeat(450) })).toContain('450/500');
    const html = edit({ note: 'a'.repeat(501) });
    expect(html).toContain('Ghi chú tối đa 500 ký tự.');
    expect(html).toContain('501/500');
    expect(tag(html, 'popover-save')).toContain('disabled');
  });

  it('ngoài khung giờ → câu nhắc vàng nhưng vẫn cho lưu', () => {
    const html = edit({ start_minute: 1020, end_minute: 1080 }); // 17:00–18:00, khung 18–22
    expect(html).toContain('bg-warning-soft');
    expect(html).toContain('Ngoài khung giờ 18:00 – 22:00.');
    expect(tag(html, 'popover-save')).not.toContain('disabled');
  });

  it('trùng giờ → câu nhắc nêu tên mục trùng', () => {
    const other = item({ id: 'it-2', place_name: 'Quán Bờ Sông', start_minute: 1100, end_minute: 1160 });
    const html = edit({}, [other]);
    expect(html).toContain('Trùng giờ với Quán Bờ Sông.');
  });

  it('kết thúc ≤ bắt đầu → lỗi dưới ô kết thúc (không đỏ cả form) và khoá Lưu', () => {
    const html = edit({ start_minute: 1140, end_minute: 1140 });
    expect(html).toContain('Giờ kết thúc phải sau giờ bắt đầu.');
    expect(html.match(/role="alert"/g)?.length).toBe(1);
    expect(tag(html, 'popover-save')).toContain('disabled');
  });

  it('đang lưu: nút Lưu xoay (aria-busy) và mọi ô bị khoá', () => {
    const html = edit({}, [], true);
    expect(tag(html, 'popover-save')).toContain('aria-busy="true"');
    expect(html).toContain('Đang lưu…');
    expect(html.match(/<input[^>]*disabled/g)?.length).toBe(2);
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(tag(html, 'popover-back')).toContain('disabled');
  });
});

describe('T-81: thanh Hoàn tác', () => {
  it('"Đã bỏ … khỏi lịch" + nút Hoàn tác, vùng chạm 44px, role=status', () => {
    const html = renderToStaticMarkup(<UndoRemoveBar name="Quán Bờ Sông" onUndo={() => {}} onDone={() => {}} />);
    expect(html).toContain('Đã bỏ Quán Bờ Sông khỏi lịch');
    expect(html).toContain('>Hoàn tác<');
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('role="status"');
  });
});

describe('T-81: i18n popup VI/EN cùng khoá', () => {
  const keys = (o: Record<string, unknown>) => Object.keys(o).sort();
  it('nhóm calendar.pop có đủ khoá ở hai ngôn ngữ', () => {
    const vi = viLocale.calendar.pop as Record<string, unknown>;
    const en = enLocale.calendar.pop as Record<string, unknown>;
    expect(keys(vi)).toEqual(keys(en));
    for (const k of keys(vi)) {
      expect(typeof vi[k]).toBe('string');
      expect((vi[k] as string).length).toBeGreaterThan(0);
      expect((en[k] as string).length).toBeGreaterThan(0);
    }
  });
});

describe('T-81: lưu giờ + ghi chú qua store (MSW)', () => {
  const ROOM_ID = mockRoom.id;
  const A_ID = mockScheduleItems[0].id;
  let bId = '';

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    resetMockDb();
    tokenStorage.clearAll();
    useScheduleStore.getState().reset();
  });
  beforeEach(async () => {
    const b = await scheduleApi.createScheduleItem(ROOM_ID, {
      place_id: mockPlaces[0].id,
      day_offset: 0,
      start_minute: 1200,
      end_minute: 1260,
      note: 'ghi chú của B',
    });
    bId = b.id;
    await useScheduleStore.getState().fetchSchedule(ROOM_ID);
  });

  it('sửa 18:00→18:10 + ghi chú mới: lưu đúng phút (không ép 15\'), ghi chú mới ở cả store và server, mục khác không đổi', async () => {
    const slot = { start_minute: 1090, end_minute: 1150 }; // 18:10–19:10
    await useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, ...slot, note: 'Đặt bàn trước' }]);
    const local = useScheduleStore.getState().items;
    expect(local.find((i) => i.id === A_ID)).toMatchObject({ ...slot, note: 'Đặt bàn trước' });
    const remote = await scheduleApi.listSchedule(ROOM_ID);
    expect(remote.find((i) => i.id === A_ID)).toMatchObject({ ...slot, note: 'Đặt bàn trước' });
    expect(remote.find((i) => i.id === bId)?.note).toBe('ghi chú của B');
  });

  it('chỉ sửa ghi chú (giờ giữ nguyên) vẫn gửi PUT và lưu', async () => {
    const a = useScheduleStore.getState().items.find((i) => i.id === A_ID)!;
    await useScheduleStore
      .getState()
      .moveItems(ROOM_ID, [{ id: A_ID, start_minute: a.start_minute, end_minute: a.end_minute, note: 'chỉ ghi chú' }]);
    const remote = await scheduleApi.listSchedule(ROOM_ID);
    expect(remote.find((i) => i.id === A_ID)).toMatchObject({ start_minute: a.start_minute, note: 'chỉ ghi chú' });
  });

  it('xoá ghi chú (note: null) thật sự xoá, khác với thiếu khoá', async () => {
    const a = useScheduleStore.getState().items.find((i) => i.id === A_ID)!;
    await useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: a.start_minute, end_minute: a.end_minute, note: null }]);
    expect((await scheduleApi.listSchedule(ROOM_ID)).find((i) => i.id === A_ID)?.note ?? null).toBeNull();
  });

  it('không đổi gì → không gọi PUT (không lỗi, mục nguyên vẹn)', async () => {
    const before = useScheduleStore.getState().items;
    const a = before.find((i) => i.id === A_ID)!;
    const after = await useScheduleStore
      .getState()
      .moveItems(ROOM_ID, [{ id: A_ID, start_minute: a.start_minute, end_minute: a.end_minute, note: a.note ?? null }]);
    expect(after).toEqual(before);
  });

  it('bỏ khỏi lịch rồi hoàn tác: POST lại đúng giờ + ghi chú cũ', async () => {
    const snapshot = useScheduleStore.getState().items.find((i) => i.id === bId)!;
    useScheduleStore.getState().removeItem(bId);
    await scheduleApi.deleteScheduleItem(ROOM_ID, bId);
    expect((await scheduleApi.listSchedule(ROOM_ID)).some((i) => i.id === bId)).toBe(false);

    const created = await scheduleApi.createScheduleItem(ROOM_ID, {
      place_id: snapshot.place_id,
      day_offset: snapshot.day_offset,
      start_minute: snapshot.start_minute,
      end_minute: snapshot.end_minute,
      note: snapshot.note ?? undefined,
    });
    useScheduleStore.getState().upsertItem(created);
    expect(created).toMatchObject({ start_minute: 1200, end_minute: 1260, note: 'ghi chú của B', place_id: snapshot.place_id });
    expect(useScheduleStore.getState().items.filter((i) => i.id === created.id)).toHaveLength(1);
  });
});
