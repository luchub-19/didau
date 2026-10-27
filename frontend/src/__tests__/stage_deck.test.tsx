import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach } from 'vitest';
import '../i18n';
import i18n from 'i18next';
import {
  createPointerGuard,
  exitTarget,
  keyToVote,
  newlyDone,
  rotationFor,
  stampProgress,
  throwDecision,
  tiltFor,
  MAX_DRAG_ROTATE_DEG,
  MAX_HOVER_TILT_DEG,
  THROW_DISTANCE_PX,
  THROW_VELOCITY_PX_S,
} from '../stage/deck/rules';
import StageDeck from '../stage/deck/StageDeck';
import { DeckProgress } from '../stage/deck/DeckProgress';
import { SwipeDeck } from '../components/decide/SwipeDeck';
import { resolvePreset } from '../motion/presets';
import { mockPlaces, mockRoom, mockHostMember } from '../mocks/mockData';
import type { DecisionSession } from '../types';

const noop = () => {};

afterEach(() => {
  void i18n.changeLanguage('vi');
});

describe('T-60: ngưỡng thả thẻ (throwDecision)', () => {
  it('khoảng cách: kéo qua ngưỡng là phiếu, bất kể vận tốc', () => {
    expect(throwDecision(THROW_DISTANCE_PX, 0)).toBe(true);
    expect(throwDecision(-THROW_DISTANCE_PX - 30, 0)).toBe(false);
    // kéo xa nhưng tay giật ngược lại lúc thả: vẫn tính theo khoảng cách
    expect(throwDecision(140, -900)).toBe(true);
  });

  it('khoảng cách chưa đủ, vận tốc chậm: bật lại chỗ cũ', () => {
    expect(throwDecision(60, 200)).toBeNull();
    expect(throwDecision(-60, -200)).toBeNull();
    expect(throwDecision(0, 0)).toBeNull();
  });

  it('vận tốc: quăng nhanh cùng chiều là phiếu dù kéo chưa xa', () => {
    expect(throwDecision(40, THROW_VELOCITY_PX_S)).toBe(true);
    expect(throwDecision(-40, -THROW_VELOCITY_PX_S - 400)).toBe(false);
  });

  it('vận tốc ngược chiều hoặc chạm quá nhẹ thì không thành phiếu', () => {
    expect(throwDecision(40, -1200)).toBeNull();
    expect(throwDecision(8, 1500)).toBeNull();
    expect(throwDecision(Number.NaN, 2000)).toBeNull();
    expect(throwDecision(40, Number.NaN)).toBeNull();
  });
});

describe('T-60: xoay, nghiêng, nhãn theo độ kéo', () => {
  it('xoay theo độ lệch, tối đa ±12°; static không xoay', () => {
    expect(rotationFor(0, 'full')).toBe(0);
    expect(rotationFor(5000, 'full')).toBe(MAX_DRAG_ROTATE_DEG);
    expect(rotationFor(-5000, 'lite')).toBe(-MAX_DRAG_ROTATE_DEG);
    expect(rotationFor(THROW_DISTANCE_PX, 'full')).toBeCloseTo(6, 6);
    expect(rotationFor(300, 'static')).toBe(0);
  });

  it('nghiêng 3D theo con trỏ ≤6°, chỉ mức full', () => {
    const corner = tiltFor(400, 0, 400, 300, 'full');
    expect(Math.abs(corner.rotateX)).toBeCloseTo(MAX_HOVER_TILT_DEG, 6);
    expect(Math.abs(corner.rotateY)).toBeCloseTo(MAX_HOVER_TILT_DEG, 6);
    expect(tiltFor(200, 150, 400, 300, 'full')).toEqual({ rotateX: -0, rotateY: 0 });
    // ra ngoài thẻ vẫn kẹp ở 6°
    expect(Math.abs(tiltFor(9000, -9000, 400, 300, 'full').rotateY)).toBe(MAX_HOVER_TILT_DEG);
    expect(tiltFor(400, 0, 400, 300, 'lite')).toEqual({ rotateX: 0, rotateY: 0 });
    expect(tiltFor(400, 0, 400, 300, 'static')).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it('nhãn Thích/Thôi hiện dần, rõ hẳn ở ngưỡng thả', () => {
    expect(stampProgress(10)).toBe(0);
    expect(stampProgress(55)).toBeGreaterThan(0);
    expect(stampProgress(55)).toBeLessThan(1);
    expect(stampProgress(-THROW_DISTANCE_PX)).toBe(1);
    expect(stampProgress(500)).toBe(1);
  });
});

describe('T-60: phím tắt ←/→', () => {
  it('→ Thích, ← Thôi, phím khác bỏ qua', () => {
    expect(keyToVote('ArrowRight', null)).toBe(true);
    expect(keyToVote('ArrowLeft', null)).toBe(false);
    expect(keyToVote('ArrowUp', null)).toBeNull();
    expect(keyToVote('Enter', null)).toBeNull();
  });

  it('đang gõ trong ô nhập thì mũi tên không quẹt thẻ', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const editable = { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget;
    const button = { tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget;
    expect(keyToVote('ArrowRight', input)).toBeNull();
    expect(keyToVote('ArrowLeft', editable)).toBeNull();
    expect(keyToVote('ArrowLeft', button)).toBe(false);
  });
});

describe('T-60: chống kẹt kéo (luật T-49 giữ nguyên)', () => {
  it('ngón tay thứ hai bị bỏ qua khi ngón đầu đang kéo', () => {
    const g = createPointerGuard();
    expect(g.down(1)).toBe(true);
    expect(g.down(2)).toBe(false);
    expect(g.owns(1)).toBe(true);
    expect(g.release(2)).toBe(false);
    expect(g.release(1)).toBe(true);
    expect(g.down(2)).toBe(true);
  });

  it('pointercancel / blur trả cử chỉ về rảnh', () => {
    const g = createPointerGuard();
    g.down(7);
    g.reset();
    expect(g.isActive()).toBe(false);
    expect(g.down(9)).toBe(true);
  });
});

describe('T-60: mức static = cross-fade, không bay/xoay', () => {
  it('exitTarget: full/lite bay theo hướng phiếu, static chỉ mờ tại chỗ', () => {
    expect(exitTarget(true, 'full', 640)).toEqual({ x: 640, opacity: 0 });
    expect(exitTarget(false, 'lite', 640)).toEqual({ x: -640, opacity: 0 });
    expect(exitTarget(true, 'static', 640)).toEqual({ opacity: 0 });
    expect(exitTarget(null, 'full', 640)).toEqual({ opacity: 0 });
    expect(resolvePreset('vote.swipe', 'static').move).toBe(false);
  });

  it('StageDeck static: thẻ trên cùng không xoay, thẻ sau ẩn khỏi trình đọc màn hình', () => {
    const html = renderToStaticMarkup(
      <StageDeck cards={mockPlaces.slice(0, 3)} lastVote={null} tier="static" onVote={noop} />,
    );
    expect(html).toContain('data-testid="swipe-card-current"');
    expect(html).toContain('data-motion="vote.swipe"');
    expect(html).not.toMatch(/rotate\((?!0)[-\d.]+deg\)/);
    // 1 thẻ trên cùng + 2 thẻ sau (chỉ hiện ≥1024px)
    expect(html.match(/data-motion="vote\.swipe"/g)?.length).toBe(3);
    expect(html).toContain('hidden lg:flex');
  });

  it('StageDeck: nhãn Thích/Thôi có chữ + icon (không chỉ màu)', () => {
    const html = renderToStaticMarkup(
      <StageDeck cards={mockPlaces.slice(0, 1)} lastVote={null} tier="full" onVote={noop} />,
    );
    expect(html).toContain('swipe-stamp-like');
    expect(html).toContain('swipe-stamp-dislike');
    expect(html).toContain('THÍCH');
    expect(html).toContain('THÔI');
    expect(html.match(/<svg/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe('T-60: tiến độ nhóm "+1" ẩn danh', () => {
  it('newlyDone chỉ đếm phần tăng', () => {
    expect(newlyDone(1, 2)).toBe(1);
    expect(newlyDone(1, 4)).toBe(3);
    expect(newlyDone(3, 3)).toBe(0);
    expect(newlyDone(3, 0)).toBe(0); // phiên mới reset
  });

  it('DeckProgress hiện x/y người xong và bộ đếm thẻ, VI và EN', async () => {
    const vi = renderToStaticMarkup(<DeckProgress done={1} total={3} currentCard={2} totalCards={5} />);
    expect(vi).toContain('swipe-progress-text');
    expect(vi).toContain('swipe-progress-bar');
    expect(vi).toContain('2 / 5 quán');
    expect(vi).toContain('width:33%');
    await i18n.changeLanguage('en');
    const en = renderToStaticMarkup(<DeckProgress done={1} total={3} currentCard={2} totalCards={5} />);
    expect(en).toContain('2 / 5 places');
    expect(i18n.t('decide.swipe.plusDone', { count: 1 })).toBe('+1 done');
  });

  it('SwipeDeck phiên OPEN: sân khấu có data-motion, thẻ dự phòng hiện ngay trước khi chunk motion tải', () => {
    const session: DecisionSession = {
      id: 's-1',
      room_id: mockRoom.id,
      mode: 'SWIPE',
      status: 'OPEN',
      category: 'FOOD',
      candidate_place_ids: mockPlaces.map((p) => p.id),
      seed: 1,
      created_by_id: mockHostMember.id,
      created_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const html = renderToStaticMarkup(
      <SwipeDeck
        roomId={mockRoom.id}
        isHost
        places={mockPlaces}
        session={session}
        doneMemberIds={[]}
        totalMembers={2}
        localSwipes={{}}
      />,
    );
    expect(html).toContain('swipe-stage');
    expect(html).toContain('swipe-card-current');
    expect(html).toContain('data-motion="vote.swipe"');
    expect(html).toContain(mockPlaces[0].name);
    expect(html).toContain('swipe-like-btn');
    expect(html).toContain('swipe-dislike-btn');
  });
});
