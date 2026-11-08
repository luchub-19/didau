// T-88: "Xuất phát từ đâu?", widget tâm nhóm, dải "Gần cả nhóm", giới hạn đề xuất, luật `state_version`.
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach, vi as vitest } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../i18n';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { MOCK_MEMBER_TOKEN, MOCK_HOST_TOKEN, mockGuestMember, mockHostMember, mockRoom } from '../mocks/mockData';
import { tokenStorage } from '../services/storage/tokenStorage';
import { WebSocketClient } from '../services/websocket/wsClient';
import {
  createStateVersionGate,
  createTracker,
  decide,
  versionOf,
} from '../services/websocket/stateVersion';
import { PLACE_LIMIT_CHOICES, parseLimitError, placeQuota, placesUsedBy, quotaLabel } from '../room/placeLimit';
import { CENTER_RADIUS_KM, centerVisible, circlePolygon } from '../room/groupCenter';
import { groupNearbyItems, nearbyRailMode } from '../room/discovery';
import { originStatus, searchCenter } from '../room/origin';
import { buildCreatePayload } from '../room/createRoom';
import { useAlgoStore } from '../store/useAlgoStore';
import { useRoomStore } from '../store/useRoomStore';
import { GroupCenterWidget } from '../components/algo/GroupCenterWidget';
import { WhyPanel } from '../components/algo/WhyPanel';
import {
  CENTER_RADIUS_FILL,
  CENTER_RADIUS_LINE,
  CENTER_RADIUS_SOURCE,
  syncCenterRadius,
} from '../components/algo/CenterRadiusLayer';
import { OriginRow } from '../components/algo/OriginSetting';
import { MemberList } from '../components/room/MemberList';
import { DiscoveryCard } from '../components/places/DiscoveryCard';
import { DiscoveryRails } from '../components/places/DiscoveryRails';
import { PlaceList } from '../components/places/PlaceList';
import type { GroupCenterResponse, Member, Place, Poi, Room } from '../types';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

/* ---------- dữ liệu mẫu ---------- */

const CENTER = { lat: 10.786, lng: 106.674 };

const poi = (id: string, i: number): Poi => ({
  external_id: `osm:node/${id}`,
  name: `Quán ${id}`,
  category: 'FOOD',
  lat: CENTER.lat + i * 0.001,
  lng: CENTER.lng,
  distance_km: 0.1 * i,
});

const groupCenter = (over: Partial<GroupCenterResponse> = {}): GroupCenterResponse => ({
  available: true,
  center: CENTER,
  area_label: 'Q3 – Phú Nhuận',
  member_count: 3,
  nearby_pois: [poi('1', 1), poi('2', 2), poi('3', 3)],
  ...over,
});

const room = (over: Partial<Room> = {}): Room => ({ ...mockRoom, ...over }) as Room;

const place = (id: string, by: string, over: Partial<Place> = {}): Place =>
  ({
    id,
    room_id: mockRoom.id,
    submitted_by_id: by,
    name: `Quán ${id}`,
    category: 'FOOD',
    status: 'PROPOSED',
    estimated_cost: 0,
    upvotes: 0,
    downvotes: 0,
    created_at: '',
    updated_at: '',
    ...over,
  }) as Place;

beforeEach(() => {
  useAlgoStore.getState().reset();
  useRoomStore.getState().reset();
});

/* ---------- state_version (CR-13, ALGORITHMS §8) ---------- */

describe('state_version: decide()', () => {
  const run = (applied: number | null, version: number | null, type = 'VOTE_UPDATED') =>
    decide({ applied, resyncing: false }, type, version);

  it('bỏ tin cũ (số nhỏ hơn số đã áp), không đổi số đang giữ', () => {
    const r = run(10, 8);
    expect(r.decision).toBe('drop');
    expect(r.tracker.applied).toBe(10);
  });

  it('áp tin bằng số (tin tạm thời, CONFLICTS_UPDATED ngầm) và tin đúng +1', () => {
    expect(run(10, 10).decision).toBe('apply');
    const next = run(10, 11);
    expect(next.decision).toBe('apply');
    expect(next.tracker.applied).toBe(11);
  });

  it('nhảy cóc (>+1) → đồng bộ lại đúng một lần, các tin nhảy cóc sau đó bị bỏ im lặng', () => {
    const first = run(10, 13);
    expect(first.decision).toBe('resync');
    expect(first.tracker.resyncing).toBe(true);
    const second = decide(first.tracker, 'PLACE_ADDED', 14);
    expect(second.decision).toBe('drop');
  });

  it('ROOM_STATE_SYNC luôn áp và đặt lại số gốc (kể cả khi nhỏ hơn) + mở lại khả năng đồng bộ', () => {
    const gap = run(10, 13);
    const sync = decide(gap.tracker, 'ROOM_STATE_SYNC', 4);
    expect(sync.decision).toBe('apply');
    expect(sync.tracker).toEqual({ applied: 4, resyncing: false });
    expect(decide(sync.tracker, 'VOTE_UPDATED', 5).decision).toBe('apply');
  });

  it('chưa có số gốc → nhận số đầu tiên làm gốc; tin không có số (server cũ) luôn áp', () => {
    const base = decide(createTracker(), 'VOTE_UPDATED', 7);
    expect(base.decision).toBe('apply');
    expect(base.tracker.applied).toBe(7);
    const legacy = run(10, null);
    expect(legacy.decision).toBe('apply');
    expect(legacy.tracker.applied).toBe(10);
  });

  it('versionOf: ưu tiên khung ngoài, lùi về payload (ROOM_STATE_SYNC)', () => {
    expect(versionOf({ state_version: 5, payload: { state_version: 9 } })).toBe(5);
    expect(versionOf({ payload: { state_version: 9 } })).toBe(9);
    expect(versionOf({ payload: {} })).toBeNull();
    expect(versionOf({ state_version: 'x', payload: null })).toBeNull();
  });
});

describe('state_version: cổng trên WebSocketClient', () => {
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor(public url: string) {
      MockWebSocket.instances.push(this);
      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.();
      }, 0);
    }
    send() {}
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    push(type: string, payload: unknown, state_version?: number) {
      this.onmessage?.({ data: JSON.stringify({ type, payload, ts: 0, state_version }) });
    }
  }

  beforeEach(() => {
    vitest.stubGlobal('WebSocket', MockWebSocket);
    MockWebSocket.instances = [];
  });
  afterEach(() => {
    vitest.unstubAllGlobals();
  });

  it('gói trễ không đè tin mới; nhảy cóc gọi onResync và không chuyển tin tới handler', async () => {
    const client = new WebSocketClient('ws://x/ws');
    const resync = vitest.fn();
    const { gate } = createStateVersionGate(resync);
    client.setGate(gate);
    const seen: number[] = [];
    client.on<{ n: number }>('VOTE_UPDATED', (p) => seen.push(p.n));
    client.connect();
    await new Promise((r) => setTimeout(r, 5));
    const ws = MockWebSocket.instances[0];

    ws.push('ROOM_STATE_SYNC', { state_version: 10 }, 10);
    ws.push('VOTE_UPDATED', { n: 11 }, 11);
    ws.push('VOTE_UPDATED', { n: 9 }, 9); // gói trễ
    ws.push('VOTE_UPDATED', { n: 11 }, 11); // bằng số: áp
    expect(seen).toEqual([11, 11]);
    expect(resync).not.toHaveBeenCalled();

    ws.push('VOTE_UPDATED', { n: 14 }, 14); // lỡ 12–13
    expect(seen).toEqual([11, 11]);
    expect(resync).toHaveBeenCalledTimes(1);
    ws.push('VOTE_UPDATED', { n: 15 }, 15);
    expect(resync).toHaveBeenCalledTimes(1);

    ws.push('ROOM_STATE_SYNC', { state_version: 15 }, 15);
    ws.push('VOTE_UPDATED', { n: 16 }, 16);
    expect(seen).toEqual([11, 11, 16]);
    client.disconnect();
  });
});

/* ---------- Giới hạn đề xuất (CR-14) ---------- */

describe('placeLimit', () => {
  const mine = 'm1';
  const list = [place('a', mine), place('b', 'm2'), place('c', mine)];

  it('đếm quán của mình; chip: 1 · 2 · 3 · Không giới hạn', () => {
    expect(placesUsedBy(list, mine)).toBe(2);
    expect(placesUsedBy(list, undefined)).toBe(0);
    expect(PLACE_LIMIT_CHOICES).toEqual([1, 2, 3, null]);
  });

  it('nhãn nút "x/y" và khoá khi đủ', () => {
    const open = placeQuota({ max_places_per_member: 3 }, list, mine);
    expect(open).toEqual({ limit: 3, used: 2, reached: false });
    expect(quotaLabel(open)).toBe('2/3');
    const full = placeQuota({ max_places_per_member: 2 }, list, mine);
    expect(full.reached).toBe(true);
    expect(quotaLabel(full)).toBe('2/2');
  });

  it('không giới hạn (null/thiếu/0) → không nhãn, không khoá', () => {
    for (const max of [null, undefined, 0]) {
      const q = placeQuota({ max_places_per_member: max }, list, mine);
      expect(q).toEqual({ limit: null, used: 2, reached: false });
      expect(quotaLabel(q)).toBeNull();
    }
    expect(placeQuota(null, list, mine).limit).toBeNull();
  });

  it('parseLimitError đọc {limit, used} từ 409 PLACE_LIMIT_REACHED, lỗi khác → null', () => {
    expect(parseLimitError({ code: 'PLACE_LIMIT_REACHED', status: 409, details: { limit: 2, used: 2 } })).toEqual({
      limit: 2,
      used: 2,
    });
    expect(parseLimitError({ code: 'PLACE_ALREADY_ADDED' })).toBeNull();
    expect(parseLimitError(null)).toBeNull();
  });

  it('payload tạo phòng: gửi max_places_per_member (kể cả null); thiếu thì bỏ trường', () => {
    const base = {
      title: 'Tối nay',
      nickname: 'Nam',
      avatarSeed: 'a',
      eventDate: '2026-11-10',
      startMinute: 1020,
      endMinute: 1380,
      city: 'HCM',
      budget: 'none' as const,
      customBudget: '',
      strategy: 'EARLIEST_SUBMISSION' as const,
      description: '',
    };
    expect(buildCreatePayload({ ...base, maxPlaces: 2 }).max_places_per_member).toBe(2);
    expect(buildCreatePayload({ ...base, maxPlaces: null })).toHaveProperty('max_places_per_member', null);
    expect(buildCreatePayload(base)).not.toHaveProperty('max_places_per_member');
  });
});

describe('nút Thêm quán "x/y" và thẻ gợi ý bị khoá', () => {
  const places = [place('a', 'm1'), place('b', 'm1')];

  it('PlaceList: nhãn "Thêm quán 1/2" khi còn chỗ', () => {
    const html = renderToStaticMarkup(
      <PlaceList
        places={[place('a', 'm1')]}
        roomId="r1"
        selectedCategory="ALL"
        currentMemberId="m1"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
        room={{ origin_lat: null, origin_lng: null, budget_limit: null, max_places_per_member: 2 }}
        members={[]}
      />,
    );
    expect(html).toContain('Thêm quán 1/2');
    expect(html).not.toContain('add-limit-note');
  });

  it('PlaceList: đủ 2/2 → nút khoá + câu giải thích gắn aria-describedby', () => {
    const html = renderToStaticMarkup(
      <PlaceList
        places={places}
        roomId="r1"
        selectedCategory="ALL"
        currentMemberId="m1"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
        room={{ origin_lat: null, origin_lng: null, budget_limit: null, max_places_per_member: 2 }}
        members={[]}
      />,
    );
    const btn = html.match(/<button[^>]*data-testid="btn-add-place"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain('disabled');
    expect(btn).toContain('aria-describedby="add-limit-note"');
    expect(html).toContain('Thêm quán 2/2');
    expect(html).toContain('Bạn đã đề xuất đủ 2 quán');
  });

  it('PlaceList: không giới hạn → nhãn cũ, không khoá', () => {
    const html = renderToStaticMarkup(
      <PlaceList
        places={places}
        roomId="r1"
        selectedCategory="ALL"
        currentMemberId="m1"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
        room={{ origin_lat: null, origin_lng: null, budget_limit: null, max_places_per_member: null }}
        members={[]}
      />,
    );
    const btn = html.match(/<button[^>]*data-testid="btn-add-place"[^>]*>/)?.[0] ?? '';
    expect(btn).not.toContain('disabled');
    expect(html).toContain('aria-label="Thêm quán"');
    expect(html).not.toContain('Thêm quán 2/2');
  });

  it('DiscoveryCard: có addLockedReason → nút ＋ khoá, title là lý do', () => {
    const html = renderToStaticMarkup(
      <DiscoveryCard
        name="Phở A"
        category="FOOD"
        thumb={null}
        meta="1 km"
        added={false}
        onOpen={() => {}}
        onAdd={() => {}}
        addLockedReason="Bạn đã đề xuất đủ 2 quán."
      />,
    );
    const btn = html.match(/<button[^>]*data-testid="discovery-add"[^>]*>/)?.[0] ?? '';
    expect(btn).toContain('disabled');
    expect(btn).toContain('title="Bạn đã đề xuất đủ 2 quán."');
  });
});

/* ---------- Tâm nhóm ---------- */

describe('groupCenter (logic thuần)', () => {
  it('centerVisible: ẩn khi <2 người, không có tâm hoặc available=false', () => {
    expect(centerVisible(null)).toBe(false);
    expect(centerVisible(groupCenter({ available: false, center: null }))).toBe(false);
    expect(centerVisible(groupCenter({ member_count: 1 }))).toBe(false);
    expect(centerVisible(groupCenter({ center: null }))).toBe(false);
    expect(centerVisible(groupCenter())).toBe(true);
  });

  it('circlePolygon: vòng khép kín, mọi đỉnh cách tâm đúng bán kính (±1%)', () => {
    const f = circlePolygon(CENTER, CENTER_RADIUS_KM, 32);
    const ring = f.geometry.coordinates[0];
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    const km = (a: [number, number]) => {
      const r = (d: number) => (d * Math.PI) / 180;
      const h =
        Math.sin(r(a[1] - CENTER.lat) / 2) ** 2 +
        Math.cos(r(CENTER.lat)) * Math.cos(r(a[1])) * Math.sin(r(a[0] - CENTER.lng) / 2) ** 2;
      return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
    };
    for (const p of ring) expect(Math.abs(km(p as [number, number]) - CENTER_RADIUS_KM)).toBeLessThan(CENTER_RADIUS_KM * 0.01);
  });
});

describe('syncCenterRadius (vòng tròn trên bản đồ)', () => {
  // Bản đồ giả: đủ các hàm mà syncCenterRadius gọi
  const fakeMap = () => {
    const layers = new Set<string>();
    const sources = new Map<string, { data: unknown; setData: (d: unknown) => void }>();
    const map = {
      getLayer: (id: string) => (layers.has(id) ? { id } : undefined),
      getSource: (id: string) => sources.get(id),
      addSource: (id: string, spec: { data: unknown }) => {
        sources.set(id, { data: spec.data, setData(d) { this.data = d; } });
      },
      addLayer: (spec: { id: string }) => void layers.add(spec.id),
      removeLayer: (id: string) => void layers.delete(id),
      removeSource: (id: string) => void sources.delete(id),
      setPaintProperty: () => undefined,
    };
    return { map: map as unknown as Parameters<typeof syncCenterRadius>[0], layers, sources };
  };

  it('có tâm → thêm nguồn + 2 lớp (tô, viền); gọi lại không thêm trùng, chỉ đổi dữ liệu', () => {
    const { map, layers, sources } = fakeMap();
    syncCenterRadius(map, CENTER);
    expect([...layers].sort()).toEqual([CENTER_RADIUS_FILL, CENTER_RADIUS_LINE].sort());
    expect(sources.has(CENTER_RADIUS_SOURCE)).toBe(true);
    syncCenterRadius(map, { lat: CENTER.lat + 0.01, lng: CENTER.lng });
    expect(layers.size).toBe(2);
    const data = sources.get(CENTER_RADIUS_SOURCE)!.data as GeoJSON.FeatureCollection;
    expect(data.features).toHaveLength(1);
  });

  it('center = null → gỡ sạch lớp và nguồn; gọi khi chưa có gì không lỗi', () => {
    const { map, layers, sources } = fakeMap();
    expect(() => syncCenterRadius(map, null)).not.toThrow();
    syncCenterRadius(map, CENTER);
    syncCenterRadius(map, null);
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
  });
});

describe('dải "Gần cả nhóm"', () => {
  it('nearbyRailMode: tâm nhóm > điểm hẹn > thành phố', () => {
    expect(nearbyRailMode(true, true)).toBe('group');
    expect(nearbyRailMode(true, false)).toBe('group');
    expect(nearbyRailMode(false, true)).toBe('meeting');
    expect(nearbyRailMode(false, false)).toBe('city');
  });

  it('groupNearbyItems giữ thứ tự server, tối đa limit, khoảng cách tính từ tâm', () => {
    const pois = [poi('1', 1), poi('2', 2), poi('3', 3)];
    const items = groupNearbyItems(pois, CENTER, null, 2);
    expect(items.map((i) => i.key)).toEqual(['osm:node/1', 'osm:node/2']);
    expect(items[0].distanceKm).toBeGreaterThan(0.09);
    expect(items[0].distanceKm).toBeLessThan(0.13);
  });

  const nearbyProp = {
    pois: [],
    status: 'ready' as const,
    origin: { lat: 10.77, lng: 106.7 },
    hasOrigin: true,
  };
  const railsProps = {
    room: room(),
    places: [] as Place[],
    members: [] as Member[],
    isHost: false,
    onOpenItem: () => {},
    onOpenPlace: () => {},
    onAddItem: () => {},
    addingKeys: new Set<string>(),
  };

  it('DiscoveryRails: có tâm → tiêu đề "Gần cả nhóm" và quán của server; không tâm → "Gần điểm hẹn"', () => {
    const withCenter = renderToStaticMarkup(
      <DiscoveryRails {...railsProps} source={{ nearby: nearbyProp, groupCenter: groupCenter(), peers: {} }} />,
    );
    expect(withCenter).toContain('Gần cả nhóm');
    expect(withCenter).not.toContain('Gần điểm hẹn');
    expect(withCenter).toContain('Quán 1');

    const without = renderToStaticMarkup(
      <DiscoveryRails
        {...railsProps}
        source={{ nearby: { ...nearbyProp, pois: [poi('9', 1)] }, groupCenter: null, peers: {} }}
      />,
    );
    expect(without).toContain('Gần điểm hẹn');
    expect(without).not.toContain('Gần cả nhóm');
  });

  it('DiscoveryRails: <2 vị trí (available=false) giữ nguyên dải cũ', () => {
    const html = renderToStaticMarkup(
      <DiscoveryRails
        {...railsProps}
        source={{
          nearby: { ...nearbyProp, pois: [poi('9', 1)] },
          groupCenter: groupCenter({ available: false, center: null, member_count: 1, nearby_pois: [] }),
          peers: {},
        }}
      />,
    );
    expect(html).toContain('Gần điểm hẹn');
  });
});

describe('GroupCenterWidget', () => {
  it('ẩn khi chưa có tâm hoặc <2 vị trí', () => {
    const html = (gc: GroupCenterResponse | null) =>
      renderToStaticMarkup(<GroupCenterWidget variant="map" source={{ groupCenter: gc }} />);
    expect(html(null)).toBe('');
    expect(html(groupCenter({ member_count: 1 }))).toBe('');
    expect(html(groupCenter({ available: false, center: null }))).toBe('');
  });

  it('thu gọn: chip "Trung tâm nhóm: khu vực · N người", aria-expanded=false, không có thẻ', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" source={{ groupCenter: groupCenter() }} />,
    );
    expect(html).toContain('Trung tâm nhóm: Q3 – Phú Nhuận · 3 người');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('center-card');
    // Góc trái dưới (tránh nút zoom bên phải)
    expect(html).toContain('left-3');
    expect(html).toContain('bottom-3');
  });

  it('chủ phòng: đẩy lên trên nút "Đặt điểm hẹn" ở góc trái dưới', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" aboveHostButton source={{ groupCenter: groupCenter() }} />,
    );
    expect(html).toContain('bottom-[68px]');
  });

  it('mở rộng: tóm tắt, số quán gần tâm, Xem quán gần đây, Vì sao?, Thu lại; thẻ rộng 320px', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" defaultExpanded source={{ groupCenter: groupCenter() }} />,
    );
    expect(html).toContain('center-card');
    expect(html).toContain('w-80');
    expect(html).toContain('cả nhóm đang ở quanh Q3 – Phú Nhuận');
    expect(html).toContain('3 quán trong bán kính');
    expect(html).toContain('Xem quán gần đây');
    expect(html).toContain('Vì sao?');
    expect(html).toContain('Thu lại');
  });

  it('mở rộng khi vòng tròn đang bật: nút đổi thành "Ẩn vòng tròn" (aria-pressed)', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" defaultExpanded source={{ groupCenter: groupCenter(), showRadius: true }} />,
    );
    expect(html).toContain('Ẩn vòng tròn');
    expect(html).toContain('aria-pressed="true"');
  });

  it('không có quán trong bán kính → câu "Chưa có quán nào"', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" defaultExpanded source={{ groupCenter: groupCenter({ nearby_pois: [] }) }} />,
    );
    expect(html).toContain('Chưa có quán nào trong bán kính');
  });

  it('mobile (inline): chip trong dòng chảy, thẻ mở rộng là Sheet (chưa mở thì không render nội dung)', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="inline" source={{ groupCenter: groupCenter() }} />,
    );
    expect(html).toContain('data-variant="inline"');
    expect(html).toContain('center-chip');
    expect(html).not.toContain('center-body');
  });

  it('toạ độ tâm không bao giờ nằm trong markup', () => {
    const html = renderToStaticMarkup(
      <GroupCenterWidget variant="map" defaultExpanded source={{ groupCenter: groupCenter() }} />,
    );
    expect(html).not.toContain(String(CENTER.lat));
    expect(html).not.toContain(String(CENTER.lng));
  });
});

describe('WhyPanel', () => {
  it('đóng: chỉ có liên kết "Vì sao?" (aria-expanded=false), không lộ nội dung', () => {
    const html = renderToStaticMarkup(
      <WhyPanel title="Vì sao quán này?" source="ESTIMATE">
        <p>Nội dung</p>
      </WhyPanel>,
    );
    expect(html).toContain('Vì sao?');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('Nội dung');
  });

  it('nhãn tuỳ chỉnh được; nguồn ghi đúng chữ ở cả hai ngôn ngữ', () => {
    expect(vi.algo.why.sourceEstimate).toBe('Ước lượng · xe máy');
    expect(vi.algo.why.sourceGoogle).toBe('Google Maps');
    expect(en.algo.why.sourceEstimate).toBe('Estimate · motorbike');
    expect(en.algo.why.sourceGoogle).toBe('Google Maps');
    const html = renderToStaticMarkup(
      <WhyPanel title="t" label="Xem lý do">
        x
      </WhyPanel>,
    );
    expect(html).toContain('Xem lý do');
  });
});

/* ---------- Xuất phát từ đâu? ---------- */

describe('OriginSetting', () => {
  const me = (over: Partial<Member>): Member => ({ ...mockGuestMember, ...over });

  it('originStatus theo cờ has_origin (không đọc toạ độ)', () => {
    expect(originStatus(null)).toBe('none');
    expect(originStatus(me({ has_origin: false }))).toBe('none');
    expect(originStatus(me({ has_origin: true }))).toBe('shared');
  });

  it('OriginRow: chưa chia sẻ → "Chưa chia sẻ"', () => {
    const html = renderToStaticMarkup(<OriginRow onOpen={() => {}} source={{ member: me({ has_origin: false }) }} />);
    expect(html).toContain('Xuất phát từ');
    expect(html).toContain('Chưa chia sẻ');
    expect(html).toContain('data-shared="false"');
  });

  it('OriginRow: đã chia sẻ → "Đã chia sẻ"; có tên nơi vừa chọn thì hiện tên đó', () => {
    const shared = me({ has_origin: true });
    expect(renderToStaticMarkup(<OriginRow onOpen={() => {}} source={{ member: shared }} />)).toContain('Đã chia sẻ');
    const html = renderToStaticMarkup(<OriginRow onOpen={() => {}} source={{ member: shared, label: 'Bình Thạnh' }} />);
    expect(html).toContain('Bình Thạnh');
    expect(html).toContain('data-shared="true"');
  });

  it('tâm tìm kiếm: điểm hẹn của phòng, không có thì tâm thành phố', () => {
    expect(searchCenter({ origin_lat: 10.8, origin_lng: 106.7 })).toEqual({ lat: 10.8, lng: 106.7 });
    const hn = searchCenter({ city: 'HN' });
    expect(hn.lat).toBeGreaterThan(20);
  });

  it('MemberList: chấm "đã chia sẻ" chỉ cho người có has_origin, không hiện nơi nào', () => {
    const html = renderToStaticMarkup(
      <MemberList
        members={[
          me({ id: 'a', nickname: 'An', has_origin: true }),
          me({ id: 'b', nickname: 'Bình', has_origin: false }),
        ]}
      />,
    );
    expect(html.match(/data-testid="origin-dot"/g)).toHaveLength(1);
    expect(html).toContain('Đã chia sẻ nơi xuất phát');
  });
});

/* ---------- Store + MSW: riêng tư (CR-11) ---------- */

describe('đặt/xoá vị trí qua MSW và store', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    resetMockDb();
    tokenStorage.clearAll();
  });
  afterAll(() => server.close());

  it('updateMyOrigin: currentMember có toạ độ của CHÍNH MÌNH; xoá thì cờ tắt', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    useRoomStore.setState({ currentMember: mockHostMember, members: [mockHostMember, mockGuestMember] });
    await useRoomStore.getState().updateMyOrigin(mockRoom.id, { lat: 10.762, lng: 106.682 });
    const after = useRoomStore.getState().currentMember;
    expect(after?.has_origin).toBe(true);
    expect(after?.origin_lat).toBeCloseTo(10.762, 3);
    expect(useRoomStore.getState().members.find((m) => m.id === mockHostMember.id)?.has_origin).toBe(true);

    await useRoomStore.getState().updateMyOrigin(mockRoom.id, null);
    expect(useRoomStore.getState().currentMember?.has_origin).toBe(false);
    expect(useRoomStore.getState().currentMember?.origin_lat).toBeNull();
  });

  it('applyMemberUpdated: cập nhật cờ của người khác mà không thêm toạ độ', () => {
    useRoomStore.setState({ currentMember: mockHostMember, members: [mockHostMember, mockGuestMember] });
    useRoomStore.getState().applyMemberUpdated(mockGuestMember.id, true);
    const guest = useRoomStore.getState().members.find((m) => m.id === mockGuestMember.id) as unknown as Record<string, unknown>;
    expect(guest.has_origin).toBe(true);
    expect('origin_lat' in guest).toBe(false);
    expect('origin_lng' in guest).toBe(false);
  });

  it('quét payload: sau khi hai người chia sẻ, không phản hồi nào chứa toạ độ của người kia', async () => {
    const hostPoint = { lat: 10.7626123, lng: 106.6820456 };
    const guestPoint = { lat: 10.795079, lng: 106.721832 };
    const base = `http://localhost/api/v1/rooms/${mockRoom.id}`;
    const hdr = (token: string) => ({ 'X-Member-Token': token, 'Content-Type': 'application/json' });
    const patch = (token: string, p: { lat: number; lng: number }) =>
      fetch(`${base}/members/me`, {
        method: 'PATCH',
        headers: hdr(token),
        body: JSON.stringify({ origin_lat: p.lat, origin_lng: p.lng }),
      });
    await patch(MOCK_HOST_TOKEN, hostPoint);
    await patch(MOCK_MEMBER_TOKEN, guestPoint);

    const leaks = (body: string, p: { lat: number; lng: number }) =>
      body.includes(String(p.lat)) || body.includes(String(p.lng));

    // Người xem là khách: không được thấy toạ độ của chủ phòng ở bất kỳ đâu
    const guestViews = await Promise.all([
      fetch(base, { headers: hdr(MOCK_MEMBER_TOKEN) }),
      fetch(`${base}/group-center`, { headers: hdr(MOCK_MEMBER_TOKEN) }),
      fetch(`${base}/places`, { headers: hdr(MOCK_MEMBER_TOKEN) }),
    ]);
    for (const res of guestViews) {
      const body = await res.text();
      expect(leaks(body, hostPoint)).toBe(false);
    }
    // Phản hồi `members/me` của chủ phòng chỉ có toạ độ của chủ phòng
    const hostMe = await (await fetch('http://localhost/api/v1/members/me', { headers: hdr(MOCK_HOST_TOKEN) })).text();
    expect(leaks(hostMe, guestPoint)).toBe(false);
    // Tâm nhóm đã làm tròn: không trùng toạ độ gốc của ai
    const gc = (await (await fetch(`${base}/group-center`, { headers: hdr(MOCK_MEMBER_TOKEN) })).json()) as GroupCenterResponse;
    expect(gc.available).toBe(true);
    expect(String(gc.center?.lat).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
    expect(gc.center?.lat).not.toBe(hostPoint.lat);
  });

  it('409 PLACE_LIMIT_REACHED: phòng mới giới hạn 2 → quán thứ 3 bị từ chối kèm {limit, used}', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    const base = `http://localhost/api/v1/rooms/${mockRoom.id}`;
    const hdr = { 'X-Member-Token': MOCK_HOST_TOKEN, 'Content-Type': 'application/json' };
    await fetch(base, { method: 'PATCH', headers: hdr, body: JSON.stringify({ max_places_per_member: 1 }) });
    const post = (name: string) =>
      fetch(`${base}/places`, { method: 'POST', headers: hdr, body: JSON.stringify({ name, category: 'FOOD' }) });
    // Quán đầu có thể được (nếu chủ phòng chưa có quán nào) hoặc bị chặn; quán sau chắc chắn vượt hạn mức 1
    await post('Quán thứ nhất');
    const res = await post('Quán vượt hạn mức');
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; details: { limit: number; used: number } } };
    expect(body.error.code).toBe('PLACE_LIMIT_REACHED');
    expect(parseLimitError({ code: body.error.code, details: body.error.details })).toEqual({
      limit: 1,
      used: body.error.details.used,
    });
    expect(body.error.details.used).toBeGreaterThanOrEqual(1);
  });
});

/* ---------- i18n ---------- */

describe('i18n algo.*', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('algo.* đủ khoá ở cả hai ngôn ngữ, không chuỗi rỗng', () => {
    expect(keys(en.algo as unknown as Record<string, unknown>).sort()).toEqual(
      keys(vi.algo as unknown as Record<string, unknown>).sort(),
    );
    for (const k of keys(vi.algo as unknown as Record<string, unknown>)) {
      const get = (o: unknown) => k.split('.').reduce((a, p) => (a as Record<string, unknown>)[p], o) as string;
      expect(get(vi.algo).length).toBeGreaterThan(0);
      expect(get(en.algo).length).toBeGreaterThan(0);
    }
  });

  it('lỗi PLACE_LIMIT_REACHED có câu dịch VI và EN', () => {
    expect(vi.errors.PLACE_LIMIT_REACHED).toBeTruthy();
    expect(en.errors.PLACE_LIMIT_REACHED).toBeTruthy();
  });
});
