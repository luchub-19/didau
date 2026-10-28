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
import { SwipeDeck } from '../components/decide/SwipeDeck';
import { LuckyLadder } from '../components/decide/LuckyLadder';
import { DecideModal } from '../components/decide/DecideModal';
import type { DecisionSession } from '../types';

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

const openSwipeSession: DecisionSession = {
  id: 'session-swipe-123',
  room_id: mockRoom.id,
  mode: 'SWIPE',
  status: 'OPEN',
  category: 'FOOD',
  candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
  seed: 998877,
  created_by_id: mockHostMember.id,
  created_at: new Date().toISOString(),
  closes_at: new Date(Date.now() + 85000).toISOString(),
};

const resolvedSwipeSession: DecisionSession = {
  ...openSwipeSession,
  status: 'RESOLVED',
  result_place_id: mockPlaces[0].id,
  result_payload: {
    tally: { [mockPlaces[0].id]: 2, [mockPlaces[1].id]: 1 },
    winner_place_id: mockPlaces[0].id,
  },
};

const openLadderSession: DecisionSession = {
  id: 'session-ladder-123',
  room_id: mockRoom.id,
  mode: 'LADDER',
  status: 'OPEN',
  category: 'FOOD',
  candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
  seed: 776655,
  created_by_id: mockHostMember.id,
  created_at: new Date().toISOString(),
  result_place_id: mockPlaces[1].id,
  result_payload: {
    n_columns: 2,
    height: 8,
    rungs: [{ column: 0, height: 2 }, { column: 0, height: 5 }],
    winning_top_column: 1,
    winning_bottom_column: 0,
    connections: { 0: 1, 1: 0 },
    paths: {
      0: [[0, 0], [0, 2], [1, 2], [1, 5], [0, 5], [0, 9]],
      1: [[1, 0], [1, 2], [0, 2], [0, 5], [1, 5], [1, 9]],
    },
    seed: 776655,
  },
};

describe('T-33: Frontend "👆 Quẹt thẻ" (SwipeDeck) & "🪜 Thang may mắn" (LuckyLadder)', () => {
  describe('1. SwipeDeck Component', () => {
    it('hiển thị thông báo chờ Host khi phiên chưa bắt đầu và người dùng là Member', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={false}
          places={mockPlaces}
          session={null}
        />,
      );
      expect(html).toContain('swipe-not-started');
      expect(html).toContain('swipe-member-waiting');
      expect(html).toContain('Đang chờ Host bắt đầu phiên quẹt thẻ');
      expect(html).not.toContain('start-swipe-btn');
    });

    it('Host thấy nút "Bắt đầu phiên quẹt thẻ (90s)" khi phiên chưa mở', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={null}
        />,
      );
      expect(html).toContain('swipe-not-started');
      expect(html).toContain('start-swipe-btn');
      expect(html).toContain('Bắt đầu phiên quẹt thẻ (90s)');
    });

    it('hiển thị thẻ quán đang quẹt, huy hiệu đếm ngược và thanh tiến độ khi phiên OPEN', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={openSwipeSession}
          doneMemberIds={[mockHostMember.id]}
          totalMembers={2}
          localSwipes={{}}
        />,
      );

      // Card thông tin quán
      expect(html).toContain('swipe-card-current');
      expect(html).toContain(mockPlaces[0].name);

      // Countdown badge
      expect(html).toContain('swipe-countdown');

      // Thanh tiến độ x/y người xong
      expect(html).toContain('swipe-progress-bar');
      expect(html).toContain('swipe-progress-text');
      expect(html).toContain('1</strong>/2 người đã xong');

      // Nút Thôi / Thích trên desktop
      expect(html).toContain('swipe-dislike-btn');
      expect(html).toContain('swipe-like-btn');
    });

    it('chuyển sang màn hình chờ "Bạn đã quẹt xong toàn bộ địa điểm" khi user đã swipe hết cards', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={false}
          places={mockPlaces}
          session={openSwipeSession}
          doneMemberIds={[mockGuestMember.id]}
          totalMembers={2}
          localSwipes={{
            [mockPlaces[0].id]: true,
            [mockPlaces[1].id]: false,
          }}
        />,
      );

      expect(html).toContain('swipe-all-done');
      expect(html).toContain('Bạn đã quẹt xong toàn bộ địa điểm');
      expect(html).toContain('Đang chờ mọi người quẹt xong');
      // Khách không có nút chốt
      expect(html).not.toContain('swipe-accept-top-btn');
    });

    it('host thấy nút chốt quán được thích nhất khi cả nhóm đã quẹt xong (backend không tự chốt SWIPE)', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={openSwipeSession}
          doneMemberIds={[mockHostMember.id, mockGuestMember.id]}
          totalMembers={2}
          localSwipes={{
            [mockPlaces[0].id]: true,
            [mockPlaces[1].id]: false,
          }}
        />,
      );
      expect(html).toContain('swipe-accept-top-btn');
      expect(html).toContain('Chốt quán được thích nhất');
    });

    it('hiển thị banner hết giờ và khóa thao tác khi hết thời gian 90s', () => {
      const expiredSession: DecisionSession = {
        ...openSwipeSession,
        closes_at: new Date(Date.now() - 5000).toISOString(), // đã quá hạn
      };

      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={expiredSession}
        />,
      );

      expect(html).toContain('swipe-expired-alert');
      expect(html).toContain('Hết giờ quẹt thẻ! Phiên đã đóng (90s)');
      expect(html).toContain('swipe-accept-top-btn');
    });

    it('hiển thị kết quả quán chiến thắng kèm nút Chốt của Host khi phiên RESOLVED', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={resolvedSwipeSession}
        />,
      );

      expect(html).toContain('swipe-resolved-winner');
      expect(html).toContain(mockPlaces[0].name);
      expect(html).toContain('Kết quả Quẹt thẻ nhóm');
      expect(html).toContain('swipe-accept-btn');
      expect(html).toContain('swipe-cancel-btn');
    });

    it('Member chỉ thấy kết quả quán thắng mà không có nút Chốt / Hủy khi phiên RESOLVED', () => {
      const html = renderToStaticMarkup(
        <SwipeDeck
          roomId={mockRoom.id}
          isHost={false}
          places={mockPlaces}
          session={resolvedSwipeSession}
        />,
      );

      expect(html).toContain('swipe-resolved-winner');
      expect(html).toContain(mockPlaces[0].name);
      expect(html).not.toContain('swipe-accept-btn');
      expect(html).toContain('Đang chờ Host xác nhận');
    });
  });

  describe('2. LuckyLadder Component (Amidakuji)', () => {
    it('render cấu trúc SVG thang may mắn chuẩn với các cột dọc và bậc ngang', () => {
      const html = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={openLadderSession}
          seed={openLadderSession.seed}
          resultPayload={openLadderSession.result_payload}
        />,
      );

      expect(html).toContain('lucky-ladder-container');
      expect(html).toContain('ladder-svg');
      expect(html).toContain('ladder-col-0');
      expect(html).toContain('ladder-col-1');
      expect(html).toContain('ladder-rung-0');
    });

    it('vẽ đường đi kết quả (winning-path) nối từ cột thắng xuống đáy', () => {
      const html = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={openLadderSession}
          seed={openLadderSession.seed}
          resultPayload={openLadderSession.result_payload}
        />,
      );

      expect(html).toContain('ladder-winning-path');
      expect(html).toContain('stroke="rgb(var(--color-accent))"');
    });

    it('hỗ trợ chuyển đổi biến thể "Chọn người quyết định" với danh sách thành viên', () => {
      const members = [mockHostMember, mockGuestMember];
      const html = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          members={members}
          session={null}
        />,
      );

      expect(html).toContain('ladder-variant-place');
      expect(html).toContain('ladder-variant-member');
      expect(html).toContain('Chọn quán ăn');
      expect(html).toContain('Chọn người quyết định');
    });

    it('phân quyền Host (có nút Thả thang ngay) và Member (chờ Host)', () => {
      const hostHtml = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          session={null}
        />,
      );
      expect(hostHtml).toContain('start-ladder-btn');
      expect(hostHtml).toContain('Thả thang ngay!');

      const memberHtml = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={false}
          places={mockPlaces}
          session={null}
        />,
      );
      expect(memberHtml).not.toContain('start-ladder-btn');
      expect(memberHtml).toContain('ladder-member-waiting');
      expect(memberHtml).toContain('Đang chờ Host bắt đầu thả thang');
    });

    it('kết cấu thang Amidakuji được sinh tất định (deterministic) theo cùng seed', () => {
      const html1 = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          seed={123456}
        />,
      );
      const html2 = renderToStaticMarkup(
        <LuckyLadder
          roomId={mockRoom.id}
          isHost={true}
          places={mockPlaces}
          seed={123456}
        />,
      );

      expect(html1).toBe(html2);
      expect(html1).toContain('ladder-winning-path');
    });
  });

  describe('3. Tích hợp DecideModal', () => {
    it('DecideModal hiển thị đầy đủ 4 tab chức năng ở trạng thái sẵn sàng (ready)', () => {
      const html = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="SMART"
          places={mockPlaces}
        />,
      );

      expect(html).toContain('Gợi ý 1 chạm');
      expect(html).toContain('Vòng quay');
      expect(html).toContain('Quẹt thẻ');
      expect(html).toContain('Thang may mắn');
      // Không còn nhãn "Sắp có" vì cả 4 tab đã hoàn thiện
      expect(html).not.toContain('Sắp có');
    });

    it('chuyển tab sang SWIPE sẽ render SwipeDeck', () => {
      const html = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="SWIPE"
          places={mockPlaces}
        />,
      );

      expect(html).toContain('swipe-deck-container');
    });

    it('chuyển tab sang LADDER sẽ render LuckyLadder', () => {
      const html = renderToStaticMarkup(
        <DecideModal
          isOpen={true}
          onClose={() => {}}
          roomId={mockRoom.id}
          isHost={true}
          selectedMode="LADDER"
          places={mockPlaces}
        />,
      );

      expect(html).toContain('lucky-ladder-container');
      expect(html).toContain('ladder-svg');
    });
  });

  describe('4. Zustand Store & API Integration cho SWIPE & LADDER', () => {
    it('submitSwipe gọi API và cập nhật localSwipes trong store', async () => {
      // Tạo phiên qua decisionApi/createDecision để MSW khởi tạo session trong memory map
      const res = await useDecisionStore.getState().createDecision(mockRoom.id, {
        mode: 'SWIPE',
        candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
      });

      await useDecisionStore
        .getState()
        .submitSwipe(mockRoom.id, res.session.id, mockPlaces[0].id, true);

      const state = useDecisionStore.getState();
      expect(state.localSwipes[mockPlaces[0].id]).toBe(true);
    });

    it('handleDecisionProgress cập nhật tiến độ doneMemberIds và totalMembers', () => {
      useDecisionStore.getState().handleDecisionProgress({
        session_id: openSwipeSession.id,
        done_member_ids: [mockHostMember.id, mockGuestMember.id],
        total_members: 2,
      });

      const state = useDecisionStore.getState();
      expect(state.doneMemberIds).toEqual([mockHostMember.id, mockGuestMember.id]);
      expect(state.totalMembers).toBe(2);
    });

    it('handleDecisionStarted thiết lập session và reset localSwipes', () => {
      useDecisionStore.setState({ localSwipes: { [mockPlaces[0].id]: true } });

      useDecisionStore.getState().handleDecisionStarted({
        session_id: 'new-swipe-session',
        mode: 'SWIPE',
        candidate_place_ids: [mockPlaces[0].id, mockPlaces[1].id],
        seed: 12345,
        closes_at: new Date(Date.now() + 90000).toISOString(),
      });

      const state = useDecisionStore.getState();
      expect(state.currentSession?.id).toBe('new-swipe-session');
      expect(state.selectedMode).toBe('SWIPE');
      expect(state.localSwipes).toEqual({});
      expect(state.doneMemberIds).toEqual([]);
    });

    it('handleDecisionResolved cập nhật status RESOLVED và kết quả winner', () => {
      useDecisionStore.setState({ currentSession: openSwipeSession });

      useDecisionStore.getState().handleDecisionResolved({
        session_id: openSwipeSession.id,
        status: 'RESOLVED',
        result_place_id: mockPlaces[0].id,
      });

      const state = useDecisionStore.getState();
      expect(state.currentSession?.status).toBe('RESOLVED');
      expect(state.currentSession?.result_place_id).toBe(mockPlaces[0].id);
    });
  });
});
