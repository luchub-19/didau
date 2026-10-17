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
  Place,
  PlaceCategory,
  PlaceReview,
  ResolveVotingRequest,
  Room,
  ScheduleItem,
  SubmitSwipeRequest,
  TriggerHint,
  VoteRequest,
} from '../types';
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

export function resetMockDb(): void {
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const host: Member = {
      id: memberId,
      room_id: roomId,
      nickname: body.creator_nickname,
      avatar_url: body.creator_avatar_url ?? null,
      role: 'HOST',
      is_active: true,
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
      joined_at: new Date().toISOString(),
    };

    membersList.push(newMember);

    return HttpResponse.json(
      {
        room: currentRoom,
        member: newMember,
        member_token: token,
      },
      { status: 200 },
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

    return HttpResponse.json({
      ...currentRoom,
      members: membersList,
      total_places: placesList.length,
    });
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
    currentRoom = { ...currentRoom, ...body, updated_at: new Date().toISOString() } as Room;
    return HttpResponse.json(currentRoom);
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

    const member =
      token === MOCK_HOST_TOKEN
        ? mockHostMember
        : membersList.find((m) => m.role === 'MEMBER') ?? mockGuestMember;

    return HttpResponse.json(member);
  }),

  // 5. Lấy danh sách địa điểm
  http.get('*/api/v1/rooms/:roomId/places', () => {
    return HttpResponse.json(placesList);
  }),

  // 6. Thêm địa điểm mới
  http.post('*/api/v1/rooms/:roomId/places', async ({ params, request }) => {
    const { roomId } = params;
    const body = (await request.json()) as CreatePlaceRequest;
    const detectedCategory =
      body.category && body.category !== 'OTHER'
        ? body.category
        : detectMockCategory(body.name);

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
    return HttpResponse.json(newPlace, { status: 201 });
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
    return HttpResponse.json({ success: true, deleted_id: placeId });
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

      const sorted = [...placesList].sort((a, b) => b.score - a.score);
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
      return normName.includes(normQ) || normAddress.includes(normQ) || normCuisine.includes(normQ);
    });

    if (lat !== null && lng !== null) {
      matched = matched.map((p) => ({
        ...p,
        distance_km: haversineKm(lat, lng, p.lat, p.lng),
      }));
      matched.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
    }

    return HttpResponse.json(matched.slice(0, limit));
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

    const hints =
      candidateIds.length >= 2
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
          { error: { code: 'CONFLICT', message: 'Phòng đã có phiên chọn hộ đang mở' } },
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

    const resultPlaceId = candidates[0] ?? null;
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
      };
    });

    const dropped = candidates.slice(3).map((p) => ({
      place_id: p.id,
      reason: 'Hết khung thời gian trong buổi (23:00)',
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

