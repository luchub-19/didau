// Hàm thuần của đề xuất hoà phiếu OMP (CR-15, T-96; không React): câu ngắn, bảng "Vì sao?", quán sẽ được chốt,
// chữ ký làm mới. Mọi số lấy nguyên từ server — FE không tự tính Ψ hay cộng km.
import type { CategoryTieSuggestion, Place, ResolveVotingRequest, Room, TieRanking, TieSuggestion } from '../../types';
import type { Language } from '../../i18n/useLanguage';

/** Chốt đề xuất: chỉ gửi chiến lược; backend tính lại Ψ theo loại và bỏ qua mọi số từ client (CR-15). */
export const TIE_RESOLVE_PAYLOAD: ResolveVotingRequest = { strategy: 'TRAVEL_TIME', max_accepted_places: 1 };

const nf = (lang: Language, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN', opts);

/** "57'" theo locale (số lớn có dấu nhóm). */
export function formatMinutes(n: number, lang: Language = 'vi'): string {
  return `${nf(lang).format(Math.round(n))}'`;
}

/** Trọng số hạng: "×1,25" (VI) / "×1.25" (EN), tối đa 2 số lẻ. */
export function formatWeight(w: number, lang: Language = 'vi'): string {
  return `×${nf(lang, { maximumFractionDigits: 2 }).format(w)}`;
}

/** Gợi ý của một loại chỉ "dùng được" khi có quán đề xuất nằm trong `ranking`. */
export const hasRecommendation = (
  s: CategoryTieSuggestion | null | undefined,
): s is CategoryTieSuggestion & { recommended_place_id: string } =>
  Boolean(s?.recommended_place_id && s.ranking.some((r) => r.place_id === s.recommended_place_id));

const byRank = (s: CategoryTieSuggestion): TieRanking[] => [...s.ranking].sort((a, b) => a.rank - b.rank);

/* ---------- Con số trong câu ngắn (PLAN gđ7 §5.2) ---------- */

export type TieDelta = { kind: 'max'; minutes: number } | { kind: 'total'; km: number } | null;

/**
 * So quán đề xuất với hạng 2: người xa nhất bớt bao nhiêu phút; nếu không bớt (thắng nhờ tổng) thì cả nhóm bớt
 * bao nhiêu km. Không có hạng 2 hoặc không bớt gì → null (câu chỉ có tên quán).
 */
export function tieDelta(s: CategoryTieSuggestion): TieDelta {
  const [first, second] = byRank(s);
  if (!first || !second || first.place_id !== s.recommended_place_id) return null;
  const minutes = second.max_min - first.max_min;
  if (minutes > 0) return { kind: 'max', minutes };
  const km = Math.round((second.total_km - first.total_km) * 10) / 10;
  return km > 0 ? { kind: 'total', km } : null;
}

/* ---------- Bảng "Vì sao?" (PLAN gđ7 §5.3: từng người, nói bằng lời, không chữ Ψ) ---------- */

export interface TieWhyRow {
  memberId: string;
  nickname: string;
  me: boolean;
  /** Phút đi + về. */
  minutes: number;
  /** km đi + về. */
  km: number;
  rank: number;
  weight: number;
}

export function buildWhyRows(s: CategoryTieSuggestion, myMemberId?: string | null): TieWhyRow[] {
  return [...s.members]
    .sort((a, b) => a.rank - b.rank)
    .map((m) => ({
      memberId: m.member_id,
      nickname: m.nickname,
      me: Boolean(myMemberId) && m.member_id === myMemberId,
      minutes: m.minutes,
      km: m.km,
      rank: m.rank,
      weight: m.weight,
    }));
}

export interface TieCompareRow {
  placeId: string;
  name: string;
  recommended: boolean;
  maxMin: number;
  totalKm: number;
}

/** Các quán hoà theo thứ hạng (đề xuất đầu) + số quán thiếu toạ độ (không xếp hạng). */
export function buildCompareRows(s: CategoryTieSuggestion): { rows: TieCompareRow[]; unranked: number } {
  const names = new Map(s.candidates.map((c) => [c.place_id, c.name]));
  const rows = byRank(s)
    .filter((r) => names.has(r.place_id))
    .map((r) => ({
      placeId: r.place_id,
      name: names.get(r.place_id) ?? '',
      recommended: r.place_id === s.recommended_place_id,
      maxMin: r.max_min,
      totalKm: r.total_km,
    }));
  const ranked = new Set(s.ranking.map((r) => r.place_id));
  return { rows, unranked: s.candidates.filter((c) => !ranked.has(c.place_id)).length };
}

/** Câu "Vì sao?" theo k (T-99, CR-16): k = 1 cộng km, k = 2 bình phương (mặc định), khác → luỹ thừa k. */
export const whyRuleKey = (
  s: CategoryTieSuggestion,
  lang: Language = 'vi',
): { key: 'algo.tie.whyRule' | 'algo.tie.whyRuleSquared' | 'algo.tie.whyRulePow'; k: string } => {
  const k = s.params.k;
  const text = nf(lang, { maximumFractionDigits: 2 }).format(k);
  if (Math.abs(k - 1) < 1e-9) return { key: 'algo.tie.whyRule', k: text };
  if (Math.abs(k - 2) < 1e-9) return { key: 'algo.tie.whyRuleSquared', k: text };
  return { key: 'algo.tie.whyRulePow', k: text };
};

/** Trọng số của người xa nhất = 1 + λ (Sơn: w tăng đều từ 1 tới 1 + λ). Một người → 1. */
export const farthestWeight = (s: CategoryTieSuggestion): number =>
  s.members.length > 1 ? 1 + s.params.lambda : 1;

/* ---------- Quán mà nút chốt sẽ chốt thật ---------- */

const DEAD = new Set(['REJECTED', 'VISITED']);

/**
 * Luồng chốt cũ (PLAN gđ7 §2) không nhận loại: `POST /voting/resolve {TRAVEL_TIME, max_accepted_places: 1}` giữ
 * MỘT quán cho cả phòng — quán đầu của nhóm (điểm, loại) lớn nhất (backend `resolve_with_strategy`: sắp khoá giảm
 * dần, loại so theo tên). Nhóm đó là một loại đang hoà → quán đề xuất của loại; nhóm chỉ có một quán → chính quán
 * đó (không thẻ nào được nút chốt). Người dùng chốt 2026-11-15: chỉ thẻ chốt thật mới có nút.
 */
export function lockTarget(
  places: readonly Pick<Place, 'id' | 'name' | 'score' | 'category' | 'status'>[],
  suggestions: readonly CategoryTieSuggestion[],
): { placeId: string; name: string; category: string } | null {
  const alive = places.filter((p) => !DEAD.has(p.status));
  if (alive.length === 0) return null;
  const cat = (p: (typeof alive)[number]) => String(p.category ?? 'OTHER');
  let best = alive[0];
  for (const p of alive) {
    const ds = (p.score ?? 0) - (best.score ?? 0);
    if (ds > 0 || (ds === 0 && cat(p) > cat(best))) best = p;
  }
  const group = alive.filter((p) => (p.score ?? 0) === (best.score ?? 0) && cat(p) === cat(best));
  if (group.length === 1) return { placeId: best.id, name: best.name, category: cat(best) };
  const s = suggestions.find((x) => x.category === cat(best));
  if (!hasRecommendation(s)) return null;
  const name = s.candidates.find((c) => c.place_id === s.recommended_place_id)?.name ?? '';
  return { placeId: s.recommended_place_id, name, category: s.category };
}

/* ---------- Quán để vẽ đường của mình (PLAN gđ7 §5.4) ---------- */

/**
 * Quán đề xuất còn hiệu lực: loại vẫn chưa có quán ACCEPTED và quán chưa bị loại. Store giữ gợi ý cũ sau khi chốt
 * (không nhấp nháy), nên bản đồ phải tự lọc để không vẽ đường tới một đề xuất đã hết hạn.
 */
export function activeRecommendedIds(
  tie: TieSuggestion | null,
  places: readonly Pick<Place, 'id' | 'category' | 'status'>[],
): string[] {
  if (!tie) return [];
  const byId = new Map(places.map((p) => [p.id, p]));
  const lockedCats = new Set(places.filter((p) => p.status === 'ACCEPTED').map((p) => String(p.category)));
  return tie.suggestions.flatMap((s) => {
    if (!hasRecommendation(s) || lockedCats.has(s.category)) return [];
    const p = byId.get(s.recommended_place_id);
    return p && !DEAD.has(p.status) ? [p.id] : [];
  });
}

/* ---------- Làm mới ---------- */

/** Chữ ký những gì làm đổi kết quả: điểm + loại của quán, vị trí các thành viên, vị trí của mình. Đổi → tải lại. */
export function tieRefreshKey(
  places: readonly (Pick<Place, 'id' | 'upvotes' | 'status'> & Partial<Pick<Place, 'score' | 'category'>>)[],
  members: readonly { id: string; has_origin?: boolean }[],
  room: Pick<Room, 'origin_lat' | 'origin_lng'> | null,
  me: { origin_lat?: number | null; origin_lng?: number | null } | null,
): string {
  return JSON.stringify([
    places.map((p) => [p.id, p.upvotes ?? 0, p.score ?? null, p.category ?? null, p.status]),
    members.map((m) => [m.id, Boolean(m.has_origin)]),
    room?.origin_lat ?? null,
    room?.origin_lng ?? null,
    me?.origin_lat ?? null,
    me?.origin_lng ?? null,
  ]);
}
