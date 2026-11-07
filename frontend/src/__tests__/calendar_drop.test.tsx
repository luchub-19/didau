// T-80: kéo quán đã chốt từ cột trái/khay mobile sang lịch — chỗ thả (dropSlot/addToCalendarSlot), quyết định
// "thêm mới / dời mục cũ", kênh kéo, placeOnCalendar (store giả), markup khay "Chưa xếp lịch" + mục gập "Dự bị (N)".
// Môi trường test là node: chỉ hàm thuần + markup tĩnh; kéo thật kiểm bằng CDP (PROGRESS T-80).
import '../i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import {
  addToCalendarSlot,
  dropSlot,
  gridRange,
  placeDropAction,
  type CalendarGrid,
} from '../room/calendar';
import { addToFirstFree, calendarChannel, placeOnCalendar } from '../room/useCalendarDrag';
import { LockedPlaces, UnscheduledTray } from '../components/schedule';
import { CalendarColumn } from '../components/schedule/CalendarColumn';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import { mockPlaces, mockRoom, mockScheduleItems } from '../mocks/mockData';
import type { Place, Room, ScheduleItem } from '../types';

const room: Room = { ...mockRoom, start_minute: 1020, end_minute: 1380 };
const item = (id: string, placeId: string, start: number, end: number, over: Partial<ScheduleItem> = {}): ScheduleItem => ({
  ...mockScheduleItems[0],
  id,
  place_id: placeId,
  place_name: `Quán ${placeId}`,
  start_minute: start,
  end_minute: end,
  order_index: 0,
  day_offset: 0,
  note: null,
  ...over,
});
const pl = (id: string, over: Partial<Place> = {}): Place => ({ ...mockPlaces[0], id, name: `Quán ${id}`, ...over });
const grid = (start: number, end: number): CalendarGrid => ({ start, end, windowStart: start, windowEnd: end });

afterEach(async () => {
  calendarChannel.reset();
  await i18n.changeLanguage('vi');
});

describe('T-80: chỗ thả', () => {
  it('thả 19:20 → 19:15–20:15 (snap 15, mặc định 60 phút)', () => {
    expect(dropSlot(1160, grid(1020, 1380))).toEqual({ start_minute: 1155, end_minute: 1215 });
  });

  it('thả 21:40 khi khung tới 22:00 → lùi về 21:00–22:00', () => {
    expect(dropSlot(1300, grid(1080, 1320))).toEqual({ start_minute: 1260, end_minute: 1320 });
  });

  it('khung < 60 phút → ô lấp cả khung; quán đã xếp giữ thời lượng mục cũ', () => {
    expect(dropSlot(1300, grid(1290, 1320))).toEqual({ start_minute: 1290, end_minute: 1320 });
    expect(dropSlot(1080, grid(1020, 1380), 90)).toEqual({ start_minute: 1080, end_minute: 1170 });
  });

  it('"Thêm vào lịch" không kéo: giờ trống đầu tiên ≥ 60 phút', () => {
    const g = gridRange(room, []);
    const items = [item('a', 'p1', 1020, 1080), item('b', 'p2', 1110, 1200)];
    // 18:00–18:30 chỉ 30 phút → bỏ, lấy 20:00
    expect(addToCalendarSlot(items, g)).toEqual({ start_minute: 1200, end_minute: 1260 });
    expect(addToCalendarSlot([], g)).toEqual({ start_minute: 1020, end_minute: 1080 });
  });

  it('lịch kín → ngay sau mục cuối, kẹp trong khung (kết thúc đúng cuối khung)', () => {
    const g = gridRange(room, []);
    const full = [item('a', 'p1', 1020, 1200), item('b', 'p2', 1200, 1350)];
    expect(addToCalendarSlot(full, g)).toEqual({ start_minute: 1320, end_minute: 1380 });
  });
});

describe('T-80: thêm mới hay dời mục cũ', () => {
  const items = [item('s1', 'p1', 1080, 1140), item('s2', 'p2', 1200, 1260, { day_offset: 1, order_index: 1 })];

  it('quán chưa có mục → thêm mới', () => {
    expect(placeDropAction('p9', { start_minute: 1155, end_minute: 1215 }, items)).toEqual({
      kind: 'add',
      placeId: 'p9',
      slot: { start_minute: 1155, end_minute: 1215 },
    });
  });

  it('quán đã có mục → dời đúng mục đó (không nhân bản)', () => {
    expect(placeDropAction('p1', { start_minute: 1200, end_minute: 1260 }, items)).toEqual({
      kind: 'move',
      itemId: 's1',
      slot: { start_minute: 1200, end_minute: 1260 },
    });
  });

  it('thả trúng giờ cũ → không làm gì; mục ở ngày khác cùng giờ vẫn là dời (về ngày đầu)', () => {
    expect(placeDropAction('p1', { start_minute: 1080, end_minute: 1140 }, items).kind).toBe('none');
    expect(placeDropAction('p2', { start_minute: 1200, end_minute: 1260 }, items).kind).toBe('move');
  });
});

describe('T-80: kênh kéo', () => {
  it('chưa có lịch đăng ký → thả = huỷ (null); đăng ký rồi gỡ', () => {
    expect(calendarChannel.resolveDrop(10, 10)).toBeNull();
    const off = calendarChannel.registerDropTarget(() => ({ start_minute: 1080, end_minute: 1140 }));
    expect(calendarChannel.resolveDrop(10, 10)).toEqual({ start_minute: 1080, end_minute: 1140 });
    off();
    expect(calendarChannel.resolveDrop(10, 10)).toBeNull();
  });

  it('end() xoá drag và ghi lastEnd tăng dần (khung phòng dựa vào để đóng ngăn kéo khi huỷ)', () => {
    calendarChannel.set({ drag: { placeId: 'p1', name: 'A', clientX: 1, clientY: 2 } });
    calendarChannel.end(false);
    const first = calendarChannel.get().lastEnd!;
    expect(calendarChannel.get().drag).toBeNull();
    expect(first.dropped).toBe(false);
    calendarChannel.end(true);
    expect(calendarChannel.get().lastEnd!.seq).toBe(first.seq + 1);
  });
});

describe('T-80: placeOnCalendar', () => {
  const initial = useScheduleStore.getState();
  type AddData = { place_id: string; start_minute: number; end_minute: number };
  let addItem: ReturnType<typeof vi.fn<[string, AddData], Promise<ScheduleItem>>>;
  let moveItems: ReturnType<typeof vi.fn<[], Promise<ScheduleItem[]>>>;
  let evaluate: ReturnType<typeof vi.fn<[], Promise<void>>>;
  let pendingDuringAdd: number;

  beforeEach(() => {
    pendingDuringAdd = -1;
    addItem = vi.fn(async (_room: string, data: AddData) => {
      pendingDuringAdd = calendarChannel.get().pending.length;
      const it = item('new', data.place_id, data.start_minute, data.end_minute, { order_index: 5 });
      useScheduleStore.setState((s) => ({ items: [...s.items, it] }));
      return it;
    });
    moveItems = vi.fn(async () => useScheduleStore.getState().items);
    evaluate = vi.fn(async () => {});
    useScheduleStore.setState({ items: [item('s1', 'p1', 1080, 1140)], addItem, moveItems } as never);
    useConflictStore.setState({ evaluateConflicts: evaluate } as never);
  });
  afterEach(() => {
    useScheduleStore.setState(initial, true);
  });

  it('quán mới: POST ngày đầu đúng giờ, skeleton trong lúc chờ rồi gỡ, sắp lại thứ tự, đánh giá xung đột', async () => {
    const r = await placeOnCalendar('room', { placeId: 'p2', name: 'B' }, { start_minute: 1155, end_minute: 1215 });
    expect(addItem).toHaveBeenCalledWith('room', { place_id: 'p2', day_offset: 0, start_minute: 1155, end_minute: 1215 });
    expect(pendingDuringAdd).toBe(1);
    expect(calendarChannel.get().pending).toHaveLength(0);
    expect(moveItems).toHaveBeenCalledWith('room', []);
    expect(evaluate).toHaveBeenCalled();
    expect(r).toEqual({ itemId: 'new', slot: { start_minute: 1155, end_minute: 1215 }, added: true });
  });

  it('quán đã xếp: dời mục cũ qua moveItems, không POST', async () => {
    await placeOnCalendar('room', { placeId: 'p1', name: 'A' }, { start_minute: 1200, end_minute: 1260 });
    expect(addItem).not.toHaveBeenCalled();
    expect(moveItems).toHaveBeenCalledWith('room', [{ id: 's1', day_offset: 0, start_minute: 1200, end_minute: 1260 }]);
  });

  it('POST lỗi → gỡ skeleton và ném lại (UI toast)', async () => {
    addItem.mockRejectedValueOnce(new Error('x'));
    await expect(placeOnCalendar('room', { placeId: 'p3', name: 'C' }, { start_minute: 1200, end_minute: 1260 })).rejects.toThrow();
    expect(calendarChannel.get().pending).toHaveLength(0);
  });

  it('WS tới trước kết quả POST (trùng id) → gộp, không nhân bản', async () => {
    addItem.mockImplementationOnce(async (_r: string, data: AddData) => {
      const it = item('dup', data.place_id, data.start_minute, data.end_minute);
      useScheduleStore.setState((s) => ({ items: [...s.items, it, it] }));
      return it;
    });
    await placeOnCalendar('room', { placeId: 'p4', name: 'D' }, { start_minute: 1200, end_minute: 1260 });
    expect(useScheduleStore.getState().items.filter((i) => i.id === 'dup')).toHaveLength(1);
  });

  it('addToFirstFree: giờ trống đầu tiên; quán đã có mục thì không thêm', async () => {
    const r = await addToFirstFree('room', room, { placeId: 'p2', name: 'B' });
    expect(addItem).toHaveBeenCalledWith('room', { place_id: 'p2', day_offset: 0, start_minute: 1020, end_minute: 1080 });
    expect(r?.added).toBe(true);
    addItem.mockClear();
    const again = await addToFirstFree('room', room, { placeId: 'p1', name: 'A' });
    expect(addItem).not.toHaveBeenCalled();
    expect(again).toEqual({ itemId: 's1', slot: { start_minute: 1080, end_minute: 1140 }, added: false });
  });
});

describe('T-80: markup', () => {
  const places = [
    pl('a', { status: 'ACCEPTED', score: 5 }),
    pl('b', { status: 'ACCEPTED', score: 1 }),
    pl('c', { status: 'PROPOSED', score: 0 }),
    pl('d', { status: 'PROPOSED', score: 0 }),
  ];
  const calendar = { draggable: true, onDrop: () => {}, onAdd: () => {}, onShow: () => {} };

  it('LockedPlaces: tay nắm + menu ⋯, nhãn giờ ở quán đã xếp, mục gập "Dự bị (N)" + "Xem lại bình chọn"', () => {
    const html = renderToStaticMarkup(
      <LockedPlaces
        places={places}
        schedule={[item('s1', 'b', 1140, 1200)]}
        onOpenPlace={() => {}}
        onReviewBackups={() => {}}
        calendar={calendar}
      />,
    );
    expect(html).toContain('data-drag-source="a"');
    expect(html).toContain('data-drag-source="b"');
    expect(html.match(/data-testid="locked-handle"/g)?.length).toBe(4);
    expect(html.match(/data-testid="locked-menu-trigger"/g)?.length).toBe(4);
    expect(html).toContain('Tuỳ chọn cho Quán a');
    // Chỉ quán b có trên lịch: một nhãn giờ 19:00
    expect(html.match(/data-testid="locked-time"/g)?.length).toBe(1);
    expect(html).toMatch(/data-testid="locked-time"[^>]*>.*19:00<\/span>/);
    expect(html).toContain('Dự bị (2)');
    expect(html).toMatch(/aria-expanded="false"[^>]*data-testid="locked-backups-toggle"/);
    expect(html).toContain('Xem lại bình chọn');
    expect(html).toContain('cursor-grab');
  });

  it('LockedPlaces không kéo được (mobile/không truyền calendar): không tay nắm', () => {
    const html = renderToStaticMarkup(
      <LockedPlaces places={places} schedule={[]} onOpenPlace={() => {}} onReviewBackups={() => {}} calendar={{ ...calendar, draggable: false }} />,
    );
    expect(html).not.toContain('data-testid="locked-handle"');
    expect(html).not.toContain('data-drag-source');
    expect(html).toContain('data-testid="locked-menu-trigger"');
    const bare = renderToStaticMarkup(<LockedPlaces places={places} schedule={[]} onOpenPlace={() => {}} onReviewBackups={() => {}} />);
    expect(bare).not.toContain('locked-menu-trigger');
  });

  it('UnscheduledTray: tiêu đề có số, chip nguồn kéo cho từng quán; rỗng → không vẽ', () => {
    const html = renderToStaticMarkup(<UnscheduledTray places={places.slice(0, 2)} onDrop={() => {}} onAddFirstFree={() => {}} />);
    expect(html).toContain('Chưa xếp lịch (2)');
    expect(html).toContain('Nhấn giữ rồi kéo xuống lịch');
    expect(html.match(/data-testid="tray-chip"/g)?.length).toBe(2);
    expect(html).toContain('data-drag-source="a"');
    expect(renderToStaticMarkup(<UnscheduledTray places={[]} onDrop={() => {}} onAddFirstFree={() => {}} />)).toBe('');
  });

  it('EN: khay + mục dự bị', async () => {
    await i18n.changeLanguage('en');
    const tray = renderToStaticMarkup(<UnscheduledTray places={places.slice(0, 1)} onDrop={() => {}} onAddFirstFree={() => {}} />);
    expect(tray).toContain('Not scheduled (1)');
    const locked = renderToStaticMarkup(
      <LockedPlaces places={places} schedule={[]} onOpenPlace={() => {}} onReviewBackups={() => {}} calendar={calendar} />,
    );
    expect(locked).toContain('Backups (2)');
    expect(locked).toContain('Review the vote');
  });

  it('CalendarColumn: khay nằm trong đầu cột; ô đang chờ POST vẽ skeleton tại giờ thả, lịch trống không hiện gợi ý', () => {
    calendarChannel.set({ pending: [{ placeId: 'p9', name: 'Quán chờ', slot: { start_minute: 1140, end_minute: 1200 } }] });
    const html = renderToStaticMarkup(
      <CalendarColumn roomId={room.id} room={room} items={[]} places={mockPlaces} conflicts={[]} tray={<div data-testid="tray-slot" />} />,
    );
    expect(html).toContain('data-testid="tray-slot"');
    expect(html).toMatch(/data-testid="calendar-pending"[^>]*style="top:128px;height:62px"/);
    expect(html).toContain('Quán chờ');
    expect(html).not.toContain('data-testid="calendar-empty"');
  });
});
