import type { ConflictAlert, Member, Place, Room, ScheduleItem } from './models';
import type { DecisionMode, DecisionStatus, TieBreakStrategyName, VoteValue } from './enums';

export interface WebSocketEnvelope<T = unknown> {
  type: string;
  payload: T;
  ts: number;
  /**
   * CR-13: số phiên bản trạng thái phòng. Có ở mọi tin server → client (server cũ không gửi).
   * Tin đổi trạng thái mang số mới (tăng đúng 1); tin tạm thời (chat, gõ, hiện diện, PONG) mang số
   * hiện tại. Client giữ số lớn nhất đã áp: tin nhỏ hơn → bỏ; nhảy cóc (> +1) → SUBSCRIBE_ROOM lại.
   * `CONFLICTS_UPDATED` do đánh giá ngầm dùng lại số của thay đổi gây ra nó (bằng, không tăng).
   */
  state_version?: number;
}

// Client -> Server Payloads
export interface PingPayload {
  [key: string]: never;
}

export interface SubscribeRoomPayload {
  room_id: string;
}

export interface TypingPlacePayload {
  is_typing: boolean;
  nickname: string;
}

// Server -> Client Payloads
export interface WsErrorPayload {
  code: string;
  message: string;
}

export interface RoomStateSyncPayload {
  room: Room;
  members: Member[];
  places: Place[];
  schedule: ScheduleItem[];
  conflicts: ConflictAlert[];
  /** CR-13: trùng với `state_version` của khung ngoài và của `room`. */
  state_version?: number;
}

export interface RoomUpdatedPayload {
  room: Room;
}

export interface MemberJoinedPayload {
  member: Member;
}

/** CR-11: thành viên đổi/xoá vị trí xuất phát. Chỉ có cờ, không bao giờ có toạ độ. */
export interface MemberUpdatedPayload {
  member_id: string;
  has_origin: boolean;
}

/**
 * CR-11/CR-12: tâm nhóm vừa có / đổi / mất. Chỉ phát khi có ≥2 người chia sẻ trước hoặc sau thay đổi.
 * `center` đã làm tròn 3 chữ số; khi `available:false` chỉ có `member_count`.
 */
export interface GroupCenterUpdatedPayload {
  available: boolean;
  center?: { lat: number; lng: number };
  area_label?: string;
  member_count: number;
}

export interface MemberLeftPayload {
  member_id: string;
  nickname: string;
}

export interface PlaceAddedPayload {
  place: Place;
}

export interface PlaceUpdatedPayload {
  place: Partial<Place> & { id: string };
}

export interface PlaceDeletedPayload {
  place_id: string;
}

export interface VoteUpdatedPayload {
  place_id: string;
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote?: VoteValue;
  /** CR-08: id người vừa bỏ phiếu (server cũ không gửi). */
  voter_id?: string;
}

/** CR-08: tiêu điểm của một member; `focus: null` = bỏ tiêu điểm. */
export interface PresenceUpdatedPayload {
  member_id: string;
  focus:
    | { kind: 'place'; place_id: string }
    | { kind: 'map'; lng: number; lat: number }
    | null;
}

export interface VotingResolvedPayload {
  strategy: TieBreakStrategyName;
  accepted_place_ids: string[];
}

export interface ScheduleUpdatedPayload {
  items: ScheduleItem[];
}

export interface ConflictsUpdatedPayload {
  conflicts: ConflictAlert[];
}

export interface DecisionStartedPayload {
  session_id: string;
  mode: DecisionMode;
  candidate_place_ids: string[];
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
  closes_at?: string | null;
}

export interface DecisionProgressPayload {
  session_id: string;
  done_member_ids: string[];
  total_members: number;
}

export interface DecisionResolvedPayload {
  session_id: string;
  result_place_id: string;
  status: DecisionStatus;
}

