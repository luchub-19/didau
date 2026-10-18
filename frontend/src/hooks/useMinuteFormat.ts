import {
  formatTime,
  timeStringToMinute as timeStringToMinuteHelper,
  formatTimeRange,
  formatDuration as formatDurationHelper,
} from '../i18n/format';

/**
 * Tiện ích và hook định dạng thời gian dạng số phút (0 - 1439).
 * Gọi lại các hàm từ module i18n/format để đảm bảo tính nhất quán và hỗ trợ song ngữ,
 * đồng thời giữ nguyên chữ ký hàm cũ cho các component hiện có.
 */

export function minuteToTimeString(minute?: number | null): string {
  return formatTime(minute, 'vi');
}

export function timeStringToMinute(timeStr: string): number {
  return timeStringToMinuteHelper(timeStr);
}

export function formatMinuteRange(startMinute: number, endMinute: number): string {
  return formatTimeRange(startMinute, endMinute, 'vi');
}

export function formatDuration(minutes: number): string {
  return formatDurationHelper(minutes, 'vi', 'short');
}

export function useMinuteFormat() {
  return {
    minuteToTimeString,
    timeStringToMinute,
    formatMinuteRange,
    formatDuration,
  };
}
