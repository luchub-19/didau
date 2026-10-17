import type {
  CityCode,
  ConflictLevel,
  DecisionMode,
  DecisionStatus,
  MemberRole,
  PlaceCategory,
  PlaceSource,
  PlaceStatus,
  RoomStatus,
  TieBreakStrategyName,
  TriggerHint,
  VoteValue,
} from './enums';

export interface Room {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  event_date: string; // YYYY-MM-DD
  status: RoomStatus;
  tie_break_strategy: TieBreakStrategyName;
  budget_limit?: number | null;
  city?: CityCode | string;
  origin_lat?: number | null;
  origin_lng?: number | null;
  start_minute?: number; // 0 - 1439, default 1020 (17:00)
  end_minute?: number; // 0 - 1439, default 1380 (23:00)
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  room_id: string;
  nickname: string;
  avatar_url?: string | null;
  role: MemberRole;
  is_active: boolean;
  joined_at: string;
  last_active_at?: string;
}

export interface Place {
  id: string;
  room_id: string;
  submitted_by_id: string;
  submitted_by_nickname?: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category: PlaceCategory;
  status: PlaceStatus;
  source?: PlaceSource;
  external_id?: string | null;
  google_place_id?: string | null;
  cuisine?: string | null;
  opening_hours_raw?: string | null;
  coords_source?: string | null;
  coords_fetched_at?: string | null;
  url?: string | null;
  notes?: string | null;
  estimated_cost: number;
  open_minute?: number | null; // 0 - 1439
  close_minute?: number | null; // 0 - 1439
  upvotes: number;
  downvotes: number;
  score: number;
  current_user_vote: VoteValue;
  created_at: string;
  updated_at?: string;
}

export interface ScheduleItem {
  id: string;
  room_id: string;
  place_id: string;
  place_name: string;
  place_address?: string | null;
  day_offset: number;
  start_minute: number; // 0 - 1439
  end_minute: number; // 0 - 1439
  order_index: number;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ConflictAlert {
  id: string;
  rule_code: string;
  level: ConflictLevel;
  message: string;
  entity_type: 'SCHEDULE' | 'PLACE' | 'ROOM';
  entity_ids: string[];
  resolved: boolean;
  created_at: string;
}

export interface Poi {
  external_id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address?: string | null;
  cuisine?: string | null;
  opening_hours_raw?: string | null;
  open_minute?: number | null;
  close_minute?: number | null;
  distance_km?: number | null;
  tags?: Record<string, string>;
}

export interface PlaceReview {
  id: string;
  external_key: string;
  room_id?: string | null;
  member_id?: string | null;
  nickname: string;
  rating: number; // 1 - 5
  comment?: string | null;
  tags: string[];
  created_at: string;
  updated_at?: string;
}

export interface ReviewSummary {
  avg: number;
  count: number;
  tags_top3: string[];
  items: PlaceReview[];
}

export interface DecisionSession {
  id: string;
  room_id: string;
  mode: DecisionMode;
  status: DecisionStatus;
  category?: string | null;
  candidate_place_ids: string[];
  seed: number;
  result_place_id?: string | null;
  result_payload?: Record<string, unknown> | null;
  created_by_id: string;
  created_at: string;
  closes_at?: string | null;
}

export interface DecisionSwipe {
  session_id: string;
  member_id: string;
  place_id: string;
  liked: boolean;
}

export interface DeciderHint {
  type: TriggerHint;
  category?: string | null;
  candidate_place_ids: string[];
}

export interface ScoredPick {
  place_id: string;
  score: number;
  reasons: string[];
}

export interface DecisionHintsResponse {
  hints: DeciderHint[];
  smart_picks: ScoredPick[];
}

export interface PlannedSlot {
  place_id: string;
  day_offset: number;
  start_minute: number;
  end_minute: number;
  travel_from_prev_min: number;
  reasons: string[];
}

export interface DroppedPlace {
  place_id: string;
  reason: string;
}

export interface AutoPlanPreviewResponse {
  slots: PlannedSlot[];
  dropped: DroppedPlace[];
  total_travel_min: number;
  total_cost: number;
  used_fallback: boolean;
  plan_hash: string;
}

