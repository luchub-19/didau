import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  RoomShell,
  RoomTopBar,
  BottomTabBar,
  DesktopTabBar,
  ConnectionBanner,
  useRoomTab,
} from '../components/shell';
import { mockRoom } from '../mocks/mockData';
import '../i18n';

describe('T-41: RoomShell, RoomTopBar, BottomTabBar Suite', () => {
  describe('useRoomTab', () => {
    function TabTester({ onResult }: { onResult: (res: ReturnType<typeof useRoomTab>) => void }) {
      const tab = useRoomTab();
      onResult(tab);
      return null;
    }

    it('mặc định activeTab là places khi URL không có query param', () => {
      let result: { activeTab: string } | null = null;
      renderToStaticMarkup(<TabTester onResult={(r) => { result = r; }} />);
      expect(result).not.toBeNull();
      if (result) {
        expect((result as { activeTab: string }).activeTab).toBe('places');
      }
    });
  });
  describe('BottomTabBar & DesktopTabBar', () => {
    it('BottomTabBar render đủ 4 tab với role="tablist", role="tab", aria-selected và nhãn chữ', () => {
      const html = renderToStaticMarkup(
        <BottomTabBar
          activeTab="places"
          onTabChange={() => {}}
          placesCount={5}
          scheduleCount={2}
        />,
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('Quán');
      expect(html).toContain('Bản đồ');
      expect(html).toContain('Lịch');
      expect(html).toContain('Nhóm');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('bg-accent'); // Vạch coral ở mục đang chọn
      expect(html).toContain('h-14'); // Chiều cao 56px
    });

    it('DesktopTabBar render tab ngang với role="tablist" và số lượng đếm', () => {
      const html = renderToStaticMarkup(
        <DesktopTabBar
          activeTab="schedule"
          onTabChange={() => {}}
          placesCount={10}
          scheduleCount={3}
          hasConflicts={true}
        />,
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('Lịch');
      expect(html).toContain('3');
      expect(html).toContain('animate-pulse'); // Chấm đỏ cảnh báo xung đột
      expect(html).toContain('border-accent');
    });

    it('BottomTabBar đổi trạng thái aria-selected khi tab active thay đổi', () => {
      const htmlMap = renderToStaticMarkup(
        <BottomTabBar
          activeTab="map"
          onTabChange={() => {}}
        />,
      );

      expect(htmlMap).toContain('id="tab-map"');
      expect(htmlMap).toContain('aria-selected="true"');
    });
  });

  describe('RoomTopBar', () => {
    it('hiển thị tên phòng, mã phòng dạng copy và nút về trang chủ', () => {
      const html = renderToStaticMarkup(
        <RoomTopBar
          title="Chuyến đi Đà Lạt"
          code="DALAT1"
          roomId="room-123"
          isConnected={true}
          onGoHome={() => {}}
        />,
      );

      expect(html).toContain('Chuyến đi Đà Lạt');
      expect(html).toContain('DALAT1');
      expect(html).toContain('Trực tiếp');
      expect(html).toContain('aria-label="Quay lại"');
      expect(html).toContain('aria-label="Chia sẻ phòng"');
    });

    it('hiển thị trạng thái mất kết nối khi isConnected = false', () => {
      const html = renderToStaticMarkup(
        <RoomTopBar
          title="Chuyến đi Đà Lạt"
          code="DALAT1"
          roomId="room-123"
          isConnected={false}
          onGoHome={() => {}}
        />,
      );

      expect(html).toContain('Mất kết nối');
      expect(html).toContain('bg-warning-soft');
    });
  });

  describe('ConnectionBanner', () => {
    it('ẩn khi WebSocket kết nối (isConnected = true)', () => {
      const html = renderToStaticMarkup(<ConnectionBanner isConnected={true} />);
      expect(html).toBe('');
    });

    it('hiển thị dải mỏng khi WebSocket mất kết nối (isConnected = false)', () => {
      const html = renderToStaticMarkup(<ConnectionBanner isConnected={false} />);
      expect(html).toContain('Mất kết nối, đang thử lại…');
      expect(html).toContain('role="status"');
      expect(html).toContain('bg-warning-soft');
    });
  });

  describe('RoomShell', () => {
    it('tích hợp đầy đủ TopBar, Banner, Main content và TabBar', () => {
      const html = renderToStaticMarkup(
        <RoomShell
          room={mockRoom}
          isConnected={true}
          activeTab="places"
          onTabChange={() => {}}
          onGoHome={() => {}}
          placesCount={3}
        >
          <div data-testid="panel-content">Nội dung panel quán</div>
        </RoomShell>,
      );

      expect(html).toContain(mockRoom.title);
      expect(html).toContain(mockRoom.code);
      expect(html).toContain('Nội dung panel quán');
      expect(html).toContain('role="tablist"');
      expect(html).toContain('pb-20'); // Chừa lề đáy cho bottom tab
    });
  });
});
