import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  RoomShell,
  RoomTopBar,
  RoomWorkspace,
  BottomTabBar,
  ConnectionBanner,
  useRoomTab,
  normalizeTab,
  isLegacyGroupLink,
  canonicalTabSearch,
  resolvePlanOpen,
  snapHeights,
  settleSnap,
  defaultSheetSnap,
  toggleSnap,
  SHEET_PEEK_PX,
  type RoomWorkspaceProps,
} from '../components/shell';
import { mockRoom } from '../mocks/mockData';
import '../i18n';

describe('T-41/T-67: RoomShell, RoomTopBar, BottomTabBar', () => {
  describe('useRoomTab', () => {
    function TabTester({ onResult }: { onResult: (res: ReturnType<typeof useRoomTab>) => void }) {
      const tab = useRoomTab();
      onResult(tab);
      return null;
    }

    it('mặc định activeTab là explore khi URL không có query param', () => {
      let result: ReturnType<typeof useRoomTab> | null = null;
      renderToStaticMarkup(<TabTester onResult={(r) => { result = r; }} />);
      expect(result).not.toBeNull();
      const r = result as unknown as ReturnType<typeof useRoomTab>;
      expect(r.activeTab).toBe('explore');
      expect(r.openedFromGroupLink).toBe(false);
    });
  });

  describe('T-67: ánh xạ URL cũ (DESIGN gđ5 §2 "URL")', () => {
    it('places/map → explore, schedule → plan, group → explore', () => {
      expect(normalizeTab('places')).toBe('explore');
      expect(normalizeTab('map')).toBe('explore');
      expect(normalizeTab('schedule')).toBe('plan');
      expect(normalizeTab('group')).toBe('explore');
      expect(normalizeTab('plan')).toBe('plan');
      expect(normalizeTab('lạ')).toBe('explore');
      expect(normalizeTab(null)).toBe('explore');
    });

    it('chỉ ?tab=group mới mở thông tin nhóm', () => {
      expect(isLegacyGroupLink('?tab=group')).toBe(true);
      expect(isLegacyGroupLink('?code=ABC&tab=group')).toBe(true);
      expect(isLegacyGroupLink('?tab=explore')).toBe(false);
      expect(isLegacyGroupLink('')).toBe(false);
    });

    it('link cũ được viết lại thành giá trị mới, giữ các tham số khác; link mới không đổi', () => {
      expect(canonicalTabSearch('?tab=schedule')).toBe('?tab=plan');
      expect(canonicalTabSearch('?code=ABC&tab=map')).toBe('?code=ABC&tab=explore');
      expect(canonicalTabSearch('?tab=group')).toBe('?tab=explore');
      expect(canonicalTabSearch('?tab=plan')).toBeNull();
      expect(canonicalTabSearch('?code=ABC')).toBeNull();
      expect(canonicalTabSearch('')).toBeNull();
    });
  });

  describe('BottomTabBar (mobile 2 tab)', () => {
    it('render đúng 2 tab có nhãn chữ, role tab, aria-selected và vạch coral', () => {
      const html = renderToStaticMarkup(<BottomTabBar activeTab="explore" onTabChange={() => {}} />);

      expect(html).toContain('role="tablist"');
      expect(html.match(/role="tab"/g)).toHaveLength(2);
      expect(html).toContain('Khám phá');
      expect(html).toContain('Kế hoạch');
      expect(html).not.toContain('Bản đồ');
      expect(html).toContain('id="tab-explore"');
      expect(html).toContain('aria-controls="panel-explore"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('bg-accent');
      expect(html).toContain('h-14');
      expect(html).toContain('lg:hidden'); // desktop không có tab
      expect(html).toContain('room-tabbar-vt'); // nhóm View Transition riêng (T-62)
    });

    it('tab Kế hoạch được chọn và mang chấm đỏ khi lịch xung đột', () => {
      const html = renderToStaticMarkup(<BottomTabBar activeTab="plan" onTabChange={() => {}} hasConflicts />);
      expect(html).toMatch(/id="tab-plan"[^>]*aria-selected="true"/);
      expect(html).toContain('bg-danger');
      expect(html).toContain('Lịch có giờ bị trùng'); // chữ cho trình đọc màn hình
    });
  });

  describe('RoomTopBar', () => {
    it('hiển thị tên phòng, mã phòng dạng copy và nút về trang chủ', () => {
      const html = renderToStaticMarkup(
        <RoomTopBar title="Chuyến đi Đà Lạt" code="DALAT1" roomId="room-123" onGoHome={() => {}} />,
      );

      expect(html).toContain('Chuyến đi Đà Lạt');
      expect(html).toContain('DALAT1');
      expect(html).not.toContain('Trực tiếp'); // pill cũ đã bỏ, trạng thái nằm ở viền avatar
      expect(html).toContain('aria-label="Quay lại"');
      expect(html).toContain('aria-label="Chia sẻ phòng"');
      expect(html).not.toContain('max-w-7xl');
    });

    it('nhận phase từ ngoài (một nguồn viewStep) và slot nút phụ', () => {
      const html = renderToStaticMarkup(
        <RoomTopBar
          title="Phòng"
          code="ABC123"
          roomId="r"
          onGoHome={() => {}}
          phase={{ phase: 'lock', step: 3, viewStep: 2, setViewStep: () => {} }}
          viewers={<button type="button">nut-xem</button>}
          identity={<button type="button">nut-avatar</button>}
        />,
      );
      expect(html).toContain('nut-xem');
      expect(html).toContain('nut-avatar');
      expect(html).toContain('Bước 2/4'); // dòng compact đọc viewStep từ prop
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
    it('cao đúng một màn, không max-w-7xl, chừa đáy cho tab chỉ trên mobile', () => {
      const html = renderToStaticMarkup(
        <RoomShell room={mockRoom} isConnected={true} activeTab="explore" onTabChange={() => {}} onGoHome={() => {}}>
          <div data-testid="panel-content">Nội dung không gian</div>
        </RoomShell>,
      );

      expect(html).toContain(mockRoom.title);
      expect(html).toContain(mockRoom.code);
      expect(html).toContain('Nội dung không gian');
      expect(html).toContain('role="tablist"');
      expect(html).toContain('h-dvh');
      expect(html).toContain('lg:pb-0');
      expect(html).not.toContain('max-w-7xl');
      // Nhóm trượt khi đổi tab mobile vẫn giữ (T-62)
      expect(html).toContain('room-panel-vt');
      expect(html).toContain('data-motion="tab.switch"');
    });
  });
});

describe('T-67: RoomWorkspace', () => {
  const base: RoomWorkspaceProps = {
    activeTab: 'explore',
    phase: 'gather',
    viewStep: 1,
    list: <div>slot-danh-sach</div>,
    map: <div>slot-ban-do</div>,
    plan: <div>slot-ke-hoach</div>,
    placesCount: 0,
    scheduleCount: 0,
  };

  describe('cột Kế hoạch tự mở theo bước, ghi đè tay đến khi giai đoạn đổi', () => {
    it('thu ở ①②, mở ở ③④', () => {
      expect(resolvePlanOpen(1, 'gather', null)).toBe(false);
      expect(resolvePlanOpen(2, 'vote', null)).toBe(false);
      expect(resolvePlanOpen(2, 'tie', null)).toBe(false);
      expect(resolvePlanOpen(3, 'lock', null)).toBe(true);
      expect(resolvePlanOpen(4, 'send', null)).toBe(true);
    });

    it('xem lại bước cũ (viewStep < step) thì theo bước đang xem', () => {
      expect(resolvePlanOpen(2, 'send', null)).toBe(false);
      expect(resolvePlanOpen(3, 'send', null)).toBe(true);
    });

    it('bấm tay thắng tự động trong cùng giai đoạn', () => {
      expect(resolvePlanOpen(1, 'gather', { phase: 'gather', open: true })).toBe(true);
      expect(resolvePlanOpen(4, 'send', { phase: 'send', open: false })).toBe(false);
    });

    it('giai đoạn đổi → bỏ ghi đè, về tự động', () => {
      // Người dùng đóng cột ở ③, rồi lịch được tạo → ④: cột tự mở lại
      expect(resolvePlanOpen(4, 'send', { phase: 'lock', open: false })).toBe(true);
      // Người dùng mở ở ②, quay về ① (xoá quán) → thu lại
      expect(resolvePlanOpen(1, 'gather', { phase: 'vote', open: true })).toBe(false);
    });
  });

  describe('sheet danh sách mobile 3 nấc', () => {
    it('nấc thu 96px, nửa màn, gần đầy chừa khe trên', () => {
      expect(snapHeights(800)).toEqual({ peek: SHEET_PEEK_PX, half: 400, full: 792 });
      // Khung quá thấp: không nấc nào thấp hơn nấc thu
      expect(snapHeights(60).half).toBeGreaterThanOrEqual(SHEET_PEEK_PX);
    });

    it('thả tay chọn nấc gần nhất; vuốt nhanh đi một nấc theo hướng', () => {
      expect(settleSnap(380, 0, 'half', 800)).toBe('half');
      expect(settleSnap(150, 0, 'half', 800)).toBe('peek');
      expect(settleSnap(700, 0, 'half', 800)).toBe('full');
      expect(settleSnap(420, 1.2, 'half', 800)).toBe('peek'); // vuốt xuống nhanh
      expect(settleSnap(420, -1.2, 'half', 800)).toBe('full'); // vuốt lên nhanh
      expect(settleSnap(100, 2, 'peek', 800)).toBe('peek'); // không xuống quá nấc thu
    });

    it('nấc mặc định theo giai đoạn và bấm tay nắm', () => {
      expect(defaultSheetSnap('gather')).toBe('half');
      expect(defaultSheetSnap('vote')).toBe('half');
      expect(defaultSheetSnap('send')).toBe('peek');
      expect(toggleSnap('peek')).toBe('half');
      expect(toggleSnap('half')).toBe('peek');
      expect(toggleSnap('full')).toBe('half');
    });
  });

  describe('render desktop rộng (SSR = ≥1280)', () => {
    it('3 vùng: danh sách | bản đồ | kế hoạch, mỗi cột cuộn riêng', () => {
      const html = renderToStaticMarkup(<RoomWorkspace {...base} />);
      expect(html).toContain('slot-danh-sach');
      expect(html).toContain('slot-ban-do');
      expect(html).toContain('aria-label="Danh sách quán"');
      expect(html).toContain('aria-label="Bản đồ"');
      expect(html).toContain('aria-label="Kế hoạch"');
      expect(html).toContain('overflow-y-auto');
      expect(html).toContain('data-layout="wide"');
      // Desktop không có tab: vùng bản đồ không là tabpanel
      expect(html).not.toContain('role="tabpanel"');
    });

    it('giai đoạn ①: cột trái 560px, Kế hoạch thu thành dải 72px (chưa render nội dung)', () => {
      const html = renderToStaticMarkup(<RoomWorkspace {...base} />);
      expect(html).toContain('width:var(--ws-left-gather)');
      expect(html).toContain('width:var(--ws-plan-rail)');
      expect(html).toContain('data-plan-open="false"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain('slot-ke-hoach');
      expect(html).toContain('Ngân sách'); // tổng ngân sách tạm "—" (T-73)
    });

    it('giai đoạn ③: cột trái 400px, Kế hoạch tự mở 440px có tiêu đề và nút thu', () => {
      const html = renderToStaticMarkup(<RoomWorkspace {...base} phase="lock" viewStep={3} />);
      expect(html).toContain('width:var(--ws-left)');
      expect(html).toContain('width:var(--ws-plan-open)');
      expect(html).toContain('data-plan-open="true"');
      expect(html).toContain('slot-ke-hoach');
      expect(html).toContain('aria-label="Thu gọn kế hoạch"');
    });

    it('dải Kế hoạch thu gọn mang chấm đỏ + số mục khi có lịch xung đột', () => {
      const html = renderToStaticMarkup(
        <RoomWorkspace {...base} phase="vote" viewStep={2} scheduleCount={3} hasConflicts />,
      );
      expect(html).toContain('bg-danger');
      expect(html).toContain('Lịch có giờ bị trùng');
      expect(html).toContain('>3<');
    });

    it('cột đổi rộng bằng transition CSS (lớp ws-col), có nhánh mức static', () => {
      const html = renderToStaticMarkup(<RoomWorkspace {...base} />);
      expect(html).toContain('ws-col');
      expect(html).toMatch(/data-motion-tier="(full|lite|static)"/);
    });
  });
});
