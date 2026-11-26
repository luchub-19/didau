// T-123: phòng mẫu ở hero. Tên test viết tiếng Anh (i18n_guard quét landing/**).
import { describe, expect, it } from 'vitest';
import demoJson from '../../data/demoCase.json';
import { START_VOTES, initialRoom, reduce, view, type RoomAction, type RoomState } from '../roomSim';
import type { DemoCaseData } from '../types';

const demo = demoJson as unknown as DemoCaseData;
const run = (s: RoomState, ...a: RoomAction[]) => a.reduce(reduce, s);

describe('T-123 roomSim', () => {
  it('starts as a 3-way tie that proposes pizza and saves 14 minutes over the runner-up', () => {
    const v = view(initialRoom(demo));
    expect(v.kind).toBe('tie');
    expect(v.max).toBe(START_VOTES);
    expect(v.tops).toEqual(['pizza', 'haidilao', 'dookki']);
    expect(v.best).toBe('pizza');
    expect(v.runner).toBe('haidilao');
    expect(v.savesMin).toBe(14);
  });

  it('a vote makes a single leader; removing it restores the tie', () => {
    const s0 = initialRoom(demo);
    const s1 = run(s0, { type: 'vote', placeId: 'dookki' });
    expect(s1.votes.dookki).toBe(START_VOTES + 1);
    expect(view(s1)).toMatchObject({ kind: 'lead', best: 'dookki', tops: ['dookki'], runner: 'dookki', savesMin: 0 });
    expect(view(run(s1, { type: 'unvote', placeId: 'dookki' })).kind).toBe('tie');
  });

  it('two places tied at the top: suggestion is the one whose farthest person travels least', () => {
    const s = run(initialRoom(demo), { type: 'vote', placeId: 'haidilao' }, { type: 'vote', placeId: 'dookki' });
    // haidilao 4, dookki 4, pizza 3
    const v = view(s);
    expect(v.kind).toBe('tie');
    expect(v.tops).toEqual(['haidilao', 'dookki']);
    expect(v.best).toBe('haidilao');
    expect(v.runner).toBe('dookki');
    expect(v.savesMin).toBe(20);
  });

  it('vote and unvote are idempotent per place', () => {
    const s1 = run(initialRoom(demo), { type: 'vote', placeId: 'pizza' });
    expect(reduce(s1, { type: 'vote', placeId: 'pizza' })).toBe(s1);
    expect(reduce(initialRoom(demo), { type: 'unvote', placeId: 'pizza' }).votes.pizza).toBe(START_VOTES);
  });

  it('lock freezes votes, closes the why panel and reports kind locked', () => {
    const s = run(initialRoom(demo), { type: 'toggleWhy' }, { type: 'lock', placeId: 'pizza' });
    expect(s.locked).toBe('pizza');
    expect(s.why).toBe(false);
    expect(view(s)).toMatchObject({ kind: 'locked', best: 'pizza' });
    expect(reduce(s, { type: 'vote', placeId: 'dookki' })).toBe(s);
  });

  it('undo clears the lock and the viewer votes, back to the initial tie', () => {
    const s = run(
      initialRoom(demo),
      { type: 'vote', placeId: 'dookki' },
      { type: 'lock', placeId: 'dookki' },
      { type: 'undo' },
    );
    expect(s.locked).toBeNull();
    expect(s.mine).toEqual({});
    expect(view(s).kind).toBe('tie');
    expect(s.votes).toEqual(initialRoom(demo).votes);
  });

  it('toggleWhy flips the panel', () => {
    const s = initialRoom(demo);
    expect(run(s, { type: 'toggleWhy' }).why).toBe(true);
    expect(run(s, { type: 'toggleWhy' }, { type: 'toggleWhy' }).why).toBe(false);
  });

  it('ignores unknown place ids', () => {
    const s = initialRoom(demo);
    expect(reduce(s, { type: 'vote', placeId: 'nope' })).toBe(s);
    expect(reduce(s, { type: 'lock', placeId: 'nope' })).toBe(s);
  });
});
