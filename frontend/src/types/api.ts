import type {
  PlaceCategory,
  PlaceStatus,
  TieBreakStrategyName,
  VoteValue,
} from './enums';
import type { ConflictAlert, Member, Place, Room, ScheduleItem } from './models';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

export interface CreateRoomRequest {
  title: string;
  description?: string;
  event_date: string;
  creator_nickname: string;
  creator_avatar_url?: string;
  budget_limit?: number;
  tie_break_strategy?: TieBreakStrategyName;
}

export interface CreateRoomResponse {
  room: Room;
  creator_member: Member;
  member_token: string;
}

export interface JoinRoomRequest {
  room_code: string;
  nickname: string;
  avatar_url?: string;
}

export interface JoinRoomResponse {
  room: Room;
  member: Member;
  member_token: string;
}

export interface RoomDetailResponse extends Room {
  members: Member[];
  total_places?: number;
}

export interface CreatePlaceRequest {
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: PlaceCategory;
  url?: string;
  notes?: string;
  estimated_cost?: number;
  open_minute?: number;
  close_minute?: number;
}

export interface VoteRequest {
  vote_value: VoteValue;
}

export interface VoteResponse {
  place_id: string;
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote: VoteValue;
}

export interface ResolveVotingRequest {
  strategy: TieBreakStrategyName;
  max_accepted_places: number;
}

export interface ResolvedPlaceItem {
  id: string;
  name: string;
  status: PlaceStatus;
  score: number;
  upvotes: number;
}

export interface ResolveVotingResponse {
  resolved_places: ResolvedPlaceItem[];
  tie_break_applied: boolean;
  tie_break_strategy: TieBreakStrategyName;
}

export interface CreateScheduleItemRequest {
  place_id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  note?: string;
}

export interface BulkUpdateScheduleItem {
  id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  order_index: number;
}

export interface BulkUpdateScheduleRequest {
  items: BulkUpdateScheduleItem[];
}

export interface DeleteScheduleResponse {
  success: boolean;
  deleted_item_id: string;
}

export type PlaceListResponse = Place[];
export type ScheduleListResponse = ScheduleItem[];
export type ConflictListResponse = ConflictAlert[];
