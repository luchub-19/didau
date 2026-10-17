import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import { mockRoom } from '../mocks/mockData';
import { resetMockDb } from '../mocks/handlers';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  useRoomStore.getState().reset();
  usePlaceStore.getState().reset();
  useScheduleStore.getState().reset();
  useConflictStore.getState().reset();
});

afterAll(() => {
  server.close();
});

describe('T-16: Token Storage & Global Zustand Stores', () => {
  it('tokenStorage lưu trữ, truy xuất và xóa token', () => {
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.hasToken()).toBe(false);

    tokenStorage.setToken('test-token-123');
    tokenStorage.setRoomCode('DIDAU8');

    expect(tokenStorage.getToken()).toBe('test-token-123');
    expect(tokenStorage.hasToken()).toBe(true);
    expect(tokenStorage.getRoomCode()).toBe('DIDAU8');

    tokenStorage.clearToken();
    expect(tokenStorage.getToken()).toBeNull();
    expect(tokenStorage.hasToken()).toBe(false);
  });

  it('useRoomStore tạo phòng thành công và lưu token', async () => {
    const res = await useRoomStore.getState().createRoom({
      title: 'Họp mặt cuối năm',
      event_date: '2026-12-30',
      creator_nickname: 'ThanhBinh',
    });

    expect(tokenStorage.getToken()).toBe(res.member_token);
    expect(useRoomStore.getState().room?.title).toBe('Họp mặt cuối năm');
    expect(useRoomStore.getState().currentMember?.nickname).toBe('ThanhBinh');
    expect(useRoomStore.getState().currentMember?.role).toBe('HOST');
  });

  it('useRoomStore lấy thông tin phòng và thành viên', async () => {
    tokenStorage.setToken('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d');
    await useRoomStore.getState().fetchRoom(mockRoom.id);

    expect(useRoomStore.getState().room?.id).toBe(mockRoom.id);
    expect(useRoomStore.getState().members.length).toBe(2);
    expect(useRoomStore.getState().currentMember?.role).toBe('HOST');
  });

  it('usePlaceStore fetch, add place và optimistic voting', async () => {
    await usePlaceStore.getState().fetchPlaces(mockRoom.id);
    const initialCount = usePlaceStore.getState().places.length;
    expect(initialCount).toBeGreaterThan(0);

    const newPlace = await usePlaceStore.getState().addPlace(mockRoom.id, {
      name: 'Bún Chả Hà Nội',
      address: '123 Lê Lợi',
      estimated_cost: 60000,
    });
    expect(usePlaceStore.getState().places[0].id).toBe(newPlace.id);

    // Vote Upvote
    await usePlaceStore.getState().castVote(mockRoom.id, newPlace.id, 1);
    const votedPlace = usePlaceStore
      .getState()
      .places.find((p) => p.id === newPlace.id);
    expect(votedPlace?.current_user_vote).toBe(1);
    expect(votedPlace?.upvotes).toBe(1);

    // Retract Vote
    await usePlaceStore.getState().retractVote(mockRoom.id, newPlace.id);
    const retractedPlace = usePlaceStore
      .getState()
      .places.find((p) => p.id === newPlace.id);
    expect(retractedPlace?.current_user_vote).toBe(0);
  });

  it('useScheduleStore fetch, thêm mục và sắp xếp lịch trình', async () => {
    await useScheduleStore.getState().fetchSchedule(mockRoom.id);
    const initialItems = useScheduleStore.getState().items;
    expect(Array.isArray(initialItems)).toBe(true);

    const added = await useScheduleStore.getState().addItem(mockRoom.id, {
      place_id: mockRoom.id,
      day_offset: 0,
      start_minute: 600,
      end_minute: 700,
      note: 'Gặp gỡ thảo luận',
    });

    expect(useScheduleStore.getState().items.some((i) => i.id === added.id)).toBe(true);

    // Xóa mục
    await useScheduleStore.getState().deleteItem(mockRoom.id, added.id);
    expect(useScheduleStore.getState().items.some((i) => i.id === added.id)).toBe(false);
  });

  it('useConflictStore fetch và đánh giá cảnh báo xung đột', async () => {
    await useConflictStore.getState().fetchConflicts(mockRoom.id);
    expect(useConflictStore.getState().conflicts.length).toBeGreaterThan(0);

    const evaluated = await useConflictStore.getState().evaluateConflicts(mockRoom.id);
    expect(Array.isArray(evaluated)).toBe(true);
  });
});
