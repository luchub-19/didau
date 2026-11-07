// Logic thuần của lịch kéo thả (DESIGN gđ6 §3, T-78): lưới, snap, thả, di, kéo dãn, chồng giờ, payload bulk.
// Không đụng React/store/DOM để test bằng dữ liệu giả. Đơn vị mọi nơi là "phút trong ngày" (0–1439).
import type { BulkUpdateScheduleItem, Room, ScheduleItem } from '../types';

/** Bước snap (phút). */
export const SNAP_MIN = 15;
/** Thời lượng mặc định của một ô mới thả vào lịch. */
export const DEFAULT_DURATION_MIN = 60;
/** Thời lượng tối thiểu của một ô. */
export const MIN_DURATION_MIN = 15;
/** Backend chỉ nhận `end_minute ≤ 1439` (không qua nửa đêm) nên lưới dừng ở đây. */
export const MAX_END_MINUTE = 1439;
/** Số cột tối đa khi chồng giờ; cụm có nhiều cột hơn thì cột cuối là "+N". */
export const MAX_COLUMNS = 3;
/** Khung giờ mặc định của phòng (17:00–23:00) khi phòng có khung hỏng. */
export const DEFAULT_WINDOW = { start: 1020, end: 1380 } as const;
/** `--cal-hour: 64px` ⇒ 64/60 px mỗi phút (15 phút = 16px). */
export const PX_PER_MIN = 64 / 60;

type SlotItem = Pick<ScheduleItem, 'start_minute' | 'end_minute'> & { day_offset?: number };
type IdSlotItem = SlotItem & { id: string };

/** Giờ bắt đầu/kết thúc của một ô. */
export interface Slot {
  start_minute: number;
  end_minute: number;
}

/** Lưới hiển thị: `start/end` là trục vẽ; `windowStart/windowEnd` là khung giờ của phòng (phần ngoài tô sọc). */
export interface CalendarGrid {
  start: number;
  end: number;
  windowStart: number;
  windowEnd: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Chỉ mục của ngày đầu (`day_offset` 0) được vẽ trên lưới; mục thiếu `day_offset` coi như ngày 0. */
const onFirstDay = (i: { day_offset?: number }) => (i.day_offset ?? 0) === 0;

/** Làm tròn về bội gần nhất của 15 phút (7' → 0, 8' → 15). */
export function snap(minute: number): number {
  return Math.round(minute / SNAP_MIN) * SNAP_MIN;
}

/** Làm tròn LÊN bội của 15 phút. */
const snapUp = (minute: number) => Math.ceil(minute / SNAP_MIN) * SNAP_MIN;

/**
 * Lưới từ khung giờ phòng; mở rộng tới mục sớm/muộn nhất nếu có mục ngoài khung (làm tròn xuống/lên giờ chẵn).
 * Mục ở ngày khác không tính. Khung phòng hỏng (start ≥ end) → dùng khung mặc định.
 */
export function gridRange(
  room: Pick<Room, 'start_minute' | 'end_minute'>,
  items: readonly SlotItem[],
): CalendarGrid {
  const rs = room.start_minute ?? DEFAULT_WINDOW.start;
  const re = room.end_minute ?? DEFAULT_WINDOW.end;
  const valid = rs >= 0 && rs < re;
  const windowStart = valid ? rs : DEFAULT_WINDOW.start;
  const windowEnd = clamp(valid ? re : DEFAULT_WINDOW.end, windowStart + 1, MAX_END_MINUTE);

  let start = windowStart;
  let end = windowEnd;
  for (const it of items) {
    if (!onFirstDay(it)) continue;
    if (it.start_minute < start) start = Math.floor(it.start_minute / 60) * 60;
    if (it.end_minute > end) end = Math.min(MAX_END_MINUTE, Math.ceil(it.end_minute / 60) * 60);
  }
  return { start: Math.max(0, start), end, windowStart, windowEnd };
}

/** Phút ứng với toạ độ y (px, tính từ đỉnh lưới). */
export function minuteAtY(y: number, gridStart: number, pxPerMin: number = PX_PER_MIN): number {
  return gridStart + y / pxPerMin;
}

/** Toạ độ y (px, tính từ đỉnh lưới) của một phút. */
export function yAtMinute(minute: number, gridStart: number, pxPerMin: number = PX_PER_MIN): number {
  return (minute - gridStart) * pxPerMin;
}

/**
 * Chỗ thả một ô mới: bắt đầu tại phút con trỏ (đã snap), lùi lại khi chạm cuối khung;
 * khung ngắn hơn `duration` thì ô lấp đầy khung.
 */
export function dropSlot(pointerMinute: number, grid: CalendarGrid, duration: number = DEFAULT_DURATION_MIN): Slot {
  if (grid.end - grid.start <= duration) return { start_minute: grid.start, end_minute: grid.end };
  const start = clamp(snap(pointerMinute), grid.start, grid.end - duration);
  return { start_minute: start, end_minute: start + duration };
}

/** Dời ô `deltaMin` phút (snap), giữ thời lượng, kẹp trong lưới. `deltaMin = 0` giữ nguyên giờ gốc (kể cả khi lệch snap). */
export function moveSlot(item: Slot, deltaMin: number, grid: CalendarGrid): Slot {
  const duration = item.end_minute - item.start_minute;
  if (deltaMin === 0 || grid.end - grid.start < duration) {
    return { start_minute: item.start_minute, end_minute: item.end_minute };
  }
  const start = clamp(snap(item.start_minute + deltaMin), grid.start, grid.end - duration);
  return { start_minute: start, end_minute: start + duration };
}

/** Kéo giờ kết thúc tới `newEnd` (snap), kẹp ≥ `start + 15'` và ≤ cuối lưới. Giờ bắt đầu không đổi. */
export function resizeSlot(item: Slot, newEnd: number, grid: CalendarGrid): Slot {
  const end = Math.min(grid.end, Math.max(item.start_minute + MIN_DURATION_MIN, snap(newEnd)));
  return { start_minute: item.start_minute, end_minute: Math.max(end, item.start_minute + 1) };
}

/** Hai khoảng [a) [b) chồng nhau (chạm đầu mút không tính). */
export function overlaps(a: Slot, b: Slot): boolean {
  return a.start_minute < b.end_minute && b.start_minute < a.end_minute;
}

/** Vị trí cột của một ô khi chồng giờ (kiểu Google Calendar). */
export interface ColumnLayout {
  id: string;
  /** Cột (0-based) trong cụm; ô tràn nằm ở cột `MAX_COLUMNS − 1`. */
  col: number;
  /** Số cột của cả cụm (≤ `MAX_COLUMNS`): mọi ô trong cụm chia đều bề ngang theo số này. */
  cols: number;
  /** `true` = ô không đủ chỗ (cụm > 3 cột): UI gộp các ô tràn của cụm thành một nút "+N". */
  overflow: boolean;
  /** Số thứ tự cụm (theo giờ), để UI gom các ô tràn về cùng một "+N". */
  cluster: number;
}

/**
 * Xếp cột cho các ô chồng giờ. Cụm = chuỗi ô nối tiếp nhau bằng chồng giờ (A∩B, B∩C dù A∩C rỗng vẫn cùng cụm).
 * Trong cụm, ô bắt đầu sớm hơn nằm cột trái (cùng giờ bắt đầu: ô dài hơn trước). Cụm cần > 3 cột thì chỉ 2 cột
 * đầu hiện ô thật, các ô còn lại `overflow` ở cột thứ 3. Kết quả theo thứ tự giờ bắt đầu.
 */
export function layoutColumns(items: readonly IdSlotItem[]): ColumnLayout[] {
  const sorted = [...items]
    .filter(onFirstDay)
    .sort(
      (a, b) =>
        a.start_minute - b.start_minute || b.end_minute - a.end_minute || a.id.localeCompare(b.id),
    );

  const out: ColumnLayout[] = [];
  let cluster: { col: number; id: string }[] = [];
  let clusterIdx = -1;
  let clusterEnd = -Infinity;
  let colEnds: number[] = [];

  const flush = () => {
    const raw = colEnds.length;
    const cols = Math.min(raw, MAX_COLUMNS);
    for (const m of cluster) {
      const overflow = raw > MAX_COLUMNS && m.col >= MAX_COLUMNS - 1;
      out.push({
        id: m.id,
        col: overflow ? MAX_COLUMNS - 1 : m.col,
        cols,
        overflow,
        cluster: clusterIdx,
      });
    }
    cluster = [];
    colEnds = [];
  };

  for (const it of sorted) {
    if (it.start_minute >= clusterEnd && cluster.length > 0) flush();
    if (cluster.length === 0) clusterIdx += 1;
    let col = colEnds.findIndex((end) => end <= it.start_minute);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.end_minute);
    } else {
      colEnds[col] = it.end_minute;
    }
    cluster.push({ col, id: it.id });
    clusterEnd = cluster.length === 1 ? it.end_minute : Math.max(clusterEnd, it.end_minute);
  }
  if (cluster.length > 0) flush();
  return out;
}

/**
 * Khe trống sớm nhất đủ `duration` phút trong lưới (bắt đầu ở bội của 15'), hoặc `null` khi kín.
 * Lưới ngắn hơn `duration` mà chưa có ô nào → lấp đầy lưới (giống `dropSlot`).
 */
export function firstFreeSlot(
  items: readonly SlotItem[],
  grid: CalendarGrid,
  duration: number = DEFAULT_DURATION_MIN,
): Slot | null {
  const busy = items
    .filter(onFirstDay)
    .map((i) => ({ s: i.start_minute, e: i.end_minute }))
    .sort((a, b) => a.s - b.s || a.e - b.e);

  if (busy.length === 0 && grid.end - grid.start < duration) {
    return { start_minute: grid.start, end_minute: grid.end };
  }

  let cursor = snapUp(grid.start);
  for (const b of busy) {
    if (b.e <= cursor) continue;
    if (b.s - cursor >= duration) break;
    cursor = Math.max(cursor, snapUp(b.e));
  }
  return cursor + duration <= grid.end ? { start_minute: cursor, end_minute: cursor + duration } : null;
}

/** Gán lại `order_index` 0..n−1 theo (ngày, giờ bắt đầu, giờ kết thúc, thứ tự cũ). Trả mảng mới, không sửa đầu vào. */
export function reorderByStart<T extends Pick<ScheduleItem, 'day_offset' | 'start_minute' | 'end_minute' | 'order_index'>>(
  items: readonly T[],
): T[] {
  return [...items]
    .sort(
      (a, b) =>
        a.day_offset - b.day_offset ||
        a.start_minute - b.start_minute ||
        a.end_minute - b.end_minute ||
        a.order_index - b.order_index,
    )
    .map((it, idx) => ({ ...it, order_index: idx }));
}

/** Thay đổi của một mục: `id` + các trường đổi. `note` chỉ gửi khi khoá này CÓ MẶT (kể cả `null` = xoá ghi chú). */
export type ScheduleChange = { id: string } & Partial<
  Pick<ScheduleItem, 'day_offset' | 'start_minute' | 'end_minute' | 'order_index' | 'note'>
>;

const PAYLOAD_FIELDS = ['day_offset', 'start_minute', 'end_minute', 'order_index'] as const;

/**
 * Dựng payload `PUT /schedule` (CR-10). Chỉ giữ mục có đổi giờ/ngày/`order_index`/`note` so với bản hiện có `all`,
 * và LUÔN kèm `note`: lấy từ bản hiện có, trừ khi `changed` tự mang khoá `note`. Thiếu `note` ở backend = xoá
 * ghi chú, nên mọi payload bulk đều phải đi qua hàm này. Mục không có trong `all` bị bỏ qua. Không cắt theo khung giờ phòng.
 */
export function toBulkPayload(
  changed: readonly ScheduleChange[],
  all: readonly ScheduleItem[],
): BulkUpdateScheduleItem[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  const payload: BulkUpdateScheduleItem[] = [];
  for (const c of changed) {
    const cur = byId.get(c.id);
    if (!cur) continue;
    const next = {
      day_offset: c.day_offset ?? cur.day_offset,
      start_minute: c.start_minute ?? cur.start_minute,
      end_minute: c.end_minute ?? cur.end_minute,
      order_index: c.order_index ?? cur.order_index,
    };
    const note = 'note' in c ? (c.note ?? null) : (cur.note ?? null);
    const dirty = PAYLOAD_FIELDS.some((f) => next[f] !== cur[f]) || note !== (cur.note ?? null);
    if (dirty) payload.push({ id: c.id, ...next, note });
  }
  return payload;
}

/** Mục lịch của một quán (một quán một mục): mục đầu theo (ngày, `order_index`), hoặc `undefined` nếu chưa có. */
export function placeScheduleItem<T extends Pick<ScheduleItem, 'place_id' | 'day_offset' | 'order_index'>>(
  placeId: string,
  items: readonly T[],
): T | undefined {
  return items
    .filter((i) => i.place_id === placeId)
    .sort((a, b) => a.day_offset - b.day_offset || a.order_index - b.order_index)[0];
}

/** Thả một quán vào lịch (T-80): chưa có mục → thêm mới; đã có → dời mục cũ (một quán một mục); trùng giờ → không làm gì. */
export type PlaceDropAction =
  | { kind: 'add'; placeId: string; slot: Slot }
  | { kind: 'move'; itemId: string; slot: Slot }
  | { kind: 'none'; itemId: string };

/** Quyết định "thêm mới / dời mục cũ" khi thả quán `placeId` vào `slot` của ngày đầu. */
export function placeDropAction(
  placeId: string,
  slot: Slot,
  items: readonly Pick<ScheduleItem, 'id' | 'place_id' | 'day_offset' | 'order_index' | 'start_minute' | 'end_minute'>[],
): PlaceDropAction {
  const cur = placeScheduleItem(placeId, items);
  if (!cur) return { kind: 'add', placeId, slot: { ...slot } };
  if (cur.day_offset === 0 && cur.start_minute === slot.start_minute && cur.end_minute === slot.end_minute) {
    return { kind: 'none', itemId: cur.id };
  }
  return { kind: 'move', itemId: cur.id, slot: { ...slot } };
}

/**
 * Chỗ cho "Thêm vào lịch" không cần kéo (bàn phím, chạm chip): khe trống đầu tiên ≥ `duration`; lịch kín thì ngay
 * sau mục cuối, kẹp trong lưới như `dropSlot` (lùi lại để kết thúc đúng cuối lưới).
 */
export function addToCalendarSlot(
  items: readonly SlotItem[],
  grid: CalendarGrid,
  duration: number = DEFAULT_DURATION_MIN,
): Slot {
  const free = firstFreeSlot(items, grid, duration);
  if (free) return free;
  const lastEnd = items.filter(onFirstDay).reduce((m, i) => Math.max(m, i.end_minute), grid.start);
  return dropSlot(snapUp(lastEnd), grid, duration);
}

// ── Form sửa giờ + ghi chú trong popup ô (T-81, DESIGN gđ6 §4) ──────────────────────────────────────

/** Ghi chú tối đa (ký tự); backend cũng chặn ở 500. */
export const NOTE_MAX = 500;
/** Đếm ký tự ghi chú chỉ hiện khi dài hơn mức này. */
export const NOTE_COUNTER_FROM = 400;
/** Chip thời lượng nhanh (phút): đổi giờ kết thúc = bắt đầu + thời lượng. */
export const DURATION_CHIPS = [30, 60, 90, 120] as const;

/** `"18:10"` → 1090; rỗng/sai định dạng/ngoài 00:00–23:59 → `null`. Không ép 15'. */
export function parseTimeInput(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 1090 → `"18:10"` cho `<input type="time">` (luôn 24 giờ, độc lập ngôn ngữ). */
export function minuteToInput(minute: number): string {
  const v = Math.min(MAX_END_MINUTE, Math.max(0, Math.floor(minute)));
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Số ký tự (điểm mã Unicode, không phải đơn vị UTF-16) của ghi chú sau khi cắt khoảng trắng hai đầu. */
export const noteLength = (note: string): number => Array.from(note.trim()).length;

/** Lỗi chặn Lưu. */
export type EditError = 'timeInvalid' | 'endNotAfterStart' | 'noteTooLong';
/** Nhắc vàng, vẫn cho Lưu. */
export type EditNotice = 'outsideWindow' | 'overlap';

export interface EditValidation {
  errors: EditError[];
  notices: EditNotice[];
  /** Giờ đã đọc được (cả khi có lỗi kết thúc ≤ bắt đầu); `null` khi một trong hai ô không đọc được. */
  slot: Slot | null;
  /** Các mục khác chồng giờ với `slot` (để câu nhắc nêu tên). */
  overlapIds: string[];
  /** Độ dài ghi chú đã cắt khoảng trắng. */
  noteLength: number;
  canSave: boolean;
}

/**
 * Kiểm form sửa của một ô. Chặn Lưu: giờ không đọc được, kết thúc ≤ bắt đầu, ghi chú > 500.
 * Chỉ nhắc: ngoài khung giờ của phòng, chồng giờ mục khác (cùng ngày đầu, trừ chính nó).
 */
export function validateEdit(
  input: { start: string; end: string; note: string },
  ctx: {
    itemId: string;
    window: Pick<Room, 'start_minute' | 'end_minute'>;
    others: readonly (Slot & { id: string; day_offset?: number })[];
  },
): EditValidation {
  const errors: EditError[] = [];
  const notices: EditNotice[] = [];
  const start = parseTimeInput(input.start);
  const end = parseTimeInput(input.end);
  let slot: Slot | null = null;
  let overlapIds: string[] = [];

  if (start === null || end === null) {
    errors.push('timeInvalid');
  } else {
    slot = { start_minute: start, end_minute: end };
    if (end <= start) {
      errors.push('endNotAfterStart');
    } else {
      const ws = ctx.window.start_minute ?? DEFAULT_WINDOW.start;
      const we = ctx.window.end_minute ?? DEFAULT_WINDOW.end;
      if (start < ws || end > we) notices.push('outsideWindow');
      overlapIds = ctx.others.filter((o) => o.id !== ctx.itemId && onFirstDay(o) && overlaps(slot!, o)).map((o) => o.id);
      if (overlapIds.length > 0) notices.push('overlap');
    }
  }

  const len = noteLength(input.note);
  if (len > NOTE_MAX) errors.push('noteTooLong');
  return { errors, notices, slot, overlapIds, noteLength: len, canSave: errors.length === 0 };
}
