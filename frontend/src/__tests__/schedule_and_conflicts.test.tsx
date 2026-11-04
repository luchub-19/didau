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
import { CalendarColumn } from '../components/schedule/CalendarColumn';
import { AddScheduleItemModal } from '../components/schedule/AddScheduleItemModal';
import { ConflictListModal } from '../components/conflicts/ConflictListModal';
import { mockScheduleItems, mockPlaces, mockConflicts } from '../mocks/mockData';
import type { ScheduleItem } from '../types';

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

  describe('4. CalendarColumn (T-79, thay dòng thời gian cũ)', () => {
    it('render lưới lịch với các mục đã xếp + nút thêm quán tạm', () => {
      const html = renderToStaticMarkup(
        <CalendarColumn
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={mockScheduleItems}
          places={mockPlaces}
          isHost={true}
          onOpenAddModal={() => {}}
        />,
      );

      expect(html).toContain('data-testid="calendar-grid"');
      expect(html).toContain('Thêm quán vào lịch');
      expect(html).toContain('Cà Phê Trứng 3T');
      expect(html).toContain('09:00 – 10:30');
      // Một ngày thì không có dòng "Ngày khác"
      expect(html).not.toContain('data-testid="calendar-other-days"');
    });

    it('mục ở ngày khác không vẽ trên lưới, chỉ có dòng "Ngày khác: N mục"', () => {
      const day2: ScheduleItem = { ...mockScheduleItems[0], id: 'day2-item', day_offset: 1 };
      const html = renderToStaticMarkup(
        <CalendarColumn
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[mockScheduleItems[0], day2]}
          places={mockPlaces}
        />,
      );
      expect(html).toContain('Ngày khác: 1 mục');
      expect(html).not.toContain('data-testid="calendar-event-day2-item"');
    });

    it('lịch trống: lưới vẫn vẽ, có gợi ý kéo thả và nút xếp lịch tự động', () => {
      const html = renderToStaticMarkup(
        <CalendarColumn
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[]}
          places={mockPlaces}
          onOpenAddModal={() => {}}
        />,
      );

      expect(html).toContain('data-testid="calendar-grid"');
      expect(html).toContain('Kéo quán đã chốt từ bên trái thả vào đây');
      expect(html).toContain('Xếp lịch tự động');
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

  describe('6. ConflictListModal Component', () => {
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

    it('ô có xung đột: viền danger + icon, câu mô tả nằm trong nhãn của ô (popup T-81 hiện đầy đủ)', () => {
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
        <CalendarColumn
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={[second, mockScheduleItems[0]]}
          places={mockPlaces}
          conflicts={mockConflicts}
        />,
      );

      expect(html.match(/data-conflict="true"/g)?.length).toBe(2);
      expect(html).toContain('outline-danger');
      // Chip tổng ở đầu cột
      expect(html).toContain('data-testid="calendar-conflicts"');
      expect(html).toContain('1 xung đột');
      expect(html).toMatch(/aria-label="Cơm Tấm Ba Ghiền, 10:00 – 11:30\. [^"]*trùng giờ/);
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
        <CalendarColumn
          roomId="c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21"
          items={mockScheduleItems}
          places={notEligiblePlaces}
          conflicts={[]}
        />,
      );

      expect(html).not.toContain('data-testid="auto-plan-button"');
      expect(html).not.toContain('Cần ít nhất 1 quán đã chốt');
    });
  });
});
