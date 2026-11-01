// T-71: trang chi tiết quán — ghép tầng dữ liệu, giờ mở so khung giờ phòng, phím ↑ ↓/Esc, ?place= + Back,
// thanh vote dính đáy. Không có jsdom: logic tách hàm thuần (room/placeView.ts, shell/useRoomTab.ts), giao diện
// kiểm bằng markup tĩnh.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import '../i18n';
import i18n from 'i18next';
import { PlaceDetail } from '../components/places/PlaceDetail';
import { PhotoGallery } from '../components/places/PhotoGallery';
import { MapEmbed } from '../components/map/MapEmbed';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { useMapStore } from '../store/useMapStore';
import { loadCurated, type CuratedData, type CuratedEntry } from '../room/curated';
import {
  adjacentPlaceId,
  detailKeyAction,
  detailTiers,
  detailVoteAction,
  hoursFit,
  mapEmbedUrl,
  placeThumb,
} from '../room/placeView';
import { placeFromSearch, placeUrlStep, searchWithPlace } from '../components/shell/useRoomTab';
import { mockRoom } from '../mocks/mockData';
import type { Place, Room } from '../types';

let curated: CuratedData;

beforeAll(async () => {
  curated = await loadCurated();
});

beforeEach(() => {
  usePlaceStore.getState().reset();
  useMapStore.getState().reset();
  void i18n.changeLanguage('vi');
});

afterEach(() => {
  void i18n.changeLanguage('vi');
});

const room: Room = { ...mockRoom, start_minute: 1020, end_minute: 1380, origin_lat: 10.7769, origin_lng: 106.7009 };

function makePlace(over: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    room_id: room.id,
    submitted_by_id: 'm-host',
    name: 'Quán thử',
    category: 'FOOD',
    status: 'PROPOSED',
    estimated_cost: 0,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    current_user_vote: 0,
    created_at: '2026-11-01T10:00:00Z',
    ...over,
  };
}

/* ---------- Ghép tầng dữ liệu ---------- */

describe('detailTiers: tuyển chọn → UI Kit → Embed → OSM', () => {
  const entry = { id: 'x' } as CuratedEntry;
  const base = { canMatchGoogle: true, canEmbed: true };

  it('1. quán tuyển chọn có ảnh, không key: ảnh tuyển chọn, không tầng Google', () => {
    const t = detailTiers({ ...base, curated: entry, curatedPhotoCount: 3, hasKey: false, uiKit: 'pending' });
    expect(t).toEqual({ curated: entry, photos: 'curated', tryUiKit: false, embed: false });
  });

  it('2. có key: thử UI Kit trước, chưa render Embed khi UI Kit đang tải hoặc đã xong', () => {
    const pending = detailTiers({ ...base, curated: null, curatedPhotoCount: 0, hasKey: true, uiKit: 'pending' });
    expect(pending.tryUiKit).toBe(true);
    expect(pending.embed).toBe(false);
    const ready = detailTiers({ ...base, curated: null, curatedPhotoCount: 0, hasKey: true, uiKit: 'ready' });
    expect(ready.embed).toBe(false);
  });

  it('3. có key, UI Kit hỏng/quá 4 s hoặc không khớp được: lùi xuống iframe Embed', () => {
    const failed = detailTiers({ ...base, curated: null, curatedPhotoCount: 0, hasKey: true, uiKit: 'failed' });
    expect(failed).toMatchObject({ tryUiKit: true, embed: true });
    const noMatch = detailTiers({
      curated: null,
      curatedPhotoCount: 0,
      hasKey: true,
      canMatchGoogle: false,
      canEmbed: true,
      uiKit: 'pending',
    });
    expect(noMatch).toMatchObject({ tryUiKit: false, embed: true });
  });

  it('4. quán OSM trơ trọi, không key: chỉ minh hoạ danh mục + OSM, không tầng 2–3', () => {
    const t = detailTiers({ ...base, curated: null, curatedPhotoCount: 0, hasKey: false, uiKit: 'failed' });
    expect(t).toEqual({ curated: null, photos: 'illustration', tryUiKit: false, embed: false });
  });

  it('quán tuyển chọn nhưng chưa có file ảnh → vẫn minh hoạ (giới thiệu vẫn dùng)', () => {
    const t = detailTiers({ ...base, curated: entry, curatedPhotoCount: 0, hasKey: false, uiKit: 'pending' });
    expect(t.photos).toBe('illustration');
    expect(t.curated).toBe(entry);
  });

  it('mapEmbedUrl: không key → null; ưu tiên place_id, không thì tên + địa chỉ, kèm toạ độ', () => {
    expect(mapEmbedUrl('', { name: 'A' }, 'vi')).toBeNull();
    const byId = mapEmbedUrl('K', { name: 'A', google_place_id: 'ChIJ1', latitude: 10, longitude: 106 }, 'en');
    expect(byId).toContain('maps/embed/v1/place?');
    expect(byId).toContain('q=place_id%3AChIJ1');
    expect(byId).toContain('language=en');
    expect(byId).toContain('center=10%2C106');
    const byName = mapEmbedUrl('K', { name: 'Phở A', address: '1 Lê Lợi' }, 'vi');
    expect(decodeURIComponent(byName ?? '').replace(/\+/g, ' ')).toContain('q=Phở A, 1 Lê Lợi');
  });

  it('placeThumb nối ảnh tuyển chọn khi có file trong manifest, thiếu thì minh hoạ', () => {
    const entry0 = curated.places[0];
    const place = { category: entry0.category, name: entry0.name, external_id: entry0.external_id };
    expect(placeThumb(place, curated).src).toBeNull(); // manifest đang rỗng
    const withFile: CuratedData = { places: curated.places, files: new Set([entry0.photos[0].file]) };
    expect(placeThumb(place, withFile).src).toBe(`/curated/${entry0.photos[0].file.replace(/\.webp$/, '.thumb.webp')}`);
    expect(placeThumb({ category: 'DRINK' }, withFile).src).toBeNull();
  });
});

/* ---------- Giờ mở so khung giờ phòng ---------- */

describe('hoursFit: giờ mở so khung 17:00–23:00 của phòng', () => {
  it('phủ cả khung → xanh, giờ đóng để hiện "tới …"', () => {
    expect(hoursFit({ open_minute: 600, close_minute: 1410 }, room)).toEqual({ kind: 'fits', close: 1410 });
  });
  it('đóng trước end_minute → cam', () => {
    expect(hoursFit({ open_minute: 360, close_minute: 1350 }, room)).toEqual({ kind: 'closesEarly', close: 1350 });
  });
  it('mở sau start_minute → cam "mở muộn"', () => {
    expect(hoursFit({ open_minute: 1080, close_minute: 1439 }, room)).toEqual({ kind: 'opensLate', open: 1080 });
  });
  it('qua đêm (17:00–02:00) phủ khung; phòng tới 01:00 mà quán đóng 00:00 → cam', () => {
    expect(hoursFit({ open_minute: 1020, close_minute: 120 }, room)).toEqual({ kind: 'fits', close: 120 });
    const lateRoom = { start_minute: 1200, end_minute: 60 };
    expect(hoursFit({ open_minute: 600, close_minute: 0 }, lateRoom)).toEqual({ kind: 'closesEarly', close: 0 });
    expect(hoursFit({ open_minute: 1080, close_minute: 180 }, lateRoom)).toEqual({ kind: 'fits', close: 180 });
  });
  it('không rõ giờ → null (ẩn dòng); mở = đóng coi như cả ngày', () => {
    expect(hoursFit({ open_minute: null, close_minute: 1300 }, room)).toBeNull();
    expect(hoursFit({}, room)).toBeNull();
    expect(hoursFit({ open_minute: 0, close_minute: 0 }, room)?.kind).toBe('fits');
  });
  it('thiếu khung giờ phòng → dùng mặc định 17:00–23:00', () => {
    expect(hoursFit({ open_minute: 360, close_minute: 1350 }, null)?.kind).toBe('closesEarly');
  });
});

/* ---------- Phím ↑ ↓ / Esc ---------- */

describe('phím trong trang chi tiết', () => {
  const ctx = { focusInPanel: true, inTextField: false, otherDialogOpen: false };
  it('↑ ↓ chỉ khi focus trong panel và không ở ô nhập', () => {
    expect(detailKeyAction('ArrowDown', ctx)).toEqual({ kind: 'move', delta: 1 });
    expect(detailKeyAction('ArrowUp', ctx)).toEqual({ kind: 'move', delta: -1 });
    expect(detailKeyAction('ArrowDown', { ...ctx, focusInPanel: false })).toBeNull();
    expect(detailKeyAction('ArrowDown', { ...ctx, inTextField: true })).toBeNull();
    expect(detailKeyAction('ArrowDown', { ...ctx, modified: true })).toBeNull();
  });
  it('Esc đóng cả khi focus ngoài panel; nhường khi hộp thoại khác đang mở', () => {
    expect(detailKeyAction('Escape', { ...ctx, focusInPanel: false })).toEqual({ kind: 'close' });
    expect(detailKeyAction('Escape', { ...ctx, otherDialogOpen: true })).toBeNull();
    expect(detailKeyAction('Enter', ctx)).toBeNull();
  });
  it('quán trước/sau theo thứ tự danh sách, đứng yên ở hai đầu', () => {
    const order = ['a', 'b', 'c'];
    expect(adjacentPlaceId(order, 'b', 1)).toBe('c');
    expect(adjacentPlaceId(order, 'b', -1)).toBe('a');
    expect(adjacentPlaceId(order, 'c', 1)).toBeNull();
    expect(adjacentPlaceId(order, 'a', -1)).toBeNull();
    expect(adjacentPlaceId(order, 'zz', 1)).toBeNull();
  });
});

/* ---------- ?place= + Back ---------- */

describe('?place=<id> và nút Back', () => {
  it('đọc/ghi ?place= giữ các tham số khác', () => {
    expect(placeFromSearch('?tab=plan&place=p9')).toBe('p9');
    expect(placeFromSearch('?place=')).toBeNull();
    expect(placeFromSearch('')).toBeNull();
    expect(searchWithPlace('?tab=plan', 'p9')).toBe('?tab=plan&place=p9');
    expect(searchWithPlace('?tab=plan&place=p9', null)).toBe('?tab=plan');
    expect(searchWithPlace('?place=p9', null)).toBe('');
  });
  it('mở = push (Back đóng panel trước), đổi quán = replace, đóng = back nếu mục là của panel', () => {
    expect(placeUrlStep('?tab=explore', 'p1', false)).toEqual({ kind: 'push', search: '?tab=explore&place=p1' });
    expect(placeUrlStep('?place=p1', 'p2', true)).toEqual({ kind: 'replace', search: '?place=p2' });
    expect(placeUrlStep('?place=p1', null, true)).toEqual({ kind: 'back' });
    // Mục không do panel push (vd. đã đổi tab sau khi mở): thay tại chỗ, không rời phòng
    expect(placeUrlStep('?place=p1&tab=plan', null, false)).toEqual({ kind: 'replace', search: '?tab=plan' });
    // Back đã bỏ ?place= rồi đóng panel: không làm gì thêm
    expect(placeUrlStep('', null, false)).toBeNull();
    expect(placeUrlStep('?place=p1', 'p1', true)).toBeNull();
  });
});

/* ---------- Thanh vote dính đáy ---------- */

describe('thanh đáy: Không / Muốn đi, đã chốt → Chỉ đường', () => {
  it('bấm lại lựa chọn đang có = rút phiếu, còn lại = gửi phiếu', () => {
    expect(detailVoteAction(0, 1)).toEqual({ kind: 'cast', value: 1 });
    expect(detailVoteAction(1, 1)).toEqual({ kind: 'retract' });
    expect(detailVoteAction(1, -1)).toEqual({ kind: 'cast', value: -1 });
    expect(detailVoteAction(-1, -1)).toEqual({ kind: 'retract' });
  });

  it('quán trong phòng: hai nút, trạng thái nhấn theo phiếu của mình, số người muốn đi', () => {
    const place = makePlace({ upvotes: 3, score: 3, current_user_vote: 1 });
    usePlaceStore.setState({ places: [place] });
    const html = renderToStaticMarkup(<PlaceDetail variant="panel" room={room} place={place} onClose={() => {}} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="detail-vote-up"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="detail-vote-down"/);
    expect(html).toContain('3 người muốn đi');
    expect(html).toContain('quán trước / sau');
    expect(html).not.toContain('data-testid="detail-directions"');
  });

  it('khoá bình chọn → hai nút bị tắt', () => {
    const place = makePlace();
    const html = renderToStaticMarkup(
      <PlaceDetail variant="panel" room={room} place={place} onClose={() => {}} isVotingDisabled />,
    );
    expect(html).toMatch(/disabled=""[^>]*data-testid="detail-vote-up"/);
  });

  it('phòng FINALIZED: thay thanh vote bằng "Chỉ đường" (link Google Maps công khai)', () => {
    const place = makePlace({ status: 'ACCEPTED', latitude: 10.78, longitude: 106.7 });
    const html = renderToStaticMarkup(
      <PlaceDetail variant="screen" room={{ ...room, status: 'FINALIZED' }} place={place} onClose={() => {}} />,
    );
    expect(html).toContain('data-testid="detail-directions"');
    expect(html).toContain('https://www.google.com/maps/dir/?api=1&amp;destination=10.78%2C106.7');
    expect(html).toContain('Đã chốt');
    expect(html).not.toContain('data-testid="detail-vote-up"');
  });
});

/* ---------- Bố cục với dữ liệu khác nhau ---------- */

describe('PlaceDetail: đủ bố cục khi thiếu dữ liệu', () => {
  it('quán tuyển chọn: giới thiệu + nên thử theo ngôn ngữ, giá tuyển chọn, lời người đề xuất', async () => {
    const e = curated.places[0];
    const place = makePlace({
      name: e.name,
      external_id: e.external_id,
      latitude: e.lat,
      longitude: e.lng,
      notes: 'Rộng, hợp nhóm đông',
      submitted_by_id: 'm1',
    });
    useRoomStore.setState({ members: [{ id: 'm1', room_id: room.id, nickname: 'Minh', role: 'MEMBER', is_active: true, joined_at: '' }] });
    let html = renderToStaticMarkup(<PlaceDetail variant="panel" room={room} place={place} onClose={() => {}} />);
    expect(html).toContain('data-testid="detail-intro"');
    expect(html).toContain(e.intro.vi);
    expect(html).toContain(e.try.vi[0]);
    expect(html).toContain(`~${Math.round(e.price_per_person / 1000)}k/người`);
    expect(html).toContain('data-testid="detail-note"');
    expect(html).toContain('Minh');
    // Manifest ảnh rỗng → minh hoạ danh mục đầy khung, không lỗi
    expect(html).toContain('data-testid="gallery-illustration"');

    await i18n.changeLanguage('en');
    html = renderToStaticMarkup(<PlaceDetail variant="panel" room={room} place={place} onClose={() => {}} />);
    expect(html).toContain(e.intro.en);
    expect(html).toContain(e.try.en[0]);
    expect(html).toContain('/person');
    useRoomStore.setState({ members: [] });
  });

  it('quán OSM trơ trọi (không ảnh, giá, giờ, điểm hẹn, ghi chú): vẫn đủ khung, không khối Google', () => {
    const place = makePlace({ name: 'Quán vô danh' });
    const html = renderToStaticMarkup(
      <PlaceDetail variant="panel" room={{ ...room, origin_lat: null, origin_lng: null }} place={place} onClose={() => {}} />,
    );
    expect(html).toContain('Quán vô danh');
    expect(html).toContain('chưa rõ giá');
    expect(html).toContain('data-testid="gallery-illustration"');
    expect(html).not.toContain('data-testid="detail-hours"');
    expect(html).not.toContain('từ điểm hẹn');
    expect(html).not.toContain('data-testid="detail-intro"');
    expect(html).not.toContain('data-testid="detail-note"');
    expect(html).not.toContain('google-place-card');
    expect(html).not.toContain('map-embed');
    expect(html).toContain('data-testid="detail-bar"');
  });

  it('giờ mở hiện xanh khi phủ khung giờ phòng; giờ OSM thô khi không tách được', () => {
    const fits = renderToStaticMarkup(
      <PlaceDetail variant="panel" room={room} place={makePlace({ open_minute: 600, close_minute: 1410 })} onClose={() => {}} />,
    );
    expect(fits).toContain('data-fit="fits"');
    expect(fits).toContain('23:30');
    const raw = renderToStaticMarkup(
      <PlaceDetail variant="panel" room={room} place={makePlace({ opening_hours_raw: 'Mo-Fr 07:00-21:00; PH off' })} onClose={() => {}} />,
    );
    expect(raw).toContain('data-testid="detail-hours-raw"');
  });

  it('mobile (screen): nút Quay lại thay nút X, ảnh 280px; desktop (panel): 230px', () => {
    const place = makePlace();
    const screen = renderToStaticMarkup(<PlaceDetail variant="screen" room={room} place={place} onClose={() => {}} />);
    expect(screen).toContain('aria-label="Quay lại"');
    expect(screen).toContain('h-[280px]');
    expect(screen).toContain('aria-modal="true"');
    const panel = renderToStaticMarkup(<PlaceDetail variant="panel" room={room} place={place} onClose={() => {}} />);
    expect(panel).toContain('aria-label="Đóng"');
    expect(panel).toContain('h-[230px]');
  });
});

describe('PhotoGallery + MapEmbed', () => {
  it('nhiều ảnh: lazy, "1/N", nút sau; 1 ảnh: không chấm/đếm', () => {
    const photos = [
      { src: '/curated/a.webp', alt: 'A' },
      { src: '/curated/b.webp', alt: 'B' },
    ];
    const html = renderToStaticMarkup(<PhotoGallery photos={photos} category="FOOD" placeName="X" size="panel" />);
    expect(html.match(/loading="lazy"/g)?.length).toBe(2);
    expect(html).toContain('1/2');
    expect(html).toContain('aria-label="Ảnh sau"');
    expect(html).not.toContain('aria-label="Ảnh trước"');
    const one = renderToStaticMarkup(<PhotoGallery photos={photos.slice(0, 1)} category="FOOD" placeName="X" size="panel" />);
    expect(one).not.toContain('1/1');
  });

  it('MapEmbed: iframe lazy có title; src null → không render', () => {
    const html = renderToStaticMarkup(<MapEmbed src="https://www.google.com/maps/embed/v1/place?key=K&q=A" name="Quán A" />);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('title="Bản đồ Google: Quán A"');
    expect(renderToStaticMarkup(<MapEmbed src={null} name="A" />)).toBe('');
  });
});
