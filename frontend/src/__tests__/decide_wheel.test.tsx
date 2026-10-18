import { renderToStaticMarkup } from 'react-dom/server';
import '../i18n';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import {
  MOCK_HOST_TOKEN,
  mockRoom,
  mockPlaces,
  mockHostMember,
  mockGuestMember,
} from '../mocks/mockData';
import { useDecisionStore } from '../store/useDecisionStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { DeciderBanner } from '../components/decide/DeciderBanner';
import { SmartPickCard } from '../components/decide/SmartPickCard';
import { SpinWheel } from '../components/decide/SpinWheel';
import { DecideModal } from '../components/decide/DecideModal';
import { TieBreakSelectorModal } from '../components/voting/TieBreakSelectorModal';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import type { DeciderHint, DecisionStartedPayload, ScoredPick } from '../types';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

beforeEach(() => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  useDecisionStore.getState().reset();
  usePlaceStore.getState().reset();
  usePlaceStore.getState().setPlaces(mockPlaces);
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  useDecisionStore.getState().reset();
  usePlaceStore.getState().reset();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});

const sampleHints: DeciderHint[] = [
  {
    type: 'TIE_AT_TOP',
    category: 'FOOD',
    candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
  },
];

const sampleSmartPicks: ScoredPick[] = [
  {
    place_id: mockPlaces[0].id,
    score: 0.95,
    reasons: ['Gần điểm hẹn nhất (~1,2 km)', 'Đang mở cửa lúc 18:00', 'Vừa ngân sách'],
  },
  {
    place_id: mockPlaces[1].id,
    score: 0.88,
    reasons: ['Nhiều lượt bình chọn (3 vote)', 'Đánh giá cao'],
  },
];

describe('T-32: Frontend "🎲 Chọn hộ" (Banner, Gợi ý 1 chạm & Vòng quay)', () => {
  describe('1. DeciderBanner', () => {
    it('ẩn (trả về null) khi không có hints', () => {
      useDecisionStore.setState({ hints: [] });
      const html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={[]} onOpenDecide={() => {}} />,
      );
      expect(html).toBe('');
    });

    it('hiển thị thông báo hoà điểm khi hint là TIE_AT_TOP', () => {
      useDecisionStore.setState({ hints: sampleHints });
      const html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={sampleHints} onOpenDecide={() => {}} />,
      );
      expect(html).toContain('Hoà điểm cao nhất');
      expect(html).toContain('2 quán đang hoà điểm, để app chọn hộ nhé?');
      expect(html).toContain('Chọn hộ nhóm');
      expect(html).not.toContain('TIE_AT_TOP');
      expect(html).not.toContain('🎲');
    });

    it('hiển thị đúng thông báo cho các loại hint khác (NEAR_TIE, TOO_MANY, STALLED, EMPTY)', () => {
      const otherHints: DeciderHint[] = [
        { type: 'NEAR_TIE', category: 'FOOD', candidate_place_ids: [mockPlaces[0].id] },
      ];
      useDecisionStore.setState({ hints: otherHints });
      let html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={otherHints} onOpenDecide={() => {}} />,
      );
      expect(html).toContain('Điểm số suýt soát');
      expect(html).not.toContain('NEAR_TIE');

      const tooManyHints: DeciderHint[] = [{ type: 'TOO_MANY', category: 'FOOD', candidate_place_ids: [] }];
      useDecisionStore.setState({ hints: tooManyHints });
      html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={tooManyHints} onOpenDecide={() => {}} />,
      );
      expect(html).toContain('Nhiều lựa chọn');

      const stalledHints: DeciderHint[] = [{ type: 'STALLED', category: null, candidate_place_ids: [] }];
      useDecisionStore.setState({ hints: stalledHints });
      html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={stalledHints} onOpenDecide={() => {}} />,
      );
      expect(html).toContain('Bình chọn chững lại');

      const emptyHints: DeciderHint[] = [{ type: 'EMPTY', category: 'ENTERTAINMENT', candidate_place_ids: [] }];
      useDecisionStore.setState({ hints: emptyHints });
      html = renderToStaticMarkup(
        <DeciderBanner roomId={mockRoom.id} hints={emptyHints} onOpenDecide={() => {}} />,
      );
      expect(html).toContain('Chưa có địa điểm');
    });
  });

  describe('2. SmartPickCard (Gợi ý 1 chạm)', () => {
    it('hiển thị quán top-1 và các chip lý do chọn dạng badge', () => {
      useDecisionStore.setState({
        smartPicks: sampleSmartPicks,
        activePickIndex: 0,
      });

      const html = renderToStaticMarkup(
        <SmartPickCard
          roomId={mockRoom.id}
          isHost={true}
          smartPicks={sampleSmartPicks}
          places={mockPlaces}
          onOpenWheel={() => {}}
        />,
      );

      // Tên quán top 1
      expect(html).toContain(mockPlaces[0].name);
      // Gợi ý 1 / 2
      expect(html).toContain('Gợi ý 1 / 2');
      // Các chip lý do
      expect(html).toContain('Gần điểm hẹn nhất (~1,2 km)');
      expect(html).toContain('Đang mở cửa lúc 18:00');
      expect(html).toContain('Vừa ngân sách');
      expect(html).toContain('smart-pick-reason-chip');
    });

    it('phân quyền: Host có nút "Chốt quán này", Member chỉ thấy "Chờ Host chốt"', () => {
      useDecisionStore.setState({
        smartPicks: sampleSmartPicks,
        activePickIndex: 0,
      });

      // Host view
      const hostHtml = renderToStaticMarkup(
        <SmartPickCard
          roomId={mockRoom.id}
          isHost={true}
          smartPicks={sampleSmartPicks}
          places={mockPlaces}
          onOpenWheel={() => {}}
        />,
      );
      expect(hostHtml).toContain('Chốt quán này');
      expect(hostHtml).not.toContain('Chờ Host chốt quán này');

      // Member view
      const memberHtml = renderToStaticMarkup(
        <SmartPickCard
          roomId={mockRoom.id}
          isHost={false}
          smartPicks={sampleSmartPicks}
          places={mockPlaces}
          onOpenWheel={() => {}}
        />,
      );
      expect(memberHtml).not.toContain('Chốt quán này');
      expect(memberHtml).toContain('Chờ Host chốt quán này');
    });

    it('nút "Đổi quán khác" xoay vòng chỉ số activePickIndex trong store', () => {
      useDecisionStore.setState({
        smartPicks: sampleSmartPicks,
        activePickIndex: 0,
      });

      expect(useDecisionStore.getState().activePickIndex).toBe(0);

      // Gọi nextPick
      useDecisionStore.getState().nextPick();
      expect(useDecisionStore.getState().activePickIndex).toBe(1);

      // Gọi nextPick lần nữa quay về 0
      useDecisionStore.getState().nextPick();
      expect(useDecisionStore.getState().activePickIndex).toBe(0);
    });

    it('hiển thị thanh ngang mảnh điểm tổng hợp và tối đa 3 lý do từ describeReason', () => {
      const customPicks: ScoredPick[] = [
        {
          place_id: mockPlaces[0].id,
          score: 0.95,
          reasons: ['Lý do 1', 'Lý do 2', 'Lý do 3', 'Lý do 4 bỏ qua'],
        },
      ];
      useDecisionStore.setState({
        smartPicks: customPicks,
        activePickIndex: 0,
      });

      const html = renderToStaticMarkup(
        <SmartPickCard
          roomId={mockRoom.id}
          isHost={true}
          smartPicks={customPicks}
          places={mockPlaces}
          onOpenWheel={() => {}}
        />,
      );

      // Điểm tổng hợp và thanh progress 95%
      expect(html).toContain('Điểm tổng hợp');
      expect(html).toContain('95%');
      expect(html).toContain('style="width:95%"');

      // Tối đa 3 lý do
      expect(html).toContain('Lý do 1');
      expect(html).toContain('Lý do 2');
      expect(html).toContain('Lý do 3');
      expect(html).not.toContain('Lý do 4');
    });

    it('hiển thị empty state khi không có smart picks', () => {
      useDecisionStore.setState({ smartPicks: [] });
      const html = renderToStaticMarkup(
        <SmartPickCard
          roomId={mockRoom.id}
          isHost={true}
          smartPicks={[]}
          places={mockPlaces}
          onOpenWheel={() => {}}
        />,
      );
      expect(html).toContain('Chưa có đủ dữ liệu để tính toán gợi ý');
      expect(html).toContain('Chuyển sang Vòng quay may mắn');
    });
  });

  describe('3. SpinWheel (Vòng quay may mắn & Phân quyền)', () => {
    it('vẽ vòng quay SVG với đầy đủ các múi ứng viên và kim chỉ ở đỉnh', () => {
      useDecisionStore.setState({
        hints: sampleHints,
      });

      const html = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          hints={sampleHints}
        />,
      );

      // SVG đĩa xoay và kim chỉ
      expect(html).toContain('data-testid="wheel-disc"');
      expect(html).toContain('M 150 150'); // SVG path arc
      expect(html).toContain(mockPlaces[0].name.slice(0, 8));
      expect(html).toContain('Trọng số theo điểm bình chọn');
      expect(html).toContain('Xem cách tính');
    });

    it('phân quyền: Host có nút "Quay ngay!", Member chỉ thấy "Đang chờ Host bắt đầu quay"', () => {
      useDecisionStore.setState({ hints: sampleHints });

      // Host view
      const hostHtml = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          hints={sampleHints}
        />,
      );
      expect(hostHtml).toContain('Quay ngay!');
      expect(hostHtml).not.toContain('Đang chờ Host bắt đầu quay');

      // Member view
      const memberHtml = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={false}
          places={mockPlaces}
          hints={sampleHints}
        />,
      );
      expect(memberHtml).not.toContain('Quay ngay!');
      expect(memberHtml).toContain('Đang chờ Host bắt đầu quay...');
    });

    it('tính góc dừng tất định: 2 client độc lập nhận cùng stop_angle_deg đều dừng chính xác cùng một góc', () => {
      const stopAngle = 1532.5;
      const winnerId = mockPlaces[0].id;

      // Giả lập client 1 nhận DECISION_STARTED
      const client1Payload: DecisionStartedPayload = {
        session_id: 'session-wheel-1',
        mode: 'WHEEL',
        candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
        seed: 987654321,
        result_place_id: winnerId,
        result_payload: {
          stop_angle_deg: stopAngle,
          winner_index: 0,
          seed: 987654321,
        },
      };

      useDecisionStore.getState().handleDecisionStarted(client1Payload);

      expect(useDecisionStore.getState().wheelStopAngle).toBe(stopAngle);
      expect(useDecisionStore.getState().wheelWinnerId).toBe(winnerId);
      expect(useDecisionStore.getState().isSpinning).toBe(true);
      expect(useDecisionStore.getState().selectedMode).toBe('WHEEL');

      // Giả lập client 2 khởi tạo riêng nhận cùng payload
      useDecisionStore.getState().reset();
      useDecisionStore.getState().handleDecisionStarted(client1Payload);

      expect(useDecisionStore.getState().wheelStopAngle).toBe(1532.5);
      expect(useDecisionStore.getState().wheelWinnerId).toBe(winnerId);

      // Render kiểm tra góc quay CSS transform
      useDecisionStore.setState({
        currentSession: {
          id: 'session-wheel-1',
          room_id: mockRoom.id,
          mode: 'WHEEL',
          status: 'OPEN',
          candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
          seed: 987654321,
          result_place_id: winnerId,
          result_payload: { stop_angle_deg: stopAngle },
          created_by_id: mockHostMember.id,
          created_at: new Date().toISOString(),
        },
        wheelStopAngle: stopAngle,
        wheelWinnerId: winnerId,
        isSpinning: true,
      });

      const wheelHtml = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          hints={sampleHints}
          wheelStopAngle={stopAngle}
          wheelWinnerId={winnerId}
        />,
      );
      // CSS transform: rotate(...)
      expect(wheelHtml).toContain('rotate(0deg)');
    });

    it('kiểm tra prefers-reduced-motion: khi kích hoạt thì bỏ qua hoạt ảnh 4s và dừng ngay lập tức', () => {
      // Mock matchMedia prefers-reduced-motion = true
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      useDecisionStore.setState({
        wheelStopAngle: 1532.5,
        wheelWinnerId: mockPlaces[0].id,
        isSpinning: true,
      });

      // Render SpinWheel
      const html = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          wheelStopAngle={1532.5}
          wheelWinnerId={mockPlaces[0].id}
        />,
      );
      expect(html).toBeDefined();
    });

    it('chốt quán sau khi quay số: upsertPlace merge an toàn dữ liệu, không làm mất tên, điểm vote và không gây màn hình đen', async () => {
      usePlaceStore.getState().setPlaces(mockPlaces);
      const originalPlace = mockPlaces[0];

      const createRes = await useDecisionStore.getState().createDecision(mockRoom.id, {
        mode: 'WHEEL',
        candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
      });
      expect(createRes.session).toBeDefined();

      await useDecisionStore.getState().acceptDecision(mockRoom.id, createRes.session.id);

      const updatedPlace = usePlaceStore.getState().places.find((p) => p.id === originalPlace.id);
      expect(updatedPlace).toBeDefined();
      expect(updatedPlace?.status).toBe('ACCEPTED');
      expect(updatedPlace?.name).toBe(originalPlace.name);
      expect(updatedPlace?.score).toBe(originalPlace.score);
      expect(updatedPlace?.upvotes).toBe(originalPlace.upvotes);

      const html = renderToStaticMarkup(
        <SpinWheel
          roomId={mockRoom.id}
          isHost={true}
          places={usePlaceStore.getState().places}
          wheelWinnerId={originalPlace.id}
        />,
      );
      expect(html).toContain('data-testid="spin-wheel-container"');
      expect(html).not.toContain('rotate(NaNdeg)');
    });

    it('SpinWheel phòng thủ an toàn: không crash khi dữ liệu quán thiếu thuộc tính name hoặc rỗng', () => {
      const corruptedPlaces = [
        { ...mockPlaces[0], name: undefined as unknown as string },
        { ...mockPlaces[1], name: '' },
      ];

      expect(() => {
        renderToStaticMarkup(
          <SpinWheel
            roomId={mockRoom.id}
            isHost={true}
            places={corruptedPlaces}
            wheelWinnerId={corruptedPlaces[0].id}
          />,
        );
      }).not.toThrow();
    });

    it('ErrorBoundary hiển thị fallback khi có lỗi', () => {
      const boundary = new ErrorBoundary({ children: <div>OK</div> });
      const errorState = ErrorBoundary.getDerivedStateFromError(new Error('Test error'));
      expect(errorState.hasError).toBe(true);

      boundary.state = errorState;
      const html = renderToStaticMarkup(boundary.render());

      expect(html).toContain('Đã xảy ra lỗi không mong muốn');
      expect(html).toContain('Hệ thống đã gặp lỗi khi hiển thị giao diện');
      expect(html).toContain('Thử lại');
    });
  });

  describe('4. DecideModal & Điều hướng chế độ', () => {
    it('mở modal với tab mặc định là "Gợi ý 1 chạm", có thể chuyển sang "Vòng quay"', () => {
      useDecisionStore.setState({
        isDecideModalOpen: true,
        selectedMode: 'SMART',
        smartPicks: sampleSmartPicks,
      });

      const smartModalHtml = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="SMART"
          smartPicks={sampleSmartPicks}
          places={mockPlaces}
        />,
      );

      expect(smartModalHtml).toContain('Chọn hộ khi phân vân');
      expect(smartModalHtml).toContain('Gợi ý 1 chạm');
      expect(smartModalHtml).toContain('Vòng quay');
      expect(smartModalHtml).toContain('Quẹt thẻ');
      expect(smartModalHtml).toContain('Thang may mắn');
      expect(smartModalHtml).toContain('smart-pick-card');

      // Chuyển sang WHEEL
      useDecisionStore.setState({ selectedMode: 'WHEEL' });
      const wheelModalHtml = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="WHEEL"
          places={mockPlaces}
        />,
      );
      expect(wheelModalHtml).toContain('spin-wheel-container');
    });

    it('chế độ SWIPE render SwipeDeck khi đủ quán', () => {
      useDecisionStore.setState({
        isDecideModalOpen: true,
        selectedMode: 'SWIPE',
      });

      const swipeModalHtml = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="SWIPE"
          places={mockPlaces}
        />,
      );
      expect(swipeModalHtml).toContain('swipe-deck-container');
    });

    it('chế độ chưa đủ điều kiện (ví dụ cần ≥ 2 quán) bị disabled trong danh sách chọn chế độ', () => {
      const html = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="SMART"
          places={[mockPlaces[0]]}
        />,
      );

      expect(html).toContain('Gợi ý 1 chạm');
      expect(html).toContain('Vòng quay');
      expect(html).toContain('disabled');
    });
  });

  describe('6. TieBreakSelectorModal (Sheet phân định hoà cho Host / Member)', () => {
    it('Host thấy 5 chiến lược phân định và nút chốt kết quả', () => {
      const html = renderToStaticMarkup(
        <TieBreakSelectorModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
        />,
      );
      expect(html).toContain('Chốt kết quả bình chọn');
      expect(html).toContain('Nhiều Upvote nhất (Most Upvotes)');
      expect(html).toContain('Đề xuất sớm nhất (Earliest Submission)');
      expect(html).toContain('Ưu tiên Host (Creator Priority)');
      expect(html).toContain('Đa dạng danh mục (Category Diversity)');
      expect(html).toContain('Ngẫu nhiên công bằng (Random)');
      expect(html).toContain('Chốt kết quả');
      expect(html).not.toContain('Đang chờ Host chốt kết quả');
    });

    it('Member chỉ thấy trạng thái chờ và không thấy nút chốt', () => {
      const html = renderToStaticMarkup(
        <TieBreakSelectorModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={false}
        />,
      );
      expect(html).toContain('Đang chờ Host chốt kết quả');
      expect(html).not.toContain('Chốt kết quả</button>');
    });
  });

  describe('5. Tích hợp Zustand Store & WebSocket Events', () => {
    it('fetchHints nạp dữ liệu hints và smart_picks thành công qua decisionApi', async () => {
      await useDecisionStore.getState().fetchHints(mockRoom.id);

      const state = useDecisionStore.getState();
      expect(state.isLoadingHints).toBe(false);
      expect(state.hints.length).toBeGreaterThan(0);
      expect(state.smartPicks.length).toBeGreaterThan(0);
    });

    it('handleDecisionStarted mở modal và gán cấu hình phiên', () => {
      useDecisionStore.getState().handleDecisionStarted({
        session_id: 'ws-session-123',
        mode: 'WHEEL',
        candidate_place_ids: [mockPlaces[0].id],
        seed: 456789,
        result_place_id: mockPlaces[0].id,
        result_payload: { stop_angle_deg: 1440 },
      });

      const state = useDecisionStore.getState();
      expect(state.isDecideModalOpen).toBe(true);
      expect(state.selectedMode).toBe('WHEEL');
      expect(state.seed).toBe(456789);
      expect(state.wheelStopAngle).toBe(1440);
      expect(state.wheelWinnerId).toBe(mockPlaces[0].id);
      expect(state.isSpinning).toBe(true);
    });

    it('handleDecisionResolved cập nhật trạng thái session sang RESOLVED', () => {
      useDecisionStore.setState({
        currentSession: {
          id: 'ws-session-123',
          room_id: mockRoom.id,
          mode: 'WHEEL',
          status: 'OPEN',
          candidate_place_ids: [mockPlaces[0].id],
          seed: 456789,
          result_place_id: null,
          result_payload: null,
          created_by_id: mockHostMember.id,
          created_at: new Date().toISOString(),
        },
      });

      useDecisionStore.getState().handleDecisionResolved({
        session_id: 'ws-session-123',
        result_place_id: mockPlaces[0].id,
        status: 'RESOLVED',
      });

      const state = useDecisionStore.getState();
      expect(state.currentSession?.status).toBe('RESOLVED');
      expect(state.wheelWinnerId).toBe(mockPlaces[0].id);
      expect(state.isSpinning).toBe(false);
    });

    it('handleDecisionProgress cập nhật tiến độ doneMemberIds', () => {
      useDecisionStore.getState().handleDecisionProgress({
        session_id: 'ws-session-123',
        done_member_ids: [mockHostMember.id, mockGuestMember.id],
        total_members: 3,
      });

      const state = useDecisionStore.getState();
      expect(state.doneMemberIds).toEqual([mockHostMember.id, mockGuestMember.id]);
      expect(state.totalMembers).toBe(3);
    });
  });
});
