import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatTimeRange,
  formatDuration,
  formatMoney,
  formatDistance,
  formatRelative,
} from '../i18n/format';

describe('i18n format test (chuẩn hoá Intl vi-VN / en-US)', () => {
  describe('formatTime', () => {
    it('định dạng giờ phút theo vi-VN (24h) và en-US (12h có AM/PM)', () => {
      expect(formatTime(540, 'vi')).toBe('09:00');
      expect(formatTime(540, 'en')).toBe('9:00 AM');

      expect(formatTime(1020, 'vi')).toBe('17:00');
      expect(formatTime(1020, 'en')).toBe('5:00 PM');

      expect(formatTime(0, 'vi')).toBe('00:00');
      expect(formatTime(0, 'en')).toBe('12:00 AM');

      expect(formatTime(1439, 'vi')).toBe('23:59');
      expect(formatTime(1439, 'en')).toBe('11:59 PM');
    });

    it('xử lý giá trị rỗng hoặc ngoại lệ an toàn', () => {
      expect(formatTime(null, 'vi')).toBe('00:00');
      expect(formatTime(undefined, 'vi')).toBe('00:00');
      expect(formatTime(-10, 'vi')).toBe('00:00');

      expect(formatTime(null, 'en')).toBe('12:00 AM');
      expect(formatTime(undefined, 'en')).toBe('12:00 AM');
      expect(formatTime(-10, 'en')).toBe('12:00 AM');
    });
  });

  describe('formatTimeRange', () => {
    it('ghép khoảng thời gian theo định dạng chuẩn của từng ngôn ngữ', () => {
      expect(formatTimeRange(540, 630, 'vi')).toBe('09:00 - 10:30');
      expect(formatTimeRange(540, 630, 'en')).toBe('9:00 AM - 10:30 AM');
    });
  });

  describe('formatDuration', () => {
    it('định dạng thời lượng dạng dài (long)', () => {
      expect(formatDuration(90, 'vi')).toBe('1 giờ 30 phút');
      expect(formatDuration(90, 'en')).toBe('1 h 30 min');

      expect(formatDuration(60, 'vi')).toBe('1 giờ');
      expect(formatDuration(60, 'en')).toBe('1 h');

      expect(formatDuration(45, 'vi')).toBe('45 phút');
      expect(formatDuration(45, 'en')).toBe('45 min');

      expect(formatDuration(0, 'vi')).toBe('0 phút');
      expect(formatDuration(0, 'en')).toBe('0 min');
      expect(formatDuration(-10, 'vi')).toBe('0 phút');
      expect(formatDuration(-10, 'en')).toBe('0 min');
    });

    it('định dạng thời lượng dạng ngắn (short)', () => {
      expect(formatDuration(90, 'vi', 'short')).toBe('1h 30m');
      expect(formatDuration(90, 'en', 'short')).toBe('1h 30m');

      expect(formatDuration(60, 'vi', 'short')).toBe('1 tiếng');
      expect(formatDuration(60, 'en', 'short')).toBe('1h');

      expect(formatDuration(45, 'vi', 'short')).toBe('45 phút');
      expect(formatDuration(45, 'en', 'short')).toBe('45m');

      expect(formatDuration(0, 'vi', 'short')).toBe('0 phút');
      expect(formatDuration(0, 'en', 'short')).toBe('0 min');
    });
  });

  describe('formatMoney', () => {
    it('định dạng tiền tệ VND đúng quy chuẩn vi-VN và en-US', () => {
      const viResult = formatMoney(45000, 'vi');
      // vi-VN: 45.000 ₫ (với non-breaking space hoặc regular space)
      expect(viResult).toMatch(/45\.000\s?₫/);

      const enResult = formatMoney(45000, 'en');
      // en-US: ₫45,000
      expect(enResult).toBe('₫45,000');
    });

    it('xử lý số tiền 0', () => {
      expect(formatMoney(0, 'vi')).toMatch(/0\s?₫/);
      expect(formatMoney(0, 'en')).toBe('₫0');
    });
  });

  describe('formatDistance', () => {
    it('định dạng khoảng cách số thập phân dấu phẩy ở vi và dấu chấm ở en', () => {
      expect(formatDistance(1.2, 'vi')).toBe('1,2 km');
      expect(formatDistance(1.2, 'en')).toBe('1.2 km');
    });

    it('xử lý số 0 hoặc số không hợp lệ', () => {
      expect(formatDistance(0, 'vi')).toBe('0,0 km');
      expect(formatDistance(0, 'en')).toBe('0.0 km');
      expect(formatDistance(-5, 'vi')).toBe('0 km');
    });
  });

  describe('formatRelative', () => {
    it('định dạng thời gian tương đối', () => {
      const now = new Date('2026-10-18T12:00:00Z');
      const fiveMinAgo = new Date('2026-10-18T11:55:00Z');
      const yesterday = new Date('2026-10-17T12:00:00Z');
      const inTwoHours = new Date('2026-10-18T14:00:00Z');

      expect(formatRelative(fiveMinAgo, 'vi', now)).toBe('5 phút trước');
      expect(formatRelative(fiveMinAgo, 'en', now)).toBe('5 minutes ago');

      expect(formatRelative(yesterday, 'vi', now)).toMatch(/(Hôm qua|1 ngày trước)/);
      expect(formatRelative(yesterday, 'en', now)).toBe('yesterday');

      expect(formatRelative(inTwoHours, 'vi', now)).toMatch(/2 giờ/);
      expect(formatRelative(inTwoHours, 'en', now)).toBe('in 2 hours');
    });
  });
});
