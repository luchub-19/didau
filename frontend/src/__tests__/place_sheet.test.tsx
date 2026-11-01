import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { MOCK_HOST_TOKEN, mockRoom } from '../mocks/mockData';
import { usePlaceStore } from '../store/usePlaceStore';
import { useMapStore } from '../store/useMapStore';
import { PlaceDetail } from '../components/places/PlaceDetail';
import { GooglePlaceCard } from '../components/map/GooglePlaceCard';
import { PlaceRow } from '../components/places/PlaceRow';
import { loadPlacesUiKit, resetPlacesUiKitLoader } from '../services/google/loadPlacesUiKit';
import type { Place, Poi, Room } from '../types';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  usePlaceStore.getState().reset();
  useMapStore.getState().reset();
  resetPlacesUiKitLoader();
  if (typeof document !== 'undefined') {
    document.querySelectorAll('script[data-gmp-places]').forEach((s) => s.remove());
  }
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  resetPlacesUiKitLoader();
  if (typeof document !== 'undefined') {
    document.querySelectorAll('script[data-gmp-places]').forEach((s) => s.remove());
  }
});

afterAll(() => {
  server.close();
});

const samplePoi: Poi = {
  external_id: 'osm:node/1001',
  name: 'Phở Hòa Pasteur',
  category: 'FOOD',
  lat: 10.785,
  lng: 106.69,
  address: '260C Pasteur, P. Võ Thị Sáu, Q.3',
  cuisine: 'vietnamese',
  opening_hours_raw: 'Mo-Su 06:00-22:30',
  open_minute: 360,
  close_minute: 1350,
};

const sampleRoom: Room = {
  ...mockRoom,
  origin_lat: 10.7769,
  origin_lng: 106.7009,
};

describe('T-28 (T-71 thay PlaceSheet bằng PlaceDetail): "Thêm vào lựa chọn" & GooglePlaceCard', () => {
  describe('1. usePlaceStore.addPlaceFromPoi', () => {
    it('thêm POI vào chuyến đi tạo đúng payload (external_id, toạ độ, category, giờ, cuisine)', async () => {
      const added = await usePlaceStore.getState().addPlaceFromPoi(sampleRoom.id, samplePoi);

      expect(added.id).toBeDefined();
      expect(added.name).toBe(samplePoi.name);
      expect(added.category).toBe('FOOD');
      expect(added.latitude).toBe(samplePoi.lat);
      expect(added.longitude).toBe(samplePoi.lng);
      expect(added.external_id).toBe(samplePoi.external_id);
      expect(added.source).toBe('OSM');
      expect(added.address).toBe(samplePoi.address);
      expect(added.cuisine).toBe(samplePoi.cuisine);
      expect(added.open_minute).toBe(360);
      expect(added.close_minute).toBe(1350);
      expect(added.opening_hours_raw).toBe(samplePoi.opening_hours_raw);

      // Store được cập nhật
      const inStore = usePlaceStore.getState().places.find((p) => p.external_id === samplePoi.external_id);
      expect(inStore).toBeDefined();
      expect(inStore?.name).toBe(samplePoi.name);
    });

    it('thêm lại quán đã có (trùng external_id) không gọi API trùng và trả về quán hiện có', async () => {
      const first = await usePlaceStore.getState().addPlaceFromPoi(sampleRoom.id, samplePoi);
      const second = await usePlaceStore.getState().addPlaceFromPoi(sampleRoom.id, samplePoi);

      expect(second.id).toBe(first.id);
      expect(usePlaceStore.getState().places.length).toBe(1);
    });
  });

  describe('2. PlaceDetail (thay PlaceSheet)', () => {
    it('POI chưa vào phòng: đủ thông tin + nút "Thêm vào lựa chọn" ở thanh đáy', () => {
      const html = renderToStaticMarkup(
        <PlaceDetail variant="panel" room={sampleRoom} poi={samplePoi} onClose={() => {}} />,
      );

      expect(html).toContain('Phở Hòa Pasteur');
      expect(html).toContain('260C Pasteur, P. Võ Thị Sáu, Q.3');
      // 06:00–22:30 đóng trước 23:00 của phòng → cam "Đóng sớm"
      expect(html).toContain('Đóng sớm');
      expect(html).toContain('22:30');
      expect(html).toContain('Món Việt');
      expect(html).toContain('từ điểm hẹn');
      expect(html).toContain('Thêm vào lựa chọn');
      expect(html).toContain('Đánh giá bạn bè');
      expect(html).toContain('Chưa có đánh giá');
    });

    it('quán đã có trong phòng: thanh đáy Không / Muốn đi thay cho nút thêm', () => {
      const existingPlace: Place = {
        id: 'place-pho-hoa',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Phở Hòa Pasteur',
        category: 'FOOD',
        status: 'PROPOSED',
        external_id: samplePoi.external_id,
        source: 'OSM',
        latitude: samplePoi.lat,
        longitude: samplePoi.lng,
        estimated_cost: 80000,
        upvotes: 5,
        downvotes: 1,
        score: 4,
        current_user_vote: 1,
        created_at: new Date().toISOString(),
      };
      usePlaceStore.setState({ places: [existingPlace] });

      const html = renderToStaticMarkup(
        <PlaceDetail variant="panel" room={sampleRoom} poi={samplePoi} place={existingPlace} onClose={() => {}} />,
      );

      expect(html).toContain('data-testid="detail-vote-up"');
      expect(html).toContain('data-testid="detail-vote-down"');
      expect(html).toContain('5 người muốn đi');
      expect(html).not.toContain('Thêm vào lựa chọn');
    });
  });

  describe('3. GooglePlaceCard & loadPlacesUiKit', () => {
    it('khi không có key Google: không tạo script tag và loadPlacesUiKit trả về false', async () => {
      const loaded = await loadPlacesUiKit();
      expect(loaded).toBe(false);

      const script = typeof document !== 'undefined' ? document.querySelector('script[data-gmp-places]') : null;
      expect(script).toBeNull();
    });

    it('GooglePlaceCard render null khi không có browser key hoặc không tìm thấy match', () => {
      const html = renderToStaticMarkup(
        <GooglePlaceCard
          externalId="osm:node/1001"
          name="Phở Hòa Pasteur"
          lat={10.785}
          lng={106.69}
        />,
      );

      // Không có key -> thẻ bị ẩn, không phát sinh lỗi
      expect(html).toBe('');
    });
  });

  describe('5. PlaceRow: bỏ badge nguồn và nút "Xem trên bản đồ" (DESIGN gđ5 §5)', () => {
    const base: Place = {
      id: 'p-row',
      room_id: sampleRoom.id,
      submitted_by_id: 'host-1',
      name: 'Quán Cơm Tấm OSM',
      category: 'FOOD',
      status: 'PROPOSED',
      source: 'OSM',
      external_id: 'osm:node/12345',
      latitude: 10.77,
      longitude: 106.7,
      estimated_cost: 45000,
      upvotes: 2,
      downvotes: 0,
      score: 2,
      current_user_vote: 0,
      created_at: new Date().toISOString(),
    };

    it('quán OSM/Google không còn badge nguồn lẫn nút "Xem trên bản đồ"; thẻ mở quán là một nút có nhãn', () => {
      for (const place of [base, { ...base, source: 'GOOGLE' as const, google_place_id: 'ChIJ' }]) {
        const html = renderToStaticMarkup(<PlaceRow place={place} roomId={sampleRoom.id} />);
        expect(html).not.toContain('badge-source');
        expect(html).not.toContain('btn-view-on-map');
        expect(html).not.toContain('Mới đề xuất');
        expect(html).toContain('data-testid="place-row-open"');
        expect(html).toContain('Xem chi tiết Quán Cơm Tấm OSM');
      }
    });

    it('quán không toạ độ, không giá vẫn có thẻ đủ: tên + "chưa rõ giá", không khoảng cách', () => {
      const html = renderToStaticMarkup(
        <PlaceRow
          place={{ ...base, latitude: null, longitude: null, external_id: null, estimated_cost: 0 }}
          roomId={sampleRoom.id}
          room={{ origin_lat: 10.78, origin_lng: 106.7, budget_limit: null }}
        />,
      );
      expect(html).toContain('Quán Cơm Tấm OSM');
      expect(html).toContain('chưa rõ giá');
      expect(html).not.toContain(' km');
    });
  });
});
