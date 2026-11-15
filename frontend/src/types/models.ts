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
  /** CR-14: số quán tối đa mỗi người đề xuất (1–10). `null` = không giới hạn (phòng cũ). */
  max_places_per_member?: number | null;
  /** CR-13: tăng 1 ở mỗi thay đổi có phát WS; client bỏ tin có số nhỏ hơn số đã áp. */
  state_version?: number;
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
  /** CR-11: thành viên này đã đặt vị trí xuất phát riêng chưa (người khác chỉ thấy cờ, không thấy toạ độ). */
  has_origin?: boolean;
  joined_at: string;
  last_active_at?: string;
}

/**
 * CR-11: thành viên ở dạng dành cho CHÍNH CHỦ — kèm toạ độ xuất phát riêng.
 * Chỉ có ở `GET /members/me`, phản hồi `PATCH /rooms/{id}/members/me`, tạo/vào phòng, và mục của
 * chính mình trong `ROOM_STATE_SYNC`. Không bao giờ có toạ độ của người khác.
 */
export interface SelfMember extends Member {
  origin_lat?: number | null;
  origin_lng?: number | null;
}

/** ALGO-03/04 (CR-12): mức khả thi dùng chung cho cảnh báo lịch và ưu tiên quán. */
export type FeasibilityRisk = 'SAFE' | 'SOFT_CONFLICT' | 'HIGH_RISK';

/** Nhãn ưu tiên (tối đa 1/quán, theo thứ tự ưu tiên này). */
export type PriorityLabel = 'RECOMMENDED' | 'MOST_VOTED_RISKY' | 'MOST_VOTED' | 'SCHEDULE_SAFE';

/**
 * ALGO-04 (CR-12 phần 2): vị trí quán trong danh sách bình chọn, do server tính (cần vị trí thành viên).
 * FE chỉ hiển thị thứ tự server trả (`GET /places?sort=priority` hoặc `PRIORITY_UPDATED`), không tự sắp lại.
 * `max_eta_min` là của người đi xa nhất cả nhóm (không có số của từng người).
 */
export interface PlacePriority {
  rank: number;
  risk: FeasibilityRisk;
  slack_min: number;
  max_eta_min: number;
  labels: PriorityLabel[];
  estimated: boolean;
  /** Quán không có giờ mở cửa → coi như mở cả khung phòng. */
  hours_unknown: boolean;
  /** Không ai có xuất phát (kể cả điểm hẹn) hoặc quán thiếu toạ độ → `max_eta_min` = 0. */
  eta_unknown: boolean;
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
  /** CR-12: null với quán bị loại (REJECTED); thiếu ở server cũ / phản hồi tạo-sửa (đợi `PRIORITY_UPDATED`). */
  priority?: PlacePriority | null;
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

/**
 * `params` của `TRAVEL_TIME` (CR-12 phần 2, ALGORITHMS §5). `required = eta + margin + buffer`,
 * `slack = gap − required`. Chỉ sinh khi `risk` ≠ SAFE và `gap_min ≥ 0` (CR-07). Dữ liệu cũ có `travel_min`.
 */
export interface TravelTimeConflictParams {
  from_item_id: string;
  to_item_id: string;
  place_names: [string, string];
  eta_min: number;
  margin_min: number;
  buffer_min: number;
  gap_min: number;
  slack_min: number;
  distance_km: number;
  risk: Exclude<FeasibilityRisk, 'SAFE'>;
  /** Rời quán trước trong 16:30–19:30 (nửa mở) của ngày thứ Hai–Sáu → biên 50%. */
  peak: boolean;
  source: 'ESTIMATE' | 'GOOGLE' | 'VALHALLA';
  estimated: boolean;
}

export interface ConflictAlert {
  id: string;
  rule_code: string;
  level: ConflictLevel;
  /** Câu tiếng Việt của server: chỉ để log/tương thích, không hiện lên giao diện ở chế độ EN. */
  message: string;
  /** Tham số theo rule_code (CR-06, có thể thiếu ở dữ liệu cũ). */
  params?: Record<string, unknown>;
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
  /** CR-17 A: loại chi tiết (restaurant | cafe | mall | cinema …, MAP-POI §3.1). */
  kind?: PoiKind | null;
  /** Khu vực gần nhất, dùng khi `address` trống. */
  district?: string | null;
  brand?: string | null;
  brand_key?: string | null;
  /** Điểm nổi bật 0–100. */
  score?: number;
  /** Zoom bắt đầu hiện icon + tên (12–17). */
  minzoom?: number;
}

export type PoiKind =
  | 'restaurant'
  | 'eatery'
  | 'fast_food'
  | 'bakery'
  | 'cafe'
  | 'tea'
  | 'dessert'
  | 'bar'
  | 'mall'
  | 'supermarket'
  | 'cinema'
  | 'karaoke'
  | 'play'
  | 'park'
  | 'museum';

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

/** Mã lý do + tham số (CR-06). */
export interface ReasonCode {
  code: string;
  params?: Record<string, unknown>;
}

export interface ScoredPick {
  place_id: string;
  score: number;
  reasons: string[];
  reason_codes?: ReasonCode[];
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
  reason_codes?: ReasonCode[];
}

export interface DroppedPlace {
  place_id: string;
  reason: string;
  reason_code?: string;
  reason_params?: Record<string, unknown>;
}

export interface AutoPlanPreviewResponse {
  slots: PlannedSlot[];
  dropped: DroppedPlace[];
  total_travel_min: number;
  total_cost: number;
  used_fallback: boolean;
  plan_hash: string;
}

