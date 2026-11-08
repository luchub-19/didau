// Hàm thuần của đề xuất hoà phiếu ALGO-02 (không React): dữ liệu bảng "Vì sao?", câu phần chênh, chữ ký làm mới.
import type { Place, ResolveVotingRequest, Room, TieSuggestion } from '../../types';
import type { Language } from '../../i18n/useLanguage';

/** Chốt đề xuất: chỉ gửi chiến lược; backend tính lại thứ hạng và bỏ qua mọi số từ client (ALGORITHMS §4). */
export const TIE_RESOLVE_PAYLOAD: ResolveVotingRequest = { strategy: 'TRAVEL_TIME', max_accepted_places: 1 };

/** Số quán hoà còn lại hiện ở thẻ; quá số này gộp thành "+N quán nữa" (đủ số liệu nằm trong "Vì sao?"). */
export const MAX_OTHER_ROWS = 3;

/** "57'" theo locale (VI: 57' · EN: 57'; số lớn có dấu nhóm). */
export function formatMinutes(n: number, lang: Language = 'vi'): string {
  return `${new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(Math.round(n))}'`;
}

/* ---------- Dữ liệu bảng "Vì sao?" (hàm thuần) ---------- */

export interface TieTableColumn {
  placeId: string;
  name: string;
  recommended: boolean;
  /** Quán không có toạ độ: không xếp hạng, ô hiện "–". */
  unranked: boolean;
  total: number | null;
  max: number | null;
}

export interface TieTableRow {
  memberId: string;
  nickname: string;
  /** Lấy điểm hẹn thay vị trí riêng → ghi "(điểm hẹn)". */
  meetingPoint: boolean;
  /** Phút theo thứ tự `columns`; null = không có số. */
  minutes: (number | null)[];
}

export interface TieTable {
  columns: TieTableColumn[];
  rows: TieTableRow[];
}

/**
 * Cột theo thứ hạng (đề xuất đứng đầu), quán không xếp hạng đặt cuối; hàng theo thứ tự `members` của server.
 * Số Tổng/Lâu nhất lấy từ `ranking` của server — FE không tự cộng lại.
 */
export function buildTieTable(s: TieSuggestion): TieTable {
  const byId = new Map(s.candidates.map((c, j) => [c.place_id, { c, j }]));
  const ranked = [...s.ranking].sort((a, b) => a.rank - b.rank);
  const columns: TieTableColumn[] = [];
  const order: number[] = [];
  for (const r of ranked) {
    const hit = byId.get(r.place_id);
    if (!hit) continue;
    order.push(hit.j);
    columns.push({
      placeId: r.place_id,
      name: hit.c.name,
      recommended: r.place_id === s.recommended_place_id,
      unranked: false,
      total: r.total_min,
      max: r.max_min,
    });
  }
  s.candidates.forEach((c, j) => {
    if (order.includes(j)) return;
    order.push(j);
    columns.push({ placeId: c.place_id, name: c.name, recommended: false, unranked: true, total: null, max: null });
  });
  const rows = s.members.map((m, i) => ({
    memberId: m.member_id,
    nickname: m.nickname,
    meetingPoint: m.origin_source === 'MEETING_POINT',
    minutes: order.map((j) => s.matrix[i]?.[j]?.minutes ?? null),
  }));
  return { columns, rows };
}

/** Câu phần chênh: `margin ≤ 0` xảy ra khi hạng 1 thắng nhờ người đi xa nhất đỡ vất vả hơn (T-86 quyết định 2). */
export function marginKey(margin: number | null): 'marginMore' | 'marginMax' | null {
  if (margin === null) return null;
  return margin > 0 ? 'marginMore' : 'marginMax';
}

/** Gợi ý chỉ coi là "dùng được" khi có quán đề xuất. */
export const hasRecommendation = (s: TieSuggestion | null): s is TieSuggestion & { recommended_place_id: string } =>
  Boolean(s && s.available && s.recommended_place_id);

/** Chữ ký những gì làm đổi kết quả: phiếu, quán, vị trí các thành viên, điểm hẹn. Đổi → tải lại đề xuất. */
export function tieRefreshKey(
  places: readonly Pick<Place, 'id' | 'upvotes' | 'status'>[],
  members: readonly { id: string; has_origin?: boolean }[],
  room: Pick<Room, 'origin_lat' | 'origin_lng'> | null,
  me: { origin_lat?: number | null; origin_lng?: number | null } | null,
): string {
  return JSON.stringify([
    places.map((p) => [p.id, p.upvotes ?? 0, p.status]),
    members.map((m) => [m.id, Boolean(m.has_origin)]),
    room?.origin_lat ?? null,
    room?.origin_lng ?? null,
    me?.origin_lat ?? null,
    me?.origin_lng ?? null,
  ]);
}

