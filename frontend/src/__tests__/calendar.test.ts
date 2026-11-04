import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { mockPlaces, mockScheduleItems } from '../mocks/mockData';
import { scheduleApi } from '../services/api';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useScheduleStore } from '../store/useScheduleStore';
import {
  dropSlot,
  firstFreeSlot,
  gridRange,
  layoutColumns,
  minuteAtY,
  moveSlot,
  placeScheduleItem,
  reorderByStart,
  resizeSlot,
  snap,
  toBulkPayload,
  yAtMinute,
  type CalendarGrid,
} from '../room/calendar';
import type { ScheduleItem } from '../types';

const ROOM = { start_minute: 1020, end_minute: 1380 }; // 17:00–23:00
const GRID: CalendarGrid = { start: 1020, end: 1380, windowStart: 1020, windowEnd: 1380 };

const item = (id: string, start: number, end: number, extra: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id,
  room_id: 'r1',
  place_id: `p-${id}`,
  place_name: id,
  day_offset: 0,
  start_minute: start,
  end_minute: end,
  order_index: 0,
  note: null,
  ...extra,
});

describe('T-78: room/calendar — lưới, snap, toạ độ', () => {
  it('snap về bội 15 phút (biên 7→0, 8→15)', () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(1027)).toBe(1020);
    expect(snap(1028)).toBe(1035);
    expect(snap(1020)).toBe(1020);
  });

  it('minuteAtY và yAtMinute là nghịch đảo của nhau (15 phút = 16px)', () => {
    expect(yAtMinute(1035, 1020)).toBeCloseTo(16);
    expect(minuteAtY(16, 1020)).toBeCloseTo(1035);
    expect(minuteAtY(yAtMinute(1100, 1020), 1020)).toBeCloseTo(1100);
    expect(yAtMinute(1020, 1020)).toBe(0);
  });

  it('gridRange: bằng khung phòng khi mọi mục nằm trong khung', () => {
    expect(gridRange(ROOM, [item('a', 1080, 1140)])).toEqual(GRID);
    expect(gridRange(ROOM, [])).toEqual(GRID);
  });

  it('gridRange: mở rộng tới giờ chẵn khi có mục ngoài khung, bỏ qua mục ngày khác', () => {
    const g = gridRange(ROOM, [item('a', 1000, 1100), item('b', 1350, 1400), item('c', 60, 120, { day_offset: 1 })]);
    expect(g.start).toBe(960); // 16:40 → 16:00
    expect(g.end).toBe(1440 - 1); // 23:20 → 24:00 bị kẹp 1439 (backend không nhận 1440)
    expect(g.windowStart).toBe(1020);
    expect(g.windowEnd).toBe(1380);
  });

  it('gridRange: khung phòng hỏng dùng khung mặc định 17–23h', () => {
    expect(gridRange({ start_minute: 600, end_minute: 600 }, [])).toMatchObject({ start: 1020, end: 1380 });
  });
});

describe('T-78: dropSlot / moveSlot / resizeSlot', () => {
  it('thả giữa khung: snap vào con trỏ, 60 phút', () => {
    expect(dropSlot(1203, GRID)).toEqual({ start_minute: 1200, end_minute: 1260 });
  });

  it('thả ở đầu khung hoặc trước khung: kẹp vào đầu', () => {
    expect(dropSlot(1020, GRID)).toEqual({ start_minute: 1020, end_minute: 1080 });
    expect(dropSlot(900, GRID)).toEqual({ start_minute: 1020, end_minute: 1080 });
  });

  it('thả ở cuối khung: lùi lại để vừa 60 phút', () => {
    expect(dropSlot(1380, GRID)).toEqual({ start_minute: 1320, end_minute: 1380 });
    expect(dropSlot(1370, GRID)).toEqual({ start_minute: 1320, end_minute: 1380 });
    expect(dropSlot(5000, GRID)).toEqual({ start_minute: 1320, end_minute: 1380 });
  });

  it('khung ngắn hơn 60 phút: ô lấp đầy khung', () => {
    const tiny: CalendarGrid = { start: 1020, end: 1050, windowStart: 1020, windowEnd: 1050 };
    expect(dropSlot(1030, tiny)).toEqual({ start_minute: 1020, end_minute: 1050 });
  });

  it('thời lượng tuỳ chọn', () => {
    expect(dropSlot(1200, GRID, 90)).toEqual({ start_minute: 1200, end_minute: 1290 });
  });

  it('moveSlot: dời và snap, giữ thời lượng', () => {
    expect(moveSlot({ start_minute: 1080, end_minute: 1140 }, 40, GRID)).toEqual({
      start_minute: 1125,
      end_minute: 1185,
    });
    expect(moveSlot({ start_minute: 1080, end_minute: 1140 }, -20, GRID)).toEqual({
      start_minute: 1065, // 1060 snap lên 1065
      end_minute: 1125,
    });
  });

  it('moveSlot: ra ngoài lưới bị kẹp ở hai đầu', () => {
    expect(moveSlot({ start_minute: 1080, end_minute: 1140 }, -9999, GRID)).toEqual({
      start_minute: 1020,
      end_minute: 1080,
    });
    expect(moveSlot({ start_minute: 1080, end_minute: 1140 }, 9999, GRID)).toEqual({
      start_minute: 1320,
      end_minute: 1380,
    });
  });

  it('moveSlot: delta 0 giữ nguyên giờ gốc, kể cả khi lệch snap', () => {
    expect(moveSlot({ start_minute: 1083, end_minute: 1143 }, 0, GRID)).toEqual({
      start_minute: 1083,
      end_minute: 1143,
    });
  });

  it('resizeSlot: snap giờ kết thúc, không đổi giờ bắt đầu', () => {
    expect(resizeSlot({ start_minute: 1080, end_minute: 1140 }, 1203, GRID)).toEqual({
      start_minute: 1080,
      end_minute: 1200,
    });
  });

  it('resizeSlot: kéo dãn dưới 15 phút bị kẹp ≥ 15', () => {
    expect(resizeSlot({ start_minute: 1080, end_minute: 1140 }, 1085, GRID).end_minute).toBe(1095);
    expect(resizeSlot({ start_minute: 1080, end_minute: 1140 }, 1000, GRID).end_minute).toBe(1095);
  });

  it('resizeSlot: không vượt cuối lưới', () => {
    expect(resizeSlot({ start_minute: 1080, end_minute: 1140 }, 9999, GRID).end_minute).toBe(1380);
  });
});

describe('T-78: layoutColumns', () => {
  const cols = (items: ScheduleItem[]) =>
    Object.fromEntries(layoutColumns(items).map((l) => [l.id, `${l.col}/${l.cols}${l.overflow ? '+' : ''}`]));

  it('không chồng: mỗi ô một cột đầy bề ngang', () => {
    expect(cols([item('a', 1020, 1080), item('b', 1080, 1140)])).toEqual({ a: '0/1', b: '0/1' });
  });

  it('chồng 2: hai cột, ô bắt đầu sớm bên trái', () => {
    expect(cols([item('b', 1050, 1110), item('a', 1020, 1080)])).toEqual({ a: '0/2', b: '1/2' });
  });

  it('chồng 3: ba cột, không tràn', () => {
    const r = layoutColumns([item('a', 1020, 1140), item('b', 1030, 1140), item('c', 1040, 1140)]);
    expect(r.map((l) => [l.id, l.col, l.cols, l.overflow])).toEqual([
      ['a', 0, 3, false],
      ['b', 1, 3, false],
      ['c', 2, 3, false],
    ]);
  });

  it('chuỗi A∩B, B∩C nhưng A∩C rỗng: cùng cụm 2 cột, C quay về cột của A', () => {
    expect(cols([item('a', 1020, 1080), item('b', 1050, 1110), item('c', 1080, 1140)])).toEqual({
      a: '0/2',
      b: '1/2',
      c: '0/2',
    });
  });

  it('cùng giờ bắt đầu: ô dài hơn đứng trước', () => {
    expect(cols([item('short', 1020, 1050), item('long', 1020, 1140)])).toEqual({ long: '0/2', short: '1/2' });
  });

  it('chồng nhiều hơn 3: hai cột đầu thật, còn lại tràn ở cột thứ 3', () => {
    const r = layoutColumns([
      item('a', 1020, 1140),
      item('b', 1020, 1140),
      item('c', 1020, 1140),
      item('d', 1020, 1140),
    ]);
    expect(r.every((l) => l.cols === 3)).toBe(true);
    expect(r.filter((l) => l.overflow).length).toBe(2);
    expect(r.filter((l) => l.overflow).every((l) => l.col === 2)).toBe(true);
    expect(r.filter((l) => !l.overflow).map((l) => l.col).sort()).toEqual([0, 1]);
    expect(new Set(r.map((l) => l.cluster)).size).toBe(1);
  });

  it('hai cụm tách rời có số cụm khác nhau; mục ngày khác không được xếp', () => {
    const r = layoutColumns([
      item('a', 1020, 1080),
      item('b', 1200, 1260),
      item('x', 1020, 1080, { day_offset: 1 }),
    ]);
    expect(r.map((l) => l.id)).toEqual(['a', 'b']);
    expect(r[0].cluster).not.toBe(r[1].cluster);
  });
});

describe('T-78: firstFreeSlot', () => {
  it('lịch trống: ngay đầu lưới', () => {
    expect(firstFreeSlot([], GRID)).toEqual({ start_minute: 1020, end_minute: 1080 });
  });

  it('lưới trống nhưng ngắn hơn 60 phút: lấp đầy lưới', () => {
    expect(firstFreeSlot([], { start: 1020, end: 1050, windowStart: 1020, windowEnd: 1050 })).toEqual({
      start_minute: 1020,
      end_minute: 1050,
    });
  });

  it('kín: null', () => {
    expect(firstFreeSlot([item('a', 1020, 1380)], GRID)).toBeNull();
    expect(firstFreeSlot([item('a', 1020, 1200), item('b', 1200, 1380)], GRID)).toBeNull();
  });

  it('khe vừa đúng 60 phút ở giữa', () => {
    const busy = [item('a', 1020, 1080), item('b', 1140, 1380)];
    expect(firstFreeSlot(busy, GRID)).toEqual({ start_minute: 1080, end_minute: 1140 });
  });

  it('khe 45 phút không đủ: nhảy qua, lấy khe sau', () => {
    const busy = [item('a', 1020, 1080), item('b', 1125, 1200)];
    expect(firstFreeSlot(busy, GRID)).toEqual({ start_minute: 1200, end_minute: 1260 });
  });

  it('khe trống ở cuối sau mục cuối; làm tròn lên 15 phút', () => {
    expect(firstFreeSlot([item('a', 1020, 1213)], GRID)).toEqual({ start_minute: 1215, end_minute: 1275 });
  });

  it('mục ngày khác không chiếm chỗ', () => {
    expect(firstFreeSlot([item('a', 1020, 1380, { day_offset: 1 })], GRID)).toEqual({
      start_minute: 1020,
      end_minute: 1080,
    });
  });
});

describe('T-78: reorderByStart / placeScheduleItem', () => {
  it('gán lại order_index theo giờ bắt đầu (ngày trước)', () => {
    const r = reorderByStart([
      item('late', 1200, 1260, { order_index: 0 }),
      item('early', 1020, 1080, { order_index: 1 }),
      item('nextday', 600, 660, { order_index: 2, day_offset: 1 }),
    ]);
    expect(r.map((i) => [i.id, i.order_index])).toEqual([
      ['early', 0],
      ['late', 1],
      ['nextday', 2],
    ]);
  });

  it('không sửa mảng đầu vào', () => {
    const input = [item('b', 1200, 1260, { order_index: 0 }), item('a', 1020, 1080, { order_index: 1 })];
    reorderByStart(input);
    expect(input.map((i) => i.id)).toEqual(['b', 'a']);
    expect(input[0].order_index).toBe(0);
  });

  it('placeScheduleItem: tìm mục của quán, undefined khi chưa có', () => {
    const items = [item('a', 1020, 1080), item('b', 1100, 1160, { place_id: 'P' })];
    expect(placeScheduleItem('P', items)?.id).toBe('b');
    expect(placeScheduleItem('zzz', items)).toBeUndefined();
  });
});

describe('T-78: toBulkPayload (CR-10)', () => {
  const all = [
    item('a', 1020, 1080, { order_index: 0, note: 'ghi chú A' }),
    item('b', 1100, 1160, { order_index: 1, note: 'ghi chú B' }),
    item('c', 1200, 1260, { order_index: 2, note: null }),
  ];

  it('chỉ gửi mục đổi giờ/order_index', () => {
    const p = toBulkPayload([{ id: 'a', start_minute: 1050, end_minute: 1110 }, { id: 'b' }, { id: 'c', order_index: 2 }], all);
    expect(p.map((i) => i.id)).toEqual(['a']);
    expect(p[0]).toMatchObject({ start_minute: 1050, end_minute: 1110, order_index: 0, day_offset: 0 });
  });

  it('luôn kèm note lấy từ bản hiện có (null khi chưa có)', () => {
    const p = toBulkPayload(
      [
        { id: 'a', start_minute: 1050, end_minute: 1110 },
        { id: 'c', order_index: 0 },
      ],
      all,
    );
    expect(p.find((i) => i.id === 'a')?.note).toBe('ghi chú A');
    expect(p.find((i) => i.id === 'c')?.note).toBeNull();
  });

  it('note do changed mang theo thì dùng note đó (kể cả null = xoá); chỉ đổi note cũng được gửi', () => {
    const p = toBulkPayload([{ id: 'a', note: 'mới' }, { id: 'b', note: null }], all);
    expect(p.map((i) => [i.id, i.note])).toEqual([
      ['a', 'mới'],
      ['b', null],
    ]);
  });

  it('mục không có trong all bị bỏ qua; payload rỗng khi không có gì đổi', () => {
    expect(toBulkPayload([{ id: 'zzz', start_minute: 1 }], all)).toEqual([]);
    expect(toBulkPayload(all, all)).toEqual([]);
  });

  it('mục ngoài khung giờ phòng vẫn đi nguyên, không bị cắt', () => {
    const out = [item('o', 600, 660, { order_index: 0, note: 'sớm' })];
    const p = toBulkPayload([{ id: 'o', start_minute: 540, end_minute: 700 }], out);
    expect(p).toEqual([{ id: 'o', day_offset: 0, start_minute: 540, end_minute: 700, order_index: 0, note: 'sớm' }]);
  });
});

describe('T-78: useScheduleStore.moveItems (qua MSW)', () => {
  const ROOM_ID = 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21';
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
    // A = mục có sẵn (ghi chú "Uống cà phê sáng…"), B = mục thứ hai có ghi chú riêng
    const b = await scheduleApi.createScheduleItem(ROOM_ID, {
      place_id: mockPlaces[0].id,
      day_offset: 0,
      start_minute: 700,
      end_minute: 760,
      note: 'ghi chú của B',
    });
    bId = b.id;
    await useScheduleStore.getState().fetchSchedule(ROOM_ID);
  });

  it('kéo mục A không làm mất ghi chú của B (cũng như của A)', async () => {
    const before = useScheduleStore.getState().items;
    const noteA = before.find((i) => i.id === A_ID)?.note;
    expect(noteA).toBeTruthy();

    await useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: 800, end_minute: 860 }]);

    const after = useScheduleStore.getState().items;
    expect(after.find((i) => i.id === A_ID)).toMatchObject({ start_minute: 800, end_minute: 860, note: noteA });
    expect(after.find((i) => i.id === bId)?.note).toBe('ghi chú của B');
    // Server cũng giữ ghi chú (đọc lại qua API)
    const server = await scheduleApi.listSchedule(ROOM_ID);
    expect(server.find((i) => i.id === bId)?.note).toBe('ghi chú của B');
    expect(server.find((i) => i.id === A_ID)?.note).toBe(noteA);
  });

  it('order_index đi theo giờ bắt đầu sau khi kéo', async () => {
    await useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: 800, end_minute: 860 }]);
    expect(useScheduleStore.getState().items.map((i) => i.id)).toEqual([bId, A_ID]);
  });

  it('vẽ lạc quan ngay trước khi server trả lời', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.put('*/api/v1/rooms/:roomId/schedule', async () => {
        await gate;
        return HttpResponse.json([]);
      }),
    );
    const pending = useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: 900, end_minute: 960 }]);
    expect(useScheduleStore.getState().items.find((i) => i.id === A_ID)?.start_minute).toBe(900);
    release();
    await pending;
  });

  it('PUT lỗi → hoàn tác về bản trước, lưu mã lỗi và ném lại lỗi', async () => {
    server.use(
      http.put('*/api/v1/rooms/:roomId/schedule', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );
    const before = useScheduleStore.getState().items.map((i) => ({ ...i }));
    await expect(
      useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: 1200, end_minute: 1260 }]),
    ).rejects.toBeTruthy();
    const state = useScheduleStore.getState();
    expect(state.items).toEqual(before);
    expect(state.error).toBeTruthy();
  });

  it('không có gì đổi → không gọi PUT', async () => {
    server.use(
      http.put('*/api/v1/rooms/:roomId/schedule', () => {
        throw new Error('không được gọi PUT');
      }),
    );
    const cur = useScheduleStore.getState().items.find((i) => i.id === A_ID)!;
    await useScheduleStore.getState().moveItems(ROOM_ID, [{ id: A_ID, start_minute: cur.start_minute }]);
    expect(useScheduleStore.getState().items.find((i) => i.id === A_ID)?.start_minute).toBe(cur.start_minute);
  });

  it('bulkUpdate cũ thiếu note vẫn không xoá ghi chú (bổ sung từ bản hiện có)', async () => {
    const b = useScheduleStore.getState().items.find((i) => i.id === bId)!;
    await useScheduleStore.getState().bulkUpdate(ROOM_ID, {
      items: [{ id: b.id, day_offset: 0, start_minute: 710, end_minute: 770, order_index: b.order_index }],
    });
    expect(useScheduleStore.getState().items.find((i) => i.id === bId)?.note).toBe('ghi chú của B');
  });

  it('MSW mô phỏng đúng backend: PUT thiếu note → note = null', async () => {
    const res = await scheduleApi.bulkUpdateSchedule(ROOM_ID, {
      items: [{ id: bId, day_offset: 0, start_minute: 710, end_minute: 770, order_index: 1 }],
    });
    expect(res.find((i) => i.id === bId)?.note).toBeNull();
  });
});
