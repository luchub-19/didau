import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { MOCK_HOST_TOKEN, mockRoom, mockPois } from '../mocks/mockData';
import { usePlaceStore } from '../store/usePlaceStore';
import { useMapStore } from '../store/useMapStore';
import { PlaceSheet } from '../components/map/PlaceSheet';
import { GooglePlaceCard } from '../components/map/GooglePlaceCard';
import { NearbySuggestions } from '../components/map/NearbySuggestions';
import { PlaceCard } from '../components/places/PlaceCard';
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

describe('T-28: Frontend PlaceSheet, "Thêm vào lựa chọn" & GooglePlaceCard', () => {
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

  describe('2. PlaceSheet Component', () => {
    it('hiển thị đầy đủ thông tin quán mới và nút "+ Thêm vào lựa chọn"', () => {
      const html = renderToStaticMarkup(
        <PlaceSheet
          room={sampleRoom}
          poi={samplePoi}
          onClose={() => {}}
        />,
      );

      expect(html).toContain('Phở Hòa Pasteur');
      expect(html).toContain('260C Pasteur, P. Võ Thị Sáu, Q.3');
      expect(html).toContain('Mo-Su 06:00-22:30');
      expect(html).toContain('vietnamese');
      expect(html).toContain('từ điểm hẹn');
      expect(html).toContain('Thêm vào lựa chọn');
      expect(html).toContain('Đánh giá bạn bè');
      expect(html).toContain('Chưa có đánh giá');
    });

    it('khi quán đã có trong phòng, nút đổi thành "Đã trong lựa chọn" và hiển thị VoteButtons', () => {
      const existingPlace: Place = {
        id: 'place-pho-hoa',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Phở Hòa Pasteur',
        category: 'FOOD',
        status: 'ACCEPTED',
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

      // Đặt existingPlace vào store
      usePlaceStore.setState({ places: [existingPlace] });

      const html = renderToStaticMarkup(
        <PlaceSheet
          room={sampleRoom}
          poi={samplePoi}
          place={existingPlace}
          onClose={() => {}}
        />,
      );

      expect(html).toContain('Đã trong lựa chọn');
      expect(html).toContain('Điểm vote: 4');
      // Không còn nút thêm vào lựa chọn
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

  describe('4. NearbySuggestions Component', () => {
    it('khi phòng đã có quán (places > 0), không hiển thị gợi ý', () => {
      const existingPlace: Place = {
        id: 'p1',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Quán cũ',
        category: 'FOOD',
        status: 'PROPOSED',
        estimated_cost: 50000,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        current_user_vote: 0,
        created_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <NearbySuggestions
          room={sampleRoom}
          places={[existingPlace]}
          pois={mockPois}
          onSelectPoi={() => {}}
        />,
      );

      expect(html).toBe('');
    });

    it('khi phòng trống (places = 0), gợi ý tối đa 5 quán gần điểm hẹn kèm nút + Thêm', () => {
      const html = renderToStaticMarkup(
        <NearbySuggestions
          room={sampleRoom}
          places={[]}
          pois={mockPois}
          onSelectPoi={() => {}}
          onAddPoi={() => {}}
        />,
      );

      expect(html).toContain('Gợi ý quanh điểm hẹn');
      expect(html).toContain('Phòng chưa có địa điểm nào');
      expect(html).toContain('+ Thêm');
      // Chứa các POI mẫu gần Q.1 trong mockPois
      expect(html).toContain('km');
    });
  });

  describe('5. PlaceCard badges & "Xem trên bản đồ"', () => {
    it('hiển thị badge nguồn OSM và nút "Xem trên bản đồ" khi có toạ độ', () => {
      const osmPlace: Place = {
        id: 'p-osm',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Quán Cơm Tấm OSM',
        category: 'FOOD',
        status: 'PROPOSED',
        source: 'OSM',
        external_id: 'osm:node/12345',
        latitude: 10.77,
        longitude: 106.70,
        estimated_cost: 45000,
        upvotes: 2,
        downvotes: 0,
        score: 2,
        current_user_vote: 0,
        created_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <PlaceCard
          place={osmPlace}
          roomId={sampleRoom.id}
        />,
      );

      expect(html).toContain('OSM');
      expect(html).toContain('Xem trên bản đồ');
      expect(html).toContain('data-testid="badge-source-osm"');
      expect(html).toContain('data-testid="btn-view-on-map"');
    });

    it('hiển thị badge nguồn Google khi có google_place_id hoặc source GOOGLE', () => {
      const googlePlace: Place = {
        id: 'p-google',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Cafe Google Place',
        category: 'DRINK',
        status: 'ACCEPTED',
        source: 'GOOGLE',
        google_place_id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        latitude: 10.78,
        longitude: 106.71,
        estimated_cost: 65000,
        upvotes: 4,
        downvotes: 0,
        score: 4,
        current_user_vote: 1,
        created_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <PlaceCard
          place={googlePlace}
          roomId={sampleRoom.id}
        />,
      );

      expect(html).toContain('Google');
      expect(html).toContain('data-testid="badge-source-google"');
      expect(html).toContain('Xem trên bản đồ');
    });

    it('không hiển thị nút "Xem trên bản đồ" khi địa điểm không có toạ độ hay external_id', () => {
      const manualPlace: Place = {
        id: 'p-manual',
        room_id: sampleRoom.id,
        submitted_by_id: 'host-1',
        name: 'Quán nhập tay không có map',
        category: 'FOOD',
        status: 'PROPOSED',
        estimated_cost: 50000,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        current_user_vote: 0,
        created_at: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <PlaceCard
          place={manualPlace}
          roomId={sampleRoom.id}
        />,
      );

      expect(html).not.toContain('badge-source-osm');
      expect(html).not.toContain('badge-source-google');
      expect(html).not.toContain('btn-view-on-map');
    });
  });
});
