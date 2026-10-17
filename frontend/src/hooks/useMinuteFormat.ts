/**
 * Tiện ích và hook định dạng thời gian dạng số phút (0 - 1439) sang định dạng giờ phút HH:mm.
 * Tuân thủ múi giờ Asia/Ho_Chi_Minh và quy ước hệ thống Đi Đâu.
 */

export function minuteToTimeString(minute?: number | null): string {
  if (minute === undefined || minute === null || isNaN(minute) || minute < 0) {
    return '00:00';
  }
  const normalized = Math.min(1439, Math.max(0, Math.floor(minute)));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function timeStringToMinute(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') {
    return 0;
  }
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) {
    return 0;
  }
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(mins)) {
    return 0;
  }
  const total = hours * 60 + mins;
  return Math.min(1439, Math.max(0, total));
}

export function formatMinuteRange(startMinute: number, endMinute: number): string {
  return `${minuteToTimeString(startMinute)} - ${minuteToTimeString(endMinute)}`;
}

export function formatDuration(minutes: number): string {
  if (isNaN(minutes) || minutes <= 0) {
    return '0 phút';
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) {
    return `${hours} tiếng`;
  }
  return `${remainingMinutes} phút`;
}

export function useMinuteFormat() {
  return {
    minuteToTimeString,
    timeStringToMinute,
    formatMinuteRange,
    formatDuration,
  };
}
