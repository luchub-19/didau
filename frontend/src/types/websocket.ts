import type { ConflictAlert, Member, Place, Room, ScheduleItem } from './models';
import type { TieBreakStrategyName, VoteValue } from './enums';

export interface WebSocketEnvelope<T = unknown> {
  type: string;
  payload: T;
  ts: number;
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
}

export interface MemberJoinedPayload {
  member: Member;
}

export interface MemberLeftPayload {
  member_id: string;
  nickname: string;
}

export interface PlaceAddedPayload {
  place: Place;
}

export interface PlaceUpdatedPayload {
  place: Place;
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
