// Nút thật sau màn công bố: đường đi, chia sẻ, thêm vào lịch. Hàm dựng URL/tệp là thuần để test được.
import type { Place, Room, ScheduleItem } from '../../types';

const DEFAULT_START_MINUTE = 1020; // 17:00
const DEFAULT_END_MINUTE = 1380; // 23:00

/**
 * Link chỉ đường mở ở tab mới (chỉ là liên kết công khai của Google Maps, không gọi API, không cần key).
 * Có toạ độ thì dùng toạ độ, không thì tìm theo tên + địa chỉ.
 */
export function directionsUrl(place: Pick<Place, 'name' | 'address' | 'latitude' | 'longitude'>): string {
  const destination =
    place.latitude != null && place.longitude != null
      ? `${place.latitude},${place.longitude}`
      : [place.name, place.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

// RFC 5545: thoát \ ; , và xuống dòng trong giá trị văn bản
function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** 'YYYY-MM-DD' + phút trong ngày (có thể ≥1440 = sang ngày sau) → giờ địa phương 'YYYYMMDDTHHMM00'. */
export function icsLocalTime(eventDate: string, minute: number): string {
  const [y, m, d] = eventDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 0, minute));
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00`
  );
}

export interface IcsInput {
  room: Pick<Room, 'id' | 'title' | 'event_date' | 'start_minute' | 'end_minute'>;
  place: Pick<Place, 'id' | 'name' | 'address'>;
  url: string;
  now?: Date;
}

/**
 * Sự kiện lịch cho buổi đi chơi: ngày của phòng, khung giờ của phòng (mặc định 17:00–23:00), địa điểm là quán
 * thắng. Giờ "trôi" (không múi giờ) để lịch hiểu là giờ địa phương của người mở.
 */
export function buildIcs({ room, place, url, now = new Date() }: IcsInput): string {
  const start = room.start_minute ?? DEFAULT_START_MINUTE;
  let end = room.end_minute ?? DEFAULT_END_MINUTE;
  if (end <= start) end += 1440;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Di Dau//Reveal//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${room.id}-${place.id}@didau`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsLocalTime(room.event_date, start)}`,
    `DTEND:${icsLocalTime(room.event_date, end)}`,
    `SUMMARY:${icsText(`${place.name} · ${room.title}`)}`,
    ...(place.address ? [`LOCATION:${icsText(place.address)}`] : []),
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export interface ScheduleIcsInput {
  room: Pick<Room, 'id' | 'title' | 'event_date'>;
  items: readonly Pick<
    ScheduleItem,
    'id' | 'place_id' | 'place_name' | 'place_address' | 'day_offset' | 'start_minute' | 'end_minute' | 'order_index' | 'note'
  >[];
  /** Địa chỉ/toạ độ dự phòng khi mục lịch thiếu địa chỉ. */
  places?: readonly Pick<Place, 'id' | 'address'>[];
  url: string;
  now?: Date;
}

/** RFC 5545 §3.1: dòng dài hơn 75 octet được gập, dòng tiếp bắt đầu bằng một dấu cách (không cắt giữa ký tự). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // dòng tiếp đã mất 1 octet cho dấu cách đầu
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/**
 * Cả lịch là một tệp nhiều VEVENT: mỗi mục một sự kiện, ngày = ngày phòng + `day_offset`, giờ địa phương "trôi"
 * (không múi giờ). Mục kết thúc <= bắt đầu coi là qua nửa đêm. Thứ tự theo (ngày, order_index).
 */
export function buildScheduleIcs({ room, items, places = [], url, now = new Date() }: ScheduleIcsInput): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const addressOf = new Map(places.map((p) => [p.id, p.address]));
  const ordered = [...items].sort((a, b) => a.day_offset - b.day_offset || a.order_index - b.order_index);
  const events = ordered.flatMap((item) => {
    const base = item.day_offset * 1440;
    const start = base + item.start_minute;
    let end = base + item.end_minute;
    if (end <= start) end += 1440;
    const address = item.place_address || addressOf.get(item.place_id) || '';
    return [
      'BEGIN:VEVENT',
      `UID:${room.id}-${item.id}@didau`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocalTime(room.event_date, start)}`,
      `DTEND:${icsLocalTime(room.event_date, end)}`,
      `SUMMARY:${icsText(`${item.place_name} · ${room.title}`)}`,
      ...(address ? [`LOCATION:${icsText(address)}`] : []),
      ...(item.note ? [`DESCRIPTION:${icsText(item.note)}`] : []),
      `URL:${url}`,
      'END:VEVENT',
    ];
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Di Dau//Plan//EN',
    'CALSCALE:GREGORIAN',
    ...events,
    'END:VCALENDAR',
    '',
  ]
    .map(foldIcsLine)
    .join('\r\n');
}

/** Tên tệp an toàn: bỏ dấu, chỉ giữ chữ-số-gạch. */
export function icsFileName(placeName: string): string {
  const slug = placeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0110\u0111]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `di-dau-${slug || 'plan'}.ics`;
}

/** Tải tệp .ics xuống (trình duyệt/điện thoại mở bằng ứng dụng lịch). */
export function downloadIcs(content: string, fileName: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
