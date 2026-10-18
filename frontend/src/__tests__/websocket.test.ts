import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from '../services/websocket/wsClient';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import type { Place, Member, ScheduleItem, ConflictAlert } from '../types';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sentData: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 10);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    this.onclose?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('T-17: WebSocket Client & Realtime Hook Engine', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
    useRoomStore.getState().reset();
    usePlaceStore.getState().reset();
    useScheduleStore.getState().reset();
    useConflictStore.getState().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('WebSocketClient kết nối, đổi trạng thái và gửi PING heartbeat', async () => {
    const client = new WebSocketClient('ws://localhost:8000/ws/rooms/123?token=abc', {
      pingInterval: 50,
    });

    let status = client.status;
    client.onStatusChange((s) => {
      status = s;
    });

    client.connect();
    expect(status).toBe('CONNECTING');

    // Đợi socket open
    await new Promise((r) => setTimeout(r, 20));
    expect(status).toBe('OPEN');

    // Test send
    const sent = client.send('SUBSCRIBE_ROOM', { room_id: '123' });
    expect(sent).toBe(true);

    const wsInstance = MockWebSocket.instances[0];
    expect(wsInstance.sentData.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(wsInstance.sentData[0]);
    expect(parsed.type).toBe('SUBSCRIBE_ROOM');
    expect(parsed.payload.room_id).toBe('123');
    expect(parsed.ts).toBeDefined();

    client.disconnect();
    expect(client.status).toBe('CLOSED');
  });

  it('WebSocketClient dispatch events và cho phép unsubscribe', async () => {
    const client = new WebSocketClient('ws://localhost:8000/ws');
    client.connect();
    await new Promise((r) => setTimeout(r, 20));

    const wsInstance = MockWebSocket.instances[0];
    let receivedPayload: unknown = null;

    const unsub = client.on<{ text: string }>('TEST_EVENT', (payload) => {
      receivedPayload = payload;
    });

    wsInstance.triggerMessage({
      type: 'TEST_EVENT',
      payload: { text: 'hello' },
      ts: Date.now(),
    });

    expect(receivedPayload).toEqual({ text: 'hello' });

    // Sau khi unsubscribe không nhận thêm
    unsub();
    wsInstance.triggerMessage({
      type: 'TEST_EVENT',
      payload: { text: 'world' },
      ts: Date.now(),
    });
    expect(receivedPayload).toEqual({ text: 'hello' });

    client.disconnect();
  });

  it('V8: disconnect khi socket còn CONNECTING không đóng giữa lúc bắt tay và không in cảnh báo', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new WebSocketClient('ws://localhost:8000/ws');
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));

    client.connect();
    const wsInstance = MockWebSocket.instances[0];
    const closeSpy = vi.spyOn(wsInstance, 'close');
    client.disconnect();

    // Chưa đóng ngay; trình duyệt có thể bắn lỗi nhưng handler đã gỡ
    expect(closeSpy).not.toHaveBeenCalled();
    wsInstance.onerror?.(new Event('error'));
    expect(warn).not.toHaveBeenCalled();

    // Mở xong thì đóng luôn, không báo OPEN và không kết nối lại
    await new Promise((r) => setTimeout(r, 20));
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(statuses).not.toContain('OPEN');
    await new Promise((r) => setTimeout(r, 1100));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('Realtime message kích hoạt cập nhật trực tiếp vào các Zustand stores', async () => {
    const client = new WebSocketClient('ws://localhost:8000/ws');
    client.connect();
    await new Promise((r) => setTimeout(r, 20));

    const wsInstance = MockWebSocket.instances[0];

    // Wire events to stores like useWebSocket does
    client.on<{ member: Member }>('MEMBER_JOINED', (p) => {
      useRoomStore.getState().addMember(p.member);
    });
    client.on<{ place: Place }>('PLACE_ADDED', (p) => {
      usePlaceStore.getState().upsertPlace(p.place);
    });
    client.on<{ place_id: string; upvotes: number; downvotes: number; score: number }>(
      'VOTE_UPDATED',
      (p) => {
        usePlaceStore.getState().updatePlaceVote(p.place_id, p.upvotes, p.downvotes, p.score);
      },
    );
    client.on<{ items: ScheduleItem[] }>('SCHEDULE_UPDATED', (p) => {
      useScheduleStore.getState().setItems(p.items);
    });
    client.on<{ conflicts: ConflictAlert[] }>('CONFLICTS_UPDATED', (p) => {
      useConflictStore.getState().setConflicts(p.conflicts);
    });

    // 1. MEMBER_JOINED
    const newMember: Member = {
      id: 'm-1',
      room_id: 'r-1',
      nickname: 'MinhAnh',
      role: 'MEMBER',
      is_active: true,
      joined_at: new Date().toISOString(),
    };
    wsInstance.triggerMessage({ type: 'MEMBER_JOINED', payload: { member: newMember }, ts: Date.now() });
    expect(useRoomStore.getState().members).toHaveLength(1);
    expect(useRoomStore.getState().members[0].nickname).toBe('MinhAnh');

    // 2. PLACE_ADDED
    const newPlace: Place = {
      id: 'p-1',
      room_id: 'r-1',
      submitted_by_id: 'm-1',
      name: 'Bánh Mì Huỳnh Hoa',
      category: 'FOOD',
      status: 'PROPOSED',
      estimated_cost: 65000,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      current_user_vote: 0,
      created_at: new Date().toISOString(),
    };
    wsInstance.triggerMessage({ type: 'PLACE_ADDED', payload: { place: newPlace }, ts: Date.now() });
    expect(usePlaceStore.getState().places).toHaveLength(1);
    expect(usePlaceStore.getState().places[0].name).toBe('Bánh Mì Huỳnh Hoa');

    // 3. VOTE_UPDATED
    wsInstance.triggerMessage({
      type: 'VOTE_UPDATED',
      payload: { place_id: 'p-1', upvotes: 5, downvotes: 1, score: 4 },
      ts: Date.now(),
    });
    expect(usePlaceStore.getState().places[0].upvotes).toBe(5);
    expect(usePlaceStore.getState().places[0].score).toBe(4);

    // 4. SCHEDULE_UPDATED
    const item: ScheduleItem = {
      id: 's-1',
      room_id: 'r-1',
      place_id: 'p-1',
      place_name: 'Bánh Mì Huỳnh Hoa',
      day_offset: 0,
      start_minute: 480,
      end_minute: 540,
      order_index: 0,
    };
    wsInstance.triggerMessage({ type: 'SCHEDULE_UPDATED', payload: { items: [item] }, ts: Date.now() });
    expect(useScheduleStore.getState().items).toHaveLength(1);

    // 5. CONFLICTS_UPDATED
    const alert: ConflictAlert = {
      id: 'c-1',
      rule_code: 'TIME_OVERLAP',
      level: 'CRITICAL',
      message: 'Trùng giờ',
      entity_type: 'SCHEDULE',
      entity_ids: ['s-1'],
      resolved: false,
      created_at: new Date().toISOString(),
    };
    wsInstance.triggerMessage({ type: 'CONFLICTS_UPDATED', payload: { conflicts: [alert] }, ts: Date.now() });
    expect(useConflictStore.getState().conflicts).toHaveLength(1);
    expect(useConflictStore.getState().conflicts[0].rule_code).toBe('TIME_OVERLAP');

    client.disconnect();
  });
});
