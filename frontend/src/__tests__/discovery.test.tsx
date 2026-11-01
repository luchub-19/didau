import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll } from 'vitest';
import type { Member, Place, Poi, Room } from '../types';
import { loadCurated, type CuratedData } from '../room/curated';
import {
  curatedToPoi,
  fitsRoomAndBudget,
  findAddedPlace,
  groupWatching,
  isAdded,
  itemFromCurated,
  itemFromPoi,
  pickNearby,
  railOrigin,
  remainingBudget,
  type DiscoveryItem,
} from '../room/discovery';
import { DiscoveryCard } from '../components/places/DiscoveryCard';
import { DiscoveryRails, type DiscoveryRailsProps } from '../components/places/DiscoveryRails';
import type { NearbyPois } from '../components/map/NearbySuggestions';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const ORIGIN = { lat: 10.7769, lng: 106.7009 };

const poi = (id: string, over: Partial<Poi> = {}): Poi => ({
  external_id: `osm:node/${id}`,
  name: `Quán ${id}`,
  category: 'FOOD',
  lat: ORIGIN.lat + Number(id) * 0.001,
  lng: ORIGIN.lng,
  ...over,
});

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1',
  code: 'ABC123',
  title: 'Tối thứ sáu',
  event_date: '2026-11-07',
  status: 'OPEN',
  tie_break_strategy: 'MANUAL',
  created_at: '',
  updated_at: '',
  start_minute: 1020,
  end_minute: 1380,
  origin_lat: ORIGIN.lat,
  origin_lng: ORIGIN.lng,
  ...over,
} as Room);

const place = (id: string, over: Partial<Place> = {}): Place =>
  ({
    id,
    room_id: 'r1',
    submitted_by_id: 'm1',
    name: `Quán ${id}`,
    category: 'FOOD',
    status: 'PROPOSED',
    estimated_cost: 0,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    current_user_vote: 0,
    created_at: '',
    ...over,
  }) as Place;

const member = (id: string): Member =>
  ({ id, room_id: 'r1', nickname: `Bạn ${id}`, role: 'MEMBER', is_active: true, joined_at: '' }) as Member;

let data: CuratedData;
beforeAll(async () => {
  data = await loadCurated();
});

describe('railOrigin / remainingBudget', () => {
  it('có điểm hẹn → dùng nó; chưa có → tâm thành phố và hasOrigin=false', () => {
    expect(railOrigin(room())).toEqual({ origin: ORIGIN, hasOrigin: true });
    const none = railOrigin(room({ origin_lat: null, origin_lng: null, city: 'HCM' }));
    expect(none.hasOrigin).toBe(false);
    expect(none.origin.lat).toBeCloseTo(10.7769, 3);
  });

  it('ngân sách còn lại: không đặt/0 → null (không giới hạn)', () => {
    expect(remainingBudget({ budget_limit: null })).toBeNull();
    expect(remainingBudget({ budget_limit: 0 })).toBeNull();
    expect(remainingBudget({ budget_limit: 300000 })).toBe(300000);
  });
});

describe('pickNearby (dải 1)', () => {
  it('gần → xa, ưu tiên mỗi danh mục một quán trước, tối đa limit', () => {
    const pois = [
      poi('1'),
      poi('2'),
      poi('3', { category: 'DRINK' }),
      poi('4', { category: 'ENTERTAINMENT' }),
      poi('5'),
    ];
    const picked = pickNearby(pois, ORIGIN, 3);
    expect(picked.map((p) => p.category).sort()).toEqual(['DRINK', 'ENTERTAINMENT', 'FOOD']);
    expect(picked.map((p) => p.external_id)).toEqual(['osm:node/1', 'osm:node/3', 'osm:node/4']);
  });

  it('thiếu danh mục thì lấp bằng quán gần nhất còn lại; rỗng → []', () => {
    expect(pickNearby([poi('1'), poi('2'), poi('3')], ORIGIN, 3)).toHaveLength(3);
    expect(pickNearby([], ORIGIN)).toEqual([]);
  });
});

describe('✓ đã thêm', () => {
  it('khớp external_id', () => {
    expect(isAdded(poi('7'), [place('p', { external_id: 'osm:node/7' })])).toBe(true);
    expect(isAdded(poi('7'), [place('p', { external_id: 'osm:node/8' })])).toBe(false);
  });

  it('không có external_id thì khớp tên (bỏ dấu) + toạ độ ≤ 50 m', () => {
    const p = poi('9', { name: 'Cà Phê Muối' });
    const near = place('p', { name: 'ca phe muoi', latitude: p.lat + 0.0001, longitude: p.lng });
    const far = place('q', { name: 'ca phe muoi', latitude: p.lat + 0.01, longitude: p.lng });
    expect(findAddedPlace(p, [near])?.id).toBe('p');
    expect(findAddedPlace(p, [far])).toBeNull();
  });
});

describe('fitsRoomAndBudget (dải 3)', () => {
  const item = (id: string, open: number | null, close: number | null, price: number | null): DiscoveryItem => ({
    ...itemFromPoi(poi(id, { open_minute: open, close_minute: close }), ORIGIN, null),
    priceVnd: price,
  });
  const r = room({ budget_limit: null });

  it('chỉ giữ quán đã biết giờ và mở trọn khung 17:00–23:00; qua đêm vẫn hợp', () => {
    const items = [
      item('1', 600, 1440 + 120, null), // 10:00–02:00 hợp
      item('2', 1080, 1380, null), // 18:00 mở muộn → loại
      item('3', 600, 1200, null), // đóng 20:00 sớm → loại
      item('4', null, null, null), // thiếu giờ → không khẳng định → loại
      item('5', 960, 1380, null), // 16:00–23:00 hợp
    ];
    const out = fitsRoomAndBudget(items, r).map((i) => i.key);
    expect(out).toEqual(['osm:node/1', 'osm:node/5']);
  });

  it('có ngân sách: giá phải biết và ≤ ngân sách; không có ngân sách thì không lọc giá', () => {
    const items = [
      item('1', 600, 1400, 80000),
      item('2', 600, 1400, 250000),
      item('3', 600, 1400, null),
    ];
    const withBudget = fitsRoomAndBudget(items, room({ budget_limit: 100000 })).map((i) => i.key);
    expect(withBudget).toEqual(['osm:node/1']);
    expect(fitsRoomAndBudget(items, r)).toHaveLength(3);
  });

  it('khung giờ phòng tuỳ chỉnh được tôn trọng', () => {
    const items = [item('1', 600, 1200, null)]; // 10:00–20:00
    expect(fitsRoomAndBudget(items, room({ start_minute: 660, end_minute: 1140 }))).toHaveLength(1);
    expect(fitsRoomAndBudget(items, r)).toHaveLength(0);
  });
});

describe('groupWatching (dải 4)', () => {
  const places = [place('p1'), place('p2')];
  const members = ['me', 'a', 'b', 'c', 'd'].map(member);
  const at = Date.now();
  const watch = (placeId: string) => ({ focus: { kind: 'place' as const, place_id: placeId }, at });

  it('chỉ mình mình online → rỗng', () => {
    expect(groupWatching({}, 'me', places, members)).toEqual({ online: 1, items: [] });
  });

  it('≥2 online và có người xem quán → hiện, kèm người xem', () => {
    const out = groupWatching({ a: watch('p1') }, 'me', places, members);
    expect(out.online).toBe(2);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].place.id).toBe('p1');
    expect(out.items[0].viewers.map((m) => m.id)).toEqual(['a']);
  });

  it('người chỉ rê con trỏ bản đồ / quán không còn trong danh sách → không có thẻ; mình không tự đếm', () => {
    const map = { a: { focus: { kind: 'map' as const, lng: 1, lat: 1 }, at } };
    expect(groupWatching(map, 'me', places, members).items).toEqual([]);
    expect(groupWatching({ a: watch('gone') }, 'me', places, members).items).toEqual([]);
    expect(groupWatching({ me: watch('p1') }, 'me', places, members).items).toEqual([]);
  });

  it('tối đa 3 avatar + "+N", quán nhiều người xem lên trước', () => {
    const peers = { a: watch('p2'), b: watch('p2'), c: watch('p2'), d: watch('p2'), me2: watch('p1') };
    const out = groupWatching(peers, 'me', places, [...members, member('me2')]);
    expect(out.items[0].place.id).toBe('p2');
    expect(out.items[0].shown).toHaveLength(3);
    expect(out.items[0].extra).toBe(1);
  });
});

describe('curatedToPoi / itemFromCurated', () => {
  it('giữ external_id OSM, bổ sung giờ từ POI bản đồ đã tải', () => {
    const entry = data.places[0];
    const loaded: Poi = { ...poi('1'), external_id: entry.external_id as string, open_minute: 600, close_minute: 1400 };
    const p = curatedToPoi(entry, loaded);
    expect(p.external_id).toBe(entry.external_id);
    expect(p.name).toBe(entry.name);
    expect(p.open_minute).toBe(600);
    const it = itemFromCurated(entry, ORIGIN, data, { [entry.external_id as string]: loaded });
    expect(it.priceVnd).toBe(entry.price_per_person);
    expect(it.poi.close_minute).toBe(1400);
  });
});

describe('DiscoveryCard', () => {
  const base = { name: 'Quán Nướng', category: 'FOOD' as const, thumb: null, meta: '1,2 km · 120.000 ₫', onOpen: () => {} };

  it('chưa thêm: nút ＋ (nhãn có tên quán); đã thêm: ✓ "Đã thêm", không còn nút ＋', () => {
    const open = renderToStaticMarkup(<DiscoveryCard {...base} added={false} onAdd={() => {}} />);
    expect(open).toContain('data-testid="discovery-add"');
    expect(open).toContain('Thêm Quán Nướng vào danh sách');
    expect(open).not.toContain('Đã thêm');
    const done = renderToStaticMarkup(<DiscoveryCard {...base} added onAdd={() => {}} />);
    expect(done).toContain('Đã thêm');
    expect(done).not.toContain('data-testid="discovery-add"');
  });
});

describe('DiscoveryRails', () => {
  const props = {
    room: room(),
    places: [] as Place[],
    members: [member('me'), member('a')],
    currentMemberId: 'me',
    isHost: true,
    onOpenItem: () => {},
    onOpenPlace: () => {},
    onAddItem: () => {},
    addingKeys: new Set<string>(),
  };
  // SSR đọc store ở trạng thái đầu → truyền dữ liệu qua `source` (cùng cách PlaceList nhận members/pulses)
  const nearbyOf = (
    pois: Poi[],
    status: 'pending' | 'ready' | 'empty',
    hasOrigin = true,
  ): NearbyPois => ({ pois: pickNearby(pois, ORIGIN), status, origin: ORIGIN, hasOrigin });
  const render = (over: Record<string, unknown> = {}, source: DiscoveryRailsProps['source'] = {}) =>
    renderToStaticMarkup(<DiscoveryRails {...props} {...over} source={source} />);
  const withPois = (pois: Poi[]) => ({
    nearby: nearbyOf(pois, pois.length ? 'ready' : 'empty'),
    poisById: Object.fromEntries(pois.map((p) => [p.external_id, p])),
  });

  it('bản đồ chưa tải xong → dải 1 là skeleton (aria-busy), chưa có thẻ', () => {
    const html = render({}, { nearby: nearbyOf([], 'pending'), poisById: {} });
    expect(html).toContain('data-testid="rail-nearby"');
    expect(html).toContain('aria-busy="true"');
    // Dải 1 chưa có thẻ nào (các dải tuyển chọn bên dưới vẫn có thẻ riêng)
    const nearbySection = html.slice(html.indexOf('data-testid="rail-nearby"'), html.indexOf('</section>'));
    expect(nearbySection).not.toContain('data-testid="discovery-card"');
  });

  it('dải rỗng bị ẩn cả tiêu đề: đã tải mà không có quán → không có "Gần điểm hẹn"', () => {
    const html = render({}, { ...withPois([]), peers: {} });
    expect(html).not.toContain('data-testid="rail-nearby"');
    expect(html).not.toContain('Gần điểm hẹn');
    expect(html).not.toContain('data-testid="rail-watching"');
  });

  it('có quán → dải "Gần điểm hẹn" với thẻ; quán đã trong danh sách hiện ✓ Đã thêm', () => {
    const p = poi('1');
    const html = render(
      { places: [place('x', { external_id: p.external_id })] },
      withPois([p, poi('2', { category: 'DRINK' })]),
    );
    expect(html).toContain('Gần điểm hẹn');
    expect(html).toContain('Quán 1');
    expect(html).toContain('Đã thêm');
    expect(html).toContain('data-testid="discovery-add"'); // quán 2 chưa thêm
  });

  it('chưa có điểm hẹn: dải 1 ghi "Quanh trung tâm thành phố" + nhắc; host có nút đặt, khách chỉ chữ', () => {
    const src = { nearby: nearbyOf([poi('1')], 'ready', false), poisById: {} };
    const host = render({ isHost: true, onSetOrigin: () => {} }, src);
    expect(host).toContain('Quanh trung tâm thành phố');
    expect(host).toContain('Đặt điểm hẹn để tính khoảng cách');
    expect(host).toContain('Đặt ở giữa bản đồ');
    const guest = render({ isHost: false, onSetOrigin: () => {} }, src);
    expect(guest).toContain('Chờ chủ phòng đặt điểm hẹn');
    expect(guest).not.toContain('Đặt ở giữa bản đồ');
  });

  it('bộ sưu tập: có chip chủ đề từ dữ liệu tuyển chọn', () => {
    const html = render({}, withPois([poi('1')]));
    expect(html).toContain('data-testid="rail-collections"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('nhóm đang để ý: chỉ hiện khi ≥2 online và có quán đang được xem', () => {
    const places = [place('p1', { name: 'Quán Chung' })];
    const base = withPois([poi('1')]);
    expect(render({ places }, { ...base, peers: {} })).not.toContain('Nhóm đang để ý');
    const peers = { a: { focus: { kind: 'place' as const, place_id: 'p1' }, at: Date.now() } };
    const html = render({ places }, { ...base, peers });
    expect(html).toContain('Nhóm đang để ý');
    expect(html).toContain('Quán Chung');
    expect(html).toContain('data-testid="discovery-viewers"');
  });
});

describe('i18n discovery: đủ vi + en, cùng bộ khoá', () => {
  const keys = (o: Record<string, unknown>, pre = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${pre}${k}.`) : [`${pre}${k}`],
    );
  it('khoá trùng nhau và không rỗng', () => {
    const a = keys(vi.discovery as unknown as Record<string, unknown>).sort();
    const b = keys(en.discovery as unknown as Record<string, unknown>).sort();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
