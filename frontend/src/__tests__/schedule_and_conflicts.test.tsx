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

      expect(html).toContain('border-rose-300');
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

      expect(html).toContain('Chưa có lịch trình cho chuyến đi');
      expect(html).toContain('Thêm địa điểm vào lịch');
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
      expect(html).toContain('bg-rose-50');
      expect(html).toContain('border-rose-300');
      expect(html).toContain('CRITICAL');
      expect(html).toContain('Xung đột nghiêm trọng cần xử lý ngay');
      expect(html).toContain('Trùng lặp thời gian');
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

      expect(html).toContain('bg-amber-50');
      expect(html).toContain('border-amber-300');
      expect(html).toContain('WARNING (1)');
      expect(html).toContain('Cảnh báo xung đột lịch trình');
      expect(html).toContain('Thời gian nghỉ giữa 2 địa điểm');
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
      expect(html).toContain('CRITICAL');
      expect(html).toContain('Cơm Tấm Ba Ghiền');
      expect(html).toContain('Đánh giá lại');
      expect(html).toContain('Đóng');
    });
  });
});
