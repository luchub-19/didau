// T-89: thẻ hoà phiếu ALGO-02 (đề xuất, "Vì sao?", "Cách khác"), mặc định TRAVEL_TIME, làm mới đề xuất.
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup as renderRaw } from 'react-dom/server';
import type React from 'react';
import { http, HttpResponse } from 'msw';
import i18n from '../i18n';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { MOCK_HOST_TOKEN, mockPlaces, mockRoom } from '../mocks/mockData';
import { tokenStorage } from '../services/storage/tokenStorage';
import { useAlgoStore } from '../store/useAlgoStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { TieBlock } from '../components/decide/TieBlock';
import { TieSuggestionView, TieWhyTable, type TieSuggestionViewProps } from '../components/algo/TieSuggestion';
import {
  MAX_OTHER_ROWS,
  TIE_RESOLVE_PAYLOAD,
  buildTieTable,
  formatMinutes,
  hasRecommendation,
  marginKey,
  tieRefreshKey,
} from '../components/algo/tieSuggestionLogic';
import { TIE_CHOOSE_INTENT } from '../room/placeView';
import type { TieLeg, TieSuggestion } from '../types';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

// Markup tĩnh mã hoá dấu nháy đơn (57' → 57&#x27;): giải mã để so chuỗi như người dùng đọc
const renderToStaticMarkup = (node: React.ReactElement) => renderRaw(node).split('&#x27;').join("'");

/* ---------- Dữ liệu mẫu: fixture tài liệu §3 (ALGORITHMS §4) ---------- */

const leg = (minutes: number, distance_km = minutes / 2): TieLeg => ({ minutes, distance_km, source: 'ESTIMATE' });

const NAMES = ['Dinh Độc Lập', 'Saigon Centre', 'Vạn Hạnh Mall'];

/** 3 thành viên × 3 quán: 14/19/32 · 18/14/28 · 12/25/20 → S 65/60/57, M 32/28/25 ⇒ đề xuất Vạn Hạnh Mall hơn 3'. */
const fixture = (over: Partial<TieSuggestion> = {}): TieSuggestion => ({
  available: true,
  reason: null,
  candidates: NAMES.map((name, i) => ({ place_id: `p${i + 1}`, name, upvotes: 4 })),
  members: [
    { member_id: 'm1', nickname: 'Lan', origin_source: 'MEMBER' },
    { member_id: 'm2', nickname: 'Minh', origin_source: 'MEMBER' },
    { member_id: 'm3', nickname: 'Hà', origin_source: 'MEETING_POINT' },
  ],
  matrix: [
    [leg(14), leg(18), leg(12)],
    [leg(19), leg(14), leg(25)],
    [leg(32), leg(28), leg(20)],
  ],
  ranking: [
    { place_id: 'p3', rank: 1, total_min: 57, max_min: 25, total_km: 28.5 },
    { place_id: 'p2', rank: 2, total_min: 60, max_min: 28, total_km: 30 },
    { place_id: 'p1', rank: 3, total_min: 65, max_min: 32, total_km: 32.5 },
  ],
  unranked_place_ids: [],
  recommended_place_id: 'p3',
  margin_vs_second_min: 3,
  threshold_min: 2,
  travel_mode: 'TWO_WHEELER',
  excluded_member_count: 0,
  estimated: true,
  ...over,
});

const viewProps = (over: Partial<TieSuggestionViewProps> = {}): TieSuggestionViewProps => ({
  suggestion: fixture(),
  loading: false,
  error: false,
  isHost: true,
  iShared: true,
  showNudge: false,
  onConfirm: () => {},
  onOther: () => {},
  onShareOrigin: () => {},
  onSetMeeting: () => {},
  onRetry: () => {},
  onDismissNudge: () => {},
  ...over,
});

const html = (over: Partial<TieSuggestionViewProps> = {}) => renderToStaticMarkup(<TieSuggestionView {...viewProps(over)} />);

beforeAll(async () => {
  await i18n.changeLanguage('vi');
});

beforeEach(() => {
  useAlgoStore.getState().reset();
});

/* ---------- Hàm thuần ---------- */

describe('buildTieTable', () => {
  it('cột theo hạng (đề xuất đầu), hàng theo thành viên, số khớp fixture 57\'/25\'', () => {
    const { columns, rows } = buildTieTable(fixture());
    expect(columns.map((c) => c.name)).toEqual(['Vạn Hạnh Mall', 'Saigon Centre', 'Dinh Độc Lập']);
    expect(columns.map((c) => c.recommended)).toEqual([true, false, false]);
    expect(columns.map((c) => [c.total, c.max])).toEqual([[57, 25], [60, 28], [65, 32]]);
    expect(rows.map((r) => r.minutes)).toEqual([[12, 18, 14], [25, 14, 19], [20, 28, 32]]);
    expect(rows.map((r) => r.meetingPoint)).toEqual([false, false, true]);
  });

  it('quán không có toạ độ: cột cuối, không xếp hạng, ô null', () => {
    const s = fixture({
      candidates: [...fixture().candidates, { place_id: 'p4', name: 'Quán X', upvotes: 4 }],
      matrix: fixture().matrix.map((row) => [...row, null]),
      unranked_place_ids: ['p4'],
    });
    const { columns, rows } = buildTieTable(s);
    const last = columns[columns.length - 1];
    expect(last).toMatchObject({ placeId: 'p4', unranked: true, total: null, max: null });
    expect(rows.every((r) => r.minutes[r.minutes.length - 1] === null)).toBe(true);
  });

  it('marginKey: dương → "ít hơn hạng 2"; ≤ 0 (thắng nhờ người xa nhất) → câu riêng; null → không có', () => {
    expect(marginKey(3)).toBe('marginMore');
    expect(marginKey(0)).toBe('marginMax');
    expect(marginKey(-2)).toBe('marginMax');
    expect(marginKey(null)).toBeNull();
  });

  it('hasRecommendation chỉ true khi available và có quán đề xuất', () => {
    expect(hasRecommendation(fixture())).toBe(true);
    expect(hasRecommendation(fixture({ available: false, reason: 'NO_ORIGINS', recommended_place_id: null }))).toBe(false);
    expect(hasRecommendation(null)).toBe(false);
  });

  it('formatMinutes theo locale; payload chốt chỉ có chiến lược TRAVEL_TIME', () => {
    expect(formatMinutes(57, 'vi')).toBe("57'");
    expect(formatMinutes(1234, 'vi')).toBe("1.234'");
    expect(formatMinutes(1234, 'en')).toBe("1,234'");
    expect(TIE_RESOLVE_PAYLOAD).toEqual({ strategy: 'TRAVEL_TIME', max_accepted_places: 1 });
  });

  it('tieRefreshKey đổi khi phiếu / vị trí / điểm hẹn đổi, không đổi vì dữ liệu không liên quan', () => {
    const places = [{ id: 'a', upvotes: 2, status: 'PROPOSED' as const }];
    const members = [{ id: 'm1', has_origin: false }];
    const room = { origin_lat: null, origin_lng: null };
    const base = tieRefreshKey(places, members, room, null);
    expect(tieRefreshKey([{ ...places[0], upvotes: 3 }], members, room, null)).not.toBe(base);
    expect(tieRefreshKey(places, [{ id: 'm1', has_origin: true }], room, null)).not.toBe(base);
    expect(tieRefreshKey(places, members, { origin_lat: 10.7, origin_lng: 106.6 }, null)).not.toBe(base);
    expect(tieRefreshKey(places, members, room, { origin_lat: 10.7, origin_lng: 106.6 })).not.toBe(base);
    expect(tieRefreshKey([...places], [...members], { ...room }, null)).toBe(base);
  });
});

/* ---------- Markup các trạng thái ---------- */

describe('TieSuggestionView', () => {
  it('host + đủ dữ liệu: đề xuất, tổng/lâu nhất, hơn hạng 2, quán còn lại, nút Chốt, Cách khác, Vì sao?', () => {
    const out = html();
    expect(out).toContain("Đề xuất: Vạn Hạnh Mall");
    expect(out).toContain("Cả nhóm đi tổng 57' · người xa nhất 25'");
    expect(out).toContain("ít hơn hạng 2 là 3'");
    expect(out).toContain('data-testid="tie-other-row"');
    expect(out).toContain('Saigon Centre');
    expect(out).toContain('Dinh Độc Lập');
    expect(out).toContain("tổng 60' · xa nhất 28'");
    expect(out).toContain('data-testid="tie-cta"');
    expect(out).toContain('Chốt Vạn Hạnh Mall');
    expect(out).toContain('data-testid="tie-change"');
    expect(out).toContain('Cách khác');
    expect(out).toContain('data-testid="tie-why-panel-link"');
    expect(out).not.toContain('tie-waiting');
  });

  it('thành viên: thấy đề xuất + "Đang chờ chủ phòng chốt" + Vì sao?, KHÔNG có nút chốt/Cách khác', () => {
    const out = html({ isHost: false });
    expect(out).toContain("Đề xuất: Vạn Hạnh Mall");
    expect(out).toContain('Đang chờ chủ phòng chốt');
    expect(out).toContain('data-testid="tie-why-panel-link"');
    expect(out).not.toContain('tie-cta');
    expect(out).not.toContain('tie-change');
  });

  it('ca thắng nhờ người xa nhất (margin ≤ 0): câu riêng, không in số âm', () => {
    const out = html({ suggestion: fixture({ margin_vs_second_min: -2 }) });
    expect(out).toContain('người xa nhất đi ít hơn hạng 2');
    expect(out).not.toContain("-2'");
  });

  it('>3 quán hoà: hiện tối đa 3 quán còn lại rồi "+N quán nữa"', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ place_id: `q${i}`, name: `Quán ${i}`, upvotes: 4 }));
    const s = fixture({
      candidates: many,
      ranking: many.map((c, i) => ({ place_id: c.place_id, rank: i + 1, total_min: 50 + i, max_min: 20 + i, total_km: 10 })),
      recommended_place_id: 'q0',
      margin_vs_second_min: 1,
      matrix: [many.map((_, i) => leg(20 + i))],
      members: [{ member_id: 'm1', nickname: 'Lan', origin_source: 'MEMBER' }],
    });
    const out = html({ suggestion: s });
    expect((out.match(/data-testid="tie-other-row"/g) ?? []).length).toBe(MAX_OTHER_ROWS);
    expect(out).toContain('+2 quán nữa');
  });

  it('quán thiếu toạ độ: nói rõ không xếp hạng, không bao giờ được đề xuất', () => {
    const out = html({ suggestion: fixture({ unranked_place_ids: ['p9'] }) });
    expect(out).toContain('1 quán chưa có toạ độ nên không xếp hạng');
  });

  it('NO_ORIGINS: host có nút chia sẻ + đặt điểm hẹn + Cách khác; thành viên chỉ chia sẻ; không có nút chốt', () => {
    const s = fixture({ available: false, reason: 'NO_ORIGINS', recommended_place_id: null, ranking: [], members: [], matrix: [] });
    const host = html({ suggestion: s, iShared: false });
    expect(host).toContain('Chưa ai chia sẻ nơi xuất phát và phòng chưa có điểm hẹn');
    expect(host).toContain('data-testid="tie-share-origin"');
    expect(host).toContain('data-testid="tie-set-meeting"');
    expect(host).toContain('data-testid="tie-change"');
    expect(host).not.toContain('tie-cta');
    const member = html({ suggestion: s, iShared: false, isHost: false });
    expect(member).toContain('data-testid="tie-share-origin"');
    expect(member).not.toContain('tie-set-meeting');
    expect(member).not.toContain('tie-change');
  });

  it('NO_PLACE_COORDS: giải thích + vẫn có Cách khác cho host', () => {
    const out = html({ suggestion: fixture({ available: false, reason: 'NO_PLACE_COORDS', recommended_place_id: null, ranking: [] }) });
    expect(out).toContain('chưa có toạ độ nên chưa tính được quãng đường');
    expect(out).toContain('data-testid="tie-change"');
  });

  it('đang tải lần đầu: skeleton có role=status (host vẫn có Cách khác); đã có bản cũ thì giữ nguyên, không skeleton', () => {
    const first = html({ suggestion: null, loading: true });
    expect(first).toContain('data-testid="tie-loading"');
    expect(first).toContain('role="status"');
    expect(first).toContain('data-testid="tie-change"');
    const refresh = html({ loading: true });
    expect(refresh).not.toContain('tie-loading');
    expect(refresh).toContain("Đề xuất: Vạn Hạnh Mall");
    expect(refresh).toContain('aria-busy="true"');
  });

  it('lỗi: câu báo + Thử lại + Cách khác (host); có bản cũ thì giữ bản cũ và báo nhỏ', () => {
    const out = html({ suggestion: null, error: true });
    expect(out).toContain('data-testid="tie-error"');
    expect(out).toContain('role="alert"');
    expect(out).toContain('data-testid="tie-retry"');
    expect(out).toContain('data-testid="tie-change"');
    const stale = html({ error: true });
    expect(stale).toContain("Đề xuất: Vạn Hạnh Mall");
    expect(stale).toContain('data-testid="tie-refresh-error"');
  });

  it('lời nhắc xuất phát: chỉ khi mình chưa chia sẻ và chưa nhắc; một lần', () => {
    expect(html({ iShared: false, showNudge: true })).toContain('Thêm nơi xuất phát để tính quán thuận đường cho bạn');
    expect(html({ iShared: true, showNudge: true })).not.toContain('tie-nudge');
    expect(html({ iShared: false, showNudge: false })).not.toContain('tie-nudge');
  });

  it('lỗi chốt hiện dưới nút (role=alert) và nút khoá khi đang chốt', () => {
    const out = html({ resolveError: 'Không chốt được', confirming: true });
    expect(out).toContain('Không chốt được');
    expect(out).toContain('Đang chốt…');
    expect(out).toMatch(/data-testid="tie-cta"[^>]*disabled|disabled[^>]*data-testid="tie-cta"/);
  });

  it('EN: đề xuất, nút chốt, chờ host', async () => {
    await i18n.changeLanguage('en');
    try {
      const host = html();
      expect(host).toContain('Suggested: Vạn Hạnh Mall');
      expect(host).toContain('Lock in Vạn Hạnh Mall');
      expect(host).toContain('Other ways');
      expect(host).toContain("Group total 57' · farthest person 25'");
      expect(host).toContain("3' less than 2nd place");
      expect(html({ isHost: false })).toContain('Waiting for the host to lock it in');
      const why = renderToStaticMarkup(<TieWhyTable suggestion={fixture()} />);
      expect(why).toContain('(meeting point)');
      expect(why).toContain('Longest');
    } finally {
      await i18n.changeLanguage('vi');
    }
  });
});

describe('TieWhyTable ("Vì sao?")', () => {
  it('bảng thành viên × quán: cột đề xuất tô nhấn, Tổng/Lâu nhất, "(điểm hẹn)", cuộn ngang, nguồn ước lượng', () => {
    const out = renderToStaticMarkup(<TieWhyTable suggestion={fixture()} />);
    expect(out).toContain('overflow-x-auto');
    expect(out).toContain('sticky left-0');
    expect(out).toContain('data-recommended="true"');
    expect(out).toContain('bg-accent-soft');
    expect((out.match(/data-testid="tie-why-row"/g) ?? []).length).toBe(3);
    expect(out).toContain('Hà');
    expect(out).toContain('(điểm hẹn)');
    // Hàng Tổng / Lâu nhất đậm, đúng số fixture
    const total = out.slice(out.indexOf('data-testid="tie-why-total"'), out.indexOf('data-testid="tie-why-max"'));
    expect(total).toContain('font-bold');
    expect(total).toMatch(/57'.*60'.*65'/);
    const max = out.slice(out.indexOf('data-testid="tie-why-max"'));
    expect(max).toMatch(/25'.*28'.*32'/);
    expect(out).toContain('sai khác tối đa 2 phút');
  });

  it('ô thiếu số hiện "–"; người chưa có xuất phát được ghi chú', () => {
    const s = fixture({
      candidates: [...fixture().candidates, { place_id: 'p4', name: 'Quán X', upvotes: 4 }],
      matrix: fixture().matrix.map((row) => [...row, null]),
      unranked_place_ids: ['p4'],
      excluded_member_count: 2,
    });
    const out = renderToStaticMarkup(<TieWhyTable suggestion={s} />);
    expect(out).toContain('–');
    expect(out).toContain('2 người chưa có nơi xuất phát nên chưa tính.');
  });

  it('thẻ gắn nguồn: ước lượng → "Ước lượng · xe máy", Google → "Google Maps"', () => {
    // WhyPanel chỉ vẽ nội dung khi mở; nhãn nguồn nằm ở khoá i18n dùng chung (T-88)
    expect(vi.algo.why.sourceEstimate).toBe('Ước lượng · xe máy');
    expect(en.algo.why.sourceGoogle).toBe('Google Maps');
  });
});

/* ---------- TieBlock ---------- */

describe('TieBlock + TieSuggestionCard', () => {
  const tied = [
    { ...mockPlaces[0], id: 'p1', name: 'Dinh Độc Lập', upvotes: 4, score: 4 },
    { ...mockPlaces[1], id: 'p3', name: 'Vạn Hạnh Mall', upvotes: 4, score: 4 },
  ];
  const hints = [{ type: 'TIE_AT_TOP' as const, category: null, candidate_place_ids: ['p1', 'p3'] }];
  const render = (source: Parameters<typeof TieBlock>[0]['suggestionSource']) =>
    renderToStaticMarkup(<TieBlock phase="tie" hints={hints} places={tied} onDecide={() => {}} suggestionSource={source} />);

  it('thẻ vẽ tiêu đề + đề xuất, không tự mở modal (không có dialog)', () => {
    const out = render({ suggestion: fixture(), loading: false, error: false, isHost: true, iShared: true, showNudge: false });
    expect(out).toContain('Hoà rồi: 2 quán cùng 4 phiếu');
    expect(out).toContain("Đề xuất: Vạn Hạnh Mall");
    expect(out).toContain('data-testid="tie-thumb"');
    expect(out).not.toContain('role="dialog"');
  });

  it('chỉ ở giai đoạn tie', () => {
    for (const phase of ['gather', 'vote', 'lock', 'send'] as const) {
      expect(renderToStaticMarkup(<TieBlock phase={phase} hints={hints} places={tied} onDecide={() => {}} />)).toBe('');
    }
  });

  it('"Cách khác" dùng ý định mở ở bước chọn kiểu', () => {
    expect(TIE_CHOOSE_INTENT).toEqual({ chooseMode: true });
  });
});

/* ---------- Store + MSW ---------- */

describe('store đề xuất hoà phiếu qua MSW', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    resetMockDb();
    tokenStorage.clearAll();
  });
  afterAll(() => server.close());

  it('fetchTieSuggestion: lưu đề xuất, tắt cờ tải', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    await useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    const st = useAlgoStore.getState();
    expect(st.tieLoading).toBe(false);
    expect(st.tieError).toBe(false);
    expect(st.tieSuggestion).not.toBeNull();
  });

  it('lỗi mạng: giữ bản cũ (không nhấp nháy), bật cờ lỗi; thử lại xong thì tắt', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    const old = fixture();
    useAlgoStore.setState({ tieSuggestion: old });
    server.use(http.get('*/api/v1/rooms/:roomId/tie-break/suggestion', () => HttpResponse.json({ detail: 'x' }, { status: 500 })));
    await useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    expect(useAlgoStore.getState().tieSuggestion).toBe(old);
    expect(useAlgoStore.getState().tieError).toBe(true);
    server.resetHandlers();
    await useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    expect(useAlgoStore.getState().tieError).toBe(false);
    expect(useAlgoStore.getState().tieSuggestion).not.toBe(old);
  });

  it('đang tải lại: bản cũ vẫn còn trong store', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    const old = fixture();
    useAlgoStore.setState({ tieSuggestion: old });
    const pending = useAlgoStore.getState().fetchTieSuggestion(mockRoom.id);
    expect(useAlgoStore.getState().tieLoading).toBe(true);
    expect(useAlgoStore.getState().tieSuggestion).toBe(old);
    await pending;
  });

  it('chốt: POST /voting/resolve đúng chiến lược TRAVEL_TIME, không kèm số nào từ client', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/api/v1/rooms/:roomId/voting/resolve', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ resolved_places: [], strategy: 'TRAVEL_TIME', tie_break_applied: true, room_status: 'FINALIZED' });
      }),
    );
    usePlaceStore.setState({ places: [] });
    await usePlaceStore.getState().resolveVoting(mockRoom.id, TIE_RESOLVE_PAYLOAD);
    expect(body).toEqual({ strategy: 'TRAVEL_TIME', max_accepted_places: 1 });
  });
});

/* ---------- i18n ---------- */

describe('i18n algo.tie', () => {
  const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('đủ khoá ở VI và EN, không chuỗi rỗng, cùng biến nội suy', () => {
    const vk = keys(vi.algo.tie as unknown as Record<string, unknown>).sort();
    expect(keys(en.algo.tie as unknown as Record<string, unknown>).sort()).toEqual(vk);
    for (const k of vk) {
      const v = (vi.algo.tie as Record<string, string>)[k];
      const e = (en.algo.tie as Record<string, string>)[k];
      expect(v.length).toBeGreaterThan(0);
      expect(e.length).toBeGreaterThan(0);
      const vars = (x: string) => (x.match(/{{\w+}}/g) ?? []).sort().join();
      expect(vars(e)).toBe(vars(v));
    }
  });
});
