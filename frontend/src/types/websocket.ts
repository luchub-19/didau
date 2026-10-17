import type { ConflictAlert, Member, Place, Room, ScheduleItem } from './models';
import type { DecisionMode, DecisionStatus, TieBreakStrategyName, VoteValue } from './enums';

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

