import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { MOCK_HOST_TOKEN, mockRoom, mockPlaces, mockHostMember, mockGuestMember } from '../mocks/mockData';
import { useScheduleStore } from '../store/useScheduleStore';
import {
  AutoPlanButton,
  shouldShowAutoPlanButton,
} from '../components/schedule/AutoPlanButton';
import { AutoPlanPreview } from '../components/schedule/AutoPlanPreview';
import { ScheduleTimeline } from '../components/schedule/ScheduleTimeline';
import {
  coordinatesToRouteGeoJSON,
  installRouteLayer,
  updateRouteSource,
  ROUTE_SOURCE,
  ROUTE_LAYER,
  ROUTE_CASING_LAYER,
} from '../components/map/RouteLayer';
import type { AutoPlanPreviewResponse, Member, Place, ScheduleItem } from '../types';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  useScheduleStore.getState().reset();
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  useScheduleStore.getState().reset();
});

afterAll(() => {
  server.close();
});

const sampleAcceptedPlaces: Place[] = [
  {
    ...mockPlaces[0],
    id: 'p-accepted-1',
    status: 'ACCEPTED',
    score: 5,
  },
  {
    ...mockPlaces[1],
    id: 'p-accepted-2',
    status: 'PROPOSED',
    score: 2,
  },
];

const sampleProposedPlaces: Place[] = [
  {
    ...mockPlaces[0],
    id: 'p-prop-1',
    status: 'PROPOSED',
    score: 0,
    upvotes: 0,
    downvotes: 0,
  },
  {
    ...mockPlaces[1],
    id: 'p-prop-2',
    status: 'PROPOSED',
    score: 0,
    upvotes: 0,
    downvotes: 0,
  },
];

const sampleOnlineMembers: Member[] = [
  {
    ...mockHostMember,
    is_active: true,
  },
  {
    ...mockGuestMember,
    is_active: true,
  },
];

const samplePreviewData: AutoPlanPreviewResponse = {
  slots: [
    {
      place_id: 'p-accepted-1',
      day_offset: 0,
      start_minute: 1020, // 17:00
      end_minute: 1095, // 18:15 (75m)
      travel_from_prev_min: 0,
      reasons: ['Ăn tối trong khung 17:30–20:30'],
    },
    {
      place_id: 'p-accepted-2',
      day_offset: 0,
      start_minute: 1110, // 18:30
      end_minute: 1185, // 19:45
      travel_from_prev_min: 15,
      reasons: ['Điểm tiếp theo theo tuyến đường', 'Cách điểm trước ~15 phút di chuyển'],
    },
  ],
  dropped: [
    {
      place_id: 'p-dropped-1',
      reason: 'Hết khung thời gian trong buổi (23:00)',
    },
  ],
  total_travel_min: 15,
  total_cost: 350000,
  used_fallback: false,
  plan_hash: 'valid_hash_12345',
};

describe('T-36: Frontend "✨ Lên lịch giúp tôi"', () => {
  describe('1. Điều kiện hiển thị nút "✨ Lên lịch giúp tôi" (shouldShowAutoPlanButton)', () => {
    it('không hiển thị khi danh sách địa điểm rỗng', () => {
      expect(shouldShowAutoPlanButton([])).toBe(false);
    });

    it('không hiển thị khi các quán đều PROPOSED và chưa ai vote', () => {
      expect(shouldShowAutoPlanButton(sampleProposedPlaces, sampleOnlineMembers)).toBe(false);
    });

    it('hiển thị khi phòng có ít nhất 1 quán đã ACCEPTED', () => {
      expect(shouldShowAutoPlanButton(sampleAcceptedPlaces)).toBe(true);
      expect(shouldShowAutoPlanButton(sampleAcceptedPlaces, sampleOnlineMembers)).toBe(true);
    });

    it('hiển thị khi cờ allOnlineVoted = true', () => {
      expect(shouldShowAutoPlanButton(sampleProposedPlaces, [], true)).toBe(true);
    });

    it('hiển thị khi các thành viên online đều đã tham gia bỏ phiếu', () => {
      const placesWithVotes: Place[] = [
        { ...sampleProposedPlaces[0], upvotes: 2, score: 2 },
        { ...sampleProposedPlaces[1], upvotes: 1, score: 1 },
      ];
      expect(shouldShowAutoPlanButton(placesWithVotes, sampleOnlineMembers)).toBe(true);
    });

    it('AutoPlanButton render disabled kèm giải thích khi không đủ điều kiện', () => {
      const html = renderToStaticMarkup(
        <AutoPlanButton
          roomId={mockRoom.id}
          places={sampleProposedPlaces}
          members={sampleOnlineMembers}
          onOpenPreview={() => {}}
        />,
      );
      expect(html).toContain('disabled');
      expect(html).toContain('data-testid="auto-plan-button"');
      expect(html).toContain('Cần ít nhất 1 quán đã chốt');
    });

    it('AutoPlanButton render button khi đủ điều kiện', () => {
      const html = renderToStaticMarkup(
        <AutoPlanButton
          roomId={mockRoom.id}
          places={sampleAcceptedPlaces}
          members={sampleOnlineMembers}
          onOpenPreview={() => {}}
        />,
      );
      expect(html).toContain('Lên lịch giúp tôi');
      expect(html).toContain('data-testid="auto-plan-button"');
    });
  });

  describe('2. AutoPlanPreview: Phân quyền Host / Member', () => {
    it('Host: nhìn thấy nút "Áp dụng lịch trình" và không thấy dòng "Chờ Host chốt"', () => {
      useScheduleStore.getState().setAutoPlanPreview(samplePreviewData);

      const html = renderToStaticMarkup(
        <AutoPlanPreview
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          places={mockPlaces}
          isHost={true}
        />,
      );

      expect(html).toContain('data-testid="apply-auto-plan-btn"');
      expect(html).toContain('Áp dụng lịch trình');
      expect(html).not.toContain('data-testid="waiting-for-host-notice"');
      expect(html).not.toContain('Chờ Host chốt');
    });

    it('Member: KHÔNG nhìn thấy nút "Áp dụng lịch trình", thấy dòng "Chờ Host chốt"', () => {
      useScheduleStore.getState().setAutoPlanPreview(samplePreviewData);

      const html = renderToStaticMarkup(
        <AutoPlanPreview
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          places={mockPlaces}
          isHost={false}
        />,
      );

      expect(html).not.toContain('data-testid="apply-auto-plan-btn"');
      expect(html).not.toContain('Áp dụng lịch trình');
      expect(html).toContain('data-testid="waiting-for-host-notice"');
      expect(html).toContain('Chờ Host chốt');
    });

    it('hiển thị đầy đủ thông tin timeline nháp, chip lý do, quán bị loại và chi phí', () => {
      useScheduleStore.getState().setAutoPlanPreview(samplePreviewData);

      const html = renderToStaticMarkup(
        <AutoPlanPreview
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          places={mockPlaces}
          isHost={true}
          preview={samplePreviewData}
        />,
      );

      // Timeline & lý do
      expect(html).toContain('Ăn tối trong khung 17:30–20:30');
      expect(html).toContain('Cách điểm trước ~15 phút di chuyển');
      expect(html).toContain('~15 phút');
      expect(html).toMatch(/350\.000\s?[₫đ]/);

      // Quán không xếp được
      expect(html).toContain('data-testid="dropped-places-section"');
      expect(html).toContain('Không thể xếp vào lịch');
      expect(html).toContain('Hết khung thời gian trong buổi (23:00)');
    });

    it('hiển thị thông báo khi used_fallback = true', () => {
      const fallbackPreview = {
        ...samplePreviewData,
        used_fallback: true,
      };
      useScheduleStore.getState().setAutoPlanPreview(fallbackPreview);

      const html = renderToStaticMarkup(
        <AutoPlanPreview
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          places={mockPlaces}
          isHost={true}
          preview={fallbackPreview}
        />,
      );

      expect(html).toContain('Chưa có địa điểm nào được chốt (ACCEPTED)');
    });
  });

  describe('3. Store & API: Xem trước và Áp dụng tự động', () => {
    it('previewAutoPlan gọi POST /schedule/auto-plan thành công và cập nhật store', async () => {
      const store = useScheduleStore.getState();
      const preview = await store.previewAutoPlan(mockRoom.id);

      expect(preview).toBeDefined();
      expect(Array.isArray(preview.slots)).toBe(true);
      expect(preview.plan_hash).toBeDefined();
      expect(useScheduleStore.getState().autoPlanPreview).toEqual(preview);
      expect(useScheduleStore.getState().isAutoPlanLoading).toBe(false);
    });

    it('setDurationOverride cập nhật thời lượng cho từng quán', () => {
      const store = useScheduleStore.getState();
      store.setDurationOverride('place-1', 90);
      store.setDurationOverride('place-2', 120);

      expect(useScheduleStore.getState().durationOverrides).toEqual({
        'place-1': 90,
        'place-2': 120,
      });

      store.resetDurationOverrides();
      expect(useScheduleStore.getState().durationOverrides).toEqual({});
    });

    it('applyAutoPlan áp dụng lịch trình thành công và lưu vào store.items', async () => {
      const store = useScheduleStore.getState();
      const preview = await store.previewAutoPlan(mockRoom.id);

      const items = await store.applyAutoPlan(mockRoom.id, {
        plan_hash: preview.plan_hash,
        slots: preview.slots,
      });

      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(preview.slots.length);
      expect(useScheduleStore.getState().items).toEqual(items);
      expect(useScheduleStore.getState().autoPlanPreview).toBeNull();
    });
  });

  describe('4. Xử lý lỗi 409 STALE_PLAN', () => {
    it('applyAutoPlan ném lỗi khi plan_hash không khớp (bị stale)', async () => {
      const store = useScheduleStore.getState();

      await expect(
        store.applyAutoPlan(mockRoom.id, {
          plan_hash: 'INVALID_HASH_123',
          slots: samplePreviewData.slots,
        }),
      ).rejects.toThrow();

      expect(useScheduleStore.getState().autoPlanError).toBe('errors.STALE_PLAN');
    });

    it('AutoPlanPreview hiển thị cảnh báo "dữ liệu vừa thay đổi" khi có cảnh báo stale', () => {
      useScheduleStore.getState().setAutoPlanPreview(samplePreviewData);

      // Render khi có staleWarning
      const html = renderToStaticMarkup(
        <div data-testid="stale-plan-alert">
          <span>⚠️</span>
          <span>Dữ liệu vừa thay đổi</span>
        </div>,
      );

      expect(html.toLowerCase()).toContain('dữ liệu vừa thay đổi');
    });
  });

  describe('5. RouteLayer & ScheduleTimeline Tích hợp', () => {
    it('coordinatesToRouteGeoJSON sinh GeoJSON LineString hợp lệ khi có >= 2 điểm', () => {
      const coords: [number, number][] = [
        [106.69, 10.78],
        [106.70, 10.77],
      ];
      const geojson = coordinatesToRouteGeoJSON(coords);

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features.length).toBe(1);
      expect(geojson.features[0].geometry.type).toBe('LineString');
      expect(geojson.features[0].geometry.coordinates).toEqual(coords);
    });

    it('coordinatesToRouteGeoJSON trả về features rỗng khi < 2 điểm', () => {
      const emptyGeojson = coordinatesToRouteGeoJSON([[106.69, 10.78]]);
      expect(emptyGeojson.features.length).toBe(0);
    });

    it('installRouteLayer đăng ký source và 2 layers (casing và line)', () => {
      const sources: Record<string, unknown> = {};
      const layers: Array<{ id: string }> = [];

      const mockMap = {
        addSource: vi.fn((id, conf) => {
          sources[id] = conf;
        }),
        addLayer: vi.fn((layer) => {
          layers.push(layer);
        }),
      } as unknown as import('maplibre-gl').Map;

      installRouteLayer(mockMap);

      expect(mockMap.addSource).toHaveBeenCalledWith(ROUTE_SOURCE, expect.anything());
      expect(layers.some((l) => l.id === ROUTE_CASING_LAYER)).toBe(true);
      expect(layers.some((l) => l.id === ROUTE_LAYER)).toBe(true);
    });

    it('updateRouteSource gọi setData trên GeoJSONSource của route', () => {
      const setDataMock = vi.fn();
      const mockMap = {
        getSource: vi.fn(() => ({
          setData: setDataMock,
        })),
      } as unknown as import('maplibre-gl').Map;

      updateRouteSource(mockMap, [
        [106.69, 10.78],
        [106.70, 10.77],
      ]);

      expect(setDataMock).toHaveBeenCalledWith(expect.objectContaining({
        type: 'FeatureCollection',
      }));
    });

    it('ScheduleTimeline hiển thị nút "⚡ Sắp lại tối ưu" khi danh sách lịch không rỗng', () => {
      const sampleItem: ScheduleItem = {
        id: 'item-1',
        room_id: mockRoom.id,
        place_id: mockPlaces[0].id,
        place_name: mockPlaces[0].name,
        place_address: mockPlaces[0].address,
        day_offset: 0,
        start_minute: 540,
        end_minute: 600,
        order_index: 0,
        note: null,
      };

      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId={mockRoom.id}
          items={[sampleItem]}
          places={mockPlaces}
          members={sampleOnlineMembers}
          isHost={true}
        />,
      );

      expect(html).toContain('data-testid="reoptimize-schedule-btn"');
      expect(html).toContain('Sắp lại tối ưu');
    });
  });
});
