import { http, HttpResponse } from 'msw';
import type {
  BulkUpdateScheduleRequest,
  CreatePlaceRequest,
  CreateRoomRequest,
  CreateScheduleItemRequest,
  JoinRoomRequest,
  Member,
  Place,
  PlaceCategory,
  ResolveVotingRequest,
  Room,
  ScheduleItem,
  VoteRequest,
} from '../types';
import {
  MOCK_HOST_TOKEN,
  MOCK_MEMBER_TOKEN,
  mockConflicts,
  mockGuestMember,
  mockHostMember,
  mockPlaces,
  mockRoom,
  mockScheduleItems,
} from './mockData';

// In-memory mock database state
let currentRoom: Room = { ...mockRoom };
let membersList: Member[] = [{ ...mockHostMember }, { ...mockGuestMember }];
let placesList: Place[] = mockPlaces.map((p) => ({ ...p }));
let scheduleList: ScheduleItem[] = mockScheduleItems.map((s) => ({ ...s }));
let conflictsList: typeof mockConflicts = [...mockConflicts];

export function resetMockDb(): void {
  currentRoom = { ...mockRoom };
  membersList = [{ ...mockHostMember }, { ...mockGuestMember }];
  placesList = mockPlaces.map((p) => ({ ...p }));
  scheduleList = mockScheduleItems.map((s) => ({ ...s }));
  conflictsList = [...mockConflicts];
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
];
