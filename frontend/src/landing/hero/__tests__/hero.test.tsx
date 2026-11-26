// T-125: landing hero. landing/** is scanned by i18n_guard: English test names and comments, copy compared via i18n.t().
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { LandingPage } from '../../LandingPage';
import { Hero } from '../Hero';
import { RoomPanel, type RoomPanelProps } from '../RoomPanel';
import {
  DEMO,
  JOINER,
  PRESENT_AT_START,
  heroReducer,
  initialHero,
  panelModel,
  presentCast,
  type HeroAction,
  type HeroState,
} from '../heroState';
import { ARRIVAL, arrivalEndMs, riderSlots, runArrival, type Animatable, RIDER_W } from '../riders';
import { SIGNS, SIGN_LIMIT, STREET_W, buildStreet } from '../street';

const noop = () => {};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/\x22/g, '&quot;').replace(/\x27/g, '&#x27;');
const run = (s: HeroState, ...a: HeroAction[]) => a.reduce(heroReducer, s);

const panel = (state: HeroState, extra: Partial<RoomPanelProps> = {}) =>
  renderToStaticMarkup(
    <RoomPanel
      state={state}
      onToggleVote={noop}
      onLock={noop}
      onUndo={noop}
      onToggleWhy={noop}
      hot={null}
      onHover={noop}
      pop={null}
      {...extra}
    />,
  );

const name = (id: string) => DEMO.places.find((p) => p.id === id)!.name;
const short = (id: string) => DEMO.places.find((p) => p.id === id)!.short;

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-125: sample room, integrated reducer + panel', () => {
  it('starts tied 3/3/3: tie card proposes pizza, saves 14 minutes, Lock + Why are there, hearts enabled', () => {
    const s = initialHero();
    const html = panel(s);
    expect(html).toContain(esc(i18n.t('landing.room.tieTitle', { n: 3, votes: 3 })));
    expect(html).toContain(esc(i18n.t('landing.room.suggest', { name: name('pizza') })));
    expect(html).toContain(esc(i18n.t('landing.room.saves', { min: 14 })));
    expect(html).toContain(`data-lock="pizza"`);
    expect(html).toContain('aria-controls="hero-why"');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/data-vote="/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
    expect(html).not.toMatch(/<button[^>]*data-vote[^>]*disabled/);
    // the Suggested tag sits on the proposed place only
    expect(html.match(new RegExp(esc(i18n.t('landing.room.proposed')), 'g'))).toHaveLength(1);
  });

  it('a heart breaks the tie into a leading card; removing it ties again', () => {
    const s1 = run(initialHero(), { type: 'vote', placeId: 'haidilao' });
    const lead = panel(s1);
    expect(lead).toContain(esc(i18n.t('landing.room.leadTitle', { name: name('haidilao') })));
    expect(lead).toContain(esc(i18n.t('landing.room.leadSub', { votes: 4 })));
    expect(lead).toContain(`data-lock="haidilao"`);
    expect(lead).toMatch(/data-vote="haidilao" aria-pressed="true" aria-label="[^"]+"/);
    expect(lead).toContain(esc(i18n.t('landing.room.voteRemove', { name: name('haidilao') })));
    expect(lead).not.toContain(esc(i18n.t('landing.room.proposed')));

    const s2 = run(s1, { type: 'unvote', placeId: 'haidilao' });
    expect(panelModel(s2).view.kind).toBe('tie');
    expect(panel(s2)).toContain(esc(i18n.t('landing.room.tieTitle', { n: 3, votes: 3 })));
  });

  it('lock: locked card with stamp + Start over, every heart disabled, other places faded', () => {
    const s = run(initialHero(), { type: 'toggleWhy' }, { type: 'lock', placeId: 'pizza' });
    expect(s.room.why).toBe(false);
    const html = panel(s);
    expect(html).toContain('hero-stamp');
    expect(html).toContain(esc(i18n.t('landing.room.locked')));
    expect(html).toContain(esc(i18n.t('landing.room.lockedSub', { host: 'Nobita' })));
    expect(html).toContain('data-undo="true"');
    expect(html.match(/<button[^>]*data-vote="[^"]+"[^>]*disabled=""/g)).toHaveLength(3);
    expect(html.match(/data-tone="faded"/g)).toHaveLength(2);
    expect(html).toContain('data-id="pizza" data-tone="hot"');
    // hearts after lock change nothing
    expect(run(s, { type: 'vote', placeId: 'dookki' })).toBe(s);
  });

  it('start over returns to the opening tie and clears the viewer hearts', () => {
    const s = run(
      initialHero(),
      { type: 'vote', placeId: 'dookki' },
      { type: 'lock', placeId: 'dookki' },
      { type: 'undo' },
    );
    expect(s.room.locked).toBeNull();
    expect(s.room.mine).toEqual({});
    expect(s.room.votes).toEqual({ pizza: 3, haidilao: 3, dookki: 3 });
    const html = panel(s);
    expect(html).toContain(`data-lock="pizza"`);
    expect(html).not.toContain('disabled=""');
  });

  it('Why? opens in place with one bar per tied place, best bar marked', () => {
    const s = run(initialHero(), { type: 'toggleWhy' });
    const html = panel(s);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('id="hero-why" class="hero-why" data-open="true"');
    expect(html.match(/class="hero-mini"/g)).toHaveLength(3);
    expect(html.match(/data-best="true"/g)).toHaveLength(1);
    expect(html).toContain(esc(i18n.t('landing.hero.minutes', { min: 60 })));
    expect(html).toContain(short('dookki'));
  });
});

describe('T-125: presence (the fourth friend joins once)', () => {
  it('3 present at start; join adds Xeko once with a toast; repeated join is a no-op', () => {
    const s0 = initialHero();
    expect(presentCast(s0)).toEqual(['Nobita', 'Doraemon', 'Xuka']);
    expect(PRESENT_AT_START).toBe(3);
    const s1 = heroReducer(s0, { type: 'join' });
    expect(s1.joined).toBe(true);
    expect(s1.toast).toBe(true);
    expect(presentCast(s1)).toEqual(['Nobita', 'Doraemon', 'Xuka', JOINER]);
    expect(JOINER).toBe('Xeko');
    const s2 = heroReducer(s1, { type: 'toastDone' });
    expect(s2.toast).toBe(false);
    const s3 = heroReducer(s2, { type: 'join' });
    expect(s3).toBe(s2);
    expect(presentCast(s3).filter((id) => id === 'Xeko')).toHaveLength(1);
  });

  it('room actions keep presence; presence actions keep the room', () => {
    const s = run(initialHero(), { type: 'join' }, { type: 'vote', placeId: 'pizza' }, { type: 'toastDone' });
    expect(s.joined).toBe(true);
    expect(s.room.votes.pizza).toBe(4);
  });
});

describe('T-125: four friends converge (riders)', () => {
  const fakeEls = () => {
    const calls: [Keyframe[], KeyframeAnimationOptions][] = [];
    const els: Animatable[] = [0, 1, 2, 3].map(() => ({
      animate: vi.fn((k: Keyframe[], o: KeyframeAnimationOptions) => {
        calls.push([k, o]);
        return {};
      }),
    }));
    return { els, calls };
  };

  it('static tier never calls animate (riders stand at their stops)', () => {
    const { els } = fakeEls();
    expect(runArrival(els, [100, 200, 300, 400], 1440, 'static')).toBe(0);
    for (const el of els) expect(el.animate).not.toHaveBeenCalled();
  });

  it('full tier: one animation per rider, 1500-1860 ms, stagger 90 ms, alternate sides, fill backwards', () => {
    const { els, calls } = fakeEls();
    const slots = [500, 620, 740, 860];
    expect(runArrival(els, slots, 1440, 'full')).toBe(4);
    expect(calls.map(([, o]) => o.duration)).toEqual([1500, 1620, 1740, 1860]);
    expect(calls.map(([, o]) => o.delay)).toEqual([300, 390, 480, 570]);
    for (const [k, o] of calls) {
      expect(o.easing).toBe(ARRIVAL.easing);
      expect(o.fill).toBe('backwards');
      expect(k[1].transform).toBe('translateX(0)');
    }
    // even riders come from beyond the left edge, odd ones from beyond the right
    expect(calls[0][0][0].transform).toBe(`translateX(${-(500 + ARRIVAL.offscreenPx)}px)`);
    expect(calls[1][0][0].transform).toBe(`translateX(${1440 - 620 + ARRIVAL.offscreenPx}px)`);
    expect(arrivalEndMs()).toBe(2430);
    expect(ARRIVAL.tagsAtMs).toBeLessThanOrEqual(arrivalEndMs());
  });

  it('stops under the app window on wide screens, centered on narrow ones', () => {
    const wide = riderSlots({ width: 1440, anchorCenterX: 1000, viewportWidth: 1440 });
    expect(wide).toEqual([1000 - 180 - RIDER_W / 2, 1000 - 60 - RIDER_W / 2, 1000 + 60 - RIDER_W / 2, 1000 + 180 - RIDER_W / 2]);
    const narrow = riderSlots({ width: 390, anchorCenterX: 300, viewportWidth: 390 });
    const centers = narrow.map((l) => l + RIDER_W / 2);
    expect((centers[1] + centers[2]) / 2).toBeCloseTo(195, 0);
    // all 4 riders still fit a 360px screen
    const tiny = riderSlots({ width: 360, anchorCenterX: null, viewportWidth: 360 });
    expect(tiny[0]).toBeGreaterThanOrEqual(-RIDER_W / 2);
    expect(tiny[3] + RIDER_W).toBeLessThanOrEqual(360 + RIDER_W / 2);
  });
});

describe('T-125: night street', () => {
  it('is deterministic from the fixed seed', () => {
    expect(buildStreet()).toEqual(buildStreet());
    expect(buildStreet(7)).not.toEqual(buildStreet(8));
  });

  it(`${SIGN_LIMIT} Vietnamese signs, each text once, spread across the street`, () => {
    const s = buildStreet();
    expect(s.signs).toHaveLength(SIGN_LIMIT);
    expect(new Set(s.signs.map((x) => x.text)).size).toBe(SIGN_LIMIT);
    expect(s.signs.map((x) => x.text)).toEqual(SIGNS.map(([t]) => t));
    expect(Math.min(...s.signs.map((x) => x.x))).toBeLessThan(STREET_W / 4);
    expect(Math.max(...s.signs.map((x) => x.x))).toBeGreaterThan((STREET_W * 3) / 4);
    for (const w of s.windows) expect(w.delay).toBeLessThanOrEqual(900);
    for (const g of s.signs) expect(g.delay).toBeLessThanOrEqual(900);
    expect(s.houses[s.houses.length - 1].x + s.houses[s.houses.length - 1].w).toBeGreaterThanOrEqual(STREET_W - 2);
  });
});

describe('T-125: hero markup', () => {
  it('hero section: h1, CTA slot, try hint, sample room group, decorative street with 4 riders', () => {
    const html = renderToStaticMarkup(
      <Hero tier="full" cta={() => <div data-cta="create" />} resumeCode={null} onResume={noop} />,
    );
    expect(html).toContain('<section id="hero" aria-labelledby="hero-title"');
    expect(html).toContain(esc(i18n.t('landing.hero.titleA')));
    expect(html).toContain(esc(i18n.t('landing.hero.try')));
    expect(html).toContain(`role="group" aria-label="${esc(i18n.t('landing.hero.roomLabel'))}"`);
    expect(html).toContain(`aria-label="${esc(i18n.t('landing.room.online', { n: 3 }))}"`);
    expect(html).toMatch(/<div class="hero-street" data-lit="false" aria-hidden="true">/);
    expect(html.match(/class="hero-rider"/g)).toHaveLength(4);
    for (const id of ['Nobita', 'Doraemon', 'Xuka', 'Xeko']) expect(html).toContain(`<span class="hero-rider-tag">${id}</span>`);
    for (const [text] of SIGNS) expect(html).toContain(text);
    // the mini map is decorative for screen readers; the panel is the interactive part
    expect(html).toContain('class="hero-map" aria-hidden="true"');
    // never shows the real demo room code (T-124: only a saved code is shown)
    expect(html).not.toContain('NN64S8');
  });

  it('static tier: street already lit, name tags shown', () => {
    const html = renderToStaticMarkup(
      <Hero tier="static" cta={() => null} resumeCode={null} onResume={noop} />,
    );
    expect(html).toContain('data-lit="true"');
    expect(html).toContain('data-arrived="true"');
  });

  it('EN copy inside the sample room', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<LandingPage onCreate={noop} onJoin={noop} resumeCode={null} onResume={noop} />);
    expect(html).toContain('Sample room');
    expect(html).toContain(esc(i18n.t('landing.room.tieTitle', { n: 3, votes: 3 })));
    expect(html).toContain('farthest person saves 14');
    expect(html).toContain('Lock in ' + esc(short('pizza')));
  });

  it('the app window forces the light palette even when the app theme is dark', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../hero.css'), 'utf8');
    const block = css.slice(css.indexOf('.hero-app {'), css.indexOf('}', css.indexOf('.hero-app {')));
    expect(block).toContain('color-scheme: light');
    expect(block).toContain('--color-bg: 250 250 249;');
    expect(block).toContain('--color-ink: 28 25 23;');
    expect(block).toContain('--color-accent-text: 199 62 38;');
    // heart and lock buttons have 44px touch targets
    expect(css).toMatch(/\.hero-heart \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    expect(css).toMatch(/\.hero-chot \{[^}]*min-height: 44px;/);
  });
});
