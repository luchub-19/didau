import { vi } from './locales/vi';
import { en } from './locales/en';
import type { Language } from './useLanguage';

/**
 * Tiện ích định dạng ngày giờ, số tiền, khoảng cách và thời gian tương đối
 * theo chuẩn Intl tương ứng với locale vi-VN / en-US.
 */

export function formatTime(minute?: number | null, lang: Language = 'vi'): string {
  if (minute === undefined || minute === null || isNaN(minute) || minute < 0) {
    return lang === 'en' ? '12:00 AM' : '00:00';
  }
  const normalized = Math.min(1439, Math.max(0, Math.floor(minute)));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const date = new Date(2026, 0, 1, hours, mins);

  if (lang === 'en') {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
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

export function formatTimeRange(
  startMinute: number,
  endMinute: number,
  lang: Language = 'vi',
): string {
  return `${formatTime(startMinute, lang)} - ${formatTime(endMinute, lang)}`;
}

/**
 * Khoảng giờ gọn cho chip khung giờ (DESIGN gđ6 §2).
 * VI: `18:00 – 22:00`. EN: `6 – 10 PM` (cùng buổi), `11 AM – 2 PM` (khác buổi), `6:30 – 10 PM` (giữ phút lẻ).
 */
export function formatTimeWindow(startMinute: number, endMinute: number, lang: Language = 'vi'): string {
  if (lang !== 'en') return `${formatTime(startMinute, 'vi')} – ${formatTime(endMinute, 'vi')}`;
  const part = (m: number) => {
    const n = Math.min(1439, Math.max(0, Math.floor(m)));
    const h24 = Math.floor(n / 60);
    const min = n % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { text: min === 0 ? `${h12}` : `${h12}:${String(min).padStart(2, '0')}`, ap: h24 < 12 ? 'AM' : 'PM' };
  };
  const a = part(startMinute);
  const b = part(endMinute);
  return a.ap === b.ap ? `${a.text} – ${b.text} ${b.ap}` : `${a.text} ${a.ap} – ${b.text} ${b.ap}`;
}

/** Ngày dài theo ngôn ngữ ("Thứ Bảy 08/11" / "Sat, Nov 8"); lỗi/rỗng → ''. */
export function describeEventDate(eventDate: string | undefined, lang: Language): string {
  const m = eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  if (lang === 'en') return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const wd = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

export function formatDuration(
  minutes: number,
  lang: Language = 'vi',
  style: 'long' | 'short' = 'long',
): string {
  const mins = Math.floor(isNaN(minutes) || minutes <= 0 ? 0 : minutes);
  const hours = Math.floor(mins / 60);
  const remainingMinutes = mins % 60;
  const dict = lang === 'en' ? en.common.duration : vi.common.duration;

  if (mins === 0) {
    return dict.zero;
  }

  if (style === 'short') {
    if (hours > 0 && remainingMinutes > 0) {
      return dict.shortHoursAndMinutes
        .replace('{{hours}}', String(hours))
        .replace('{{minutes}}', String(remainingMinutes));
    }
    if (hours > 0) {
      return dict.shortHoursOnly.replace('{{hours}}', String(hours));
    }
    return dict.shortMinutesOnly.replace('{{minutes}}', String(remainingMinutes));
  }

  if (hours > 0 && remainingMinutes > 0) {
    return dict.hoursAndMinutes
      .replace('{{hours}}', String(hours))
      .replace('{{minutes}}', String(remainingMinutes));
  }
  if (hours > 0) {
    return dict.hoursOnly.replace('{{hours}}', String(hours));
  }
  return dict.minutesOnly.replace('{{minutes}}', String(remainingMinutes));
}

export function formatMoney(vnd: number, lang: Language = 'vi'): string {
  const amount = isNaN(vnd) ? 0 : Math.round(vnd);
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDistance(km: number, lang: Language = 'vi'): string {
  if (isNaN(km) || km < 0) {
    return '0 km';
  }
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km);
  return `${formatted} km`;
}

export function formatRelative(
  dateInput: Date | number | string,
  lang: Language = 'vi',
  nowInput?: Date | number,
): string {
  const date =
    typeof dateInput === 'object' && dateInput instanceof Date
      ? dateInput
      : new Date(dateInput);
  const now = nowInput
    ? typeof nowInput === 'object' && nowInput instanceof Date
      ? nowInput
      : new Date(nowInput)
    : new Date();

  if (isNaN(date.getTime()) || isNaN(now.getTime())) {
    return '';
  }

  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const diffMonth = Math.round(diffDay / 30);
  const diffYear = Math.round(diffDay / 365);

  const locale = lang === 'en' ? 'en-US' : 'vi-VN';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSec) < 45) {
    return rtf.format(diffSec, 'second');
  }
  if (Math.abs(diffMin) < 45) {
    return rtf.format(diffMin, 'minute');
  }
  if (Math.abs(diffHour) < 22) {
    return rtf.format(diffHour, 'hour');
  }
  if (Math.abs(diffDay) < 26) {
    return rtf.format(diffDay, 'day');
  }
  if (Math.abs(diffMonth) < 11) {
    return rtf.format(diffMonth, 'month');
  }
  return rtf.format(diffYear, 'year');
}

// Giữ các alias tương thích ngược với API cũ
export const minuteToTimeString = (minute?: number | null): string =>
  formatTime(minute, 'vi');
export const formatMinuteRange = (
  startMinute: number,
  endMinute: number,
): string => formatTimeRange(startMinute, endMinute, 'vi');
