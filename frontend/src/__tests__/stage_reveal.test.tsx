import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../i18n';
import i18n from 'i18next';
import {
  revealSteps,
  revealTotalMs,
  revealIntent,
  SCRIPT_WITH_MAP,
  SCRIPT_CARD_ONLY,
} from '../stage/reveal/steps';
import {
  createRevealMemory,
  detectReveal,
  pickWinner,
  revealMemory,
  type RevealObservation,
} from '../stage/reveal/triggers';
import { buildIcs, directionsUrl, icsFileName, icsLocalTime } from '../stage/reveal/actions';
import { watchReveals } from '../stage/reveal/useRevealTrigger';
import RevealStage from '../stage/reveal/RevealStage';
import { MOTION_PRESETS } from '../motion/presets';
import { setMotionOverride } from '../motion/debug';
import { useDecisionStore } from '../store/useDecisionStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { SoundToggle } from '../sound/SoundToggle';
import { mockPlaces, mockRoom } from '../mocks/mockData';
import type { DecisionSession, Place } from '../types';

const ROOM_ID = 'room-1';
const P1 = 'place-1';
const P2 = 'place-2';

function obs(partial: Partial<RevealObservation> = {}): RevealObservation {
  return {
    roomId: ROOM_ID,
    roomStatus: 'VOTING',
    session: null,
    places: [
      { id: P1, status: 'VOTING', score: 3 },
      { id: P2, status: 'VOTING', score: 5 },
    ],
    ...partial,
  };
}

const accepted = (id: string) =>
  obs().places.map((p) => (p.id === id ? { ...p, status: 'ACCEPTED' as const } : p));

describe('T-61: kịch bản reveal là dữ liệu (steps)', () => {
  afterEach(() => setMotionOverride(null));

  it('full + có bản đồ: đủ 5 bước theo thứ tự dim → fly → card → sweep → actions, trong ngân sách preset', () => {
    const steps = revealSteps('full', { canFly: true });
    expect(steps.map((s) => s.id)).toEqual(['dim', 'fly', 'card', 'sweep', 'actions']);
    const card = steps.find((s) => s.id === 'card')!;
    const sweep = steps.find((s) => s.id === 'sweep')!;
    const actions = steps.find((s) => s.id === 'actions')!;
    expect(card.at).toBeGreaterThan(0);
    expect(sweep.at).toBeGreaterThanOrEqual(card.at);
    expect(actions.at).toBeGreaterThan(sweep.at);
    expect(revealTotalMs(steps)).toBeLessThanOrEqual(MOTION_PRESETS['decide.reveal'].maxSequenceMs);
    // Yêu cầu task: cả màn ≤ 3,5 s
    expect(revealTotalMs(steps)).toBeLessThanOrEqual(3500);
  });

  it('full không có bản đồ và lite: không bay, lite ngắn hơn', () => {
    const noMap = revealSteps('full', { canFly: false });
    const lite = revealSteps('lite', { canFly: true });
    expect(noMap.some((s) => s.id === 'fly')).toBe(false);
    expect(lite.some((s) => s.id === 'fly')).toBe(false);
    expect(lite.map((s) => s.id)).toEqual(['dim', 'card', 'sweep', 'actions']);
    expect(revealTotalMs(lite)).toBeLessThan(revealTotalMs(noMap));
  });

  it('static: hiện ngay trạng thái cuối (mọi bước bắt đầu ở 0, không quét/bay)', () => {
    const steps = revealSteps('static', { canFly: true });
    expect(steps.map((s) => s.id)).toEqual(['dim', 'card', 'actions']);
    expect(steps.every((s) => s.at === 0)).toBe(true);
  });

  it('?motion=slow kéo dài cả chuỗi ×4 để soi', () => {
    const normal = revealTotalMs(revealSteps('full', { canFly: true }));
    setMotionOverride('slow');
    expect(revealTotalMs(revealSteps('full', { canFly: true }))).toBe(normal * 4);
  });

  it('kịch bản không có bước nào vượt quá cuối chuỗi của preset', () => {
    for (const script of [SCRIPT_WITH_MAP, SCRIPT_CARD_ONLY]) {
      for (const row of script) {
        expect(row.at).toBeGreaterThanOrEqual(0);
        expect(row.at + row.span).toBeLessThanOrEqual(
          MOTION_PRESETS['decide.reveal'].maxSequenceMs / 1800,
        );
      }
    }
  });
});

describe('T-61: bỏ qua được (revealIntent)', () => {
  it('đang chạy: Esc, bấm nền, bấm thẻ đều nhảy tới cuối', () => {
    expect(revealIntent({ kind: 'escape' }, false)).toBe('skip');
    expect(revealIntent({ kind: 'click', insideCard: false }, false)).toBe('skip');
    expect(revealIntent({ kind: 'click', insideCard: true }, false)).toBe('skip');
  });

  it('đã xong: Esc / bấm nền đóng, bấm trong thẻ để nút tự xử lý', () => {
    expect(revealIntent({ kind: 'escape' }, true)).toBe('close');
    expect(revealIntent({ kind: 'click', insideCard: false }, true)).toBe('close');
    expect(revealIntent({ kind: 'click', insideCard: true }, true)).toBeNull();
  });
});

describe('T-61: phát hiện "vừa chốt" (detectReveal)', () => {
  it('vào phòng muộn: lần quan sát đầu / đổi phòng không phát', () => {
    const finalized = obs({ roomStatus: 'FINALIZED', places: accepted(P1) });
    expect(detectReveal(null, finalized)).toBeNull();
    expect(detectReveal(obs({ roomId: 'other' }), finalized)).toBeNull();
    // Store đang tải (phòng chưa có) rồi mới thấy FINALIZED: không phải chuyển trạng thái trực tiếp
    expect(detectReveal(obs({ roomStatus: null, places: [] }), finalized)).toBeNull();
  });

  it('A. phiên chọn hộ OPEN → RESOLVED: phát với quán của phiên', () => {
    const open = obs({ session: { id: 's1', status: 'OPEN', resultPlaceId: P1 } });
    const resolved = obs({ session: { id: 's1', status: 'RESOLVED', resultPlaceId: P1 } });
    expect(detectReveal(open, resolved)).toEqual({ key: 'session:s1', placeId: P1, placeKey: `place:${ROOM_ID}:${P1}` });
    // RESOLVED mà trước đó không thấy OPEN (vào muộn) thì thôi
    expect(detectReveal(obs(), resolved)).toBeNull();
  });

  it('B. bỏ phiếu thường: phòng VOTING → FINALIZED, chọn quán điểm cao nhất trong các quán vừa chốt', () => {
    const before = obs();
    const after = obs({
      roomStatus: 'FINALIZED',
      places: obs().places.map((p) => ({ ...p, status: 'ACCEPTED' as const })),
    });
    const found = detectReveal(before, after);
    expect(found?.placeId).toBe(P2);
    expect(found?.key).toBe(`vote:${ROOM_ID}:${P2}`);
  });

  it('C. host tự chốt tie-break: quán thành ACCEPTED khi phòng chưa đổi trạng thái', () => {
    expect(detectReveal(obs(), obs({ places: accepted(P1) }))?.placeId).toBe(P1);
    // Danh sách lúc trước còn rỗng (đang tải) thì không tính
    expect(detectReveal(obs({ places: [] }), obs({ places: accepted(P1) }))).toBeNull();
  });

  it('pickWinner ưu tiên quán của phiên, hoà điểm lấy quán đứng trước', () => {
    const o = obs({ session: { id: 's', status: 'OPEN', resultPlaceId: P1 } });
    expect(pickWinner(o, [P1, P2])).toBe(P1);
    const tie = obs({ places: [{ id: P1, status: 'ACCEPTED', score: 2 }, { id: P2, status: 'ACCEPTED', score: 2 }] });
    expect(pickWinner(tie, [P1, P2])).toBe(P1);
    expect(pickWinner(tie, [])).toBeNull();
  });

  it('một lần chốt đi qua A, B, C (máy khác: VOTING_RESOLVED rồi DECISION_RESOLVED) chỉ phát một lần', () => {
    const memory = createRevealMemory();
    const seq: RevealObservation[] = [
      obs({ session: { id: 's1', status: 'OPEN', resultPlaceId: null } }),
      obs({ session: { id: 's1', status: 'OPEN', resultPlaceId: null }, places: accepted(P1) }),
      obs({ session: { id: 's1', status: 'OPEN', resultPlaceId: null }, places: accepted(P1), roomStatus: 'FINALIZED' }),
      obs({ session: { id: 's1', status: 'RESOLVED', resultPlaceId: P1 }, places: accepted(P1), roomStatus: 'FINALIZED' }),
    ];
    let fired = 0;
    for (let i = 1; i < seq.length; i++) {
      const found = detectReveal(seq[i - 1], seq[i]);
      if (found && !memory.has(found)) {
        memory.remember(found);
        fired++;
        expect(found.placeId).toBe(P1);
      }
    }
    expect(fired).toBe(1);
  });

  it('recentlyRevealed chỉ đúng trong vài giây sau khi công bố quán đó (bỏ toast trùng)', () => {
    let clock = 1000;
    const memory = createRevealMemory(() => clock);
    expect(memory.recentlyRevealed(P1)).toBe(false);
    memory.remember({ key: 's1', placeId: P1, placeKey: `place:r:${P1}` });
    expect(memory.recentlyRevealed(P1)).toBe(true);
    expect(memory.recentlyRevealed(P2)).toBe(false);
    clock += 3001;
    expect(memory.recentlyRevealed(P1)).toBe(false);
  });
});

describe('T-61: kích hoạt từ store thật (watchReveals) — một lần mỗi phiên', () => {
  const places: Place[] = mockPlaces.slice(0, 2).map((p) => ({ ...p, status: 'VOTING' }));
  const openSession: DecisionSession = {
    id: 'sess-reveal',
    room_id: mockRoom.id,
    mode: 'SMART',
    status: 'OPEN',
    category: null,
    candidate_place_ids: [places[0].id],
    seed: 1,
    result_place_id: places[0].id,
    result_payload: null,
    created_by_id: 'host',
    created_at: new Date().toISOString(),
    closes_at: null,
  };

  beforeEach(() => {
    revealMemory.clear();
    useRoomStore.setState({ room: { ...mockRoom, status: 'VOTING' } });
    usePlaceStore.setState({ places });
    useDecisionStore.setState({ currentSession: openSession });
  });

  afterEach(() => {
    useDecisionStore.getState().reset();
  });

  it('host chốt SMART (session RESOLVED → quán ACCEPTED → phòng FINALIZED): phát đúng một lần', () => {
    const fired: string[] = [];
    const stop = watchReveals((t) => fired.push(t.placeId));
    // Thứ tự giống acceptDecision
    useDecisionStore.setState({ currentSession: { ...openSession, status: 'RESOLVED' } });
    usePlaceStore.getState().upsertPlace({ ...places[0], status: 'ACCEPTED' });
    useRoomStore.setState({ room: { ...mockRoom, status: 'FINALIZED' } });
    stop();
    expect(fired).toEqual([places[0].id]);
  });

  it('lớp phủ mount lại (đổi tab, mở lại sheet) không phát lại phiên đã công bố', () => {
    const first: string[] = [];
    const stop1 = watchReveals((t) => first.push(t.key));
    useDecisionStore.setState({ currentSession: { ...openSession, status: 'RESOLVED' } });
    stop1();
    // Giả lập store quay lại OPEN rồi RESOLVED cùng phiên (sự kiện WS lặp)
    useDecisionStore.setState({ currentSession: openSession });
    const second: string[] = [];
    const stop2 = watchReveals((t) => second.push(t.key));
    useDecisionStore.setState({ currentSession: { ...openSession, status: 'RESOLVED' } });
    stop2();
    expect(first).toEqual(['session:sess-reveal']);
    expect(second).toEqual([]);
  });

  it('vào phòng khi đã chốt sẵn: không phát', () => {
    useRoomStore.setState({ room: { ...mockRoom, status: 'FINALIZED' } });
    useDecisionStore.setState({ currentSession: { ...openSession, status: 'RESOLVED' } });
    usePlaceStore.setState({ places: [{ ...places[0], status: 'ACCEPTED' }, places[1]] });
    const fired: string[] = [];
    const stop = watchReveals((t) => fired.push(t.key));
    // Đồng bộ lại (ROOM_STATE_SYNC) với cùng dữ liệu
    usePlaceStore.setState({ places: [{ ...places[0], status: 'ACCEPTED' }, places[1]] });
    useRoomStore.setState({ room: { ...mockRoom, status: 'FINALIZED' } });
    stop();
    expect(fired).toEqual([]);
  });

  it('huỷ phiên (CANCELLED) không phải chốt: không phát', () => {
    const fired: string[] = [];
    const stop = watchReveals((t) => fired.push(t.key));
    useDecisionStore.setState({ currentSession: { ...openSession, status: 'CANCELLED' } });
    stop();
    expect(fired).toEqual([]);
  });
});

describe('T-61: nút thật sau màn công bố (actions)', () => {
  const room = { id: 'r1', title: 'Tối thứ 6', event_date: '2026-10-30', start_minute: 1020, end_minute: 1380 };
  const place = { id: 'p1', name: 'Quán Ngon, 138', address: '138 Nam Kỳ Khởi Nghĩa; Q1' };

  it('tệp .ics dùng ngày + khung giờ của phòng (mặc định 17:00–23:00), thoát ký tự đặc biệt', () => {
    const ics = buildIcs({ room, place, url: 'https://x/rooms/r1', now: new Date('2026-10-28T00:00:00Z') });
    expect(ics).toContain('DTSTART:20261030T170000');
    expect(ics).toContain('DTEND:20261030T230000');
    expect(ics).toContain('SUMMARY:Quán Ngon\\, 138 · Tối thứ 6');
    expect(ics).toContain('LOCATION:138 Nam Kỳ Khởi Nghĩa\\; Q1');
    expect(ics).toContain('DTSTAMP:20261028T000000Z');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    const fallback = buildIcs({ room: { ...room, start_minute: undefined, end_minute: undefined }, place, url: 'u' });
    expect(fallback).toContain('DTSTART:20261030T170000');
  });

  it('khung giờ qua nửa đêm: giờ kết thúc sang ngày sau', () => {
    expect(icsLocalTime('2026-12-31', 1500)).toBe('20270101T010000');
    const ics = buildIcs({ room: { ...room, start_minute: 1320, end_minute: 60 }, place, url: 'u' });
    expect(ics).toContain('DTEND:20261031T010000');
  });

  it('link đường đi: có toạ độ dùng toạ độ, không thì tên + địa chỉ', () => {
    expect(directionsUrl({ name: 'A', address: null, latitude: 10.77, longitude: 106.7 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=10.77%2C106.7',
    );
    expect(directionsUrl({ name: 'A', address: 'B', latitude: null, longitude: null })).toContain(
      'destination=A%2C%20B',
    );
  });

  it('tên tệp lịch không dấu', () => {
    expect(icsFileName('Đông Phương Quán')).toBe('di-dau-dong-phuong-quan.ics');
    expect(icsFileName('!!!')).toBe('di-dau-plan.ics');
  });
});

describe('T-61: RevealStage (render tĩnh)', () => {
  const place: Place = { ...mockPlaces[0], status: 'ACCEPTED' };
  const room = { ...mockRoom, status: 'FINALIZED' as const };
  const noop = () => {};

  afterEach(() => {
    void i18n.changeLanguage('vi');
  });

  it('static: hiện ngay trạng thái cuối — đủ 4 nút thật, không có nút Bỏ qua, đọc tên quán', () => {
    const html = renderToStaticMarkup(<RevealStage place={place} room={room} tier="static" onClose={noop} />);
    expect(html).toContain('data-reveal-state="done"');
    expect(html).not.toContain('data-testid="reveal-skip"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(place.name);
    expect(html).toContain(i18n.t('reveal.announce', { name: place.name }));
    for (const key of ['reveal.done', 'reveal.directions', 'reveal.share', 'reveal.calendar'] as const) {
      expect(html).toContain(i18n.t(key));
    }
    expect(html).toContain('data-motion="decide.reveal"');
  });

  it('full/lite: bắt đầu ở trạng thái đang chạy, có nút Bỏ qua, chưa đọc tên quán', () => {
    const html = renderToStaticMarkup(<RevealStage place={place} room={room} tier="lite" onClose={noop} />);
    expect(html).toContain('data-reveal-state="playing"');
    expect(html).toContain('data-testid="reveal-skip"');
    expect(html).not.toContain(i18n.t('reveal.announce', { name: place.name }));
  });

  it('song ngữ: tiếng Anh không lẫn tiếng Việt ở nút', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<RevealStage place={place} room={room} tier="static" onClose={noop} />);
    expect(html).toContain('Let’s go');
    expect(html).toContain('Add to calendar');
    expect(html).not.toContain('Đi thôi');
  });
});

describe('T-61: nút bật âm', () => {
  it('icon (header trang chủ) có aria-label + aria-pressed; label (tab Nhóm) hiện chữ trạng thái', () => {
    const icon = renderToStaticMarkup(<SoundToggle />);
    expect(icon).toContain('aria-pressed="false"');
    expect(icon).toContain(`aria-label="${i18n.t('sound.turnOn')}"`);
    const label = renderToStaticMarkup(<SoundToggle variant="label" />);
    expect(label).toContain(i18n.t('sound.off'));
  });
});
