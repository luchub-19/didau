import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import {
  minuteToTimeString,
  timeStringToMinute,
  formatMinuteRange,
  formatDuration,
  useMinuteFormat,
} from '../hooks/useMinuteFormat';
import { TimeSlotPicker } from '../components/schedule/TimeSlotPicker';
import { ScheduleItemCard } from '../components/schedule/ScheduleItemCard';
import { ScheduleTimeline } from '../components/schedule/ScheduleTimeline';
import { AddScheduleItemModal } from '../components/schedule/AddScheduleItemModal';
import { ConflictAlertBanner } from '../components/conflicts/ConflictAlertBanner';
import { ConflictListModal } from '../components/conflicts/ConflictListModal';
import { mockScheduleItems, mockPlaces, mockConflicts } from '../mocks/mockData';
import type { ConflictAlert, ScheduleItem } from '../types';

describe('T-21: Frontend UI - Drag-and-Drop Schedule Builder & Conflict Alert Banner', () => {
  describe('1. useMinuteFormat Hook & Utilities', () => {
    it('chuyển đổi số phút (0 - 1439) sang chuỗi HH:mm chuẩn xác', () => {
      expect(minuteToTimeString(0)).toBe('00:00');
      expect(minuteToTimeString(540)).toBe('09:00');
      expect(minuteToTimeString(630)).toBe('10:30');
      expect(minuteToTimeString(855)).toBe('14:15');
      expect(minuteToTimeString(1439)).toBe('23:59');
      // Edge cases
      expect(minuteToTimeString(-10)).toBe('00:00');
      expect(minuteToTimeString(2000)).toBe('23:59');
      expect(minuteToTimeString(null)).toBe('00:00');
      expect(minuteToTimeString(undefined)).toBe('00:00');
    });

    it('chuyển đổi chuỗi HH:mm sang số phút từ 00:00', () => {
      expect(timeStringToMinute('00:00')).toBe(0);
      expect(timeStringToMinute('09:00')).toBe(540);
      expect(timeStringToMinute('10:30')).toBe(630);
      expect(timeStringToMinute('14:15')).toBe(855);
      expect(timeStringToMinute('23:59')).toBe(1439);
      // Edge cases
      expect(timeStringToMinute('')).toBe(0);
      expect(timeStringToMinute('invalid')).toBe(0);
    });

    it('định dạng khung giờ và thời lượng hoạt động', () => {
      expect(formatMinuteRange(540, 630)).toBe('09:00 - 10:30');
      expect(formatMinuteRange(0, 1439)).toBe('00:00 - 23:59');

      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(60)).toBe('1 tiếng');
      expect(formatDuration(45)).toBe('45 phút');
      expect(formatDuration(0)).toBe('0 phút');
      expect(formatDuration(-10)).toBe('0 phút');

      const hook = useMinuteFormat();
      expect(hook.minuteToTimeString(540)).toBe('09:00');
      expect(hook.timeStringToMinute('10:30')).toBe(630);
    });
  });

  describe('2. TimeSlotPicker Component', () => {
    it('render khung chọn giờ bắt đầu, kết thúc và hiển thị thời lượng', () => {
      const html = renderToStaticMarkup(
        <TimeSlotPicker
          startMinute={540}
          endMinute={630}
          onChange={() => {}}
          label="Khung giờ ăn sáng"
        />,
      );

      expect(html).toContain('Khung giờ ăn sáng');
      expect(html).toContain('09:00');
      expect(html).toContain('10:30');
      expect(html).toContain('Thời lượng: 1h 30m');
      expect(html).toContain('+30p');
      expect(html).toContain('+60p');
    });

    it('hiển thị cảnh báo lỗi nếu giờ bắt đầu >= giờ kết thúc', () => {
      const html = renderToStaticMarkup(
        <TimeSlotPicker
          startMinute={630}
          endMinute={540}
          onChange={() => {}}
        />,
      );

      expect(html).toContain('Giờ bắt đầu (10:30) phải sớm hơn giờ kết thúc (09:00)');
    });
  });

  describe('3. ScheduleItemCard Component', () => {
    const item: ScheduleItem = mockScheduleItems[0];

    it('render thông tin mục lịch trình bình thường', () => {
      const html = renderToStaticMarkup(
        <ScheduleItemCard
          item={item}
          index={0}
          totalItems={1}
          category="DRINK"
          isConflict={false}
          isHost={true}
          onDelete={() => {}}
          onMoveUp={() => {}}
          onMoveDown={() => {}}
        />,
      );

      expect(html).toContain('Cà Phê Trứng 3T');
      expect(html).toContain('09:00 - 10:30');
      expect(html).toContain('1h 30m');
      expect(html).toContain('1A Tôn Đức Thắng, Q1');
      expect(html).toContain('Uống cà phê sáng và ngắm tàu thuyền');
      expect(html).toContain('data-testid="schedule-item-4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d"');
    });

    it('render cảnh báo màu đỏ khi mục lịch trình có xung đột thời gian', () => {
      const html = renderToStaticMarkup(
        <ScheduleItemCard
          item={item}
          index={0}
          totalItems={2}
          category="DRINK"
          isConflict={true}
          conflictMessages={['Trùng lặp thời gian với Cơm Tấm Ba Ghiền']}
          isHost={true}
        />,
      );

      expect(html).toContain('border-danger');
      expect(html).toContain('Xung đột');
      expect(html).toContain('Trùng lặp thời gian với Cơm Tấm Ba Ghiền');
    });
  });

  describe('4. ScheduleTimeline Component', () => {
    it('render trục thời gian với danh sách các địa điểm đã xếp lịch', () => {
      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={mockScheduleItems}
          places={mockPlaces}
          isHost={true}
          onOpenAddModal={() => {}}
        />,
      );

      expect(html).toContain('Tất cả (1)');
      expect(html).toContain('Xếp lịch mới');
      expect(html).toContain('Cà Phê Trứng 3T');
      expect(html).toContain('09:00 - 10:30');
    });

    it('render giao diện trống khi chưa có mục nào trong lịch trình', () => {
      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[]}
          places={mockPlaces}
          onOpenAddModal={() => {}}
        />,
      );

      expect(html).toContain('Chưa có lịch');
      expect(html).toContain('Lên lịch giúp tôi');
    });
  });

  describe('5. AddScheduleItemModal Component', () => {
    it('render modal thêm mục lịch trình với danh sách quán và gợi ý giờ mở cửa', () => {
      const html = renderToStaticMarkup(
        <AddScheduleItemModal
          isOpen={true}
          onClose={() => {}}
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          places={mockPlaces}
        />,
      );

      expect(html).toContain('Thêm địa điểm vào lịch trình');
      expect(html).toContain('Chọn địa điểm');
      expect(html).toContain('Cà Phê Trứng 3T');
      expect(html).toContain('Ngày 1');
      expect(html).toContain('Khung giờ hoạt động');
      expect(html).toContain('Ghi chú (tùy chọn)');
      expect(html).toContain('Thêm vào lịch');
    });
  });

  describe('6. ConflictAlertBanner & ConflictListModal Components', () => {
    it('không render banner khi danh sách xung đột rỗng', () => {
      const html = renderToStaticMarkup(
        <ConflictAlertBanner
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          conflicts={[]}
        />,
      );
      expect(html).toBe('');
    });

    it('render banner màu đỏ (CRITICAL) khi có xung đột trùng giờ nghiêm trọng', () => {
      const html = renderToStaticMarkup(
        <ConflictAlertBanner
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          conflicts={mockConflicts}
        />,
      );

      expect(html).toContain('data-testid="conflict-alert-banner"');
      expect(html).toContain('bg-danger-soft');
      expect(html).toContain('border-danger');
      expect(html).toContain('Nghiêm trọng');
      expect(html).toContain('Xung đột nghiêm trọng cần xử lý ngay');
      expect(html).toContain('bị trùng giờ với');
      expect(html).toContain('Chi tiết (1)');
      expect(html).toContain('Đánh giá lại');
    });

    it('render banner màu vàng (WARNING) khi chỉ có cảnh báo thời gian di chuyển hoặc ngân sách', () => {
      const warningConflicts: ConflictAlert[] = [
        {
          id: 'warn-1',
          rule_code: 'TRAVEL_TIME',
          level: 'WARNING',
          message: 'Thời gian nghỉ giữa 2 địa điểm ngắn hơn dự kiến di chuyển (15 phút)',
          entity_type: 'SCHEDULE',
          entity_ids: ['item-1'],
          resolved: false,
          created_at: '2026-10-17T08:00:00Z',
        },
      ];

      const html = renderToStaticMarkup(
        <ConflictAlertBanner
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          conflicts={warningConflicts}
        />,
      );

      expect(html).toContain('bg-warning-soft');
      expect(html).toContain('border-warning');
      expect(html).toContain('Cảnh báo (1)');
      expect(html).toContain('Cảnh báo xung đột lịch trình');
      expect(html).toContain('Không đủ thời gian di chuyển');
    });

    it('render modal chi tiết danh sách xung đột với đầy đủ các rule code', () => {
      const html = renderToStaticMarkup(
        <ConflictListModal
          isOpen={true}
          onClose={() => {}}
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          conflicts={mockConflicts}
        />,
      );

      expect(html).toContain('Chi tiết cảnh báo xung đột lịch trình');
      expect(html).toContain('Trùng lặp thời gian');
      expect(html).toContain('Nghiêm trọng');
      expect(html).toContain('Cơm Tấm Ba Ghiền');
      expect(html).toContain('Đánh giá lại');
      expect(html).toContain('Đóng');
    });
  });

  describe('7. T-46: Dòng thời gian, a11y sắp xếp bàn phím, qua nửa đêm & song ngữ', () => {
    it('hiển thị nhãn "(hôm sau)" khi mục lịch trình kết thúc qua nửa đêm', () => {
      const midnightItem: ScheduleItem = {
        ...mockScheduleItems[0],
        id: 'midnight-item-1',
        start_minute: 1380, // 23:00
        end_minute: 1470, // 00:30 next day (or 30)
      };

      const html = renderToStaticMarkup(
        <ScheduleItemCard
          item={midnightItem}
          index={0}
          totalItems={1}
          category="DRINK"
        />,
      );

      expect(html).toContain('(hôm sau)');
      expect(html).toContain('23:00 - 00:30');
    });

    it('nút di chuyển lên/xuống có aria-label và disabled đúng vị trí đầu/cuối danh sách', () => {
      const item: ScheduleItem = mockScheduleItems[0];
      const html = renderToStaticMarkup(
        <ScheduleItemCard
          item={item}
          index={0}
          totalItems={3}
          onMoveUp={() => {}}
          onMoveDown={() => {}}
          onDelete={() => {}}
        />,
      );

      expect(html).toContain('aria-label="Di chuyển lên"');
      expect(html).toContain('aria-label="Di chuyển xuống"');
      expect(html).toContain('aria-label="Xoá khỏi lịch"');
      // Index 0 disabled Move Up
      expect(html).toMatch(/disabled=""[^>]*aria-label="Di chuyển lên"/);
    });

    it('ScheduleTimeline hiển thị thời gian di chuyển và khoảng trống giữa 2 mục', () => {
      const item1: ScheduleItem = {
        ...mockScheduleItems[0],
        id: 'item-1',
        place_id: mockPlaces[0].id,
        start_minute: 540, // 09:00
        end_minute: 600, // 10:00
        order_index: 0,
        day_offset: 0,
      };
      const item2: ScheduleItem = {
        ...mockScheduleItems[0],
        id: 'item-2',
        place_id: mockPlaces[1].id,
        start_minute: 690, // 11:30 (trống 90m = 1h 30m)
        end_minute: 750, // 12:30
        order_index: 1,
        day_offset: 0,
      };

      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[item1, item2]}
          places={mockPlaces}
          isHost={true}
        />,
      );

      // Khoảng trống lớn hiển thị "Trống 1 giờ 30 phút"
      expect(html).toContain('Trống 1 giờ 30 phút');
      // Di chuyển giữa 2 điểm có toạ độ
      expect(html).toContain('phút di chuyển');
    });

    it('AddScheduleItemModal cảnh báo ngay nếu khung giờ chọn nằm ngoài giờ mở cửa', () => {
      const placeWithHours = {
        ...mockPlaces[0],
        open_minute: 480, // 08:00
        close_minute: 600, // 10:00
      };

      // Chọn 11:00 - 12:00 ngoài giờ mở cửa
      const html = renderToStaticMarkup(
        <AddScheduleItemModal
          isOpen={true}
          onClose={() => {}}
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          places={[placeWithHours]}
          preselectedPlaceId={placeWithHours.id}
        />,
      );

      expect(html).toContain('Quán mở cửa 08:00 – 10:00');
      expect(html).toContain('nằm ngoài giờ mở cửa');
    });

    it('ScheduleTimeline hiển thị dải tóm tắt xung đột đầu tab khi có xung đột', () => {
      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={mockScheduleItems}
          places={mockPlaces}
          conflicts={mockConflicts}
        />,
      );

      // mockConflicts có 1 xung đột
      expect(html).toContain('data-testid="schedule-conflicts-summary"');
      expect(html).toContain('1 vấn đề trong lịch');
      expect(html).toContain('Chi tiết (1)');
    });

    it('V6: xung đột của một cặp chỉ hiện câu mô tả ở thẻ sau, cả 2 thẻ đều có huy hiệu', () => {
      const second: ScheduleItem = {
        ...mockScheduleItems[0],
        id: '5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e',
        place_name: 'Cơm Tấm Ba Ghiền',
        start_minute: 600,
        end_minute: 690,
        order_index: 1,
        note: null,
      };
      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[second, mockScheduleItems[0]]}
          places={mockPlaces}
          conflicts={mockConflicts}
        />,
      );

      // Huy hiệu "Xung đột" trên cả 2 thẻ, nhưng chỉ 1 hộp mô tả xung đột
      expect(html.match(/>Xung đột</g)?.length).toBe(2);
      expect(html.match(/mt-2\.5 p-2\.5 rounded-card/g)?.length).toBe(1);
      // Hộp mô tả nằm sau tên quán thứ hai (thẻ sau)
      const secondName = html.indexOf('Cơm Tấm Ba Ghiền</h4>');
      expect(secondName).toBeGreaterThan(-1);
      expect(html.indexOf('mt-2.5 p-2.5 rounded-card')).toBeGreaterThan(secondName);
    });

    it('T-56: thanh công cụ không chen câu giải thích khi chưa đủ điều kiện lên lịch tự động', () => {
      // Không quán nào đã chốt, chưa ai vote
      const notEligiblePlaces = mockPlaces.map((p) => ({
        ...p,
        status: 'PROPOSED' as const,
        upvotes: 0,
        downvotes: 0,
      }));
      const html = renderToStaticMarkup(
        <ScheduleTimeline
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={mockScheduleItems}
          places={notEligiblePlaces}
          conflicts={[]}
        />,
      );

      expect(html).not.toContain('data-testid="auto-plan-button"');
      expect(html).not.toContain('Cần ít nhất 1 quán đã chốt');
    });

    it('T-56: banner xung đột ở mobile chỉ giữ nút Chi tiết (Đánh giá lại, Xem lịch trình ẩn dưới sm)', () => {
      const html = renderToStaticMarkup(
        <ConflictAlertBanner
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          conflicts={mockConflicts}
          onSwitchToSchedule={() => {}}
        />,
      );

      expect(html).toMatch(/class="[^"]*hidden sm:inline-flex[^"]*"[^>]*>(?:(?!<\/button>).)*Đánh giá lại/);
      expect(html).toMatch(/class="hidden sm:inline [^"]*"[^>]*>Xem lịch trình/);
    });
  });
});
