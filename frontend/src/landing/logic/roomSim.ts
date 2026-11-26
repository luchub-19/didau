// Phòng mẫu ở hero (PLAN §4.4): reducer thuần cho "bỏ phiếu → hoà → gợi ý → chốt". Không gọi backend.
// Gợi ý trong nhóm đang hoà = quán có người xa nhất đi ít nhất; "bớt N′" so với quán đứng sau.
import { farOfPlace } from './explore';
import type { DemoCaseData, PlaceId } from './types';

/** Mỗi quán bắt đầu bằng 3 phiếu (cả ba cùng điểm → hoà), đúng ca demo gđ8. */
export const START_VOTES = 3;

export interface RoomState {
  /** Thứ tự quán, cố định. */
  order: PlaceId[];
  /** Phút của người xa nhất ở từng quán (lấy từ ca demo). */
  far: Record<PlaceId, number>;
  /** Tổng km từng quán, dùng để phá hoà khi cùng số phút. */
  total: Record<PlaceId, number>;
  votes: Record<PlaceId, number>;
  /** Quán mà người xem đã thả tim. */
  mine: Record<PlaceId, boolean>;
  locked: PlaceId | null;
  /** Panel "Vì sao?" đang mở. */
  why: boolean;
}

export type RoomAction =
  | { type: 'vote'; placeId: PlaceId }
  | { type: 'unvote'; placeId: PlaceId }
  | { type: 'lock'; placeId: PlaceId }
  | { type: 'undo' }
  | { type: 'toggleWhy' };

export function initialRoom(demo: DemoCaseData): RoomState {
  const order = demo.places.map((p) => p.id);
  const far: Record<PlaceId, number> = {};
  const total: Record<PlaceId, number> = {};
  const votes: Record<PlaceId, number> = {};
  for (const id of order) {
    far[id] = farOfPlace(demo, id).far;
    total[id] = demo.totals[id];
    votes[id] = START_VOTES;
  }
  return { order, far, total, votes, mine: {}, locked: null, why: false };
}

export function reduce(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case 'vote': {
      if (state.locked || state.mine[action.placeId] || !(action.placeId in state.votes)) return state;
      return {
        ...state,
        votes: { ...state.votes, [action.placeId]: state.votes[action.placeId] + 1 },
        mine: { ...state.mine, [action.placeId]: true },
      };
    }
    case 'unvote': {
      if (state.locked || !state.mine[action.placeId]) return state;
      return {
        ...state,
        votes: { ...state.votes, [action.placeId]: state.votes[action.placeId] - 1 },
        mine: { ...state.mine, [action.placeId]: false },
      };
    }
    case 'lock':
      if (!(action.placeId in state.votes)) return state;
      return { ...state, locked: action.placeId, why: false };
    case 'undo':
      // Như mock: gỡ chốt và đưa phòng về trạng thái đầu (xoá phiếu của người xem).
      return resetRoom(state);
    case 'toggleWhy':
      return { ...state, why: !state.why };
  }
}

function resetRoom(s: RoomState): RoomState {
  const votes: Record<PlaceId, number> = {};
  for (const id of s.order) votes[id] = START_VOTES;
  return { ...s, votes, mine: {}, locked: null, why: false };
}

export type RoomKind = 'tie' | 'lead' | 'locked';

export interface RoomView {
  kind: RoomKind;
  /** Số phiếu cao nhất. */
  max: number;
  /** Các quán dẫn đầu (theo thứ tự quán). */
  tops: PlaceId[];
  /** Quán được gợi ý (hoặc quán đã chốt khi `locked`). */
  best: PlaceId;
  /** Quán đứng sau `best` trong nhóm dẫn đầu; bằng `best` nếu chỉ có một quán dẫn. */
  runner: PlaceId;
  /** Số phút người xa nhất được bớt khi chọn `best` thay vì `runner`. */
  savesMin: number;
}

export function view(state: RoomState): RoomView {
  const max = Math.max(...state.order.map((id) => state.votes[id]));
  const tops = state.order.filter((id) => state.votes[id] === max);
  const sorted = [...tops].sort(
    (a, b) => state.far[a] - state.far[b] || state.total[a] - state.total[b] || state.order.indexOf(a) - state.order.indexOf(b),
  );
  const best = state.locked ?? sorted[0];
  const runner = state.locked ? (sorted.find((id) => id !== state.locked) ?? state.locked) : (sorted[1] ?? sorted[0]);
  const kind: RoomKind = state.locked ? 'locked' : tops.length > 1 ? 'tie' : 'lead';
  return { kind, max, tops, best, runner, savesMin: state.far[runner] - state.far[best] };
}
