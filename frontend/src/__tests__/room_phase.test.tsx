import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { roomPhase, phaseStep, resolveViewStep, nextReview } from '../room/phase';
import { PhaseStepper } from '../components/shell';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';
import '../i18n';

const room = (status = 'PLANNING') => ({ status }) as never;
const pl = (...s: string[]) => s.map((status) => ({ status })) as never[];
const sch = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) })) as never[];
const hint = (type: string) => [{ type }] as never[];

describe('T-66: roomPhase', () => {
  it('gather: 0 quán; 1 quán; 1 quán + 1 REJECTED', () => {
    expect(roomPhase({ room: room(), places: [], schedule: [], hints: [] })).toBe('gather');
    expect(roomPhase({ room: room(), places: pl('PROPOSED'), schedule: [], hints: [] })).toBe('gather');
    expect(roomPhase({ room: room(), places: pl('PROPOSED', 'REJECTED'), schedule: [], hints: [] })).toBe('gather');
  });
  it('vote / tie', () => {
    const places = pl('PROPOSED', 'VOTING');
    expect(roomPhase({ room: room(), places, schedule: [], hints: [] })).toBe('vote');
    expect(roomPhase({ room: room(), places, schedule: [], hints: hint('STALLED') })).toBe('vote');
    expect(roomPhase({ room: room(), places, schedule: [], hints: hint('FOO') })).toBe('vote');
    expect(roomPhase({ room: room(), places, schedule: [], hints: hint('TIE_AT_TOP') })).toBe('tie');
    expect(roomPhase({ room: room(), places, schedule: [], hints: hint('NEAR_TIE') })).toBe('tie');
  });
  it('lock: có ACCEPTED, thắng tie', () => {
    expect(roomPhase({ room: room(), places: pl('ACCEPTED', 'VOTING'), schedule: [], hints: hint('TIE_AT_TOP') })).toBe('lock');
  });
  it('send: ACCEPTED nhưng có lịch; FINALIZED không lịch', () => {
    expect(roomPhase({ room: room(), places: pl('ACCEPTED'), schedule: sch(1), hints: [] })).toBe('send');
    expect(roomPhase({ room: room('FINALIZED'), places: [], schedule: [], hints: [] })).toBe('send');
  });
  it('phaseStep: tie = 2', () => {
    expect(['gather', 'vote', 'tie', 'lock', 'send'].map((p) => phaseStep(p as never))).toEqual([1, 2, 2, 3, 4]);
  });
});

describe('T-66: viewStep (xem lại)', () => {
  it('chỉ nhận bước đã qua; tương lai/hiện tại = thoát', () => {
    expect(nextReview('lock', 1)).toEqual({ phase: 'lock', step: 1 });
    expect(nextReview('lock', 3)).toBeNull();
    expect(nextReview('lock', 4)).toBeNull();
    expect(nextReview('lock', null)).toBeNull();
  });
  it('tự xoá khi phase đổi', () => {
    const r = nextReview('lock', 2);
    expect(resolveViewStep(r, 'lock')).toBe(2);
    expect(resolveViewStep(r, 'send')).toBe(4);
    expect(resolveViewStep(r, 'vote')).toBe(2); // phase khác → về bước thật của phase đó
    expect(resolveViewStep(null, 'tie')).toBe(2);
  });
});

describe('T-66: PhaseStepper', () => {
  it('đánh dấu bước qua, hiện tại và bước tới', () => {
    const html = renderToStaticMarkup(<PhaseStepper step={3} viewStep={3} onViewStep={() => {}} />);
    expect(html).toContain('Tìm quán');
    expect(html).toContain('Gửi lịch');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-disabled="true"');
  });
  it('compact hiện "Bước x/4 · tên"', () => {
    const html = renderToStaticMarkup(<PhaseStepper variant="compact" step={2} viewStep={2} onViewStep={() => {}} />);
    expect(html).toContain('Bước 2/4 · Bình chọn');
  });
  it('i18n parity phase.*', () => {
    const keys = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v as never, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en.phase).sort()).toEqual(keys(vi.phase).sort());
  });
});
