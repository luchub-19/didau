// Trạng thái cửa sổ phòng mẫu ở hero: bọc reducer thuần `roomSim` (T-123) + hiện diện (Xeko vào phòng đúng một lần)
// + toast. Thuần, không DOM, để test "reducer tích hợp" (T-125) chạy trên node.
import demoJson from '../data/demoCase.json';
import { CAST } from '../cast';
import type { CastId } from '../cast';
import { initialRoom, reduce, view, type RoomAction, type RoomState, type RoomView } from '../logic/roomSim';
import type { DemoCaseData, DemoPlace, PlaceId } from '../logic/types';

export const DEMO = demoJson as unknown as DemoCaseData;

/** Ba người đang xem lúc tải; người thứ tư (Xeko) vào sau JOIN_AT_MS. */
export const PRESENT_AT_START = 3;
export const JOINER: CastId = CAST[PRESENT_AT_START].id;

/** Nhịp hiện diện (PLAN §4.5): vào phòng 3,6 s sau tải (static: 1,2 s như mock), toast 2,6 s. */
export const PRESENCE_TIMING = { joinAtMs: 3600, joinAtStaticMs: 1200, toastMs: 2600, popMs: 420 } as const;

export interface HeroState {
  room: RoomState;
  /** Xeko đã vào phòng (chỉ một lần). */
  joined: boolean;
  /** Toast "Xeko vừa vào phòng" đang hiện. */
  toast: boolean;
}

export type HeroAction = RoomAction | { type: 'join' } | { type: 'toastDone' };

export function initialHero(demo: DemoCaseData = DEMO): HeroState {
  return { room: initialRoom(demo), joined: false, toast: false };
}

export function heroReducer(state: HeroState, action: HeroAction): HeroState {
  switch (action.type) {
    case 'join':
      if (state.joined) return state;
      return { ...state, joined: true, toast: true };
    case 'toastDone':
      return state.toast ? { ...state, toast: false } : state;
    default: {
      const room = reduce(state.room, action);
      return room === state.room ? state : { ...state, room };
    }
  }
}

/** Ai đang ở trong phòng (thứ tự CAST). */
export function presentCast(state: HeroState): CastId[] {
  return CAST.slice(0, state.joined ? CAST.length : PRESENT_AT_START).map((c) => c.id);
}

export function placeById(id: PlaceId, demo: DemoCaseData = DEMO): DemoPlace {
  const p = demo.places.find((x) => x.id === id);
  if (!p) throw new Error(`unknown place: ${id}`);
  return p;
}

/** Mô hình hiển thị của panel: thẻ trên cùng + từng dòng quán. */
export interface PlaceRowModel {
  id: PlaceId;
  votes: number;
  mine: boolean;
  far: number;
  /** Nhãn "Đề xuất" (chỉ khi đang hoà và quán này là gợi ý). */
  proposed: boolean;
  /** Đã chốt: quán chốt nổi, quán khác mờ. */
  tone: 'normal' | 'hot' | 'faded';
  /** Nút tim khoá sau khi chốt. */
  disabled: boolean;
}

export function panelModel(state: HeroState): { view: RoomView; rows: PlaceRowModel[] } {
  const v = view(state.room);
  const { room } = state;
  const rows = room.order.map((id) => ({
    id,
    votes: room.votes[id],
    mine: !!room.mine[id],
    far: room.far[id],
    proposed: v.kind === 'tie' && id === v.best,
    tone: (room.locked ? (room.locked === id ? 'hot' : 'faded') : 'normal') as PlaceRowModel['tone'],
    disabled: room.locked !== null,
  }));
  return { view: v, rows };
}
