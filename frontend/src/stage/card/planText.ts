// Văn bản emoji dán Zalo/Messenger (DESIGN gđ6 §5, OUTPUT §4B). Hàm thuần: nhận `t` + `lang` nên test được không cần i18n thật.
import type { TFunction } from 'i18next';
import type { Member, Room, ScheduleItem } from '../../types';
import { formatDistance, formatTimeWindow } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';

/** Số tên thành viên tối đa trong văn bản và trên thẻ. */
export const MAX_NAMES = 6;
const MAX_ADDRESS_CHARS = 48;

type TFn = TFunction;

/** Chặng di chuyển giữa hai mục liền nhau (số liệu ALGO-03, T-90 nối vào). */
export interface PlanLeg {
  fromId: string;
  toId: string;
  minutes: number;
  km?: number | null;
  /** Nguồn là ước lượng (không phải đường thật) → thêm "(ước lượng)". */
  estimated?: boolean;
}

/** Kết luận khả thi của cả lịch (ALGO-03). */
export interface PlanFeasibility {
  /** Số phút dự phòng còn dư khi lịch hợp lý. */
  spareMinutes?: number;
  /** Đoạn thiếu giờ (nếu có thì ưu tiên hơn `spareMinutes`). */
  shortfall?: { fromId: string; toId: string; minutes: number };
  estimated?: boolean;
}

export type PlanItem = Pick<
  ScheduleItem,
  'id' | 'place_id' | 'place_name' | 'place_address' | 'day_offset' | 'start_minute' | 'end_minute' | 'order_index'
>;

/** Thứ tự hiển thị: ngày, giờ bắt đầu, order_index. */
export function sortPlanItems<T extends PlanItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.day_offset - b.day_offset || a.start_minute - b.start_minute || a.order_index - b.order_index,
  );
}

/** Địa chỉ ngắn 1 dòng: hai đoạn đầu (trước dấu phẩy), cắt ở ~48 ký tự. Rỗng → ''. */
export function shortAddress(address: string | null | undefined): string {
  const parts = (address ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const text = parts.slice(0, 2).join(', ');
  if (text.length <= MAX_ADDRESS_CHARS) return text;
  return `${text.slice(0, MAX_ADDRESS_CHARS - 1).trimEnd()}…`;
}

/** Cắt danh sách còn tối đa `max` phần tử, trả thêm số phần tử bị cắt. */
export function limitList<T>(list: readonly T[], max: number): { shown: T[]; extra: number } {
  return { shown: list.slice(0, max), extra: Math.max(0, list.length - max) };
}

/** "Thứ Bảy (07/11/2026)" / "Saturday (Nov 7, 2026)"; lỗi → ''. */
export function describeLongDate(eventDate: string | undefined, lang: Language): string {
  const m = eventDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return '';
  if (lang === 'en') {
    const wd = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
    return `${wd} (${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)})`;
  }
  const wd = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} (${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()})`;
}

export interface PlanTextInput {
  room: Pick<Room, 'title' | 'event_date' | 'start_minute' | 'end_minute'>;
  items: readonly PlanItem[];
  members: readonly Pick<Member, 'nickname'>[];
  url: string;
  lang: Language;
  t: TFn;
  legs?: readonly PlanLeg[];
  feasibility?: PlanFeasibility | null;
}

/** Dòng "🛵 Di chuyển: ~20 phút (3,2 km) (ước lượng)". */
export function legLine(leg: PlanLeg, lang: Language, t: TFn): string {
  const base = t('export.text.travel', { minutes: Math.max(1, Math.round(leg.minutes)) });
  const km = leg.km != null && leg.km > 0 ? ` (${formatDistance(leg.km, lang)})` : '';
  const est = leg.estimated ? ` ${t('export.text.estimated')}` : '';
  return `${base}${km}${est}`;
}

/** Chuỗi emoji theo ngôn ngữ đang chọn. Dòng 🛵 và 💡/⚠️ chỉ có khi có `legs`/`feasibility`. */
export function buildPlanText({ room, items, members, url, lang, t, legs = [], feasibility = null }: PlanTextInput): string {
  const sorted = sortPlanItems(items);
  const nameOf = new Map(sorted.map((i) => [i.id, i.place_name]));
  const legAfter = new Map(legs.map((l) => [l.fromId, l]));
  const start = room.start_minute ?? 1020;
  const end = room.end_minute ?? 1380;

  const lines: string[] = [`🎉 ${t('export.text.header', { title: room.title })}`];
  const date = describeLongDate(room.event_date, lang);
  const windowText = t('export.text.window', { window: formatTimeWindow(start, end, lang) });
  lines.push(`📅 ${date ? `${date} | ` : ''}${windowText}`);

  sorted.forEach((item, i) => {
    const addr = shortAddress(item.place_address);
    const when = formatTimeWindow(item.start_minute, item.end_minute, lang);
    lines.push(`📍 ${when}: ${item.place_name}${addr ? ` (${addr})` : ''}`);
    const next = sorted[i + 1];
    const leg = legAfter.get(item.id);
    if (next && leg && leg.toId === next.id) lines.push(`🛵 ${legLine(leg, lang, t)}`);
  });

  if (members.length > 0) {
    const { shown, extra } = limitList(members, MAX_NAMES);
    const names = shown.map((m) => m.nickname).join(', ');
    lines.push(`👥 ${names}${extra > 0 ? ` (+${extra})` : ''}`);
  }

  if (feasibility) {
    const est = feasibility.estimated ? ` ${t('export.text.estimated')}` : '';
    if (feasibility.shortfall && feasibility.shortfall.minutes > 0) {
      const { fromId, toId, minutes } = feasibility.shortfall;
      lines.push(
        `⚠️ ${t('export.text.short', {
          from: nameOf.get(fromId) ?? '',
          to: nameOf.get(toId) ?? '',
          minutes: Math.round(minutes),
        })}${est}`,
      );
    } else if (feasibility.spareMinutes != null && feasibility.spareMinutes >= 0) {
      lines.push(`💡 ${t('export.text.ok', { minutes: Math.round(feasibility.spareMinutes) })}${est}`);
    }
  }

  lines.push(`👉 ${url}`);
  return lines.join('\n');
}
