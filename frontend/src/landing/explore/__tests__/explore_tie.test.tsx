// T-128: tie explorable (viewer is the 5th friend). landing/** is scanned by i18n_guard: English test names, copy via i18n.t().
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { LandingPage } from '../../LandingPage';
import { DISTRICT_CODES } from '../../cast';
import { DISTRICT_CENTERS, evaluate, type ExploreMode } from '../../logic/explore';
import { DEMO, ExploreTie, GRID } from '../ExploreTie';
import { ModeSwitch } from '../ModeSwitch';
import { YouMarker } from '../YouMarker';
import {
  ARROW_STEP,
  CHIP_ORDER,
  VIEW_INSET,
  YOU_LIMIT,
  baseBounds,
  boardModel,
  initialTie,
  insideView,
  labelSide,
  modeForKey,
  nudge,
  paperProjector,
  tiePadding,
  tieReducer,
  verdictModel,
  type TieAction,
  type TieState,
  type VerdictLine,
} from '../model';

const noop = () => {};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/\x22/g, '&quot;').replace(/\x27/g, '&#x27;');
const run = (...a: TieAction[]) => a.reduce(tieReducer, initialTie());
const name = (id: string) => DEMO.places.find((p) => p.id === id)!.name;
const html = (s: TieState) => renderToStaticMarkup(<ExploreTie initial={s} />);
/** Visible sentence text with the <strong> markup removed (Trans renders it as real tags). */
const plain = (key: VerdictLine['key'], vars: Record<string, unknown>) =>
  esc(i18n.t(`landing.tie.verdict.${key}`, vars).replace(/<\/?strong>/g, ''));
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

afterEach(async () => {
  await i18n.changeLanguage('vi');
  vi.restoreAllMocks();
});

describe('T-128 tie: district chips drive the proposal (real Valhalla grid, same pairs as T-123)', () => {
  it('Go Vap chip flips the proposal to haidilao; Xeko stays farthest; no diff sentence', () => {
    const s = run({ type: 'chip', area: 'gv' });
    expect(s.you).toEqual(DISTRICT_CENTERS.gv);
    expect(s.area).toBe('gv');
    expect(s.drop).toBe(1);
    const r = evaluate(DEMO, GRID, s.you, s.mode);
    expect(r.pickId).toBe('haidilao');
    const v = verdictModel(r, s.mode);
    expect(v.pick).toEqual({ key: 'farPick', vars: { name: name('haidilao') } });
    expect(v.why.key).toBe('farOther');
    expect(v.why.vars).toMatchObject({ who: 'Xeko', min: 74 });
    expect(v.diff).toBeUndefined();
    const out = stripTags(html(s));
    expect(out).toContain(esc(i18n.t('landing.tie.verdict.farPick', { name: name('haidilao') })));
    expect(out).toContain(plain('farOther', { who: 'Xeko', min: 74, yours: v.why.vars.yours }));
    expect(out).not.toContain(esc(i18n.t('landing.tie.verdict.diff', { name: name('pizza'), who: 'Xuka', min: 60 })));
  });

  it('Binh Tan chip: pizza stays, the viewer becomes the farthest (farYou) and the diff names haidilao', () => {
    const s = run({ type: 'chip', area: 'btn' });
    const r = evaluate(DEMO, GRID, s.you, s.mode);
    expect(r.pickId).toBe('pizza');
    const v = verdictModel(r, s.mode);
    expect(v.why.key).toBe('farYou');
    expect(v.diff?.vars.name).toBe(name('haidilao'));
    const out = stripTags(html(s));
    expect(out).toContain(plain('farYou', { min: v.why.vars.min }));
    expect(out).toContain(
      plain('diff', {
        name: name('haidilao'),
        who: v.diff!.vars.who === 'you' ? i18n.t('landing.tie.youInline') : v.diff!.vars.who,
        min: v.diff!.vars.min,
      }),
    );
  });

  it('Nha Be chip: far mode keeps pizza with the viewer farthest; sum mode switches to dookki', () => {
    const s = run({ type: 'chip', area: 'nb' });
    const far = evaluate(DEMO, GRID, s.you, 'far');
    expect(far.pickId).toBe('pizza');
    expect(verdictModel(far, 'far').why.key).toBe('farYou');
    const sum = tieReducer(s, { type: 'mode', mode: 'sum' });
    expect(sum.mode).toBe('sum');
    expect(sum.you).toEqual(s.you);
    const r = evaluate(DEMO, GRID, sum.you, sum.mode);
    expect(r.pickId).toBe('dookki');
    expect(stripTags(html(sum))).toContain(esc(i18n.t('landing.tie.verdict.sumPick', { name: name('dookki') })));
  });

  it('chips are 12 buttons in the mixed near/far order of mock v3, the picked one is pressed', () => {
    expect(CHIP_ORDER).toEqual(['q1', 'q7', 'gv', 'btn', 'td', 'nb', 'bt', 'q12', 'pn', 'tb', 'q3', 'q5']);
    expect([...CHIP_ORDER].sort()).toEqual([...DISTRICT_CODES].sort());
    const out = html(run({ type: 'chip', area: 'gv' }));
    expect(out.match(/data-area="/g)).toHaveLength(12);
    expect(out).toContain('data-area="gv" aria-pressed="true"');
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(2); // the chip + the active mode button
  });
});

describe('T-128 tie: before the viewer joins and mode switch', () => {
  it('empty room in far mode: waiting sentence names pizza and Xuka 60, no source note', () => {
    const s = initialTie();
    const r = evaluate(DEMO, GRID, s.you, s.mode);
    const v = verdictModel(r, s.mode);
    expect(v.pick).toEqual({ key: 'waitPick', vars: { name: name('pizza') } });
    expect(v.why).toEqual({ key: 'waitWhy', vars: { who: 'Xuka', min: 60 } });
    expect(v.diff).toBeUndefined();
    const out = stripTags(html(s));
    expect(out).toContain(plain('waitWhy', { who: 'Xuka', min: 60 }));
    expect(out).not.toContain(esc(i18n.t('landing.tie.noteGrid')));
    expect(out).not.toContain(esc(i18n.t('landing.tie.noteEstimate')));
  });

  it('empty room in sum mode: haidilao, Xeko 74, and the diff back to pizza', () => {
    const s = tieReducer(initialTie(), { type: 'mode', mode: 'sum' });
    const v = verdictModel(evaluate(DEMO, GRID, null, 'sum'), 'sum');
    expect(v.pick.vars.name).toBe(name('haidilao'));
    expect(v.why).toEqual({ key: 'sumWhy', vars: { km: 63.5, who: 'Xeko', min: 74 } });
    expect(v.diff?.vars).toEqual({ name: name('pizza'), who: 'Xuka', min: 60 });
    // In sum mode the extra line tells what the OTHER mode would do (not "if it only added up total km", which it already does)
    expect(v.diff?.key).toBe('diffFar');
    const out = stripTags(html(s));
    expect(out).toContain(plain('sumWhy', { km: '63,5', who: 'Xeko', min: 74 }));
    expect(out).toContain(plain('diffFar', { name: name('pizza'), who: 'Xuka', min: 60 }));
    expect(out).not.toContain(plain('diff', { name: name('pizza'), who: 'Xuka', min: 60 }));
  });

  it('mode switch: same mode is a no-op, arrow keys map left=sum right=far, buttons expose aria-pressed', () => {
    const s = initialTie();
    expect(tieReducer(s, { type: 'mode', mode: 'far' })).toBe(s);
    expect(modeForKey('ArrowLeft')).toBe('sum');
    expect(modeForKey('ArrowRight')).toBe('far');
    expect(modeForKey('Enter')).toBeNull();
    for (const mode of ['sum', 'far'] as ExploreMode[]) {
      const out = renderToStaticMarkup(<ModeSwitch mode={mode} onChange={noop} />);
      expect(out).toContain(`role="group" aria-label="${esc(i18n.t('landing.tie.modeLabel'))}"`);
      expect(out).toContain(`data-mode="${mode}" aria-pressed="true"`);
    }
  });

  it('diff sentence shows exactly when the two modes propose different places', () => {
    const cases: (TieState['you'] | null)[] = [null, ...CHIP_ORDER.map((c) => DISTRICT_CENTERS[c])];
    let seenDiff = 0;
    let seenSame = 0;
    for (const you of cases) {
      for (const mode of ['far', 'sum'] as ExploreMode[]) {
        const r = evaluate(DEMO, GRID, you, mode);
        const v = verdictModel(r, mode);
        const waiting = mode === 'far' && !you;
        expect(Boolean(v.diff)).toBe(!waiting && r.pickId !== r.otherPickId);
        if (v.diff) seenDiff += 1;
        else seenSame += 1;
        const out = stripTags(html({ ...initialTie(), you, mode }));
        const diffText = v.diff
          ? plain(v.diff.key, {
              name: v.diff.vars.name,
              who: v.diff.vars.who === 'you' ? i18n.t('landing.tie.youInline') : v.diff.vars.who,
              min: v.diff.vars.min,
            })
          : null;
        if (diffText) expect(out).toContain(diffText);
      }
    }
    expect(seenDiff).toBeGreaterThan(0);
    expect(seenSame).toBeGreaterThan(0);
  });

  it('English: same structure, km uses a decimal point', async () => {
    await i18n.changeLanguage('en');
    const out = stripTags(html(tieReducer(initialTie(), { type: 'mode', mode: 'sum' })));
    expect(out).toContain(plain('sumWhy', { km: '63.5', who: 'Xeko', min: 74 }));
    expect(out).toContain(esc(i18n.t('landing.tie.total', { km: '68.2' })));
  });
});

describe('T-128 tie: keyboard moves the pin (WCAG 2.5.7 alternative to dragging)', () => {
  it('each arrow key moves 0.005 degrees, other keys do nothing', () => {
    const ll = DISTRICT_CENTERS.q1;
    const near = (a: readonly number[], b: readonly number[]) => {
      expect(a[0]).toBeCloseTo(b[0], 9);
      expect(a[1]).toBeCloseTo(b[1], 9);
    };
    expect(ARROW_STEP).toBe(0.005);
    near(nudge(ll, 'ArrowUp'), [ll[0], ll[1] + 0.005]);
    near(nudge(ll, 'ArrowDown'), [ll[0], ll[1] - 0.005]);
    near(nudge(ll, 'ArrowLeft'), [ll[0] - 0.005, ll[1]]);
    near(nudge(ll, 'ArrowRight'), [ll[0] + 0.005, ll[1]]);
    expect(nudge(ll, 'a')).toBe(ll);
  });

  it('nudge in the reducer: clears the chip, keeps the drop key, is a no-op before placing', () => {
    expect(tieReducer(initialTie(), { type: 'nudge', key: 'ArrowUp' })).toEqual(initialTie());
    const s = run(
      { type: 'chip', area: 'pn' },
      { type: 'nudge', key: 'ArrowRight' },
      { type: 'nudge', key: 'ArrowRight' },
    );
    expect(s.area).toBeNull();
    expect(s.drop).toBe(1);
    expect(s.you![0]).toBeCloseTo(DISTRICT_CENTERS.pn[0] + 0.01, 6);
  });

  it('the pin cannot leave greater Ho Chi Minh City', () => {
    let s = run({ type: 'place', ll: [YOU_LIMIT[2] - 0.001, YOU_LIMIT[3] - 0.001] });
    for (let i = 0; i < 5; i += 1) s = tieReducer(s, { type: 'nudge', key: 'ArrowUp' });
    expect(s.you![1]).toBe(YOU_LIMIT[3]);
    expect(run({ type: 'place', ll: [0, 0] }).you).toEqual([YOU_LIMIT[0], YOU_LIMIT[1]]);
  });

  it('place = new drop (520 ms fall), drag does not re-trigger the fall', () => {
    const s = run({ type: 'place', ll: [106.7, 10.8] }, { type: 'drag', ll: [106.71, 10.8] });
    expect(s.drop).toBe(1);
    expect(s.you).toEqual([106.71, 10.8]);
  });

  it('the pin is a focusable button with an arrow-key label; drop animation only when not still', () => {
    const out = renderToStaticMarkup(
      <YouMarker pt={[100, 200]} drop={2} still={false} onDrag={noop} onDragEnd={noop} onNudge={noop} />,
    );
    expect(out).toContain('<button type="button" class="tie-you"');
    expect(out).toContain(`aria-label="${esc(i18n.t('landing.tie.pinLabel'))}"`);
    expect(out).toContain('data-drop="true"');
    const still = renderToStaticMarkup(
      <YouMarker pt={[100, 200]} drop={2} still onDrag={noop} onDragEnd={noop} onNudge={noop} />,
    );
    expect(still).not.toContain('data-drop');
  });
});

describe('T-128 tie: board, source note, projection, privacy', () => {
  it('board: shared scale >= 110, selected row follows the pick, the viewer shows as farthest', () => {
    const r = evaluate(DEMO, GRID, DISTRICT_CENTERS.btn, 'far');
    const b = boardModel(DEMO, r);
    expect(b.scale).toBeGreaterThanOrEqual(110);
    expect(b.scale).toBeGreaterThanOrEqual(Math.max(...b.rows.map((x) => x.far)) + 10);
    expect(b.rows[b.selIndex].placeId).toBe('pizza');
    expect(b.rows.filter((x) => x.selected)).toHaveLength(1);
    expect(b.rows[0].farWho).toBe('you');
    expect(b.rows[0].pct).toBeCloseTo((b.rows[0].far / b.scale) * 100, 1);
    const out = html({ ...initialTie(), you: DISTRICT_CENTERS.btn });
    expect(out).toContain('data-id="pizza" data-sel="true"');
    expect(out).toContain('--sel:0');
    expect(out).toContain('data-you="true"');
  });

  it('source note: grid inside the precomputed grid, estimate outside it', () => {
    expect(html({ ...initialTie(), you: DISTRICT_CENTERS.q3 })).toContain(esc(i18n.t('landing.tie.noteGrid')));
    const far: TieState = { ...initialTie(), you: [106.45, 10.5] };
    expect(evaluate(DEMO, GRID, far.you, 'far').estimated).toBe(true);
    expect(html(far)).toContain(esc(i18n.t('landing.tie.noteEstimate')));
  });

  it('paper projection round-trips and the base view holds the 4 districts + 3 places inside the padding', () => {
    const w = 700;
    const h = 560;
    const pad = tiePadding(w);
    const p = paperProjector(baseBounds(DEMO), w, h, pad);
    for (const ll of [...DEMO.members.map((m) => m.ll), ...DEMO.places.map((x) => x.ll)]) {
      const pt = p.project(ll);
      expect(insideView(pt, w, h, pad, 0)).toBe(true);
      const back = p.unproject(pt);
      expect(back[0]).toBeCloseTo(ll[0], 6);
      expect(back[1]).toBeCloseTo(ll[1], 6);
    }
    expect(insideView(p.project(DISTRICT_CENTERS.nb), w, h, pad)).toBe(false); // far chip triggers a refit
  });

  it('privacy line, map label and live region are present; friends carry district labels only', () => {
    const out = html(initialTie());
    expect(out).toContain(esc(i18n.t('landing.tie.privacy')));
    expect(out).toContain(`aria-label="${esc(i18n.t('landing.tie.mapLabel'))}"`);
    expect(out).toContain('aria-live="polite"');
    for (const m of DEMO.members) expect(out).toContain(`${m.id} · ${esc(i18n.t(`landing.district.${m.district}`))}`);
  });

  it('no network request besides map tiles: rendering and evaluating never call fetch', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    html(initialTie());
    for (const c of CHIP_ORDER) html(run({ type: 'chip', area: c }));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    const dir = path.resolve(__dirname, '..');
    for (const f of fs.readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(src, f).not.toMatch(
        /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|from '\.\.\/\.\.\/api/,
      );
    }
  });

  it('landing page mounts the explorable in #tie (no placeholder section left)', () => {
    const out = renderToStaticMarkup(<LandingPage onCreate={noop} onJoin={noop} resumeCode={null} onResume={noop} />);
    expect(out).toContain('id="tie"');
    expect(out).toContain('class="tie-explore"');
    expect(out).toContain(esc(i18n.t('landing.tie.askQ')));
  });

  it('reduced motion: no drop / swap animation and no sliding transitions', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../explore.css'), 'utf8');
    expect(css).toMatch(
      /\.landing\[data-tier='static'\] \.tie-you-in\[data-drop\],\s*\.landing\[data-tier='static'\] \.tie-pick\[data-swap\] \{\s*animation: none;/,
    );
    for (const sel of ['.tie-fill', '.tie-who', '.tie-sel-frame', '.tie-seg-knob']) {
      expect(css).toContain(`.landing[data-tier='static'] ${sel}`);
    }
  });
});

describe('T-128 tie: map overlay layout', () => {
  it('place labels point away from the nearest friend (pizza/haidilao right, dookki left of Xeko)', () => {
    const friends = DEMO.members.map((m) => m.ll);
    const side = (id: string) => labelSide(DEMO.places.find((p) => p.id === id)!.ll, friends);
    expect(side('pizza')).toBe('right');
    expect(side('haidilao')).toBe('right');
    expect(side('dookki')).toBe('left');
  });

  it('a pin hugging the padding edge counts as outside, so the view refits and the avatar is never cut', () => {
    const pad = tiePadding(700);
    expect(insideView([pad.left + 9, 300], 700, 560, pad)).toBe(false);
    expect(insideView([pad.left + VIEW_INSET, 300], 700, 560, pad)).toBe(true);
  });
});
