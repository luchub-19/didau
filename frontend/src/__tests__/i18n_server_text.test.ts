import { describe, it, expect } from 'vitest';
import i18n from '../i18n';
import { vi as viDict } from '../i18n/locales/vi';
import {
  describeApiError,
  describeConflict,
  describeDropReason,
  describeReason,
  describeReasons,
  describeStoreError,
  describeWsError,
  errorKey,
} from '../i18n/serverText';
import { cuisineLabel } from '../i18n/osm';
import type { ConflictAlert } from '../types';

const tVi = i18n.getFixedT('vi') as (k: string, o?: object) => string;
const tEn = i18n.getFixedT('en') as (k: string, o?: object) => string;

const VI_CHAR = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// Tên quán trong params là dữ liệu nên được phép có dấu: bỏ chúng trước khi kiểm tra.
const stripNames = (text: string, names: string[]) => names.reduce((s, n) => s.split(n).join(''), text);

const conflict = (rule_code: string, params?: Record<string, unknown>, entity_ids: string[] = []): ConflictAlert => ({
  id: 'c1',
  rule_code,
  level: 'WARNING',
  message: 'Câu tiếng Việt của server',
  params,
  entity_type: 'SCHEDULE',
  entity_ids,
  resolved: false,
  created_at: '2026-10-18T00:00:00Z',
});

describe('describeApiError', () => {
  const codes = Object.keys(viDict.errors).filter((k) => k !== 'generic' && k !== 'ws');

  it('mỗi mã lỗi có câu ở cả vi và en', () => {
    for (const code of codes) {
      expect(describeApiError({ code, status: 400 }, tVi)).toBe(tVi(`errors.${code}`));
      expect(describeApiError({ code, status: 400 }, tEn)).toBe(tEn(`errors.${code}`));
      expect(tEn(`errors.${code}`)).not.toMatch(VI_CHAR);
    }
  });

  it('mã lạ ra câu chung theo HTTP status', () => {
    expect(describeApiError({ code: 'WHATEVER', status: 404 }, tEn)).toBe(tEn('errors.generic.http404'));
    expect(describeApiError({ code: 'WHATEVER', status: 429 }, tVi)).toBe(tVi('errors.generic.http429'));
    expect(describeApiError({ code: 'WHATEVER', status: 503 }, tEn)).toBe(tEn('errors.generic.server'));
    expect(describeApiError({ code: 'WHATEVER' }, tEn)).toBe(tEn('errors.generic.unknown'));
  });

  it('không lộ message thô của server', () => {
    const text = describeApiError({ code: 'WHATEVER', status: 400, message: 'Câu tiếng Việt của server' }, tEn);
    expect(text).not.toContain('server');
    expect(text).not.toMatch(VI_CHAR);
  });

  it('errorKey ưu tiên mã server, rồi mã hành động', () => {
    expect(errorKey({ code: 'NICKNAME_TAKEN', status: 409 }, 'JOIN_ROOM_FAILED')).toBe('errors.NICKNAME_TAKEN');
    expect(errorKey({ code: 'NETWORK_ERROR' }, 'VOTE_FAILED')).toBe('errors.NETWORK_ERROR');
    expect(errorKey(new Error('x'), 'VOTE_FAILED')).toBe('errors.VOTE_FAILED');
    expect(errorKey({ code: 'X', status: 500 }, 'VOTE_FAILED')).toBe('errors.generic.server');
    expect(describeStoreError('errors.VOTE_FAILED', tEn)).toBe(tEn('errors.VOTE_FAILED'));
    expect(describeStoreError(null, tEn)).toBe('');
  });

  it('WS: mã đã biết và mã lạ', () => {
    for (const code of ['UNAUTHORIZED', 'MESSAGE_TOO_LONG', 'RATE_LIMIT_EXCEEDED']) {
      expect(describeWsError({ code }, tEn)).toBe(tEn(`errors.ws.${code}`));
    }
    expect(describeWsError({ code: 'X' }, tEn)).toBe(tEn('errors.ws.unknown'));
  });
});

describe('describeConflict', () => {
  const names = ['Cà Phê Trứng 3T', 'Cơm Tấm Ba Ghiền'];
  const cases: [string, Record<string, unknown>][] = [
    ['TIME_OVERLAP', { place_names: names, ranges: [{ start_minute: 540, end_minute: 630 }, { start_minute: 600, end_minute: 690 }] }],
    ['TRAVEL_TIME', { place_names: names, gap_min: 10, travel_min: 25, distance_km: 4.2 }],
    ['OPENING_HOURS', { place_name: names[0], start_minute: 360, end_minute: 420, open_minute: 480, close_minute: 1320 }],
    ['DUPLICATE_PLACE', { place_names: names, similarity: 0.9, distance_m: 30 }],
    ['BUDGET_THRESHOLD', { total_cost: 250000, budget_limit: 100000 }],
  ];

  it.each(cases)('%s có params: câu đúng ở vi và en', (rule, params) => {
    const c = conflict(rule, params);
    const vi = describeConflict(c, {}, tVi);
    const en = describeConflict(c, {}, tEn);
    expect(vi).not.toBe(en);
    expect(vi).not.toContain('{{');
    expect(en).not.toContain('{{');
    expect(stripNames(en, names)).not.toMatch(VI_CHAR);
  });

  it('TIME_OVERLAP: giờ định dạng theo ngôn ngữ', () => {
    const c = conflict('TIME_OVERLAP', cases[0][1]);
    expect(describeConflict(c, {}, tEn)).toContain('9:00 AM');
    expect(describeConflict(c, {}, tVi)).toContain('09:00');
  });

  it('BUDGET_THRESHOLD: tiền định dạng bằng format.ts', () => {
    const en = describeConflict(conflict('BUDGET_THRESHOLD', cases[4][1]), {}, tEn);
    expect(en).toContain('250,000');
  });

  it('thiếu params: dựng từ lịch trong store', () => {
    const c = conflict('TIME_OVERLAP', undefined, ['a', 'b']);
    const ctx = {
      scheduleItems: [
        { id: 'a', place_id: 'p1', start_minute: 540, end_minute: 630 },
        { id: 'b', place_id: 'p2', start_minute: 600, end_minute: 690 },
      ] as never,
      places: [{ id: 'p1', name: 'Quán A' }, { id: 'p2', name: 'Quán B' }] as never,
    };
    const en = describeConflict(c, ctx, tEn);
    expect(en).toContain('Quán A');
    expect(en).toContain('10:00 AM');
  });

  it('không đủ dữ liệu: câu chung theo rule_code, mã lạ: câu chung nhất, EN không có dấu', () => {
    for (const rule of ['TIME_OVERLAP', 'TRAVEL_TIME', 'OPENING_HOURS', 'DUPLICATE_PLACE', 'BUDGET_THRESHOLD', 'LẠ']) {
      const en = describeConflict(conflict(rule), {}, tEn);
      expect(en).not.toMatch(VI_CHAR);
      expect(en.length).toBeGreaterThan(5);
    }
    expect(describeConflict(conflict('LẠ'), {}, tEn)).toBe(tEn('conflict.generic.UNKNOWN'));
  });
});

describe('describeReason / describeDropReason', () => {
  const codes = Object.keys(viDict.reason).filter((k) => k !== 'window');
  const params = {
    score: 3, upvotes: 2, distance_km: 1.2, minute: 1080, cost: 45000, budget_limit: 100000,
    category: 'FOOD', total_score: 0.8, window: 'dinner', start_minute: 1050, end_minute: 1230,
    travel_min: 12, from_name: 'Quán A',
  };

  it.each(codes)('mã %s dịch được ở cả hai ngôn ngữ, không còn {{ }}', (code) => {
    const vi = describeReason({ code, params }, tVi);
    const en = describeReason({ code, params }, tEn);
    expect(vi).toBeTruthy();
    expect(en).toBeTruthy();
    expect(en).not.toContain('{{');
    expect(stripNames(en!, ['Quán A'])).not.toMatch(VI_CHAR);
  });

  it('TRAVEL_FROM với from_origin dùng câu điểm hẹn', () => {
    const en = describeReason({ code: 'TRAVEL_FROM', params: { travel_min: 9, from_origin: true } }, tEn);
    expect(en).toContain('meeting point');
  });

  it('không có mã: VI trả câu gốc, EN trả null', () => {
    expect(describeReason(null, tVi, 'Câu gốc')).toBe('Câu gốc');
    expect(describeReason(null, tEn, 'Câu gốc')).toBeNull();
    expect(describeReason({ code: 'MÃ_LẠ' }, tEn, 'Câu gốc')).toBeNull();
  });

  it('describeReasons ghép mã và câu cũ, bỏ mục không dịch được ở EN', () => {
    expect(describeReasons([{ code: 'FREE' }], ['Miễn phí'], tEn)).toEqual(['Free']);
    expect(describeReasons(undefined, ['Miễn phí'], tEn)).toEqual([]);
    expect(describeReasons(undefined, ['Miễn phí'], tVi)).toEqual(['Miễn phí']);
  });

  it('describeDropReason', () => {
    const d = { place_id: 'p', reason: 'Hết giờ trong buổi', reason_code: 'OUT_OF_TIME', reason_params: {} };
    expect(describeDropReason(d, tEn)).toBe(tEn('reason.OUT_OF_TIME'));
    expect(describeDropReason({ place_id: 'p', reason: 'Hết giờ' }, tEn)).toBeNull();
    expect(describeDropReason({ place_id: 'p', reason: 'Hết giờ' }, tVi)).toBe('Hết giờ');
  });
});

describe('cuisineLabel', () => {
  it('giá trị phổ biến có nhãn hai ngôn ngữ', () => {
    expect(cuisineLabel('bubble_tea', 'en')).toBe('Bubble tea');
    expect(cuisineLabel('Bubble Tea', 'vi')).toBe('Trà sữa');
    expect(cuisineLabel('coffee-shop', 'en')).toBe('Coffee shop');
  });
  it('giá trị lạ hoặc rỗng trả null', () => {
    expect(cuisineLabel('xyz_unknown', 'en')).toBeNull();
    expect(cuisineLabel('constructor', 'en')).toBeNull();
    expect(cuisineLabel('', 'vi')).toBeNull();
    expect(cuisineLabel(null, 'vi')).toBeNull();
  });
});
