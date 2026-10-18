import { vi } from './locales/vi';
import { formatDistance, formatMoney, formatTime, formatTimeRange } from './format';
import type { Language } from './useLanguage';
import type { ConflictAlert, DroppedPlace, ReasonCode, ScheduleItem, Place } from '../types';

/**
 * Dịch mọi chữ do server (hoặc store) sinh ra. Component chỉ gọi các hàm ở đây,
 * không bao giờ hiện `message` thô của server.
 */

// Chữ ký lỏng của `t`: khoá ghép động nên không thể kiểm kiểu từng khoá (tính đủ khoá do test parity đảm bảo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TFn = (key: any, options?: any) => string;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

const langOf = (t: TFn): Language => (t('lang.code') === 'en' ? 'en' : 'vi');

const errorCodes = (): Record<string, string> => vi.errors as unknown as Record<string, string>;

// ---------------------------------------------------------------- lỗi API

/** Mã lạ → câu chung theo HTTP status. */
function genericByStatus(status: number | undefined): string {
  if (status === undefined) return 'errors.generic.unknown';
  if (status >= 500) return 'errors.generic.server';
  if ([400, 401, 403, 404, 409, 429].includes(status)) return `errors.generic.http${status}`;
  return 'errors.generic.unknown';
}

/** Khoá i18n cho một lỗi: mã đã biết → `errors.<CODE>`, mã lạ → câu chung theo status. */
export function errorMessageKey(err: unknown, fallbackCode?: string): string {
  const { code, status } = (err ?? {}) as { code?: string; status?: number };
  if (code && code in errorCodes()) return `errors.${code}`;
  if (status !== undefined) return genericByStatus(status);
  if (fallbackCode && fallbackCode in errorCodes()) return `errors.${fallbackCode}`;
  return 'errors.generic.unknown';
}

/**
 * Khoá i18n lưu vào store (`error`). Ưu tiên mã server; nếu server không cho mã dùng mã hành động
 * (ví dụ `VOTE_FAILED`). Lỗi mạng luôn ra `errors.NETWORK_ERROR`.
 */
export function errorKey(err: unknown, actionCode: string): string {
  const { code, status } = (err ?? {}) as { code?: string; status?: number };
  if (code === 'NETWORK_ERROR') return 'errors.NETWORK_ERROR';
  if (code && code in errorCodes()) return `errors.${code}`;
  if (status !== undefined && status >= 500) return 'errors.generic.server';
  return `errors.${actionCode}`;
}

/** Lỗi API → câu đã dịch. `fallbackCode` là mã hành động khi lỗi không có mã/status. */
export function describeApiError(err: unknown, t: TFn, fallbackCode?: string): string {
  return t(errorMessageKey(err, fallbackCode));
}

/** Lỗi mạng/timeout: component hiện nút thử lại. */
export function isNetworkError(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'NETWORK_ERROR';
}

/** Dịch giá trị `store.error` (khoá i18n) để component cũ vẫn hiện được. */
export function describeStoreError(key: string | null | undefined, t: TFn): string {
  if (!key) return '';
  return key.startsWith('errors.') ? t(key) : t('errors.generic.unknown');
}

// ------------------------------------------------------------- lỗi WebSocket

const WS_CODES = ['UNAUTHORIZED', 'MESSAGE_TOO_LONG', 'RATE_LIMIT_EXCEEDED'];

export function describeWsError(payload: { code?: string } | null | undefined, t: TFn): string {
  const code = payload?.code;
  if (code && WS_CODES.includes(code)) return t(`errors.ws.${code}`);
  return t('errors.ws.unknown');
}

// ------------------------------------------------------------------ xung đột

export interface ConflictContext {
  scheduleItems?: ScheduleItem[];
  places?: Place[];
  lang?: Language;
}

const placeNameOfItem = (item: ScheduleItem | undefined, places: Place[] | undefined): string | undefined => {
  if (!item) return undefined;
  const direct = (item as { place_name?: string; place?: { name?: string } }).place_name
    ?? (item as { place?: { name?: string } }).place?.name;
  if (direct) return direct;
  return places?.find((p) => p.id === item.place_id)?.name;
};

type Range = { start_minute?: number; end_minute?: number };

/** Câu xung đột theo `rule_code` + `params` (CR-06); thiếu `params` thì dựng từ store. */
export function describeConflict(conflict: ConflictAlert, ctx: ConflictContext, t: TFn): string {
  const lang = ctx.lang ?? langOf(t);
  const p = (conflict.params ?? {}) as Record<string, unknown>;
  const items = ctx.scheduleItems ?? [];
  const byId = (id: string | undefined) => items.find((i) => i.id === id);
  const ids = conflict.entity_ids ?? [];

  switch (conflict.rule_code) {
    case 'TIME_OVERLAP': {
      const names = Array.isArray(p.place_names) ? (p.place_names as string[]) : undefined;
      const ranges = Array.isArray(p.ranges) ? (p.ranges as Range[]) : undefined;
      const a = byId(ids[0]);
      const b = byId(ids[1]);
      const nameA = names?.[0] ?? placeNameOfItem(a, ctx.places);
      const nameB = names?.[1] ?? placeNameOfItem(b, ctx.places);
      const rA = ranges?.[0] ?? (a ? { start_minute: a.start_minute, end_minute: a.end_minute } : undefined);
      const rB = ranges?.[1] ?? (b ? { start_minute: b.start_minute, end_minute: b.end_minute } : undefined);
      if (nameA && nameB && rA && rB) {
        return t('conflict.TIME_OVERLAP', {
          nameA, nameB,
          rangeA: formatTimeRange(rA.start_minute ?? 0, rA.end_minute ?? 0, lang),
          rangeB: formatTimeRange(rB.start_minute ?? 0, rB.end_minute ?? 0, lang),
        });
      }
      break;
    }
    case 'TRAVEL_TIME': {
      const names = Array.isArray(p.place_names) ? (p.place_names as string[]) : undefined;
      const from = names?.[0] ?? placeNameOfItem(byId(str(p.from_item_id) ?? ids[0]), ctx.places);
      const to = names?.[1] ?? placeNameOfItem(byId(str(p.to_item_id) ?? ids[1]), ctx.places);
      const gap = num(p.gap_min);
      const travel = num(p.travel_min);
      if (from && to && gap !== undefined && travel !== undefined) {
        return t('conflict.TRAVEL_TIME', { from, to, gap, travel });
      }
      if (from && to) return t('conflict.TRAVEL_TIME_short', { from, to });
      break;
    }
    case 'OPENING_HOURS': {
      const item = byId(str(p.item_id) ?? ids[0]);
      const name = str(p.place_name) ?? placeNameOfItem(item, ctx.places);
      const open = num(p.open_minute);
      const close = num(p.close_minute);
      const start = num(p.start_minute) ?? item?.start_minute;
      const end = num(p.end_minute) ?? item?.end_minute;
      if (name && open !== undefined && close !== undefined && start !== undefined && end !== undefined) {
        return t('conflict.OPENING_HOURS', {
          name,
          range: formatTimeRange(start, end, lang),
          open: formatTime(open, lang),
          close: formatTime(close, lang),
        });
      }
      if (name) return t('conflict.OPENING_HOURS_short', { name });
      break;
    }
    case 'DUPLICATE_PLACE': {
      const names = Array.isArray(p.place_names) ? (p.place_names as string[]) : undefined;
      const nameA = names?.[0] ?? ctx.places?.find((x) => x.id === ids[0])?.name;
      const nameB = names?.[1] ?? ctx.places?.find((x) => x.id === ids[1])?.name;
      if (nameA && nameB) return t('conflict.DUPLICATE_PLACE', { nameA, nameB });
      break;
    }
    case 'BUDGET_THRESHOLD': {
      const total = num(p.total_cost);
      const limit = num(p.budget_limit);
      if (total !== undefined && limit !== undefined) {
        return t('conflict.BUDGET_THRESHOLD', {
          total: formatMoney(total, lang),
          limit: formatMoney(limit, lang),
        });
      }
      break;
    }
    default:
      break;
  }
  // Không đủ dữ liệu: câu chung theo rule_code, mã lạ thì câu chung nhất.
  const known = ['TIME_OVERLAP', 'TRAVEL_TIME', 'OPENING_HOURS', 'DUPLICATE_PLACE', 'BUDGET_THRESHOLD'];
  return known.includes(conflict.rule_code)
    ? t(`conflict.generic.${conflict.rule_code}`)
    : t('conflict.generic.UNKNOWN');
}

// --------------------------------------------------------------- lý do chọn

/**
 * Lý do của chọn hộ / lên lịch. Có mã → câu theo mã. Không có mã (backend cũ): trả câu gốc ở VI,
 * `null` ở EN (đây là chỗ duy nhất được phép dùng câu của server, chỉ khi đang ở VI).
 */
export function describeReason(
  reason: ReasonCode | null | undefined,
  t: TFn,
  fallbackText?: string | null,
): string | null {
  if (!reason?.code) return langOf(t) === 'vi' ? (fallbackText ?? null) : null;
  const lang = langOf(t);
  const p = (reason.params ?? {}) as Record<string, unknown>;
  const code = reason.code === 'TRAVEL_FROM' && p.from_origin ? 'TRAVEL_FROM_ORIGIN' : reason.code;
  const key = `reason.${code}`;
  if (!(code in (vi.reason as unknown as Record<string, string>))) {
    return lang === 'vi' ? (fallbackText ?? null) : null;
  }
  return t(key, {
    score: num(p.score), upvotes: num(p.upvotes),
    distance: num(p.distance_km) !== undefined ? formatDistance(num(p.distance_km)!, lang) : undefined,
    time: num(p.minute) !== undefined ? formatTime(num(p.minute)!, lang) : undefined,
    cost: num(p.cost) !== undefined ? formatMoney(num(p.cost)!, lang) : undefined,
    limit: num(p.budget_limit) !== undefined ? formatMoney(num(p.budget_limit)!, lang) : undefined,
    total: num(p.total_score),
    category: str(p.category) ? t(`category.${p.category}`, { defaultValue: String(p.category) }) : undefined,
    window: str(p.window) ? t(`reason.window.${p.window}`, { defaultValue: String(p.window) }) : undefined,
    range:
      num(p.start_minute) !== undefined && num(p.end_minute) !== undefined
        ? formatTimeRange(num(p.start_minute)!, num(p.end_minute)!, lang)
        : undefined,
    minutes: num(p.travel_min),
    from: str(p.from_name),
  });
}

/** Danh sách lý do đã dịch của một item; bỏ qua mục không dịch được. */
export function describeReasons(
  codes: ReasonCode[] | undefined,
  legacy: string[] | undefined,
  t: TFn,
): string[] {
  const out: string[] = [];
  const n = Math.max(codes?.length ?? 0, legacy?.length ?? 0);
  for (let i = 0; i < n; i += 1) {
    const text = codes?.[i]
      ? describeReason(codes[i], t, legacy?.[i])
      : describeReason(null, t, legacy?.[i]);
    if (text) out.push(text);
  }
  return out;
}

/** Lý do quán bị loại khỏi lịch tự động. */
export function describeDropReason(dropped: DroppedPlace, t: TFn): string | null {
  if (dropped.reason_code) {
    const text = describeReason(
      { code: dropped.reason_code, params: dropped.reason_params },
      t,
      dropped.reason,
    );
    if (text) return text;
  }
  return langOf(t) === 'vi' ? (dropped.reason || null) : null;
}
