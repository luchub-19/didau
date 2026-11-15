import { http, HttpResponse } from 'msw';
import type {
  AutoPlanApplyRequest,
  AutoPlanPreviewRequest,
  BulkUpdateScheduleRequest,
  CreateDecisionRequest,
  CreatePlaceRequest,
  CreateReviewRequest,
  CreateRoomRequest,
  CreateScheduleItemRequest,
  DecisionSession,
  DecisionSwipe,
  GoogleMatchRequest,
  JoinRoomRequest,
  Member,
  FeasibilityLeg,
  FeasibilityRisk,
  Place,
  PlaceCategory,
  PlacePriority,
  PlaceReview,
  Poi,
  ResolveVotingRequest,
  Room,
  ScheduleFeasibility,
  ScheduleItem,
  SelfMember,
  SubmitSwipeRequest,
  CategoryTieSuggestion,
  MyRoutes,
  RouteLeg,
  ScheduleRoutes,
  TieSuggestion,
  TriggerHint,
  UpdateMyOriginRequest,
  VoteRequest,
} from '../types';
import { encodePolyline } from '../components/algo/polyline';
import {
  MOCK_HOST_TOKEN,
  MOCK_MEMBER_TOKEN,
  mockConflicts,
  mockGuestMember,
  mockHostMember,
  mockPlaces,
  mockPois,
  mockReviews,
  mockRoom,
  mockScheduleItems,
} from './mockData';

// In-memory mock database state
let currentRoom: Room = { ...mockRoom };
let membersList: Member[] = [{ ...mockHostMember }, { ...mockGuestMember }];
let placesList: Place[] = mockPlaces.map((p) => ({ ...p }));
let scheduleList: ScheduleItem[] = mockScheduleItems.map((s) => ({ ...s }));
let conflictsList: typeof mockConflicts = [...mockConflicts];
let reviewsList: PlaceReview[] = mockReviews.map((r) => ({ ...r }));
const googleLinks: Map<string, string | null> = new Map();
const decisionSessions: Map<string, DecisionSession> = new Map();
const decisionSwipes: Map<string, DecisionSwipe[]> = new Map();

// CR-13: số phiên bản trạng thái phòng — tăng 1 ở mỗi thay đổi (như backend), trả qua header
// `X-State-Version` và trường `state_version` của phòng.
let stateVersion = 0;
// CR-11: vị trí xuất phát riêng của từng thành viên (chỉ chính chủ đọc được toạ độ)
const memberOrigins: Map<string, { lat: number; lng: number }> = new Map();

function bumpStateVersion(): number {
  stateVersion += 1;
  currentRoom = { ...currentRoom, state_version: stateVersion };
  return stateVersion;
}

function versionHeaders(): Record<string, string> {
  return { 'X-State-Version': String(stateVersion) };
}

/** Thành viên ứng với token trong mock (token chủ phòng → chủ phòng, còn lại → khách đầu tiên). */
function memberForToken(token: string | null): Member {
  return token === MOCK_HOST_TOKEN
    ? (membersList.find((m) => m.id === mockHostMember.id) ?? mockHostMember)
    : (membersList.find((m) => m.role === 'MEMBER') ?? mockGuestMember);
}

function toSelfMember(member: Member): SelfMember {
  const origin = memberOrigins.get(member.id);
  return {
    ...member,
    has_origin: origin !== undefined,
    origin_lat: origin?.lat ?? null,
    origin_lng: origin?.lng ?? null,
  };
}

function unauthorized() {
  return HttpResponse.json(
    { error: { code: 'UNAUTHORIZED', message: 'Thiếu header xác thực X-Member-Token.' } },
    { status: 401 },
  );
}

type LatLngPoint = { lat: number; lng: number };

function mockKm(a: LatLngPoint, b: LatLngPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Trung bình vector trên mặt cầu (ALGORITHMS §3), làm tròn 3 chữ số. */
function mockGroupCenter(points: LatLngPoint[]): LatLngPoint {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const phi = (p.lat * Math.PI) / 180;
    const lam = (p.lng * Math.PI) / 180;
    x += Math.cos(phi) * Math.cos(lam);
    y += Math.cos(phi) * Math.sin(lam);
    z += Math.sin(phi);
  }
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    lat: round3((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
    lng: round3((Math.atan2(y, x) * 180) / Math.PI),
  };
}

/* ---------- CR-15 (T-96): hoà phiếu OMP theo loại + đường đi — cùng luật với backend, ước lượng 25 km/h ---------- */

const CATEGORY_ORDER: PlaceCategory[] = ['FOOD', 'DRINK', 'ENTERTAINMENT', 'SIGHTSEEING', 'ACCOMMODATION', 'SHOPPING', 'OTHER'];
// T-99 (CR-16): mặc định (λ = 1; k = 2) như backend `algo_config.py`
const OMP_LAMBDA = 1;
const OMP_K = 2;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const mockKmEst = (a: LatLngPoint, b: LatLngPoint) => mockKm(a, b) * 1.3;
const mockMin = (km: number) => Math.ceil(Math.round((km / 25) * 60 * 1e6) / 1e6);
const coordOfPlace = (p: Place): LatLngPoint | null =>
  p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;
const placeScore = (p: Place) => p.score ?? (p.upvotes ?? 0) - (p.downvotes ?? 0);

/** Đường giả dạng chữ L (đi dọc rồi ngang) để bản đồ có "đường thật" khi chạy mock; mã hoá polyline độ chính xác 6. */
function mockShape(a: LatLngPoint, b: LatLngPoint, latFirst: boolean): string {
  const corner = latFirst ? { lat: b.lat, lng: a.lng } : { lat: a.lat, lng: b.lng };
  const pts: [number, number][] = [];
  const seg = (p: LatLngPoint, q: LatLngPoint) => {
    for (let i = 0; i < 6; i++) pts.push([p.lng + ((q.lng - p.lng) * i) / 6, p.lat + ((q.lat - p.lat) * i) / 6]);
  };
  seg(a, corner);
  seg(corner, b);
  pts.push([b.lng, b.lat]);
  return encodePolyline(pts);
}

function mockTieSuggestion(): TieSuggestion {
  const alive = placesList.filter((p) => p.status !== 'REJECTED' && p.status !== 'VISITED');
  const origins = membersList.flatMap((m) => {
    const o = memberOrigins.get(m.id);
    return o ? [{ m, o }] : [];
  });
  const excluded = membersList.length - origins.length;
  const suggestions: CategoryTieSuggestion[] = [];
  for (const category of CATEGORY_ORDER) {
    const inCat = alive.filter((p) => (p.category ?? 'OTHER') === category);
    if (inCat.length < 2 || inCat.some((p) => p.status === 'ACCEPTED')) continue;
    const top = Math.max(...inCat.map(placeScore));
    const tied = inCat.filter((p) => placeScore(p) === top).sort((x, y) => x.created_at.localeCompare(y.created_at));
    const activity = inCat.some((p) => (p.upvotes ?? 0) + (p.downvotes ?? 0) > 0 || placeScore(p) !== 0);
    if (tied.length < 2 || !activity) continue;
    const candidates = tied.map((p) => ({
      place_id: p.id,
      name: p.name,
      upvotes: p.upvotes ?? 0,
      downvotes: p.downvotes ?? 0,
      score: placeScore(p),
    }));
    const n = origins.length;
    const w = (r: number) => (n > 1 ? 1 + (OMP_LAMBDA * (r - 1)) / (n - 1) : 1);
    const evals = n === 0 ? [] : tied.flatMap((p) => {
      const c = coordOfPlace(p);
      if (!c) return [];
      const people = origins
        .map(({ m, o }) => {
          const go = mockKmEst(o, c);
          const back = mockKmEst(c, o);
          return { m, km: go + back, minutes: mockMin(go) + mockMin(back) };
        })
        .sort((x, y) => x.km - y.km);
      const psi = people.reduce((acc, x, i) => acc + w(i + 1) * x.km ** OMP_K, 0);
      return [{ p, people, psi, max_km: people[people.length - 1].km, total_km: people.reduce((a2, x) => a2 + x.km, 0) }];
    });
    evals.sort(
      (x, y) =>
        (Math.abs(x.psi - y.psi) > 1e-9 ? x.psi - y.psi : 0) ||
        x.max_km - y.max_km ||
        x.total_km - y.total_km ||
        x.p.created_at.localeCompare(y.p.created_at) ||
        x.p.id.localeCompare(y.p.id),
    );
    const best = evals[0];
    suggestions.push({
      category,
      candidates,
      recommended_place_id: best?.p.id ?? null,
      ranking: evals.map((e, i) => ({
        place_id: e.p.id,
        rank: i + 1,
        psi: round3(e.psi),
        max_km: round3(e.max_km),
        total_km: round3(e.total_km),
        max_min: Math.max(...e.people.map((x) => x.minutes)),
      })),
      members: best
        ? best.people.map((x, i) => ({ member_id: x.m.id, nickname: x.m.nickname, km: round3(x.km), minutes: x.minutes, rank: i + 1, weight: round3(w(i + 1)) }))
        : [],
      runner_up_psi: evals[1] ? round3(evals[1].psi) : null,
      excluded_member_count: excluded,
      estimated: true,
      source: 'ESTIMATE',
      params: { lambda: OMP_LAMBDA, k: OMP_K },
    });
  }
  if (suggestions.length === 0) return { available: false, reason: 'NO_TIE', suggestions: [] };
  if (origins.length === 0) return { available: false, reason: 'NO_ORIGINS', suggestions };
  if (suggestions.every((x) => x.ranking.length === 0)) return { available: false, reason: 'NO_PLACE_COORDS', suggestions };
  return { available: true, reason: null, suggestions };
}

/** Thứ hạng cho resolve TRAVEL_TIME: nối thứ hạng từng loại (như `travel_ranking` của backend). */
function mockTravelRanking(): string[] {
  return mockTieSuggestion().suggestions.flatMap((x) => [
    ...x.ranking.map((r) => r.place_id),
    ...x.candidates.filter((c) => !x.ranking.some((r) => r.place_id === c.place_id)).map((c) => c.place_id),
  ]);
}

// ── CR-12 phần 2 (T-87): ALGO-03 khả thi lịch + ALGO-04 ưu tiên — cùng luật với backend (ước lượng 25 km/h) ──
function mockLeg(a: LatLngPoint, b: LatLngPoint): { minutes: number; distance_km: number } {
  const km = mockKm(a, b) * 1.3;
  return { minutes: Math.ceil(Math.round((km / 25) * 60 * 1e6) / 1e6), distance_km: km };
}

/** Thứ Hai–Sáu và rời đi trong [16:30, 19:30) → biên 50%, còn lại 25%; sàn 5′. */
function mockMargin(eta: number, departMinute: number, eventDate: string, dayOffset = 0): number {
  const [y, m, d] = eventDate.split('-').map(Number);
  const wd = new Date(y, m - 1, d + dayOffset).getDay();
  const peak = wd >= 1 && wd <= 5 && departMinute % 1440 >= 990 && departMinute % 1440 < 1170;
  return Math.max(5, Math.ceil(Math.round(eta * (peak ? 0.5 : 0.25) * 1e6) / 1e6));
}

function mockAvailable(open: number | null | undefined, close: number | null | undefined, start: number, end: number): number | null {
  if (open == null || close == null) return null;
  const e = end > start ? end : end + 1440;
  if (open === close) return e - start;
  const c = close > open ? close : close + 1440;
  return [-1440, 0, 1440].reduce((acc, sh) => acc + Math.max(0, Math.min(c + sh, e) - Math.max(open + sh, start)), 0);
}

function mockOrigins(): LatLngPoint[] {
  const meeting =
    currentRoom.origin_lat != null && currentRoom.origin_lng != null
      ? { lat: currentRoom.origin_lat, lng: currentRoom.origin_lng }
      : null;
  return membersList.flatMap((m) => {
    const o = memberOrigins.get(m.id) ?? meeting;
    return o ? [o] : [];
  });
}

/** ALGO-04: khoá (rủi ro, −phiếu, −dư, người đi xa nhất, thời điểm thêm); nhãn tối đa 1/quán. */
function mockPriorities(): Map<string, PlacePriority> {
  const start = currentRoom.start_minute ?? 1020;
  const end = currentRoom.end_minute ?? 1380;
  const origins = mockOrigins();
  const rows = placesList
    .filter((p) => p.status !== 'REJECTED')
    .map((p) => {
      const coord = p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;
      const etaUnknown = !coord || origins.length === 0;
      const maxEta = etaUnknown ? 0 : Math.max(...origins.map((o) => mockLeg(o, coord!).minutes));
      const avail0 = mockAvailable(p.open_minute, p.close_minute, start, end);
      const avail = avail0 ?? (end > start ? end - start : end + 1440 - start);
      const slack = avail - (60 + maxEta + mockMargin(maxEta, start, currentRoom.event_date) + 5);
      const risk: FeasibilityRisk = avail === 0 || slack < -30 ? 'HIGH_RISK' : slack < 0 ? 'SOFT_CONFLICT' : 'SAFE';
      return { p, risk, slack, maxEta, etaUnknown, hoursUnknown: avail0 === null };
    });
  const rr = { SAFE: 0, SOFT_CONFLICT: 1, HIGH_RISK: 2 } as const;
  rows.sort(
    (a, b) =>
      rr[a.risk] - rr[b.risk] ||
      b.p.upvotes - a.p.upvotes ||
      b.slack - a.slack ||
      a.maxEta - b.maxEta ||
      a.p.created_at.localeCompare(b.p.created_at),
  );
  const top = Math.max(0, ...rows.map((r) => r.p.upvotes));
  return new Map(
    rows.map((r, i) => {
      const label =
        i === 0 && r.risk === 'SAFE'
          ? 'RECOMMENDED'
          : top > 0 && r.p.upvotes === top
            ? r.risk === 'SAFE'
              ? 'MOST_VOTED'
              : 'MOST_VOTED_RISKY'
            : r.risk === 'SAFE' && r.slack >= 30
              ? 'SCHEDULE_SAFE'
              : null;
      return [
        r.p.id,
        {
          rank: i + 1,
          risk: r.risk,
          slack_min: r.slack,
          max_eta_min: r.maxEta,
          labels: label ? [label] : [],
          estimated: !r.etaUnknown,
          hours_unknown: r.hoursUnknown,
          eta_unknown: r.etaUnknown,
        } satisfies PlacePriority,
      ];
    }),
  );
}

/** ALGO-03: tổng kế hoạch của ngày phòng (`day_offset = 0`). */
function mockFeasibility(): ScheduleFeasibility {
  const start = currentRoom.start_minute ?? 1020;
  const end = currentRoom.end_minute ?? 1380;
  const items = scheduleList
    .filter((s) => (s.day_offset ?? 0) === 0)
    .sort((a, b) => a.start_minute - b.start_minute || a.order_index - b.order_index);
  const coordOf = (s: ScheduleItem) => {
    const p = placesList.find((x) => x.id === s.place_id);
    return p && p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;
  };
  const legs: FeasibilityLeg[] = [];
  let unknown = 0;
  for (let i = 0; i + 1 < items.length; i++) {
    const a = coordOf(items[i]);
    const b = coordOf(items[i + 1]);
    if (!a || !b) {
      unknown++;
      continue;
    }
    const leg = mockLeg(a, b);
    const gap = items[i + 1].start_minute - items[i].end_minute;
    const still = leg.minutes <= 0 && leg.distance_km <= 0;
    const margin = still ? 0 : mockMargin(leg.minutes, items[i].end_minute, currentRoom.event_date);
    const buffer = still ? 0 : 5;
    const slack = gap - (leg.minutes + margin + buffer);
    const [y, m, d] = currentRoom.event_date.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    legs.push({
      from_item_id: items[i].id,
      to_item_id: items[i + 1].id,
      eta_min: leg.minutes,
      margin_min: margin,
      buffer_min: buffer,
      gap_min: gap,
      slack_min: slack,
      distance_km: Math.round(leg.distance_km * 1000) / 1000,
      risk: slack >= 0 ? 'SAFE' : gap >= leg.minutes ? 'SOFT_CONFLICT' : 'HIGH_RISK',
      peak: wd >= 1 && wd <= 5 && items[i].end_minute >= 990 && items[i].end_minute < 1170,
      source: 'ESTIMATE',
    });
  }
  const window = end > start ? end - start : end + 1440 - start;
  const required =
    items.reduce((acc, s) => acc + Math.max(0, s.end_minute - s.start_minute), 0) +
    legs.reduce((acc, l) => acc + l.eta_min + l.margin_min + l.buffer_min, 0);
  return {
    window_min: window,
    required_total_min: required,
    buffer_total_min: window - required,
    is_feasible: window - required >= 0 && legs.every((l) => l.risk !== 'HIGH_RISK'),
    legs,
    estimated: legs.length > 0,
    item_count: items.length,
    unknown_leg_count: unknown,
  };
}

export function resetMockDb(): void {
  stateVersion = 0;
  memberOrigins.clear();
  currentRoom = { ...mockRoom };
  membersList = [{ ...mockHostMember }, { ...mockGuestMember }];
  placesList = mockPlaces.map((p) => ({ ...p }));
  scheduleList = mockScheduleItems.map((s) => ({ ...s }));
  conflictsList = [...mockConflicts];
  reviewsList = mockReviews.map((r) => ({ ...r }));
  googleLinks.clear();
  decisionSessions.clear();
  decisionSwipes.clear();
}


// Helper auto-category detection for mock
function detectMockCategory(name: string): PlaceCategory {
  const lower = name.toLowerCase();
  if (
    lower.includes('cà phê') ||
    lower.includes('cafe') ||
    lower.includes('trà') ||
    lower.includes('bar')
  ) {
    return 'DRINK';
  }
  if (
    lower.includes('cơm') ||
    lower.includes('phở') ||
    lower.includes('bún') ||
    lower.includes('ăn') ||
    lower.includes('bánh')
  ) {
    return 'FOOD';
  }
  if (
    lower.includes('cgv') ||
    lower.includes('phim') ||
    lower.includes('karaoke') ||
    lower.includes('bida')
  ) {
    return 'ENTERTAINMENT';
  }
  if (
    lower.includes('khách sạn') ||
    lower.includes('hotel') ||
    lower.includes('homestay')
  ) {
    return 'ACCOMMODATION';
  }
  if (
    lower.includes('chợ') ||
    lower.includes('mall') ||
    lower.includes('siêu thị')
  ) {
    return 'SHOPPING';
  }
  return 'OTHER';
}

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export const handlers = [
  // 1. Tạo phòng mới
  http.post('*/api/v1/rooms', async ({ request }) => {
    const body = (await request.json()) as CreateRoomRequest;
    const roomId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const token = crypto.randomUUID();

    currentRoom = {
      id: roomId,
      code: 'NEW' + Math.floor(100 + Math.random() * 900),
      title: body.title,
      description: body.description ?? null,
      event_date: body.event_date,
      status: 'PLANNING',
      tie_break_strategy: body.tie_break_strategy ?? 'EARLIEST_SUBMISSION',
      budget_limit: body.budget_limit ?? null,
      // CR-14: phòng mới mặc định 2 quán/người; gửi null tường minh = không giới hạn
      max_places_per_member:
        'max_places_per_member' in body ? (body.max_places_per_member ?? null) : 2,
      state_version: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    stateVersion = 0;
    memberOrigins.clear();

    const host: Member = {
      id: memberId,
      room_id: roomId,
      nickname: body.creator_nickname,
      avatar_url: body.creator_avatar_url ?? null,
      role: 'HOST',
      is_active: true,
      has_origin: false,
      joined_at: new Date().toISOString(),
    };

    membersList = [host];
    placesList = [];
    scheduleList = [];

    return HttpResponse.json(
      {
        room: currentRoom,
        creator_member: host,
        member_token: token,
      },
      { status: 201 },
    );
  }),

  // 2. Tham gia phòng bằng mã
  http.post('*/api/v1/rooms/join', async ({ request }) => {
    const body = (await request.json()) as JoinRoomRequest;
    if (
      body.room_code.toUpperCase() !== currentRoom.code &&
      body.room_code !== mockRoom.code
    ) {
      return HttpResponse.json(
        {
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Không tìm thấy phòng với mã yêu cầu.',
          },
        },
        { status: 404 },
      );
    }

    const memberId = crypto.randomUUID();
    const token = MOCK_MEMBER_TOKEN;
    const newMember: Member = {
      id: memberId,
      room_id: currentRoom.id,
      nickname: body.nickname,
      avatar_url: body.avatar_url ?? null,
      role: 'MEMBER',
      is_active: true,
      has_origin: false,
      joined_at: new Date().toISOString(),
    };

    membersList.push(newMember);
    bumpStateVersion();

    return HttpResponse.json(
      {
        room: currentRoom,
        member: toSelfMember(newMember),
        member_token: token,
      },
      { status: 200, headers: versionHeaders() },
    );
  }),

  // 3. Lấy thông tin phòng
  http.get('*/api/v1/rooms/:roomId', ({ params }) => {
    const { roomId } = params;
    if (roomId !== currentRoom.id && roomId !== mockRoom.id) {
      return HttpResponse.json(
        {
          error: {
            code: 'ROOM_NOT_FOUND',
            message: 'Phòng không tồn tại.',
            details: { room_id: roomId },
          },
        },
        { status: 404 },
      );
    }

    // CR-11: người xem chỉ thấy `has_origin` của các thành viên, không có toạ độ
    return HttpResponse.json(
      {
        ...currentRoom,
        members: membersList.map((m) => ({ ...m, has_origin: memberOrigins.has(m.id) })),
        total_places: placesList.length,
      },
      { headers: versionHeaders() },
    );
  }),

  // 3b. Cập nhật cấu hình phòng (CR-03, Host only)
  http.patch('*/api/v1/rooms/:roomId', async ({ request }) => {
    const token = request.headers.get('X-Member-Token');
    if (token !== MOCK_HOST_TOKEN) {
      return HttpResponse.json(
        { error: { code: 'FORBIDDEN_HOST_ONLY', message: 'Thao tác này chỉ dành riêng cho Chủ phòng (HOST).' } },
        { status: 403 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;
    // CR-14: 1–10 hoặc null (bỏ giới hạn)
    const limit = body.max_places_per_member;
    if (limit !== undefined && limit !== null && (typeof limit !== 'number' || limit < 1 || limit > 10)) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu đầu vào không hợp lệ.',
            details: { field: 'max_places_per_member' },
          },
        },
        { status: 422 },
      );
    }
    currentRoom = { ...currentRoom, ...body, updated_at: new Date().toISOString() } as Room;
    bumpStateVersion();
    return HttpResponse.json(currentRoom, { headers: versionHeaders() });
  }),

  // 4. Lấy thông tin thành viên hiện tại
  http.get('*/api/v1/members/me', ({ request }) => {
    const token = request.headers.get('X-Member-Token');
    if (!token) {
      return HttpResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Thiếu header xác thực X-Member-Token.',
          },
        },
        { status: 401 },
      );
    }

    return HttpResponse.json(toSelfMember(memberForToken(token)), { headers: versionHeaders() });
  }),

  // 4b. Đặt/xoá vị trí xuất phát riêng của mình (CR-11)
  http.patch('*/api/v1/rooms/:roomId/members/me', async ({ request }) => {
    const token = request.headers.get('X-Member-Token');
    if (!token) {
      return HttpResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Thiếu header xác thực X-Member-Token.' } },
        { status: 401 },
      );
    }
    const body = (await request.json()) as Partial<UpdateMyOriginRequest>;
    const { origin_lat: lat, origin_lng: lng } = body;
    const bothMissing = lat === undefined || lng === undefined;
    const half = (lat === null) !== (lng === null);
    const outOfRange =
      (typeof lat === 'number' && (lat < -90 || lat > 90)) ||
      (typeof lng === 'number' && (lng < -180 || lng > 180));
    if (bothMissing || half || outOfRange) {
      return HttpResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu đầu vào không hợp lệ.',
            details: { fields: ['origin_lat', 'origin_lng'] },
          },
        },
        { status: 422 },
      );
    }
    const member = memberForToken(token);
    if (lat === null || lng === null) {
      memberOrigins.delete(member.id);
    } else {
      memberOrigins.set(member.id, { lat, lng });
    }
    membersList = membersList.map((m) =>
      m.id === member.id ? { ...m, has_origin: memberOrigins.has(m.id) } : m,
    );
    bumpStateVersion();
    return HttpResponse.json(toSelfMember(member), { headers: versionHeaders() });
  }),

  // 5. Lấy danh sách địa điểm (CR-12: kèm `priority`; `?sort=priority` theo rank, quán bị loại xuống cuối)
  http.get('*/api/v1/rooms/:roomId/places', ({ request }) => {
    const pri = mockPriorities();
    const list = placesList.map((p) => ({ ...p, priority: pri.get(p.id) ?? null }));
    if (new URL(request.url).searchParams.get('sort') === 'priority') {
      const last = list.length + 1;
      list.sort((a, b) => (a.priority?.rank ?? last) - (b.priority?.rank ?? last));
    }
    return HttpResponse.json(list);
  }),

  // 6. Thêm địa điểm mới
  http.post('*/api/v1/rooms/:roomId/places', async ({ params, request }) => {
    const { roomId } = params;
    const body = (await request.json()) as CreatePlaceRequest;
    const detectedCategory =
      body.category && body.category !== 'OTHER'
        ? body.category
        : detectMockCategory(body.name);

    // Chống trùng external_id (CR-03)
    if (body.external_id) {
      const existing = placesList.find(
        (p) => p.room_id === String(roomId) && p.external_id === body.external_id,
      );
      if (existing) {
        return HttpResponse.json(
          {
            error: {
              code: 'PLACE_ALREADY_ADDED',
              message: 'Địa điểm này đã được thêm vào chuyến đi.',
              details: { place_id: existing.id },
            },
          },
          { status: 409 },
        );
      }
    }

    // CR-14: giới hạn số quán mỗi người đề xuất (quán đã xoá không còn trong danh sách nên không tính)
    const limit = currentRoom.max_places_per_member;
    if (limit != null) {
      const used = placesList.filter((p) => p.submitted_by_id === mockHostMember.id).length;
      if (used >= limit) {
        return HttpResponse.json(
          {
            error: {
              code: 'PLACE_LIMIT_REACHED',
              message: 'Bạn đã đề xuất đủ số quán cho phòng này.',
              details: { limit, used },
            },
          },
          { status: 409 },
        );
      }
    }

    const newPlace: Place = {
      id: crypto.randomUUID(),
      room_id: String(roomId),
      submitted_by_id: mockHostMember.id,
      submitted_by_nickname: mockHostMember.nickname,
      name: body.name,
      address: body.address ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      category: detectedCategory,
      status: 'PROPOSED',
      source: body.source ?? (body.external_id ? 'OSM' : undefined),
      external_id: body.external_id ?? null,
      google_place_id: body.google_place_id ?? null,
      cuisine: body.cuisine ?? null,
      opening_hours_raw: body.opening_hours_raw ?? null,
      coords_source: body.coords_source ?? null,
      url: body.url ?? null,
      notes: body.notes ?? null,
      estimated_cost: body.estimated_cost ?? 0,
      open_minute: body.open_minute ?? null,
      close_minute: body.close_minute ?? null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      current_user_vote: 0,
      created_at: new Date().toISOString(),
    };

    placesList.unshift(newPlace);
    bumpStateVersion();
    return HttpResponse.json(newPlace, { status: 201, headers: versionHeaders() });
  }),

  // 7. Cập nhật trạng thái / thông tin địa điểm
  http.patch(
    '*/api/v1/rooms/:roomId/places/:placeId',
    async ({ params, request }) => {
      const { placeId } = params;
      const body = (await request.json()) as Partial<Place>;
      const index = placesList.findIndex((p) => p.id === placeId);
      if (index === -1) {
        return HttpResponse.json(
          {
            error: {
              code: 'PLACE_NOT_FOUND',
              message: 'Không tìm thấy địa điểm.',
            },
          },
          { status: 404 },
        );
      }

      placesList[index] = { ...placesList[index], ...body };
      return HttpResponse.json(placesList[index]);
    },
  ),

  // 8. Xóa địa điểm
  http.delete('*/api/v1/rooms/:roomId/places/:placeId', ({ params }) => {
    const { placeId } = params;
    placesList = placesList.filter((p) => p.id !== placeId);
    bumpStateVersion();
    return HttpResponse.json({ success: true, deleted_id: placeId }, { headers: versionHeaders() });
  }),

  // 9. Bỏ phiếu cho địa điểm
  http.post(
    '*/api/v1/rooms/:roomId/places/:placeId/votes',
    async ({ params, request }) => {
      const { placeId } = params;
      const body = (await request.json()) as VoteRequest;
      const place = placesList.find((p) => p.id === placeId);

      if (!place) {
        return HttpResponse.json(
          {
            error: {
              code: 'PLACE_NOT_FOUND',
              message: 'Địa điểm không tồn tại.',
            },
          },
          { status: 404 },
        );
      }

      // Giả lập thay đổi vote
      const prevVote = place.current_user_vote;
      const newVote = body.vote_value;

      let upvotes = place.upvotes;
      let downvotes = place.downvotes;

      if (prevVote === 1) upvotes--;
      if (prevVote === -1) downvotes--;

      if (newVote === 1) upvotes++;
      if (newVote === -1) downvotes++;

      place.upvotes = upvotes;
      place.downvotes = downvotes;
      place.score = upvotes - downvotes;
      place.current_user_vote = newVote;

      return HttpResponse.json({
        place_id: place.id,
        upvotes: place.upvotes,
        downvotes: place.downvotes,
        score: place.score,
        current_user_vote: place.current_user_vote,
      });
    },
  ),

  // 10. Hủy bỏ phiếu
  http.delete(
    '*/api/v1/rooms/:roomId/places/:placeId/votes',
    ({ params }) => {
      const { placeId } = params;
      const place = placesList.find((p) => p.id === placeId);

      if (!place) {
        return HttpResponse.json(
          {
            error: {
              code: 'PLACE_NOT_FOUND',
              message: 'Địa điểm không tồn tại.',
            },
          },
          { status: 404 },
        );
      }

      if (place.current_user_vote === 1) place.upvotes--;
      if (place.current_user_vote === -1) place.downvotes--;
      place.current_user_vote = 0;
      place.score = place.upvotes - place.downvotes;

      return HttpResponse.json({
        place_id: place.id,
        upvotes: place.upvotes,
        downvotes: place.downvotes,
        score: place.score,
        current_user_vote: 0,
      });
    },
  ),

  // 11. Chốt kết quả bình chọn (Resolve Voting)
  http.post(
    '*/api/v1/rooms/:roomId/voting/resolve',
    async ({ request }) => {
      const body = (await request.json()) as ResolveVotingRequest;
      const count = body.max_accepted_places ?? 3;

      // CR-15: TRAVEL_TIME → như backend: nhóm (điểm, loại) giảm dần, trong nhóm theo thứ hạng OMP của server
      const rank = new Map(
        (body.strategy === 'TRAVEL_TIME' ? mockTravelRanking() : []).map((id, i) => [id, i] as const),
      );
      const sorted = placesList
        .filter((p) => p.status !== 'REJECTED' && p.status !== 'VISITED')
        .map((p, i) => ({ p, i }))
        .sort(
          (x, y) =>
            placeScore(y.p) - placeScore(x.p) ||
            String(y.p.category ?? 'OTHER').localeCompare(String(x.p.category ?? 'OTHER')) ||
            (rank.get(x.p.id) ?? 1e9) - (rank.get(y.p.id) ?? 1e9) ||
            x.i - y.i,
        )
        .map((x) => x.p);
      const accepted = sorted.slice(0, count);

      accepted.forEach((p) => {
        p.status = 'ACCEPTED';
      });

      return HttpResponse.json({
        resolved_places: accepted.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          score: p.score,
          upvotes: p.upvotes,
        })),
        tie_break_applied: true,
        tie_break_strategy: body.strategy,
      });
    },
  ),

  // 11b. Tâm nhóm (ALGO-01, CR-11): chỉ tính người đã chia sẻ vị trí, làm tròn 3 chữ số, không lộ toạ độ ai
  http.get('*/api/v1/rooms/:roomId/group-center', ({ request }) => {
    if (!request.headers.get('X-Member-Token')) return unauthorized();
    const points = [...memberOrigins.values()];
    if (points.length < 2) {
      return HttpResponse.json(
        { available: false, center: null, area_label: null, member_count: points.length, nearby_pois: [] },
        { headers: versionHeaders() },
      );
    }
    const center = mockGroupCenter(points);
    const nearby = mockPois
      .map((poi) => ({ ...poi, distance_km: Math.round(mockKm(center, poi) * 1000) / 1000 }))
      .filter((poi) => poi.distance_km <= 2)
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 10);
    return HttpResponse.json(
      { available: true, center, area_label: 'Q1', member_count: points.length, nearby_pois: nearby },
      { headers: versionHeaders() },
    );
  }),

  // 11c. Gợi ý hoà phiếu OMP theo loại (CR-15): cùng luật với backend, km khứ hồi ước lượng 25 km/h
  http.get('*/api/v1/rooms/:roomId/tie-break/suggestion', ({ request }) => {
    if (!request.headers.get('X-Member-Token')) return unauthorized();
    return HttpResponse.json(mockTieSuggestion(), { headers: versionHeaders() });
  }),

  // 11d. Tổng khả thi của lịch (ALGO-03, CR-12 phần 2)
  http.get('*/api/v1/rooms/:roomId/schedule/feasibility', ({ request }) => {
    if (!request.headers.get('X-Member-Token')) return unauthorized();
    return HttpResponse.json(mockFeasibility(), { headers: versionHeaders() });
  }),

  // 11e. Đường của tôi tới một quán (CR-15 mục 37): CHỈ của người gọi, không toạ độ, không khoá cache
  http.get('*/api/v1/rooms/:roomId/routes/me', ({ request }) => {
    const token = request.headers.get('X-Member-Token');
    if (!token) return unauthorized();
    const placeId = new URL(request.url).searchParams.get('place_id');
    const place = placesList.find((p) => p.id === placeId);
    if (!place) {
      return HttpResponse.json({ error: { code: 'PLACE_NOT_FOUND', message: 'Không tìm thấy quán.' } }, { status: 404 });
    }
    const origin = memberOrigins.get(memberForToken(token).id);
    if (!origin) {
      return HttpResponse.json({ error: { code: 'NO_ORIGIN', message: 'Bạn chưa chia sẻ vị trí.' } }, { status: 404 });
    }
    const c = coordOfPlace(place);
    if (!c) {
      return HttpResponse.json({ error: { code: 'NO_PLACE_COORDS', message: 'Quán chưa có toạ độ.' } }, { status: 404 });
    }
    const leg = (a: LatLngPoint, b: LatLngPoint, latFirst: boolean): RouteLeg => {
      const km = mockKmEst(a, b);
      return { km: round3(km), minutes: mockMin(km), shape: mockShape(a, b, latFirst), source: 'VALHALLA' };
    };
    const body: MyRoutes = { place_id: place.id, to_place: leg(origin, c, true), to_home: leg(c, origin, true) };
    return HttpResponse.json(body, { headers: versionHeaders() });
  }),

  // 11f. Đường giữa các mục lịch (CR-15 mục 38): cặp liên tiếp của ngày phòng, như mục 36
  http.get('*/api/v1/rooms/:roomId/schedule/routes', ({ request }) => {
    if (!request.headers.get('X-Member-Token')) return unauthorized();
    const items = scheduleList
      .filter((x) => (x.day_offset ?? 0) === 0)
      .sort((x, y) => x.start_minute - y.start_minute || x.order_index - y.order_index);
    const legs: ScheduleRoutes['legs'] = [];
    let unknown = 0;
    for (let i = 0; i + 1 < items.length; i++) {
      const pa = placesList.find((p) => p.id === items[i].place_id);
      const pb = placesList.find((p) => p.id === items[i + 1].place_id);
      const a = pa ? coordOfPlace(pa) : null;
      const b = pb ? coordOfPlace(pb) : null;
      if (!a || !b) {
        unknown++;
        continue;
      }
      const km = mockKmEst(a, b);
      legs.push({
        from_item_id: items[i].id,
        to_item_id: items[i + 1].id,
        km: round3(km),
        minutes: mockMin(km),
        shape: mockShape(a, b, false),
        source: 'VALHALLA',
      });
    }
    const body: ScheduleRoutes = { legs, unknown_leg_count: unknown };
    return HttpResponse.json(body, { headers: versionHeaders() });
  }),

  // 12. Lấy danh sách lịch trình
  http.get('*/api/v1/rooms/:roomId/schedule', () => {
    return HttpResponse.json(scheduleList);
  }),

  // 13. Thêm mục vào lịch trình
  http.post('*/api/v1/rooms/:roomId/schedule', async ({ params, request }) => {
    const { roomId } = params;
    const body = (await request.json()) as CreateScheduleItemRequest;
    const place = placesList.find((p) => p.id === body.place_id);

    const newItem: ScheduleItem = {
      id: crypto.randomUUID(),
      room_id: String(roomId),
      place_id: body.place_id,
      place_name: place?.name ?? 'Địa điểm',
      place_address: place?.address ?? null,
      day_offset: body.day_offset,
      start_minute: body.start_minute,
      end_minute: body.end_minute,
      order_index: scheduleList.length,
      note: body.note ?? null,
    };

    scheduleList.push(newItem);
    return HttpResponse.json(newItem, { status: 201 });
  }),

  // 14. Bulk update lịch trình
  http.put('*/api/v1/rooms/:roomId/schedule', async ({ request }) => {
    const body = (await request.json()) as BulkUpdateScheduleRequest;
    const itemMap = new Map(body.items.map((i) => [i.id, i]));

    scheduleList = scheduleList.map((item) => {
      const update = itemMap.get(item.id);
      if (update) {
        return {
          ...item,
          day_offset: update.day_offset,
          start_minute: update.start_minute,
          end_minute: update.end_minute,
          order_index: update.order_index,
          // Giống backend (CR-10): thiếu `note` trong payload = đặt NULL
          note: update.note ?? null,
        };
      }
      return item;
    });

    scheduleList.sort((a, b) => a.order_index - b.order_index);
    return HttpResponse.json(scheduleList);
  }),

  // 15. Xóa mục lịch trình
  http.delete('*/api/v1/rooms/:roomId/schedule/:itemId', ({ params }) => {
    const { itemId } = params;
    scheduleList = scheduleList.filter((s) => s.id !== itemId);
    return HttpResponse.json({ success: true, deleted_item_id: itemId });
  }),

  // 16. Lấy danh sách xung đột
  http.get('*/api/v1/rooms/:roomId/conflicts', () => {
    return HttpResponse.json(conflictsList);
  }),

  // 17. Đánh giá xung đột
  http.post('*/api/v1/rooms/:roomId/conflicts/evaluate', () => {
    return HttpResponse.json(conflictsList);
  }),

  // 18. Danh sách POI theo Bounding Box
  http.get('*/api/v1/pois', ({ request }) => {
    const url = new URL(request.url);
    const bboxStr = url.searchParams.get('bbox');
    const category = url.searchParams.get('category') as PlaceCategory | null;
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);

    let results = [...mockPois];
    if (category) {
      results = results.filter((p) => p.category === category);
    }

    if (bboxStr) {
      const parts = bboxStr.split(',').map((v) => parseFloat(v.trim()));
      if (parts.length === 4 && !parts.some(isNaN)) {
        let minLat: number, minLng: number, maxLat: number, maxLng: number;
        if (parts[0] > 50) {
          // minLng,minLat,maxLng,maxLat
          [minLng, minLat, maxLng, maxLat] = parts;
        } else {
          // minLat,minLng,maxLat,maxLng
          [minLat, minLng, maxLat, maxLng] = parts;
        }
        results = results.filter(
          (p) => p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng
        );
      }
    }

    // CR-17 A: bbox xếp score giảm dần để `limit` giữ quán nổi bật
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return HttpResponse.json(results.slice(0, limit));
  }),

  // 19. Tìm kiếm POI không dấu
  http.get('*/api/v1/pois/search', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const lat = url.searchParams.get('lat') ? parseFloat(url.searchParams.get('lat')!) : null;
    const lng = url.searchParams.get('lng') ? parseFloat(url.searchParams.get('lng')!) : null;
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const normQ = removeVietnameseTones(q);
    let matched = mockPois.filter((p) => {
      const normName = removeVietnameseTones(p.name);
      const normAddress = removeVietnameseTones(p.address || '');
      const normCuisine = removeVietnameseTones(p.cuisine || '');
      const normBrand = removeVietnameseTones(p.brand || '');
      return [normName, normAddress, normCuisine, normBrand].some((text) => text.includes(normQ));
    });

    // Cùng luật backend (MAP-POI §5): khớp tên → dải 3 km → score → khoảng cách
    const tier = (p: Poi) => (removeVietnameseTones(p.name).includes(normQ) ? 0 : 1);
    if (lat !== null && lng !== null) {
      matched = matched.map((p) => ({
        ...p,
        distance_km: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 1000) / 1000,
      }));
    }
    matched.sort(
      (a, b) =>
        tier(a) - tier(b) ||
        Math.floor((a.distance_km ?? 0) / 3) - Math.floor((b.distance_km ?? 0) / 3) ||
        (b.score ?? 0) - (a.score ?? 0) ||
        (a.distance_km ?? 0) - (b.distance_km ?? 0),
    );

    return HttpResponse.json(matched.slice(0, limit));
  }),

  // 19b. Chuỗi cửa hàng khớp truy vấn (CR-17 B) — phải đứng trước `/pois/:prefix/:id`
  http.get('*/api/v1/pois/brands', ({ request }) => {
    const url = new URL(request.url);
    const normQ = removeVietnameseTones(url.searchParams.get('q') || '');
    const lat = url.searchParams.get('lat') ? parseFloat(url.searchParams.get('lat')!) : null;
    const lng = url.searchParams.get('lng') ? parseFloat(url.searchParams.get('lng')!) : null;
    const limit = parseInt(url.searchParams.get('limit') || '5', 10);
    const groups = new Map<string, Poi[]>();
    for (const p of mockPois) {
      if (!p.brand_key || !p.brand || !removeVietnameseTones(p.brand).startsWith(normQ)) continue;
      groups.set(p.brand_key, [...(groups.get(p.brand_key) ?? []), p]);
    }
    const brands = [...groups.entries()]
      .filter(([, pois]) => pois.length >= 3)
      .map(([brand_key, pois]) => ({
        brand_key,
        name: pois[0].brand!,
        count: pois.length,
        nearest_km:
          lat !== null && lng !== null
            ? Math.round(Math.min(...pois.map((p) => haversineKm(lat, lng, p.lat, p.lng))) * 1000) / 1000
            : null,
      }))
      .sort((a, b) => b.count - a.count);
    return HttpResponse.json(brands.slice(0, limit));
  }),

  http.get('*/api/v1/pois/brands/:brandKey', ({ request, params }) => {
    const url = new URL(request.url);
    const lat = url.searchParams.get('lat') ? parseFloat(url.searchParams.get('lat')!) : null;
    const lng = url.searchParams.get('lng') ? parseFloat(url.searchParams.get('lng')!) : null;
    let pois = mockPois.filter((p) => p.brand_key === params.brandKey);
    if (lat !== null && lng !== null) {
      pois = pois
        .map((p) => ({ ...p, distance_km: Math.round(haversineKm(lat, lng, p.lat, p.lng) * 1000) / 1000 }))
        .sort((a, b) => a.distance_km - b.distance_km);
    }
    return HttpResponse.json(pois);
  }),

  // 20. Chi tiết một POI
  http.get('*/api/v1/pois/:prefix/:id', ({ params }) => {
    const extId = `${params.prefix}/${params.id}`;
    const poi = mockPois.find((p) => p.external_id === extId);
    if (!poi) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Không tìm thấy địa điểm' } },
        { status: 404 },
      );
    }
    return HttpResponse.json(poi);
  }),

  http.get('*/api/v1/pois/:externalId', ({ params }) => {
    const rawId = params.externalId as string;
    const extId = decodeURIComponent(rawId);
    const poi = mockPois.find((p) => p.external_id === extId || p.external_id === rawId);
    if (!poi) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Không tìm thấy địa điểm' } },
        { status: 404 },
      );
    }
    return HttpResponse.json(poi);
  }),

  // 21. Khớp Google Place ID
  http.post('*/api/v1/pois/google-match', async ({ request }) => {
    const body = (await request.json()) as GoogleMatchRequest;
    let placeId = googleLinks.get(body.external_id);
    if (placeId === undefined) {
      placeId = `ChIJ_mock_${body.external_id.replace(/[^a-zA-Z0-9]/g, '_')}`;
      googleLinks.set(body.external_id, placeId);
    }
    return HttpResponse.json({
      google_place_id: placeId,
      reason: 'OK',
    });
  }),

  // 22. Báo sai khớp Google Place ID
  http.delete('*/api/v1/pois/google-match/:prefix/:id', ({ params }) => {
    const extId = `${params.prefix}/${params.id}`;
    googleLinks.delete(extId);
    return HttpResponse.json({ success: true, message: 'Đã hủy liên kết Google Place ID' });
  }),

  http.delete('*/api/v1/pois/google-match/:externalId', ({ params }) => {
    const rawId = params.externalId as string;
    const extId = decodeURIComponent(rawId);
    googleLinks.delete(extId);
    googleLinks.delete(rawId);
    return HttpResponse.json({ success: true, message: 'Đã hủy liên kết Google Place ID' });
  }),


  // 23. Lấy đánh giá nội bộ
  http.get('*/api/v1/reviews', ({ request }) => {
    const url = new URL(request.url);
    const externalKey = url.searchParams.get('external_key') || '';
    const items = reviewsList.filter((r) => r.external_key === externalKey);
    const count = items.length;
    const avg =
      count > 0 ? Number((items.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1)) : 0;

    const tagCounts: Record<string, number> = {};
    items.forEach((r) => {
      r.tags.forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const tags_top3 = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    return HttpResponse.json({
      avg,
      count,
      tags_top3,
      items,
    });
  }),

  // 24. Đăng / cập nhật đánh giá nội bộ
  http.put('*/api/v1/reviews', async ({ request }) => {
    const body = (await request.json()) as CreateReviewRequest;
    const token = request.headers.get('X-Member-Token');
    const member =
      membersList.find((m) =>
        token === MOCK_HOST_TOKEN ? m.role === 'HOST' : m.role === 'MEMBER',
      ) || mockHostMember;

    const existingIndex = reviewsList.findIndex(
      (r) => r.external_key === body.external_key && r.member_id === member.id,
    );

    const updatedReview: PlaceReview = {
      id: existingIndex >= 0 ? reviewsList[existingIndex].id : crypto.randomUUID(),
      external_key: body.external_key,
      room_id: currentRoom.id,
      member_id: member.id,
      nickname: member.nickname,
      rating: body.rating,
      comment: body.comment ?? null,
      tags: body.tags ?? [],
      created_at:
        existingIndex >= 0 ? reviewsList[existingIndex].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      reviewsList[existingIndex] = updatedReview;
    } else {
      reviewsList.push(updatedReview);
    }

    return HttpResponse.json(updatedReview);
  }),

  // 25. Lấy gợi ý Chọn hộ
  http.get('*/api/v1/rooms/:roomId/decisions/hints', ({ params }) => {
    const { roomId } = params;
    const roomPlaces = placesList.filter((p) => p.room_id === roomId);
    const candidateIds = roomPlaces.map((p) => p.id);

    // CR-15: TIE_AT_TOP theo từng loại như backend (hoà điểm cao nhất trong loại); không có thì giữ gợi ý mẫu cũ
    const perCategory = CATEGORY_ORDER.flatMap((category) => {
      const inCat = roomPlaces.filter((p) => (p.category ?? 'OTHER') === category && p.status !== 'REJECTED' && p.status !== 'VISITED');
      if (inCat.length < 2) return [];
      const top = Math.max(...inCat.map(placeScore));
      const tied = inCat.filter((p) => placeScore(p) === top);
      return tied.length >= 2 ? [{ type: 'TIE_AT_TOP' as TriggerHint, category, candidate_place_ids: tied.map((p) => p.id) }] : [];
    });
    const hints =
      perCategory.length > 0
        ? perCategory
        : candidateIds.length >= 2
        ? [
            {
              type: 'TIE_AT_TOP' as TriggerHint,
              category: 'FOOD',
              candidate_place_ids: candidateIds.slice(0, 3),
            },
          ]
        : [];

    const smart_picks = candidateIds.slice(0, 3).map((id, idx) => ({
      place_id: id,
      score: Number((0.95 - idx * 0.1).toFixed(2)),
      reasons: ['Gần điểm hẹn nhất (~1,2 km)', 'Đang mở cửa lúc 18:00', 'Vừa ngân sách'],
      reason_codes: [
        { code: 'NEAREST', params: { distance_km: 1.2 } },
        { code: 'OPEN_AT', params: { minute: 1080 } },
        { code: 'WITHIN_BUDGET', params: { cost: 45000, budget_limit: 100000 } },
      ],
    }));

    return HttpResponse.json({ hints, smart_picks });
  }),

  // 26. Tạo phiên Chọn hộ
  http.post('*/api/v1/rooms/:roomId/decisions', async ({ request, params }) => {
    const { roomId } = params;
    const body = (await request.json()) as CreateDecisionRequest;

    for (const session of decisionSessions.values()) {
      if (session.room_id === roomId && session.status === 'OPEN') {
        return HttpResponse.json(
          {
            error: {
              code: 'CONFLICT',
              message: 'Phòng đã có phiên chọn hộ đang mở',
              details: { session_id: session.id },
            },
          },
          { status: 409 },
        );
      }
    }

    const sessionId = crypto.randomUUID();
    const seed = 123456789;
    const candidates =
      body.candidate_place_ids && body.candidate_place_ids.length > 0
        ? body.candidate_place_ids
        : placesList.filter((p) => p.room_id === roomId).map((p) => p.id);

    // SWIPE chưa có quán thắng lúc tạo (giống backend): kết quả chỉ có khi chốt từ các lượt quẹt
    const resultPlaceId = body.mode === 'SWIPE' ? null : (candidates[0] ?? null);
    let resultPayload: Record<string, unknown> | null = null;
    if (body.mode === 'WHEEL') {
      resultPayload = { stop_angle_deg: 1532.5 };
    } else if (body.mode === 'LADDER') {
      resultPayload = { n_columns: candidates.length, winning_column: 0, rungs: [] };
    }

    const newSession: DecisionSession = {
      id: sessionId,
      room_id: roomId as string,
      mode: body.mode,
      status: 'OPEN',
      category: body.category ?? null,
      candidate_place_ids: candidates,
      seed,
      result_place_id: resultPlaceId,
      result_payload: resultPayload,
      created_by_id: mockHostMember.id,
      created_at: new Date().toISOString(),
      closes_at: body.mode === 'SWIPE' ? new Date(Date.now() + 90000).toISOString() : null,
    };

    decisionSessions.set(sessionId, newSession);
    decisionSwipes.set(sessionId, []);

    return HttpResponse.json(
      {
        session: newSession,
        seed,
        result_place_id: resultPlaceId,
        result_payload: resultPayload,
      },
      { status: 201 },
    );
  }),

  // 27. Quẹt thẻ bình chọn Swipe
  http.post('*/api/v1/rooms/:roomId/decisions/:sessionId/swipes', async ({ request, params }) => {
    const { sessionId } = params;
    const body = (await request.json()) as SubmitSwipeRequest;
    const session = decisionSessions.get(sessionId as string);
    if (!session || session.status !== 'OPEN') {
      return HttpResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'Phiên không tồn tại hoặc đã đóng' } },
        { status: 400 },
      );
    }

    const token = request.headers.get('X-Member-Token');
    const member =
      membersList.find((m) =>
        token === MOCK_HOST_TOKEN ? m.role === 'HOST' : m.role === 'MEMBER',
      ) || mockHostMember;

    const swipes = decisionSwipes.get(sessionId as string) || [];
    const existingIndex = swipes.findIndex(
      (s) => s.member_id === member.id && s.place_id === body.place_id,
    );
    const newSwipe: DecisionSwipe = {
      session_id: sessionId as string,
      member_id: member.id,
      place_id: body.place_id,
      liked: body.liked,
    };
    if (existingIndex >= 0) {
      swipes[existingIndex] = newSwipe;
    } else {
      swipes.push(newSwipe);
    }
    decisionSwipes.set(sessionId as string, swipes);

    return HttpResponse.json({
      success: true,
      session_id: sessionId,
      place_id: body.place_id,
      liked: body.liked,
    });
  }),

  // 28. Chấp nhận kết quả phiên Chọn hộ
  http.post('*/api/v1/rooms/:roomId/decisions/:sessionId/accept', ({ params }) => {
    const { sessionId } = params;
    const session = decisionSessions.get(sessionId as string);
    if (!session) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiên chọn hộ' } },
        { status: 404 },
      );
    }

    session.status = 'RESOLVED';
    if (!session.result_place_id) {
      // SWIPE chốt sớm: quán nhiều lượt Thích nhất (hoà thì lấy quán đứng trước), chưa ai quẹt thì quán đầu
      const likes = new Map<string, number>(session.candidate_place_ids.map((id) => [id, 0]));
      for (const s of decisionSwipes.get(sessionId as string) || []) {
        if (s.liked && likes.has(s.place_id)) likes.set(s.place_id, (likes.get(s.place_id) ?? 0) + 1);
      }
      let winner: string | null = session.candidate_place_ids[0] ?? null;
      for (const [id, count] of likes) {
        if (winner === null || count > (likes.get(winner) ?? 0)) winner = id;
      }
      session.result_place_id = winner;
    }
    let resolvedPlace: Place | undefined;
    if (session.result_place_id) {
      const pIdx = placesList.findIndex((p) => p.id === session.result_place_id);
      if (pIdx >= 0) {
        placesList[pIdx] = { ...placesList[pIdx], status: 'ACCEPTED' };
        resolvedPlace = placesList[pIdx];
      }
    }

    return HttpResponse.json({
      session,
      resolved_place: resolvedPlace,
      strategy: 'GROUP_DECISION',
    });
  }),

  // 29. Hủy phiên Chọn hộ
  http.post('*/api/v1/rooms/:roomId/decisions/:sessionId/cancel', ({ params }) => {
    const { sessionId } = params;
    const session = decisionSessions.get(sessionId as string);
    if (!session) {
      return HttpResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Không tìm thấy phiên chọn hộ' } },
        { status: 404 },
      );
    }

    session.status = 'CANCELLED';
    return HttpResponse.json({ session });
  }),

  // 30. Xem trước lịch trình tự động (Auto-plan Preview)
  http.post('*/api/v1/rooms/:roomId/schedule/auto-plan', async ({ request, params }) => {
    const { roomId } = params;
    const body = ((await request.json().catch(() => ({}))) || {}) as AutoPlanPreviewRequest;
    const dayOffset = body.day_offset ?? 0;
    const durationOverrides = body.duration_overrides || {};

    const roomPlaces = placesList.filter((p) => p.room_id === roomId);
    let candidates = roomPlaces.filter((p) => p.status === 'ACCEPTED');
    let usedFallback = false;
    if (candidates.length === 0) {
      candidates = [...roomPlaces].sort((a, b) => b.score - a.score);
      usedFallback = true;
    }

    let currentMinute = 1020; // 17:00
    const slots = candidates.slice(0, 3).map((p, i) => {
      const duration = durationOverrides[p.id] || (p.category === 'FOOD' ? 75 : 60);
      const start = currentMinute;
      const end = start + duration;
      currentMinute = end + 15;
      return {
        place_id: p.id,
        day_offset: dayOffset,
        start_minute: start,
        end_minute: end,
        travel_from_prev_min: i === 0 ? 0 : 15,
        reasons: [
          p.category === 'FOOD'
            ? 'Ăn tối trong khung 17:30–20:30'
            : 'Điểm tiếp theo theo tuyến đường',
          'Cách điểm trước ~15 phút di chuyển',
        ],
        reason_codes: [
          p.category === 'FOOD'
            ? { code: 'MEAL_WINDOW', params: { window: 'dinner', start_minute: 1050, end_minute: 1230 } }
            : { code: 'DRINK', params: {} },
          i === 0
            ? { code: 'TRAVEL_FROM', params: { travel_min: 15, from_origin: true } }
            : { code: 'TRAVEL_FROM', params: { travel_min: 15, from_name: candidates[i - 1].name } },
        ],
      };
    });

    const dropped = candidates.slice(3).map((p) => ({
      place_id: p.id,
      reason: 'Hết khung thời gian trong buổi (23:00)',
      reason_code: 'OUT_OF_TIME',
      reason_params: {},
    }));

    const planHash = `hash_${slots.map((s) => `${s.place_id}:${s.start_minute}:${s.end_minute}`).join('_')}`;

    return HttpResponse.json({
      slots,
      dropped,
      total_travel_min: slots.length > 1 ? (slots.length - 1) * 15 : 0,
      total_cost: candidates.slice(0, 3).reduce((sum, p) => sum + p.estimated_cost, 0),
      used_fallback: usedFallback,
      plan_hash: planHash,
    });
  }),

  // 31. Áp dụng lịch trình tự động (Auto-plan Apply)
  http.post('*/api/v1/rooms/:roomId/schedule/auto-plan/apply', async ({ request, params }) => {
    const { roomId } = params;
    const body = (await request.json()) as AutoPlanApplyRequest;

    if (!body.plan_hash || body.plan_hash.startsWith('INVALID')) {
      return HttpResponse.json(
        {
          error: {
            code: 'STALE_PLAN',
            message: 'Dữ liệu phòng đã thay đổi, vui lòng xem trước lại',
          },
        },
        { status: 409 },
      );
    }

    scheduleList = scheduleList.filter((s) => s.room_id !== roomId);
    body.slots.forEach((slot, index) => {
      const place = placesList.find((p) => p.id === slot.place_id);
      scheduleList.push({
        id: crypto.randomUUID(),
        room_id: roomId as string,
        place_id: slot.place_id,
        place_name: place?.name ?? 'Địa điểm',
        place_address: place?.address ?? null,
        day_offset: slot.day_offset,
        start_minute: slot.start_minute,
        end_minute: slot.end_minute,
        order_index: index,
        note: slot.reasons.join(', '),
      });
    });

    return HttpResponse.json(scheduleList.filter((s) => s.room_id === roomId));
  }),
];

