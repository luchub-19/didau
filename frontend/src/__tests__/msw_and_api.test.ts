import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { roomApi, placeApi, voteApi, scheduleApi, conflictApi } from '../services/api';
import { tokenStorage } from '../services/storage/tokenStorage';
import { MOCK_HOST_TOKEN, mockRoom } from '../mocks/mockData';

import { resetMockDb } from '../mocks/handlers';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
});

afterAll(() => {
  server.close();
});

describe('T-15: MSW Contract Handlers & REST Endpoints', () => {
  it('lấy thông tin phòng qua mock GET /api/v1/rooms/:roomId', async () => {
    const room = await roomApi.getRoom(mockRoom.id);
    expect(room.id).toBe(mockRoom.id);
    expect(room.code).toBe('DIDAU8');
    expect(room.title).toBe(mockRoom.title);
    expect(room.members).toHaveLength(2);
    expect(room.total_places).toBeGreaterThanOrEqual(1);
  });

  it('tạo phòng mới qua POST /api/v1/rooms và nhận member_token', async () => {
    const res = await roomApi.createRoom({
      title: 'Đi Vũng Tàu',
      event_date: '2026-11-01',
      creator_nickname: 'QuangHuy',
    });

    expect(res.room.title).toBe('Đi Vũng Tàu');
    expect(res.creator_member.nickname).toBe('QuangHuy');
    expect(res.creator_member.role).toBe('HOST');
    expect(res.member_token).toBeDefined();
  });

  it('tham gia phòng qua POST /api/v1/rooms/join', async () => {
    const res = await roomApi.joinRoom({
      room_code: 'DIDAU8',
      nickname: 'MaiLan',
    });

    expect(res.member.nickname).toBe('MaiLan');
    expect(res.member.role).toBe('MEMBER');
    expect(res.member_token).toBeDefined();
  });

  it('lấy danh sách địa điểm và thêm địa điểm mới tự động phát hiện danh mục', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const initialPlaces = await placeApi.listPlaces(mockRoom.id);
    expect(initialPlaces.length).toBeGreaterThan(0);

    const newPlace = await placeApi.createPlace(mockRoom.id, {
      name: 'Phở Hòa Pasteur',
      address: '260C Pasteur, Q.3',
      estimated_cost: 85000,
    });

    expect(newPlace.name).toBe('Phở Hòa Pasteur');
    expect(newPlace.category).toBe('FOOD'); // Tự động phát hiện FOOD
    expect(newPlace.score).toBe(0);
  });

  it('bỏ phiếu và hủy phiếu bình chọn cho địa điểm', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const places = await placeApi.listPlaces(mockRoom.id);
    const targetPlace = places.find((p) => p.current_user_vote === 0) || places[2];
    const initialUpvotes = targetPlace.upvotes;

    const voteRes = await voteApi.castVote(mockRoom.id, targetPlace.id, 1);
    expect(voteRes.current_user_vote).toBe(1);
    expect(voteRes.upvotes).toBe(initialUpvotes + 1);

    const retractRes = await voteApi.retractVote(mockRoom.id, targetPlace.id);
    expect(retractRes.current_user_vote).toBe(0);
    expect(retractRes.upvotes).toBe(initialUpvotes);
  });

  it('chốt kết quả bình chọn (Resolve Voting with TieBreak)', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const res = await voteApi.resolveVoting(mockRoom.id, {
      strategy: 'MOST_UPVOTES',
      max_accepted_places: 2,
    });

    expect(res.tie_break_applied).toBe(true);
    expect(res.tie_break_strategy).toBe('MOST_UPVOTES');
    expect(res.resolved_places.length).toBeLessThanOrEqual(2);
    expect(res.resolved_places[0].status).toBe('ACCEPTED');
  });

  it('lấy và thêm mục lịch trình', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const schedule = await scheduleApi.listSchedule(mockRoom.id);
    expect(Array.isArray(schedule)).toBe(true);

    const newItem = await scheduleApi.createScheduleItem(mockRoom.id, {
      place_id: mockRoom.id,
      day_offset: 0,
      start_minute: 720,
      end_minute: 800,
      note: 'Ăn trưa',
    });

    expect(newItem.start_minute).toBe(720);
    expect(newItem.end_minute).toBe(800);
  });

  it('lấy danh sách và đánh giá cảnh báo xung đột', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const conflicts = await conflictApi.listConflicts(mockRoom.id);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].rule_code).toBe('TIME_OVERLAP');
    expect(conflicts[0].level).toBe('CRITICAL');

    const evalConflicts = await conflictApi.evaluateConflicts(mockRoom.id);
    expect(Array.isArray(evalConflicts)).toBe(true);
  });
});
