import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import {
  decisionApi,
  poiApi,
  reviewApi,
  scheduleApi,
} from '../services/api';
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

describe('T-24: Frontend Types & MSW Handlers cho CR-02', () => {
  describe('POI API (OSM & Google Match)', () => {
    it('lấy danh sách POI đầy đủ và theo bộ lọc danh mục / bbox', async () => {
      const allPois = await poiApi.listPois();
      expect(allPois.length).toBeGreaterThanOrEqual(25);

      const drinks = await poiApi.listPois({ category: 'DRINK' });
      expect(drinks.length).toBeGreaterThan(0);
      drinks.forEach((p) => expect(p.category).toBe('DRINK'));

      // Lọc theo bounding box Quận 1
      const q1Pois = await poiApi.listPois({
        bbox: '106.69,10.76,106.71,10.79',
      });
      expect(q1Pois.length).toBeGreaterThan(0);
      q1Pois.forEach((p) => {
        expect(p.lat).toBeGreaterThanOrEqual(10.76);
        expect(p.lat).toBeLessThanOrEqual(10.79);
        expect(p.lng).toBeGreaterThanOrEqual(106.69);
        expect(p.lng).toBeLessThanOrEqual(106.71);
      });
    });


    it('tìm kiếm POI không dấu tiếng Việt và tính khoảng cách', async () => {
      // Tìm không dấu "pho" khớp với "Phở Hòa Pasteur" và "Phở Lệ"
      const phoResults = await poiApi.searchPois({ q: 'pho' });
      expect(phoResults.length).toBeGreaterThanOrEqual(2);
      expect(phoResults.some((p) => p.name.includes('Phở Hòa'))).toBe(true);

      // Tìm kèm toạ độ điểm hẹn để tính khoảng cách
      const nearResults = await poiApi.searchPois({
        q: 'coffee',
        lat: 10.7769,
        lng: 106.7058,
        limit: 5,
      });
      expect(nearResults.length).toBeGreaterThan(0);
      expect(nearResults[0].distance_km).toBeDefined();
      expect(nearResults[0].distance_km).toBeGreaterThanOrEqual(0);
    });

    it('lấy chi tiết một POI theo external_id và trả về 404 nếu không tồn tại', async () => {
      const poi = await poiApi.getPoi('osm:node/1001');
      expect(poi.external_id).toBe('osm:node/1001');
      expect(poi.name).toBe('Phở Hòa Pasteur');
      expect(poi.open_minute).toBe(360);
      expect(poi.close_minute).toBe(1320);

      await expect(poiApi.getPoi('osm:node/999999')).rejects.toThrow();
    });

    it('khớp Google Place ID và báo sai liên kết', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const matchRes = await poiApi.matchGooglePlace({
        external_id: 'osm:node/1001',
        name: 'Phở Hòa Pasteur',
        lat: 10.7872,
        lng: 106.6896,
      });

      expect(matchRes.google_place_id).toBeDefined();
      expect(matchRes.reason).toBe('OK');

      const unmatchRes = await poiApi.unmatchGooglePlace('osm:node/1001');
      expect(unmatchRes.success).toBe(true);
    });
  });

  describe('Review API (Đánh giá nội bộ)', () => {
    it('lấy danh sách đánh giá nội bộ với điểm trung bình và top tags', async () => {
      const summary = await reviewApi.getReviews('osm:node/1001');
      expect(summary.count).toBe(2);
      expect(summary.avg).toBe(4.5);
      expect(summary.tags_top3).toContain('ngon');
      expect(summary.items).toHaveLength(2);
    });

    it('gửi đánh giá mới hoặc cập nhật đánh giá của thành viên', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const review = await reviewApi.submitReview({
        external_key: 'osm:node/1002',
        rating: 5,
        comment: 'Bánh mì nhiều thịt pate thơm béo rất ngon.',
        tags: ['ngon', 'đáng tiền'],
      });

      expect(review.external_key).toBe('osm:node/1002');
      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Bánh mì nhiều thịt pate thơm béo rất ngon.');
      expect(review.tags).toContain('đáng tiền');

      // Kiểm tra lại danh sách review sau khi submit
      const updatedSummary = await reviewApi.getReviews('osm:node/1002');
      expect(updatedSummary.count).toBe(1);
      expect(updatedSummary.avg).toBe(5);
      expect(updatedSummary.tags_top3).toContain('ngon');
    });
  });

  describe('Decision API (Chọn hộ & Vòng quay, Swipe, Thang)', () => {
    it('lấy gợi ý kích hoạt Chọn hộ (hints) và top smart picks', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const res = await decisionApi.getHints(mockRoom.id);
      expect(res.hints).toBeDefined();
      expect(res.smart_picks).toBeDefined();
      if (res.hints.length > 0) {
        expect(res.hints[0].type).toBe('TIE_AT_TOP');
      }
      if (res.smart_picks.length > 0) {
        expect(res.smart_picks[0].score).toBeGreaterThan(0);
        expect(res.smart_picks[0].reasons.length).toBeGreaterThan(0);
      }
    });

    it('tạo phiên Chọn hộ WHEEL thành công và chặn tạo 2 phiên OPEN cùng lúc', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const res = await decisionApi.createDecision(mockRoom.id, {
        mode: 'WHEEL',
        category: 'FOOD',
        weighted: false,
      });

      expect(res.session.status).toBe('OPEN');
      expect(res.session.mode).toBe('WHEEL');
      expect(res.seed).toBe(123456789);
      expect(res.result_payload).toHaveProperty('stop_angle_deg');

      // Cố tình tạo thêm phiên OPEN thứ hai -> bị 409 CONFLICT
      await expect(
        decisionApi.createDecision(mockRoom.id, {
          mode: 'LADDER',
        }),
      ).rejects.toThrow();
    });

    it('thực hiện quẹt thẻ (swipe) trong phiên SWIPE', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const createRes = await decisionApi.createDecision(mockRoom.id, {
        mode: 'SWIPE',
      });
      const sessionId = createRes.session.id;

      const swipeRes = await decisionApi.submitSwipe(mockRoom.id, sessionId, {
        place_id: createRes.session.candidate_place_ids[0],
        liked: true,
      });

      expect(swipeRes.success).toBe(true);
      expect(swipeRes.liked).toBe(true);
    });

    it('chấp nhận kết quả phiên Chọn hộ và cập nhật trạng thái địa điểm', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const createRes = await decisionApi.createDecision(mockRoom.id, {
        mode: 'WHEEL',
      });
      const sessionId = createRes.session.id;

      const acceptRes = await decisionApi.acceptDecision(mockRoom.id, sessionId);
      expect(acceptRes.session.status).toBe('RESOLVED');
      expect(acceptRes.strategy).toBe('GROUP_DECISION');
      if (acceptRes.resolved_place) {
        expect(acceptRes.resolved_place.status).toBe('ACCEPTED');
      }
    });

    it('hủy phiên Chọn hộ đang mở', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const createRes = await decisionApi.createDecision(mockRoom.id, {
        mode: 'LADDER',
      });
      const sessionId = createRes.session.id;

      const cancelRes = await decisionApi.cancelDecision(mockRoom.id, sessionId);
      expect(cancelRes.session.status).toBe('CANCELLED');
    });
  });

  describe('Auto-plan API (✨ Lên lịch giúp tôi)', () => {
    it('xem trước lịch trình tự động deterministic và trả về plan_hash', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const preview1 = await scheduleApi.previewAutoPlan(mockRoom.id);
      expect(preview1.slots.length).toBeGreaterThan(0);
      expect(preview1.plan_hash).toBeDefined();
      expect(preview1.total_cost).toBeGreaterThanOrEqual(0);

      // Cùng dữ liệu đầu vào trả về cùng plan_hash
      const preview2 = await scheduleApi.previewAutoPlan(mockRoom.id);
      expect(preview2.plan_hash).toBe(preview1.plan_hash);
    });

    it('áp dụng lịch trình tự động thành công và chặn khi plan_hash không khớp', async () => {
      tokenStorage.setToken(MOCK_HOST_TOKEN);

      const preview = await scheduleApi.previewAutoPlan(mockRoom.id);

      // Áp dụng với đúng plan_hash
      const appliedItems = await scheduleApi.applyAutoPlan(mockRoom.id, {
        plan_hash: preview.plan_hash,
        slots: preview.slots,
      });

      expect(appliedItems.length).toBe(preview.slots.length);
      expect(appliedItems[0].start_minute).toBe(preview.slots[0].start_minute);

      // Áp dụng với plan_hash không hợp lệ -> ném lỗi 409
      await expect(
        scheduleApi.applyAutoPlan(mockRoom.id, {
          plan_hash: 'INVALID_HASH_123',
          slots: preview.slots,
        }),
      ).rejects.toThrow();
    });
  });
});
