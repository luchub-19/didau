import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { mockRoom, mockPlaces, mockHostMember, MOCK_HOST_TOKEN } from '../mocks/mockData';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { usePresenceStore } from '../store/usePresenceStore';
import { PlaceRow, PlaceList } from '../components/places';
import { VoteButtons } from '../components/voting';
import { TieBlock } from '../components/decide';
import { vi as viLocale } from '../i18n/locales/vi';
import { en as enLocale } from '../i18n/locales/en';
import {
  DEFAULT_TIE_MODE,
  TIE_CHOOSE_INTENT,
  TIE_RUN_INTENT,
  badgeFor,
  distanceToOrigin,
  formatDistance,
  formatPriceShort,
  hasListTools,
  isOverBudget,
  leadingPlaceIds,
  likersOf,
  pickBadge,
  pickProgress,
  placeThumb,
  tieInfo,
} from '../room/placeView';
import type { Place } from '../types';

const place = (over: Partial<Place> = {}): Place => ({ ...mockPlaces[0], ...over });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  usePresenceStore.getState().reset();
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  useRoomStore.getState().reset();
  usePlaceStore.getState().reset();
  usePresenceStore.getState().reset();
});
afterAll(() => {
  server.close();
});

describe('T-69: placeView (logic thuần)', () => {
  it('nhãn ưu tiên: Đã chốt > Đang dẫn > Vượt ngân sách, tối đa 1', () => {
    expect(pickBadge({ accepted: true, leading: true, overBudget: true })).toBe('accepted');
    expect(pickBadge({ accepted: false, leading: true, overBudget: true })).toBe('leading');
    expect(pickBadge({ accepted: false, leading: false, overBudget: true })).toBe('overBudget');
    expect(pickBadge({ accepted: false, leading: false, overBudget: false })).toBeNull();
  });

  it('badgeFor: quán bị loại không nhãn; ACCEPTED thắng dù đang dẫn và vượt ngân sách', () => {
    const lead = new Set(['a']);
    expect(badgeFor({ id: 'a', status: 'ACCEPTED', estimated_cost: 900000 }, lead, 100000)).toBe('accepted');
    expect(badgeFor({ id: 'a', status: 'VOTING', estimated_cost: 900000 }, lead, 100000)).toBe('leading');
    expect(badgeFor({ id: 'b', status: 'VOTING', estimated_cost: 900000 }, lead, 100000)).toBe('overBudget');
    expect(badgeFor({ id: 'a', status: 'REJECTED', estimated_cost: 900000 }, lead, 100000)).toBeNull();
  });

  it('vượt ngân sách: giá > budget_limit; giá 0/thiếu và không có ngân sách thì không vượt', () => {
    expect(isOverBudget({ estimated_cost: 150000 }, 100000)).toBe(true);
    expect(isOverBudget({ estimated_cost: 100000 }, 100000)).toBe(false);
    expect(isOverBudget({ estimated_cost: 0 }, 100000)).toBe(false);
    expect(isOverBudget({ estimated_cost: 150000 }, null)).toBe(false);
    expect(isOverBudget({ estimated_cost: 150000 }, 0)).toBe(false);
  });

  it('quán đang dẫn: điểm cao nhất > 0, hoà thì dẫn chung, quán bị loại không tính', () => {
    const ps = [
      { id: 'a', status: 'VOTING' as const, score: 3 },
      { id: 'b', status: 'VOTING' as const, score: 3 },
      { id: 'c', status: 'VOTING' as const, score: 1 },
      { id: 'd', status: 'REJECTED' as const, score: 9 },
    ];
    expect([...leadingPlaceIds(ps)].sort()).toEqual(['a', 'b']);
    expect(leadingPlaceIds([{ id: 'a', status: 'VOTING', score: 0 }]).size).toBe(0);
  });

  it('khoảng cách tới điểm hẹn + định dạng; thiếu dữ liệu thì null', () => {
    const origin = { origin_lat: 10.7769, origin_lng: 106.7009 };
    const near = distanceToOrigin({ latitude: 10.7769, longitude: 106.7099 }, origin);
    expect(near).not.toBeNull();
    expect(near as number).toBeGreaterThan(900);
    expect(near as number).toBeLessThan(1100);
    expect(distanceToOrigin({ latitude: null, longitude: null }, origin)).toBeNull();
    expect(distanceToOrigin({ latitude: 10.7, longitude: 106.7 }, { origin_lat: null, origin_lng: null })).toBeNull();
    expect(formatDistance(350, 'vi')).toBe('350 m');
    expect(formatDistance(1234, 'vi')).toBe('1,2 km');
    expect(formatDistance(1234, 'en')).toBe('1.2 km');
    expect(formatDistance(3, 'en')).toBe('10 m');
  });

  it('giá ngắn "~45k"; 0/thiếu → null', () => {
    expect(formatPriceShort(45000)).toBe('~45k');
    expect(formatPriceShort(55000)).toBe('~55k');
    expect(formatPriceShort(0)).toBeNull();
    expect(formatPriceShort(null)).toBeNull();
  });

  it('ảnh đại diện tạm là minh hoạ danh mục (src null) cho tới khi T-70 nối ảnh', () => {
    expect(placeThumb({ category: 'DRINK' })).toEqual({ src: null, category: 'DRINK' });
  });

  it('người đã thích: lấy từ pulses theo quán, bỏ mình, không vượt số upvote', () => {
    const pulses = { m1: { placeId: 'p' }, m2: { placeId: 'p' }, m3: { placeId: 'other' }, me: { placeId: 'p' } };
    expect(likersOf({ id: 'p', upvotes: 5, current_user_vote: 0 }, pulses, 'me')).toEqual(['m1', 'm2']);
    // Mình đã ♥ chiếm 1 chỗ; chỉ còn 1 upvote cho người khác
    expect(likersOf({ id: 'p', upvotes: 2, current_user_vote: 1 }, pulses, 'me')).toEqual(['m1']);
    // Không còn upvote thì không hiện ai (không rõ người vừa vote là +1 hay −1)
    expect(likersOf({ id: 'p', upvotes: 0, current_user_vote: 0 }, pulses, 'me')).toEqual([]);
  });

  it('"x/y đã chọn": y = thành viên hoạt động, x = mình có ♥/✕ + người khác đã có VOTE_UPDATED, không vượt y', () => {
    const members = [
      { id: 'me', is_active: true },
      { id: 'a', is_active: true },
      { id: 'b', is_active: true },
      { id: 'gone', is_active: false },
    ];
    expect(pickProgress([{ current_user_vote: 0 }], members, {}, 'me')).toEqual({ done: 0, total: 3 });
    expect(pickProgress([{ current_user_vote: 1 }], members, { a: { placeId: 'p' } }, 'me')).toEqual({ done: 2, total: 3 });
    // Người đã rời phòng không được đếm
    expect(pickProgress([{ current_user_vote: -1 }], members, { gone: { placeId: 'p' } }, 'me')).toEqual({ done: 1, total: 3 });
  });

  it('tieInfo: lấy ứng viên từ hint, thiếu thì quán chung điểm cao nhất, <2 thì null', () => {
    const ps = [
      place({ id: 'a', name: 'A', upvotes: 3, score: 3 }),
      place({ id: 'b', name: 'B', upvotes: 3, score: 3 }),
      place({ id: 'c', name: 'C', upvotes: 1, score: 1 }),
    ];
    expect(tieInfo([{ type: 'TIE_AT_TOP', category: null, candidate_place_ids: ['a', 'b'] }], ps)).toEqual({
      count: 2,
      votes: 3,
      names: ['A', 'B'],
    });
    expect(tieInfo([{ type: 'NEAR_TIE', category: null, candidate_place_ids: [] }], ps)?.count).toBe(2);
    expect(tieInfo([], [ps[0], ps[2]])).toBeNull();
  });

  it('lọc/sắp xếp/tìm chỉ khi >8 quán; trọng tài mặc định SMART; hai ý định của TieBlock', () => {
    expect(hasListTools(8)).toBe(false);
    expect(hasListTools(9)).toBe(true);
    expect(DEFAULT_TIE_MODE).toBe('SMART');
    expect(TIE_RUN_INTENT).toEqual({ mode: 'SMART' });
    expect(TIE_CHOOSE_INTENT).toEqual({ chooseMode: true });
  });
});

describe('T-69: ♥ Muốn đi', () => {
  it('♥ qua store: bấm = upvote (+1), bấm lại = bỏ vote (0)', async () => {
    await usePlaceStore.getState().fetchPlaces(mockRoom.id);
    const target = usePlaceStore.getState().places.find((p) => p.current_user_vote === 0)!;
    const base = target.upvotes;

    await usePlaceStore.getState().castVote(mockRoom.id, target.id, 1);
    let now = usePlaceStore.getState().places.find((p) => p.id === target.id)!;
    expect(now.current_user_vote).toBe(1);
    expect(now.upvotes).toBe(base + 1);

    await usePlaceStore.getState().retractVote(mockRoom.id, target.id);
    now = usePlaceStore.getState().places.find((p) => p.id === target.id)!;
    expect(now.current_user_vote).toBe(0);
    expect(now.upvotes).toBe(base);
  });

  it('dạng heart: nhãn "Muốn đi", aria-pressed theo phiếu của mình, nhãn bỏ vote khi đã ♥, chạm ≥44px', () => {
    const off = renderToStaticMarkup(
      <VoteButtons variant="heart" roomId="r" placeId="p" upvotes={3} downvotes={0} score={3} currentUserVote={0} />,
    );
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('aria-label="Muốn đi"');
    expect(off).toContain('min-h-[44px]');
    expect(off).toContain('>3<');
    // Dạng heart không có nút "Không" và điểm tổng
    expect(off).not.toContain('Không');

    const on = renderToStaticMarkup(
      <VoteButtons variant="heart" roomId="r" placeId="p" upvotes={4} downvotes={0} score={4} currentUserVote={1} />,
    );
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('Bỏ “Muốn đi”');
    expect(on).toContain('text-accent-text');
  });

  it('dạng full (trang chi tiết) đổi nhãn: Muốn đi / Không', () => {
    const html = renderToStaticMarkup(
      <VoteButtons roomId="r" placeId="p" upvotes={1} downvotes={1} score={0} currentUserVote={0} />,
    );
    expect(html).toContain('aria-label="Muốn đi"');
    expect(html).toContain('aria-label="Không"');
  });

  it('FINALIZED khoá vote: thẻ nhận isVotingDisabled thì ♥ và "Không" bị vô hiệu', () => {
    const html = renderToStaticMarkup(
      <PlaceRow place={place()} roomId={mockRoom.id} isVotingDisabled />,
    );
    expect(html).toMatch(/data-testid="vote-heart"[^>]*disabled=""|disabled=""[^>]*data-testid="vote-heart"/);
  });

  it('quán bị loại: ♥ vô hiệu, thẻ mờ, không nhãn', () => {
    const html = renderToStaticMarkup(
      <PlaceRow place={place({ status: 'REJECTED', score: 9 })} roomId={mockRoom.id} leading={new Set([mockPlaces[0].id])} />,
    );
    expect(html).toContain('opacity-60');
    expect(html).not.toContain('data-testid="badge-');
    expect(html).toMatch(/disabled=""/);
  });
});

describe('T-69: PlaceRow / PlaceList', () => {
  it('nhãn trên thẻ: Đã chốt, Đang dẫn, Vượt ngân sách theo thứ tự ưu tiên', () => {
    const lead = new Set([mockPlaces[0].id]);
    const accepted = renderToStaticMarkup(
      <PlaceRow place={place({ status: 'ACCEPTED' })} roomId={mockRoom.id} leading={lead} room={{ origin_lat: null, origin_lng: null, budget_limit: 10 }} />,
    );
    expect(accepted).toContain('data-testid="badge-accepted"');
    expect(accepted).toContain('Đã chốt');
    expect(accepted).not.toContain('badge-leading');

    const leadingHtml = renderToStaticMarkup(
      <PlaceRow place={place()} roomId={mockRoom.id} leading={lead} room={{ origin_lat: null, origin_lng: null, budget_limit: 10 }} />,
    );
    expect(leadingHtml).toContain('data-testid="badge-leading"');
    expect(leadingHtml).toContain('Đang dẫn');
    expect(leadingHtml).not.toContain('badge-overBudget');

    const over = renderToStaticMarkup(
      <PlaceRow place={place({ estimated_cost: 95000 })} roomId={mockRoom.id} room={{ origin_lat: null, origin_lng: null, budget_limit: 50000 }} />,
    );
    expect(over).toContain('data-testid="badge-overBudget"');
    expect(over).toContain('Vượt ngân sách');
  });

  it('menu ⋯ luôn có; "Xoá" chỉ khi là host/người đề xuất (menu đóng nên kiểm bằng trigger)', () => {
    const html = renderToStaticMarkup(
      <PlaceRow place={place()} roomId={mockRoom.id} currentMemberId={mockHostMember.id} isHost onDeletePlace={() => {}} />,
    );
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(`Tuỳ chọn cho ${mockPlaces[0].name}`);
  });

  it('thanh "x/y đã chọn" chỉ ở vote/tie; gather/lock không có', () => {
    const render = (phase: 'gather' | 'vote' | 'tie' | 'lock') =>
      renderToStaticMarkup(
        <PlaceList
          places={mockPlaces}
          roomId={mockRoom.id}
          selectedCategory="ALL"
          phase={phase}
          members={[mockHostMember]}
          currentMemberId={mockHostMember.id}
          onOpenAddModal={() => {}}
          onDeletePlace={() => {}}
        />,
      );
    expect(render('vote')).toContain('data-testid="pick-progress"');
    expect(render('tie')).toContain('/1 đã chọn');
    expect(render('gather')).not.toContain('pick-progress');
    expect(render('lock')).not.toContain('pick-progress');
  });

  it('giai đoạn tie: nút Thêm quán thu còn icon (vẫn có aria-label)', () => {
    const html = renderToStaticMarkup(
      <PlaceList places={mockPlaces} roomId={mockRoom.id} selectedCategory="ALL" phase="tie" onOpenAddModal={() => {}} onDeletePlace={() => {}} />,
    );
    expect(html).toContain('aria-label="Thêm quán"');
    expect(html).not.toContain('<span>Thêm quán</span>');
  });

  it('>8 quán: bộ lọc danh mục đang đặt vẫn áp; ≤8 quán thì bỏ qua để không kẹt vô hình', () => {
    const drink = place({ id: 'd', name: 'Quán nước', category: 'DRINK' });
    const food = place({ id: 'f', name: 'Quán cơm', category: 'FOOD' });
    const few = renderToStaticMarkup(
      <PlaceList places={[drink, food]} roomId={mockRoom.id} selectedCategory="DRINK" onOpenAddModal={() => {}} onDeletePlace={() => {}} />,
    );
    expect(few).toContain('Quán cơm');
    const many = Array.from({ length: 8 }, (_, i) => place({ id: `f${i}`, name: `Cơm ${i}`, category: 'FOOD' }));
    const html = renderToStaticMarkup(
      <PlaceList places={[drink, ...many]} roomId={mockRoom.id} selectedCategory="DRINK" onOpenAddModal={() => {}} onDeletePlace={() => {}} />,
    );
    expect(html).toContain('Quán nước');
    expect(html).not.toContain('Cơm 0');
  });
});

describe('T-69: TieBlock', () => {
  const tied = [place({ id: 'a', name: 'Quán A', upvotes: 2, score: 2 }), place({ id: 'b', name: 'Quán B', upvotes: 2, score: 2 })];
  const hints = [{ type: 'TIE_AT_TOP' as const, category: null, candidate_place_ids: ['a', 'b'] }];

  it('chỉ ở phase tie', () => {
    for (const phase of ['gather', 'vote', 'lock', 'send'] as const) {
      expect(renderToStaticMarkup(<TieBlock phase={phase} hints={hints} places={tied} onDecide={() => {}} />)).toBe('');
    }
    expect(renderToStaticMarkup(<TieBlock phase="tie" hints={hints} places={tied} onDecide={() => {}} />)).toContain('tie-cta');
  });

  it('đủ chữ VI và EN', () => {
    const vi = renderToStaticMarkup(<TieBlock phase="tie" hints={hints} places={tied} onDecide={() => {}} />);
    expect(vi).toContain('Hoà rồi: 2 quán cùng 2 phiếu');
    expect(vi).toContain('Để trọng tài chọn');
    expect(vi).toContain('Đổi cách chọn');
    expect(viLocale.decide.tie.cta).toBe('Để trọng tài chọn');
    expect(enLocale.decide.tie.cta).toBe('Let the referee pick');
    expect(enLocale.decide.tie.change).toBe('Pick another way');
  });

  it('nhiều quán hoà: liệt kê 3 tên rồi "+N quán nữa"', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => place({ id, name: `Q-${id}`, upvotes: 2, score: 2 }));
    const html = renderToStaticMarkup(
      <TieBlock phase="tie" hints={[{ type: 'TIE_AT_TOP', category: null, candidate_place_ids: ['a', 'b', 'c', 'd', 'e'] }]} places={five} onDecide={() => {}} />,
    );
    expect(html).toContain('Q-a · Q-b · Q-c');
    expect(html).toContain('+2 quán nữa');
    expect(html).not.toContain('Q-d');
  });
});
