// Mô hình thuần của phần "Một phòng, bốn bước" (T-127, PLAN §4.1 dòng 4, §4.5): bước đang hiện, hướng chuyển màn,
// khoá IO 1 s sau khi bấm nút bước, và dữ liệu của 4 màn (ca demo gđ8). Không DOM, không React.
import type { CastId } from '../../cast';
import demoJson from '../../data/demoCase.json';
import type { DemoCaseData, PlaceId } from '../../logic/types';

const DEMO = demoJson as unknown as DemoCaseData;

export const STEP_KEYS = ['find', 'vote', 'lock', 'send'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_COUNT = STEP_KEYS.length;

/** Khoá i18n của tiêu đề + mô tả từng bước (liệt kê tường minh để `t()` kiểm kiểu). */
export const STEP_COPY = [
  { title: 'landing.flow.s1Title', body: 'landing.flow.s1Body' },
  { title: 'landing.flow.s2Title', body: 'landing.flow.s2Body' },
  { title: 'landing.flow.s3Title', body: 'landing.flow.s3Body' },
  { title: 'landing.flow.s4Title', body: 'landing.flow.s4Body' },
] as const;

/** Từ độ rộng này (px) trở lên mới có khung dính; dưới đó mỗi bước có khung riêng dưới chữ. */
export const WIDE_MIN_PX = 961;
export const WIDE_QUERY = `(min-width: ${WIDE_MIN_PX}px)`;

/** Bước tính là "đang hiện" khi vào dải giữa màn hình: trên/dưới mỗi bên cắt 45% (PLAN §4.1). */
export const STEP_ROOT_MARGIN = '-45% 0px -45% 0px';
/** Sau khi bấm nút bước, bỏ qua IO 1 s để cuộn mượt không nháy qua bước ở giữa. */
export const IGNORE_IO_MS = 1000;

/** Gõ "pizza" ở ô tìm của màn 1, mỗi ký tự 80 ms, đúng một lần. */
export const TYPED_TEXT = 'pizza';
export const TYPE_STEP_MS = 80;

export interface FlowState {
  current: number;
  /** 0 = lần dựng đầu (không diễn); 1 = xuống; -1 = lên. */
  dir: -1 | 0 | 1;
  /** Mốc `performance.now()` mà trước đó IO bị bỏ qua. */
  ignoreUntil: number;
}

export type FlowAction =
  /** Bước `index` vừa đi vào dải giữa màn hình. */
  | { type: 'io'; index: number; now: number }
  /** Bấm nút bước `index` trong khung. */
  | { type: 'go'; index: number; now: number };

export const initialFlow = (): FlowState => ({ current: 0, dir: 0, ignoreUntil: 0 });

const clampIndex = (i: number): number => Math.max(0, Math.min(STEP_COUNT - 1, Math.round(i)));

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  const index = clampIndex(action.index);
  if (action.type === 'io' && action.now <= state.ignoreUntil) return state;
  const ignoreUntil = action.type === 'go' ? action.now + IGNORE_IO_MS : state.ignoreUntil;
  if (index === state.current) return ignoreUntil === state.ignoreUntil ? state : { ...state, ignoreUntil };
  return { current: index, dir: index > state.current ? 1 : -1, ignoreUntil };
}

/** Trạng thái nút bước trong khung: đã qua / đang ở / chưa tới. */
export type PillState = 'done' | 'now' | 'todo';
export const pillState = (k: number, current: number): PillState => (k < current ? 'done' : k === current ? 'now' : 'todo');

/** Chữ đã gõ sau `elapsedMs` (ký tự nào cũng hiện sau mỗi TYPE_STEP_MS). */
export const typedAt = (elapsedMs: number, text: string = TYPED_TEXT): string =>
  text.slice(0, Math.max(0, Math.min(text.length, Math.floor(elapsedMs / TYPE_STEP_MS) + 1)));

// ---------- Dữ liệu 4 màn (đúng ca demo gđ8, khớp phòng mẫu ở hero) ----------

export interface FindRow {
  /** `cafe` là quán thứ tư (cà phê), không nằm trong ca demo ba quán ăn. */
  id: PlaceId | 'cafe';
  who: CastId;
  /** Mã quận của dòng meta (i18n `landing.district.*`); quán cà phê dùng địa chỉ riêng. */
  district?: 'td' | 'q7';
  drink?: boolean;
}

export const FIND_ROWS: readonly FindRow[] = [
  { id: 'pizza', who: 'Nobita', district: 'td' },
  { id: 'haidilao', who: 'Xuka', district: 'td' },
  { id: 'dookki', who: 'Xeko', district: 'q7' },
  { id: 'cafe', who: 'Doraemon', drink: true },
];

export interface VoteRow {
  id: PlaceId;
  /** Ai đã bấm Muốn đi (thứ tự avatar). */
  voters: readonly CastId[];
}

/** Ba quán cùng 3 phiếu: đúng thẻ hoà ở hero (roomSim START_VOTES = 3). */
export const VOTE_ROWS: readonly VoteRow[] = [
  { id: 'pizza', voters: ['Nobita', 'Doraemon', 'Xeko'] },
  { id: 'haidilao', voters: ['Nobita', 'Doraemon', 'Xuka'] },
  { id: 'dookki', voters: ['Doraemon', 'Xuka', 'Xeko'] },
];
/** Hàng đầu có dòng "Muốn đi / Không" mở sẵn (người xem đang bỏ phiếu). */
export const VOTE_OPEN_ROW: PlaceId = 'pizza';
export const VOTED = { done: 4, of: 4 } as const;

/** Màn 3: quán được chốt, người chốt, phút của người xa nhất (đo Valhalla, khớp DEMO gđ8). */
export const LOCK = { placeId: 'pizza' as PlaceId, host: 'Nobita' as CastId };

export function lockFarthestMin(): number {
  const mins = DEMO.members.map((m) => DEMO.trips[m.id][LOCK.placeId].min);
  return Math.max(...mins);
}

export interface CalEvent {
  kind: 'food' | 'open';
  /** i18n `landing.flow.*` của tiêu đề (hoặc tên quán khi `place`). */
  title: 'place' | 'coffee' | 'next';
  top: number;
  height: number;
  /** Dòng phụ: `dinner` / `open` kèm khung giờ; `next` chỉ có giờ. */
  note: 'dinner' | 'open' | null;
  range: string;
}

export const CAL_HOURS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'] as const;
export const CAL_EVENTS: readonly CalEvent[] = [
  { kind: 'food', title: 'place', top: 2, height: 62, note: 'dinner', range: '18:00–19:30' },
  { kind: 'open', title: 'coffee', top: 79, height: 53, note: 'open', range: '19:45–21:00' },
  { kind: 'open', title: 'next', top: 145, height: 40, note: null, range: '21:15' },
];
export const EXPORT_KEYS = ['png', 'message', 'ics', 'link'] as const;

export function placeName(id: PlaceId): string {
  const p = DEMO.places.find((x) => x.id === id);
  if (!p) throw new Error(`unknown place: ${id}`);
  return p.name;
}
