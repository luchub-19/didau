import type {
  ConflictLevel,
  MemberRole,
  PlaceCategory,
  PlaceStatus,
  RoomStatus,
  TieBreakStrategyName,
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
