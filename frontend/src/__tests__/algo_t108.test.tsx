// T-108: "Vì sao?" thành biểu đồ thanh chung thước + câu đối chiếu với "cộng tổng km" (PLAN gđ8 §5).
import { describe, it, expect, beforeAll } from 'vitest';
import { renderToStaticMarkup as renderRaw } from 'react-dom/server';
import type React from 'react';
import i18n from '../i18n';
import { TieWhyBody } from '../components/algo/TieSuggestion';
import { barRatio, barScale, buildWhyRows, contrastLine, minSumPick } from '../components/algo/tieSuggestionLogic';
import type { CategoryTieSuggestion } from '../types';
import { mockTieDemo } from '../mocks/handlers';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const renderToStaticMarkup = (node: React.ReactElement) => renderRaw(node).split('&#x27;').join("'");
const count = (out: string, needle: string) => out.split(needle).length - 1;

/* Ca TC-04 (như algo_t96): OMP chọn p3 (Vạn Hạnh), cộng tổng km chọn p1 (Dinh Độc Lập, 36,9 km). */
const food = (over: Partial<CategoryTieSuggestion> = {}): CategoryTieSuggestion => ({
  category: 'FOOD',
  candidates: [
    { place_id: 'p1', name: 'Dinh Độc Lập', upvotes: 7, downvotes: 0, score: 7 },
    { place_id: 'p2', name: 'Saigon Centre', upvotes: 7, downvotes: 0, score: 7 },
    { place_id: 'p3', name: 'Vạn Hạnh Mall', upvotes: 7, downvotes: 0, score: 7 },
  ],
  recommended_place_id: 'p3',
  ranking: [
    { place_id: 'p3', rank: 1, psi: 50.278, max_km: 17.066, total_km: 37.647, max_min: 42, farthest_member_id: 'm3' },
    { place_id: 'p1', rank: 2, psi: 51.457, max_km: 20.1, total_km: 36.9, max_min: 50, farthest_member_id: 'm2' },
    { place_id: 'p2', rank: 3, psi: 54.122, max_km: 22, total_km: 38.5, max_min: 54, farthest_member_id: 'm3' },
  ],
  members: [
    { member_id: 'm1', nickname: 'Bảo', km: 4.19, minutes: 12, rank: 1, weight: 1 },
    { member_id: 'm2', nickname: 'Lan', km: 16.391, minutes: 40, rank: 2, weight: 1.5 },
    { member_id: 'm3', nickname: 'Hà', km: 17.066, minutes: 42, rank: 3, weight: 2 },
  ],
  runner_up_psi: 51.457,
  excluded_member_count: 0,
  estimated: false,
  source: 'VALHALLA',
  params: { lambda: 1, k: 2 },
  ...over,
});

/** Server cũ (trước CR-19): không có `farthest_member_id`. */
const legacy = () =>
  food({
    ranking: food().ranking.map((r) => {
      const copy = { ...r };
      delete copy.farthest_member_id;
      return copy;
    }),
  });
/** Quán đề xuất cũng là quán tổng km nhỏ nhất. */
const sameAsSum = () => food({ ranking: food().ranking.map((r) => (r.place_id === 'p3' ? { ...r, total_km: 30 } : r)) });

const why = (s: CategoryTieSuggestion, me: string | null = 'm2') =>
  renderToStaticMarkup(<TieWhyBody suggestion={s} myMemberId={me} />);

/** Các `data-ratio` theo thứ tự xuất hiện. */
const ratios = (out: string) => [...out.matchAll(/data-ratio="([\d.]+)"/g)].map((m) => Number(m[1]));

beforeAll(async () => {
  await i18n.changeLanguage('vi');
});

describe('logic thuần', () => {
  it('minSumPick: total_km nhỏ nhất; bằng nhau → rank nhỏ hơn; bỏ quán không có trong candidates; rỗng → null', () => {
    expect(minSumPick(food())?.place_id).toBe('p1');
    const tied = food({ ranking: food().ranking.map((r) => ({ ...r, total_km: 40 })) });
    expect(minSumPick(tied)?.place_id).toBe('p3');
    expect(minSumPick(food({ candidates: food().candidates.filter((c) => c.place_id !== 'p1') }))?.place_id).toBe('p3');
    expect(minSumPick(food({ ranking: [] }))).toBeNull();
  });

  it('barScale = max(max_min) của các quán; barRatio kẹp 0..1, thước 0 → 0', () => {
    expect(barScale(food())).toBe(54);
    expect(barScale(food({ ranking: [] }))).toBe(0);
    expect(barRatio(27, 54)).toBe(0.5);
    expect(barRatio(80, 54)).toBe(1);
    expect(barRatio(10, 0)).toBe(0);
  });

  it('contrastLine: tên người xa nhất ở quán cộng-tổng + phút thêm; thiếu trường → không tên; trùng quán → null', () => {
    expect(contrastLine(food())).toEqual({ placeId: 'p1', name: 'Dinh Độc Lập', who: 'Lan', minutes: 50, extra: 8 });
    expect(contrastLine(legacy())?.who).toBeNull();
    expect(contrastLine(sameAsSum())).toBeNull();
    // Tên tra theo danh sách truyền vào (vd. thành viên phòng), không thấy → không tên
    expect(contrastLine(food(), [{ member_id: 'm2', nickname: 'Lan (phòng)' }])?.who).toBe('Lan (phòng)');
    expect(contrastLine(food(), [])?.who).toBeNull();
    expect(contrastLine(food({ recommended_place_id: null }))).toBeNull();
  });

  it('buildWhyRows xa → gần theo phút (bằng phút → km lớn trước)', () => {
    const s = food({
      members: [
        { member_id: 'a', nickname: 'A', km: 5, minutes: 20, rank: 1, weight: 1 },
        { member_id: 'b', nickname: 'B', km: 9, minutes: 20, rank: 2, weight: 1.5 },
        { member_id: 'c', nickname: 'C', km: 12, minutes: 31, rank: 3, weight: 2 },
      ],
    });
    expect(buildWhyRows(s).map((r) => r.nickname)).toEqual(['C', 'B', 'A']);
  });
});

describe('ca demo T-106 trong mock (dev)', () => {
  it('OMP chọn Pizza 4P\'s, cộng tổng chọn Haidilao: Xeko 74\', thêm 14\'; người xem là Nobita', () => {
    const s = mockTieDemo('me').suggestions[0];
    expect(contrastLine(s)).toMatchObject({ name: 'Haidilao Giga Mall', who: 'Xeko', minutes: 74, extra: 14 });
    expect(barScale(s)).toBe(94);
    expect(buildWhyRows(s, 'me').map((r) => [r.nickname, r.me])).toEqual([
      ['Xuka', false],
      ['Xeko', false],
      ['Doraemon', false],
      ['Nobita', true],
    ]);
    expect(s.members.reduce((a, m) => a + m.km, 0)).toBeCloseTo(68.2, 5);
  });
});

describe('TieWhyBody', () => {
  it('đúng 4 khối: câu luật một câu · biểu đồ quán · câu đối chiếu · thanh từng người; không Ψ, không trọng số', () => {
    const out = why(food());
    expect(out).toContain('Máy ưu tiên người phải đi xa nhất, để không ai phải đi quá xa.');
    expect(out).toContain('Người xa nhất phải đi (đi + về)');
    expect(out).toContain('data-testid="tie-why-contrast"');
    expect(out).toContain('Tới Vạn Hạnh Mall');
    expect(out).not.toMatch(/Ψ|psi|×|50[.,]278|Tính nặng|<table/i);
  });

  it('câu đối chiếu có tên khi có farthest_member_id; nhãn "tổng km ít nhất" chỉ ở quán cộng-tổng', () => {
    const out = why(food());
    expect(out).toContain('Nếu chỉ cộng tổng km, máy sẽ chọn Dinh Độc Lập:');
    expect(out).toContain("Lan phải đi 50', thêm 8'.");
    expect(out).toContain('data-named="true"');
    expect(count(out, 'data-testid="tie-why-minsum-tag"')).toBe(1);
    expect(out).toMatch(/data-minsum="true"[^]*?Dinh Độc Lập[^]*?tổng km ít nhất/);
    expect(out).not.toContain('data-testid="tie-why-same"');
  });

  it('thiếu farthest_member_id (server cũ) → câu không tên', () => {
    const out = why(legacy());
    expect(out).toContain("người xa nhất phải đi 50', thêm 8'.");
    expect(out).toContain('data-named="false"');
    expect(out).not.toContain('Lan phải đi');
  });

  it('quán cộng-tổng ≤ phút quán đề xuất → câu không có "thêm"', () => {
    const s = food({ ranking: food().ranking.map((r) => (r.place_id === 'p1' ? { ...r, max_min: 40 } : r)) });
    expect(why(s)).toContain("Lan phải đi 40'.");
    expect(why(s)).not.toContain('thêm');
  });

  it('trùng quán → ẩn câu đối chiếu, hiện dòng "cũng có tổng ít nhất", không nhãn tổng km', () => {
    const out = why(sameAsSum());
    expect(out).not.toContain('data-testid="tie-why-contrast"');
    expect(out).toContain('Quán này cũng có tổng quãng đường ít nhất.');
    expect(out).not.toContain('tổng km ít nhất');
  });

  it('thước chung cả panel: thanh dài nhất = max(max_min); quán theo hạng rồi người xa → gần', () => {
    const out = why(food());
    expect(out).toContain('data-scale="54"');
    // 3 quán (42, 50, 54) rồi 3 người (42, 40, 12), cùng chia cho 54
    expect(ratios(out)).toEqual([0.778, 0.926, 1, 0.778, 0.741, 0.222]);
    expect(out).toMatch(/Vạn Hạnh Mall[^]*Dinh Độc Lập[^]*Saigon Centre/);
    expect(out).toMatch(/Hà[^]*Lan[^]*Bảo/);
  });

  it('chỉ thanh quán đề xuất màu coral; thanh aria-hidden, hàng có chữ đủ nghĩa', () => {
    const out = why(food());
    expect(count(out, 'rounded-chip bg-accent"')).toBe(1);
    expect(count(out, 'rounded-chip bg-ink-3"')).toBe(5);
    expect(count(out, 'aria-hidden="true" class="mt-1 h-2"')).toBe(6);
    expect(out).toContain('<span class="sr-only">42 phút</span>');
    expect(out).toContain('16,4 km');
  });

  it('"(bạn)" đúng người, "(xa nhất)" ở hàng đầu', () => {
    const out = why(food(), 'm2');
    expect(count(out, 'data-me="true"')).toBe(1);
    expect(out).toMatch(/data-me="true"[^]*?Lan[^]*?\(bạn\)/);
    expect(count(out, '(bạn)')).toBe(1);
    expect(out).toMatch(/Hà[^]*?\(xa nhất\)/);
    expect(count(out, 'data-testid="tie-why-farthest"')).toBe(1);
    expect(why(food(), null)).not.toContain('(bạn)');
  });

  it('một người: câu "mới có một người", không nhãn xa nhất, không vỡ', () => {
    const one = food({ members: [food().members[2]] });
    const out = why(one);
    expect(out).toContain('Mới có một người được tính');
    expect(count(out, 'data-testid="tie-why-row"')).toBe(1);
    expect(out).not.toContain('(xa nhất)');
  });

  it('một quán xếp hạng được: không biểu đồ quán/câu đối chiếu, vẫn có thanh từng người; ghi quán thiếu toạ độ', () => {
    const s = food({ ranking: [food().ranking[0]] });
    const out = why(s);
    expect(out).not.toContain('data-testid="tie-why-compare"');
    expect(out).not.toContain('data-testid="tie-why-contrast"');
    expect(out).toContain('data-scale="42"');
    expect(count(out, 'data-testid="tie-why-row"')).toBe(3);
    expect(out).toContain('2 quán chưa có toạ độ nên không xếp hạng');
  });

  it('EN: câu đối chiếu và nhãn', async () => {
    await i18n.changeLanguage('en');
    try {
      const out = why(food());
      expect(out).toContain('If we only added up the km, we’d pick Dinh Độc Lập:');
      expect(out).toContain("Lan would travel 50', 8' more.");
      expect(out).toContain('lowest total km');
      expect(out).toContain('(farthest)');
      expect(out).toContain('<span class="sr-only">42 minutes</span>');
      expect(why(legacy())).toContain("the farthest person would travel 50', 8' more.");
    } finally {
      await i18n.changeLanguage('vi');
    }
  });

  it('khoá i18n algo.tie hai ngôn ngữ khớp nhau; khoá bảng cũ đã xoá', () => {
    expect(Object.keys(en.algo.tie).sort()).toEqual(Object.keys(vi.algo.tie).sort());
    for (const k of ['whyRule', 'whyRuleSquared', 'whyRulePow', 'tableLabel', 'colMember', 'colTrip', 'colKm', 'colWeight', 'compareTitle', 'compareRow']) {
      expect(vi.algo.tie).not.toHaveProperty(k);
      expect(en.algo.tie).not.toHaveProperty(k);
    }
  });
});
