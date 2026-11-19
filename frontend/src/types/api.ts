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
  FeasibilityRisk,
  Member,
  Place,
  PlannedSlot,
  Poi,
  Room,
  ScheduleItem,
  SelfMember,
} from './models';

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

/** Lỗi đã chuẩn hoá mà `apiClient` ném ra. `message` là chữ gốc của server, chỉ dùng để log. */
export interface ApiError {
  code: string;
  status?: number;
  details?: Record<string, unknown> | null;
  message?: string;
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
  /** CR-14: mặc định 2 khi bỏ trống; `null` = không giới hạn. */
  max_places_per_member?: number | null;
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
  /** CR-14 (Host): 1–10; gửi `null` tường minh = bỏ giới hạn; không gửi = giữ nguyên. */
  max_places_per_member?: number | null;
}

/** CR-11: `PATCH /rooms/{room_id}/members/me`. Cả hai `null` = xoá; chỉ một `null` hoặc thiếu = 422. */
export interface UpdateMyOriginRequest {
  origin_lat: number | null;
  origin_lng: number | null;
}

/** CR-14: `details` của lỗi 409 `PLACE_LIMIT_REACHED`. */
export interface PlaceLimitReachedDetails {
  limit: number;
  used: number;
}

export interface CreateRoomResponse {
  room: Room;
  creator_member: SelfMember;
  member_token: string;
}

export interface JoinRoomRequest {
  room_code: string;
  nickname: string;
  avatar_url?: string;
}

export interface JoinRoomResponse {
  room: Room;
  member: SelfMember;
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
  /** CR-10: thiếu `note` = backend đặt NULL, nên client luôn gửi (dựng qua `toBulkPayload`). */
  note?: string | null;
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
  /** CR-18: chỉ quán trong thành phố của phòng (`HCM` | `HN`). */
  city?: string;
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


// ── Algorithm Engine (CR-11 / CR-12 phần 1, T-86) ────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * `GET /rooms/{room_id}/group-center` (ALGO-01). `available:false` khi <2 người chia sẻ vị trí (widget ẩn).
 * `center` đã làm tròn 3 chữ số; KHÔNG bao giờ có toạ độ từng thành viên. Điểm hẹn của host không tính vào tâm.
 */
export interface GroupCenterResponse {
  available: boolean;
  center: LatLng | null;
  /** Vd. "Q3" hoặc "Q3 – Phú Nhuận" (tên quận, không qua i18n). */
  area_label: string | null;
  member_count: number;
  /** Tối đa 10 quán trong 2 km, gần → xa (`distance_km` có giá trị). */
  nearby_pois: Poi[];
}

/** VALHALLA: km của Valhalla tự host (CR-15 phần B, T-95). */
export type TravelSource = 'ESTIMATE' | 'GOOGLE' | 'VALHALLA';

export type TieUnavailableReason = 'NO_TIE' | 'NO_ORIGINS' | 'NO_PLACE_COORDS';

export interface TieCandidate {
  place_id: string;
  name: string;
  upvotes: number;
  downvotes: number;
  score: number;
}

/** Một quán đã xếp hạng (CR-15): `psi` chỉ để so, UI không hiện chữ Ψ (PLAN gđ7 §5.3). km là khứ hồi. */
export interface TieRanking {
  place_id: string;
  rank: number;
  psi: number;
  max_km: number;
  total_km: number;
  max_min: number;
  /** CR-19: người đi xa nhất ở quán này; nickname tra từ danh sách thành viên phòng. Tuỳ chọn ở type: backend Render chưa deploy thì thiếu → câu không tên. */
  farthest_member_id?: string;
}

/** Một người với quán đề xuất: km/phút đi + về, `rank` 1 = gần nhất, `weight` = trọng số của hạng đó. */
export interface TieMemberCost {
  member_id: string;
  nickname: string;
  km: number;
  minutes: number;
  rank: number;
  weight: number;
}

/** Hoà trong một loại quán (CR-15). Quán thiếu toạ độ có trong `candidates` nhưng không có dòng `ranking`. */
export interface CategoryTieSuggestion {
  category: PlaceCategory;
  candidates: TieCandidate[];
  recommended_place_id: string | null;
  /** Ψ tăng dần. */
  ranking: TieRanking[];
  /** Của quán đề xuất, theo `rank`. */
  members: TieMemberCost[];
  runner_up_psi: number | null;
  excluded_member_count: number;
  estimated: boolean;
  source: TravelSource | 'MIXED';
  params: { lambda: number; k: number };
}

/**
 * `GET /rooms/{room_id}/tie-break/suggestion` (CR-15): mỗi loại hoà một mục, thứ tự khai báo `PlaceCategory`.
 * Không toạ độ, không hình học đường đi (CR-11).
 */
export interface TieSuggestion {
  available: boolean;
  reason: TieUnavailableReason | null;
  suggestions: CategoryTieSuggestion[];
}

/** Một chiều đường đi (mục 37, 38). `shape`: polyline độ chính xác 6; null = chưa có đường thật (không vẽ đường cong). */
export interface RouteLeg {
  km: number;
  minutes: number;
  shape: string | null;
  source: TravelSource;
}

/** `GET /rooms/{id}/routes/me?place_id=`: chỉ của người gọi (nhà mình ↔ quán). 404 `NO_ORIGIN` khi chưa chia sẻ. */
export interface MyRoutes {
  place_id: string;
  to_place: RouteLeg;
  to_home: RouteLeg;
}

export interface ScheduleRouteLeg extends RouteLeg {
  from_item_id: string;
  to_item_id: string;
}

/** `GET /rooms/{id}/schedule/routes`: đường giữa các mục liên tiếp của ngày phòng. */
export interface ScheduleRoutes {
  legs: ScheduleRouteLeg[];
  unknown_leg_count: number;
}

// ── CR-12 phần 2 (T-87) ─────────────────────────────────────────────────────────────────────────

/** Một cặp mục liên tiếp trên lịch (ALGO-03). `slack_min < 0` = thiếu giờ; `gap_min < 0` = chồng giờ. */
export interface FeasibilityLeg {
  from_item_id: string;
  to_item_id: string;
  eta_min: number;
  margin_min: number;
  buffer_min: number;
  gap_min: number;
  slack_min: number;
  distance_km: number;
  risk: FeasibilityRisk;
  peak: boolean;
  source: TravelSource;
}

/**
 * `GET /rooms/{room_id}/schedule/feasibility` — tổng kế hoạch NGÀY CỦA PHÒNG (chỉ mục `day_offset = 0`).
 * `required_total_min = Σ thời lượng + Σ (eta + margin + buffer)`, `buffer_total_min = window − required`;
 * `is_feasible` = dư ≥ 0 và không có chặng HIGH_RISK. Cặp có quán thiếu toạ độ không vào `legs` mà đếm ở
 * `unknown_leg_count`. Gọi lại khi nhận `SCHEDULE_UPDATED`/`CONFLICTS_UPDATED`/`ROOM_UPDATED`.
 */
export interface ScheduleFeasibility {
  window_min: number;
  required_total_min: number;
  buffer_total_min: number;
  is_feasible: boolean;
  legs: FeasibilityLeg[];
  estimated: boolean;
  item_count: number;
  unknown_leg_count: number;
}

/** Query của `GET /rooms/{room_id}/places` (CR-12): `priority` = theo `priority.rank`, bỏ trống = thứ tự thêm. */
export type PlaceSort = 'priority';
