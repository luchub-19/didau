import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from 'i18next';
import {
  PRESENCE_KEEPALIVE_MS,
  PRESENCE_MIN_INTERVAL_MS,
  PRESENCE_TTL_MS,
  approach,
  avatarStack,
  composeFocus,
  createPresenceSender,
  mapCursors,
  nextExpiryIn,
  parseFocus,
  pinChipOffset,
  pruneExpired,
  sameFocus,
  viewersByPlace,
  type PeerMap,
  type PresenceFocus,
} from '../stage/presence/rules';
import { attachPresenceTransport, receivePresence, receiveVote, setHoverPlace } from '../stage/presence/channel';
import { PresenceAvatarStack } from '../stage/presence/PresenceAvatars';
import { usePresenceStore } from '../store/usePresenceStore';
import { useRoomStore } from '../store/useRoomStore';
import { useMapStore } from '../store/useMapStore';
import { mockGuestMember, mockHostMember } from '../mocks/mockData';
import type { Member } from '../types';

const place = (id: string) => ({ kind: 'place' as const, place_id: id });

function fakeTimers() {
  let now = 1_000;
  let seq = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      now: () => now,
      setTimer: (fn: () => void, ms: number) => {
        queue.set(++seq, { at: now + ms, fn });
        return seq;
      },
      clearTimer: (id: unknown) => void queue.delete(id as number),
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

describe('presence rules', () => {
  it('sameFocus so khớp theo loại, quán, toạ độ (bỏ qua nhích < 1 m)', () => {
    expect(sameFocus(null, null)).toBe(true);
    expect(sameFocus(place('a'), place('a'))).toBe(true);
    expect(sameFocus(place('a'), place('b'))).toBe(false);
    expect(sameFocus(place('a'), null)).toBe(false);
    expect(sameFocus({ kind: 'map', lng: 106.7, lat: 10.77 }, { kind: 'map', lng: 106.700001, lat: 10.77 })).toBe(true);
    expect(sameFocus({ kind: 'map', lng: 106.7, lat: 10.77 }, { kind: 'map', lng: 106.701, lat: 10.77 })).toBe(false);
  });

  it('parseFocus nhận đúng dạng, trả undefined khi sai dạng', () => {
    expect(parseFocus(null)).toBeNull();
    expect(parseFocus({ kind: 'place', place_id: 'p1' })).toEqual(place('p1'));
    expect(parseFocus({ kind: 'map', lng: 1, lat: 2, extra: 1 })).toEqual({ kind: 'map', lng: 1, lat: 2 });
    expect(parseFocus({ kind: 'map', lng: 'x', lat: 2 })).toBeUndefined();
    expect(parseFocus({ kind: 'place' })).toBeUndefined();
    expect(parseFocus('place')).toBeUndefined();
  });

  it('hết hạn sau 15 s; không ai hết hạn thì giữ nguyên object', () => {
    const peers: PeerMap = { a: { focus: place('p1'), at: 0 }, b: { focus: place('p1'), at: 10_000 } };
    expect(pruneExpired(peers, 5_000)).toBe(peers);
    expect(Object.keys(pruneExpired(peers, PRESENCE_TTL_MS))).toEqual(['b']);
    expect(nextExpiryIn(peers, 5_000)).toBe(PRESENCE_TTL_MS - 5_000);
    expect(nextExpiryIn({}, 0)).toBeNull();
  });

  it('viewersByPlace theo thứ tự đến, bỏ chính mình; mapCursors chỉ lấy con trỏ', () => {
    const peers: PeerMap = {
      b: { focus: place('p1'), at: 20 },
      a: { focus: place('p1'), at: 10 },
      me: { focus: place('p1'), at: 5 },
      c: { focus: { kind: 'map', lng: 1, lat: 2 }, at: 30 },
    };
    expect(viewersByPlace(peers, 'me')).toEqual({ p1: ['a', 'b'] });
    expect(mapCursors(peers, 'me')).toEqual({ c: { lng: 1, lat: 2 } });
  });

  it('avatarStack tối đa 3 + "+N"', () => {
    expect(avatarStack([1, 2])).toEqual({ shown: [1, 2], extra: 0 });
    expect(avatarStack([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], extra: 2 });
  });

  it('composeFocus: rê chuột > con trỏ bản đồ > quán đang mở', () => {
    const cursor = { lng: 1, lat: 2 };
    expect(composeFocus({ hoverPlaceId: 'h', cursor, selectedPlaceId: 's' })).toEqual(place('h'));
    expect(composeFocus({ hoverPlaceId: null, cursor, selectedPlaceId: 's' })).toEqual({ kind: 'map', ...cursor });
    expect(composeFocus({ hoverPlaceId: null, cursor: null, selectedPlaceId: 's' })).toEqual(place('s'));
    expect(composeFocus({ hoverPlaceId: null, cursor: null, selectedPlaceId: null })).toBeNull();
  });

  it('approach tiến dần về đích, gần tới nơi sau một nhịp gửi', () => {
    expect(approach(0, 10, 0)).toBe(0);
    const half = approach(0, 10, PRESENCE_MIN_INTERVAL_MS / 4);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(10);
    expect(approach(0, 10, PRESENCE_MIN_INTERVAL_MS)).toBeGreaterThan(9.4);
  });
});

describe('pinChipOffset', () => {
  it('chip ở trên ghim, lật xuống dưới khi ghim nằm dưới ô tìm kiếm', () => {
    expect(pinChipOffset(400)[1]).toBeLessThan(0);
    expect(pinChipOffset(60)[1]).toBeGreaterThan(0);
    expect(pinChipOffset(119)[1]).toBeGreaterThan(0);
    expect(pinChipOffset(120)[1]).toBeLessThan(0);
  });
});

describe('createPresenceSender', () => {
  it('throttle ≤ 5 lần/giây với cạnh sau, bỏ trùng', () => {
    const t = fakeTimers();
    const sent: PresenceFocus[] = [];
    const s = createPresenceSender((f) => (sent.push(f), true), t.timers);
    s.update(place('a'));
    s.update(place('a'));
    expect(sent).toEqual([place('a')]);
    // Dồn dập trong 200 ms: chỉ gửi giá trị cuối khi hết nhịp
    s.update(place('b'));
    s.update(place('c'));
    t.advance(PRESENCE_MIN_INTERVAL_MS - 1);
    expect(sent).toHaveLength(1);
    t.advance(1);
    expect(sent).toEqual([place('a'), place('c')]);
    // 1 giây cập nhật liên tục: không quá 5 lần (+ lần đầu)
    for (let i = 0; i < 50; i++) {
      s.update({ kind: 'map', lng: i, lat: 0 });
      t.advance(20);
    }
    expect(sent.length - 2).toBeLessThanOrEqual(5);
  });

  it('giữ tiêu điểm thì gửi lại mỗi 10 s; null thì không gửi lại', () => {
    const t = fakeTimers();
    const sent: PresenceFocus[] = [];
    const s = createPresenceSender((f) => (sent.push(f), true), t.timers);
    s.update(place('a'));
    t.advance(PRESENCE_KEEPALIVE_MS);
    expect(sent).toEqual([place('a'), place('a')]);
    s.update(null);
    t.advance(PRESENCE_MIN_INTERVAL_MS);
    expect(sent.at(-1)).toBeNull();
    const n = sent.length;
    t.advance(PRESENCE_KEEPALIVE_MS * 3);
    expect(sent).toHaveLength(n);
  });

  it('tab ẩn gửi null một lần rồi ngừng; hiện lại gửi lại tiêu điểm', () => {
    const t = fakeTimers();
    const sent: PresenceFocus[] = [];
    const s = createPresenceSender((f) => (sent.push(f), true), t.timers);
    s.update(place('a'));
    s.pause();
    s.pause();
    s.update(place('b'));
    t.advance(PRESENCE_KEEPALIVE_MS * 2);
    expect(sent).toEqual([place('a'), null]);
    s.resume();
    expect(sent.at(-1)).toEqual(place('b'));
  });

  it('socket chưa mở (send trả false) thì lần sau thử lại', () => {
    const t = fakeTimers();
    let open = false;
    const sent: PresenceFocus[] = [];
    const s = createPresenceSender((f) => (open ? (sent.push(f), true) : false), t.timers);
    s.update(place('a'));
    open = true;
    t.advance(PRESENCE_MIN_INTERVAL_MS);
    s.update(place('a'));
    expect(sent).toEqual([place('a')]);
  });
});

describe('presence channel + store', () => {
  const me = mockHostMember;
  const guest = mockGuestMember;
  const third: Member = { ...guest, id: 'm-3', nickname: 'Khoa' };
  const fourth: Member = { ...guest, id: 'm-4', nickname: 'Lan' };
  const fifth: Member = { ...guest, id: 'm-5', nickname: 'Minh' };

  beforeEach(() => {
    usePresenceStore.getState().reset();
    useRoomStore.setState({ currentMember: me, members: [me, guest, third, fourth, fifth] });
  });
  afterEach(() => {
    void i18n.changeLanguage('vi');
    useMapStore.getState().selectPlace(null);
  });

  it('PRESENCE_UPDATED cập nhật store, bỏ chính mình và payload sai', () => {
    receivePresence({ member_id: guest.id, focus: { kind: 'place', place_id: 'p1' } });
    receivePresence({ member_id: me.id, focus: { kind: 'place', place_id: 'p1' } });
    receivePresence({ member_id: third.id, focus: { kind: 'bogus' } });
    expect(Object.keys(usePresenceStore.getState().peers)).toEqual([guest.id]);
    receivePresence({ member_id: guest.id, focus: null });
    expect(usePresenceStore.getState().peers).toEqual({});
  });

  it('VOTE_UPDATED có voter_id: người đó hiện trên quán và nhịp tăng; thiếu voter_id thì bỏ qua', () => {
    receiveVote('p1', guest.id);
    receiveVote('p1', guest.id);
    receiveVote('p1', undefined);
    receiveVote('p1', me.id);
    const s = usePresenceStore.getState();
    expect(s.peers[guest.id].focus).toEqual(place('p1'));
    expect(s.pulses[guest.id]).toMatchObject({ placeId: 'p1', seq: 2 });
    expect(Object.keys(s.pulses)).toEqual([guest.id]);
    usePresenceStore.getState().remove(guest.id);
    expect(usePresenceStore.getState().peers).toEqual({});
  });

  it('bộ gửi gắn vào socket: rê chuột thẻ và quán đang mở trên bản đồ', () => {
    vi.useFakeTimers();
    try {
      const sent: PresenceFocus[] = [];
      const detach = attachPresenceTransport((f) => (sent.push(f), true));
      setHoverPlace('p1');
      vi.advanceTimersByTime(PRESENCE_MIN_INTERVAL_MS);
      setHoverPlace(null);
      vi.advanceTimersByTime(PRESENCE_MIN_INTERVAL_MS);
      expect(sent).toEqual([place('p1'), null]);
      detach();
      setHoverPlace('p2');
      vi.advanceTimersByTime(PRESENCE_MIN_INTERVAL_MS);
      expect(sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PresenceAvatarStack: tối đa 3 avatar + "+N", nhãn đọc tên VI/EN', () => {
    const viewers = [guest, third, fourth, fifth].map((m) => ({ id: m.id, name: m.nickname }));
    const pulses = { [third.id]: { placeId: 'p1', seq: 1, at: 0 } };
    let html = renderToStaticMarkup(<PresenceAvatarStack placeId="p1" viewers={viewers} pulses={pulses} />);
    expect(html).toContain('data-testid="presence-avatars"');
    expect(html).toContain('+1');
    expect((html.match(/data-motion="presence.pulse"/g) ?? []).length).toBe(3);
    expect(html).toContain(`${guest.nickname}, Khoa, Lan, Minh đang xem quán này`);
    void i18n.changeLanguage('en');
    html = renderToStaticMarkup(<PresenceAvatarStack placeId="p1" viewers={viewers.slice(0, 1)} pulses={{}} />);
    expect(html).toContain(`${guest.nickname} is looking at this place`);
    expect(html).not.toContain('+');
    expect(renderToStaticMarkup(<PresenceAvatarStack placeId="p1" viewers={[]} pulses={{}} />)).toBe('');
  });
});
