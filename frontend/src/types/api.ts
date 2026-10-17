import type {
  CityCode,
  DecisionMode,
  PlaceCategory,
  PlaceSource,
  PlaceStatus,
  TieBreakStrategyName,
  VoteValue,
} from './enums';
import type {
  ConflictAlert,
  DecisionSession,
  Member,
  Place,
  PlannedSlot,
  Poi,
  Room,
  ScheduleItem,
} from './models';

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
  city?: CityCode | string;
  origin_lat?: number;
  origin_lng?: number;
  start_minute?: number;
  end_minute?: number;
}

export interface UpdateRoomRequest {
  title?: string;
  description?: string | null;
  event_date?: string;
  budget_limit?: number | null;
  tie_break_strategy?: TieBreakStrategyName;
  city?: CityCode | string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  start_minute?: number;
  end_minute?: number;
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
  source?: PlaceSource;
  external_id?: string;
  google_place_id?: string;
  cuisine?: string;
  opening_hours_raw?: string;
  coords_source?: string;
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
export type PoiListResponse = Poi[];


// POI API types
export interface PoiQueryParams {
  bbox?: string;
  category?: PlaceCategory;
  limit?: number;
}

export interface PoiSearchParams {
  q: string;
  lat?: number;
  lng?: number;
  limit?: number;
}

export interface GoogleMatchRequest {
  external_id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GoogleMatchResponse {
  google_place_id: string | null;
  reason: 'OK' | 'NO_MATCH' | 'QUOTA' | 'DISABLED' | string;
}

// Review API types
export interface CreateReviewRequest {
  external_key: string;
  rating: number; // 1 - 5
  comment?: string | null;
  tags?: string[];
}

// Decision API types
export interface CreateDecisionRequest {
  mode: DecisionMode;
  category?: PlaceCategory | null;
  candidate_place_ids?: string[];
  weighted?: boolean;
}

export interface CreateDecisionResponse {
  session: DecisionSession;
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
}

export interface SubmitSwipeRequest {
  place_id: string;
  liked: boolean;
}

export interface SubmitSwipeResponse {
  success: boolean;
  session_id?: string;
  place_id?: string;
  liked?: boolean;
}

export interface DecisionActionResponse {
  session: DecisionSession;
  resolved_place?: Place;
  strategy?: TieBreakStrategyName;
  message?: string;
}


// Auto-Plan API types
export interface AutoPlanPreviewRequest {
  day_offset?: number;
  duration_overrides?: Record<string, number>;
}

export interface AutoPlanApplyRequest {
  plan_hash: string;
  slots: PlannedSlot[];
}

