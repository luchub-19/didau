// T-127: "one room, four steps". File is under landing/** so i18n_guard scans it: English test names, copy via i18n.t().
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { CAST } from '../../cast';
import { START_VOTES } from '../../logic/roomSim';
import { FourStepsLayout } from '../FourSteps';
import { StepScreen, Typed } from '../steps/Screens';
import {
  CAL_EVENTS,
  EXPORT_KEYS,
  FIND_ROWS,
  IGNORE_IO_MS,
  STEP_COUNT,
  STEP_KEYS,
  STEP_ROOT_MARGIN,
  TYPED_TEXT,
  VOTE_ROWS,
  flowReducer,
  initialFlow,
  lockFarthestMin,
  pillState,
  placeName,
  typedAt,
  type FlowAction,
  type FlowState,
} from '../steps/model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/\x22/g, '&quot;').replace(/\x27/g, '&#x27;');
const run = (actions: FlowAction[], from: FlowState = initialFlow()) => actions.reduce(flowReducer, from);

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-127: step state machine', () => {
  it('starts on step 1 with no direction (first paint is not animated)', () => {
    expect(initialFlow()).toEqual({ current: 0, dir: 0, ignoreUntil: 0 });
    expect(STEP_COUNT).toBe(4);
    expect(STEP_ROOT_MARGIN).toBe('-45% 0px -45% 0px');
  });

  it('an intersection moves the current step and records the scroll direction', () => {
    const down = run([{ type: 'io', index: 1, now: 100 }]);
    expect(down).toMatchObject({ current: 1, dir: 1 });
    const up = run([{ type: 'io', index: 0, now: 200 }], down);
    expect(up).toMatchObject({ current: 0, dir: -1 });
  });

  it('the same step again keeps the same state object (no re-render, no replayed animation)', () => {
    const s = initialFlow();
    expect(flowReducer(s, { type: 'io', index: 0, now: 50 })).toBe(s);
  });

  it('pressing a step button jumps there and ignores intersections for 1 s (no flicker through middle steps)', () => {
    const t0 = 5000;
    let s = run([{ type: 'go', index: 3, now: t0 }]);
    expect(s).toMatchObject({ current: 3, dir: 1, ignoreUntil: t0 + IGNORE_IO_MS });
    // smooth scroll passes steps 2 and 1 on the way: both ignored
    s = flowReducer(s, { type: 'io', index: 2, now: t0 + 300 });
    s = flowReducer(s, { type: 'io', index: 1, now: t0 + 700 });
    expect(s.current).toBe(3);
    // after the lock a real intersection works again
    s = flowReducer(s, { type: 'io', index: 2, now: t0 + IGNORE_IO_MS + 1 });
    expect(s).toMatchObject({ current: 2, dir: -1 });
  });

  it('pressing the button of the current step still re-arms the lock; indexes are clamped', () => {
    const s = run([{ type: 'go', index: 0, now: 10 }]);
    expect(s.current).toBe(0);
    expect(s.ignoreUntil).toBe(10 + IGNORE_IO_MS);
    expect(run([{ type: 'go', index: 99, now: 0 }]).current).toBe(3);
    expect(run([{ type: 'go', index: -4, now: 0 }]).current).toBe(0);
  });

  it('step pills are done before the current step, now on it, todo after', () => {
    expect([0, 1, 2, 3].map((k) => pillState(k, 2))).toEqual(['done', 'done', 'now', 'todo']);
  });

  it('typing: one character per 80 ms, whole word after 400 ms, never longer', () => {
    expect(typedAt(0)).toBe('p');
    expect(typedAt(79)).toBe('p');
    expect(typedAt(80)).toBe('pi');
    expect(typedAt(320)).toBe(TYPED_TEXT);
    expect(typedAt(99999)).toBe(TYPED_TEXT);
    expect(TYPED_TEXT).toBe('pizza');
  });
});

describe('T-127: demo data', () => {
  it('votes match the tie card in the hero: three places, each with START_VOTES friends from the cast', () => {
    const ids = CAST.map((c) => c.id);
    expect(VOTE_ROWS).toHaveLength(3);
    for (const r of VOTE_ROWS) {
      expect(r.voters).toHaveLength(START_VOTES);
      expect(new Set(r.voters).size).toBe(START_VOTES);
      for (const v of r.voters) expect(ids).toContain(v);
    }
  });

  it('the farthest person at the locked place is 60 minutes (DEMO gd8)', () => {
    expect(lockFarthestMin()).toBe(60);
    expect(placeName('pizza')).toBe("Pizza 4P's Thiso Mall Sala");
  });

  it('screen 1 has four proposals from four different friends, the last one a coffee place', () => {
    expect(FIND_ROWS).toHaveLength(4);
    expect(new Set(FIND_ROWS.map((r) => r.who)).size).toBe(4);
    expect(FIND_ROWS[3].drink).toBe(true);
    expect(CAL_EVENTS).toHaveLength(3);
    expect(EXPORT_KEYS).toHaveLength(4);
  });
});

describe('T-127: screens', () => {
  const html = (step: number) => renderToStaticMarkup(<StepScreen step={step} />);

  it('find: typed word, four places, who added each', () => {
    const h = html(0);
    expect(h).toContain('>pizza<');
    expect(h).toContain(esc(i18n.t('landing.flow.cafe')));
    for (const r of FIND_ROWS) expect(h).toContain(esc(i18n.t('landing.flow.added', { name: r.who })));
    expect(h.match(/class="fs-place /g)).toHaveLength(4);
  });

  it('typing modes: hold renders an empty search, run starts empty, full shows the word', () => {
    expect(renderToStaticMarkup(<Typed mode="hold" />)).toContain('></b>');
    expect(renderToStaticMarkup(<Typed mode="run" />)).toContain('></b>');
    expect(renderToStaticMarkup(<Typed mode="full" />)).toContain('>pizza</b>');
  });

  it('vote: three places with 3 voters each, one open Want to go row, 4/4 voted', () => {
    const h = html(1);
    expect(h.match(/class="fs-place /g)).toHaveLength(3);
    expect(h.split(esc(i18n.t('landing.flow.wantN', { n: 3 }))).length - 1).toBe(3);
    expect(h.match(/class="fs-vbtn"/g)).toHaveLength(2);
    expect(h.match(/data-yes="true"/g)).toHaveLength(1);
    expect(h).toContain(esc(i18n.t('landing.flow.agree')));
    expect(h).toContain('4/4');
  });

  it('lock: stamp, place name, host, farthest 60 minutes', () => {
    const h = html(2);
    expect(h).toContain('fs-stamp');
    expect(h).toContain(esc(placeName('pizza')));
    expect(h).toContain(esc(i18n.t('landing.flow.lockedBy', { host: 'Nobita' })));
    expect(h).toContain(esc(i18n.t('landing.hero.minutes', { min: 60 })));
  });

  it('send: three calendar events and the four export formats', () => {
    const h = html(3);
    expect(h.match(/class="fs-ev"/g)).toHaveLength(3);
    for (const k of EXPORT_KEYS) expect(h).toContain(esc(i18n.t(`landing.flow.exports.${k}`)));
    expect(h).toContain('18:00');
  });

  it('screens carry no interactive elements (decorative, hidden from screen readers by the parent)', () => {
    for (let k = 0; k < STEP_COUNT; k++) expect(html(k)).not.toMatch(/<(button|a|input)\b/);
  });
});

describe('T-127: layouts', () => {
  const wide = () => renderToStaticMarkup(<FourStepsLayout wide />);
  const narrow = () => renderToStaticMarkup(<FourStepsLayout wide={false} />);

  it('wide: four text steps, ONE sticky frame, no per-step frames, first step on', () => {
    const h = wide();
    expect(h.match(/<article /g)).toHaveLength(4);
    expect(h.match(/class="fs-device"/g)).toHaveLength(1);
    expect(h).not.toContain('fs-inline');
    expect(h.match(/data-on="true"/g)).toHaveLength(1);
    expect(h).toMatch(/data-step="0" data-on="true"/);
  });

  it('wide: step buttons are a labelled group; only the current one is pressed; the screen is aria-hidden', () => {
    const h = wide();
    expect(h).toContain(`role="group" aria-label="${esc(i18n.t('landing.flow.steps.label'))}"`);
    expect(h.match(/<button[^>]*data-go=/g)).toHaveLength(4);
    expect(h.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(h).toMatch(/class="fs-screen" data-dir="0" aria-hidden="true"/);
    for (const key of STEP_KEYS) expect(h).toContain(esc(i18n.t(`landing.flow.steps.${key}`)));
  });

  it('narrow: no sticky frame, every step gets its own hidden frame and reads as on', () => {
    const h = narrow();
    expect(h).not.toContain('fs-device');
    expect(h.match(/class="fs-inline"/g)).toHaveLength(4);
    expect(h.match(/<div class="fs-inline"[^>]*aria-hidden="true"/g)).toHaveLength(4);
    expect(h.match(/data-on="true"/g)).toHaveLength(4);
    expect(h).not.toMatch(/<button[^>]*data-go=/);
  });

  it('step copy is real i18n text in both languages; headings are h3 under the section h2', async () => {
    expect(wide()).toContain(esc(i18n.t('landing.flow.s2Title')));
    await i18n.changeLanguage('en');
    const h = wide();
    expect(h).toContain(esc(i18n.t('landing.flow.s4Title')));
    expect(h).toContain(esc(i18n.t('landing.flow.steps.send')));
    expect(h.match(/<h3>/g)).toHaveLength(4);
    expect(h).toContain('id="flow-title"');
  });
});

describe('T-127: motion rules in CSS', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../steps/steps.css'), 'utf8');

  it('static tier and reduced motion switch every entrance animation off', () => {
    expect(css).toMatch(/\.landing\[data-tier='static'\] \.fs-screen[\s\S]*?animation: none/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/);
  });

  it('no infinite loops, no sticky/pin tricks beyond the one frame, no gsap', () => {
    expect(css).not.toMatch(/infinite/);
    expect(css.match(/position: sticky/g)).toHaveLength(1);
    const src = fs.readFileSync(path.resolve(__dirname, '../FourSteps.tsx'), 'utf8');
    expect(src).not.toMatch(/gsap|stage\/hero/);
  });
});
