// T-124: khung landing. File nằm ngoài src/__tests__ nên i18n_guard quét nó: tên test viết tiếng Anh,
// chữ hiển thị so qua i18n.t() thay vì viết chuỗi có dấu.
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { HomePage } from '../../../pages/HomePage';
import { tokenStorage } from '../../../services/storage/tokenStorage';
import { LandingPage, LANDING_SECTION_IDS } from '../../LandingPage';
import { LandingHeader } from '../LandingHeader';
import { HOME_MODAL_INITIAL, homeModalReducer, showTopCreate } from '../ctaState';
import { initialOnceState } from '../useOnceInView';
import { CAST, DISTRICT_CODES, HOST, YOU_SEED, avatarFor, castMember } from '../../cast';

const noop = () => {};
// Thoát HTML như renderToStaticMarkup (viết \x22/\x27 để bộ bỏ comment của i18n_guard không coi là chuỗi)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/\x22/g, '&quot;').replace(/\x27/g, '&#x27;');

afterEach(async () => {
  tokenStorage.clearAll();
  await i18n.changeLanguage('vi');
});

describe('T-124: CTA paths (create / join / resume)', () => {
  it('create opens CreateRoomModal, join opens JoinRoomModal with an empty code', () => {
    expect(homeModalReducer(HOME_MODAL_INITIAL, { type: 'create' })).toEqual({ modal: 'create', joinCode: '' });
    expect(homeModalReducer({ modal: 'join', joinCode: 'AB12CD' }, { type: 'join' })).toEqual({
      modal: 'join',
      joinCode: '',
    });
  });

  it('resume opens JoinRoomModal prefilled with the saved code; no code = no-op; close resets', () => {
    const s = homeModalReducer(HOME_MODAL_INITIAL, { type: 'resume', code: 'XY34ZW' });
    expect(s).toEqual({ modal: 'join', joinCode: 'XY34ZW' });
    expect(homeModalReducer(HOME_MODAL_INITIAL, { type: 'resume', code: null })).toBe(HOME_MODAL_INITIAL);
    expect(homeModalReducer(s, { type: 'close' })).toEqual(HOME_MODAL_INITIAL);
  });

  it('HomePage renders hero + end CTAs and the header, and no resume link without a saved room', () => {
    const html = renderToStaticMarkup(<HomePage onNavigateToRoom={noop} />);
    expect(html).toContain(esc(i18n.t('landing.hero.titleA')));
    expect(html.match(/data-cta="create"/g)).toHaveLength(2);
    expect(html.match(/data-cta="join"/g)).toHaveLength(2);
    expect(html).not.toContain('data-cta="resume"');
    expect(html).not.toContain(esc(i18n.t('landing.hero.resume')));
  });

  it('resume link shows the real saved code (not a fixed demo code)', () => {
    tokenStorage.setRoomCode('QW12ER');
    const html = renderToStaticMarkup(<HomePage onNavigateToRoom={noop} />);
    expect(html).toContain('data-cta="resume"');
    expect(html).toContain(esc(i18n.t('landing.hero.resumeLink', { code: 'QW12ER' })));
    expect(html).not.toContain('NN64S8');
  });

  it('top-bar Create is visible only when the hero CTA is gone and the end CTA is not in view', () => {
    expect(showTopCreate(true, false)).toBe(false);
    expect(showTopCreate(false, true)).toBe(false);
    expect(showTopCreate(true, true)).toBe(false);
    expect(showTopCreate(false, false)).toBe(true);
    const hidden = renderToStaticMarkup(<LandingHeader showCreate={false} onCreate={noop} onJoin={noop} />);
    expect(hidden).toMatch(/data-show="false"[^>]*aria-hidden="true"[^>]*tabindex="-1"/);
    const shown = renderToStaticMarkup(<LandingHeader showCreate onCreate={noop} onJoin={noop} />);
    expect(shown).toMatch(/data-show="true"[^>]*aria-hidden="false"[^>]*tabindex="0"/);
  });
});

describe('T-124: page skeleton, landmarks, i18n', () => {
  it('8 parts: header, 7 sections with labelled headings, footer', () => {
    const html = renderToStaticMarkup(
      <LandingPage onCreate={noop} onJoin={noop} resumeCode={null} onResume={noop} />,
    );
    expect(html).toContain('<header id="top"');
    expect(html).toContain('<main');
    expect(html).toContain('<footer');
    for (const id of LANDING_SECTION_IDS) {
      const m = html.match(new RegExp(`<section id="${id}" aria-labelledby="([\\w-]+)"`));
      expect(m, `section #${id}`).not.toBeNull();
      expect(html).toContain(`id="${m![1]}"`);
    }
    // Hero là h1 duy nhất; mỗi phần còn lại có h2 thật (không lorem)
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toMatch(/lorem/i);
    for (const key of ['chat', 'flow', 'tie', 'numbers', 'end'] as const) {
      expect(html).toContain(esc(i18n.t(`landing.${key}.title`)));
      expect(html).toContain(esc(i18n.t(`landing.${key}.sub`)));
    }
  });

  it('EN renders English copy, uses the app language switch and the app SoundToggle', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(
      <LandingPage onCreate={noop} onJoin={noop} resumeCode="AB12CD" onResume={noop} />,
    );
    expect(html).toContain('Where to tonight?');
    expect(html).toContain('Settle it in one room.');
    expect(html).toContain('<strong class="font-semibold text-night-moon">nobody rides the farthest alone</strong>');
    expect(html).toContain('rejoin room AB12CD');
    expect(html).toContain('Create a room');
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('aria-label="Turn sound on"');
  });

  it('landing root always uses night tokens (data-tier set, no theme-dependent stage-paper)', () => {
    const html = renderToStaticMarkup(
      <LandingPage onCreate={noop} onJoin={noop} resumeCode={null} onResume={noop} />,
    );
    expect(html).toMatch(/class="landing [^"]*bg-night /);
    expect(html).not.toContain('stage-paper');
    const css = fs.readFileSync(path.resolve(__dirname, '../../../styles/tokens.css'), 'utf8');
    const darkBlocks = css.split(/:root\[data-theme="dark"\]|prefers-color-scheme: dark/).slice(1).join('');
    expect(css).toContain('--night: 22 17 28;');
    expect(darkBlocks).not.toMatch(/--night|--lamp|--coral-on-dark|--house-/);
  });
});

describe('T-124: no old hero / gsap imports', () => {
  const srcDir = path.resolve(__dirname, '../../..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
      return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });

  it('HomePage and landing/** import neither stage/hero/* nor gsap', () => {
    const files = [path.join(srcDir, 'pages/HomePage.tsx'), ...walk(path.join(srcDir, 'landing'))];
    expect(files.length).toBeGreaterThan(5);
    const bad: string[] = [];
    for (const f of files) {
      const code = fs.readFileSync(f, 'utf8');
      const specs = [...code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const s of specs) {
        if (/stage\/hero(\/|$)/.test(s) || /^gsap(\/|$)/.test(s) || s.startsWith('@gsap/')) {
          bad.push(`${path.relative(srcDir, f)} -> ${s}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('T-124: hidden-until-in-view rule', () => {
  const base = { tier: 'full' as const, hasObserver: true, viewportHeight: 800 };
  it('content in the first screen at load is shown at once; only content below the fold waits', () => {
    expect(initialOnceState({ ...base, top: 120 })).toBe('shown');
    expect(initialOnceState({ ...base, top: 680 })).toBe('shown');
    expect(initialOnceState({ ...base, top: 681 })).toBe('waiting');
    expect(initialOnceState({ ...base, top: 2400 })).toBe('waiting');
  });

  it('static motion tier or no IntersectionObserver: always shown', () => {
    expect(initialOnceState({ ...base, tier: 'static', top: 2400 })).toBe('shown');
    expect(initialOnceState({ ...base, hasObserver: false, top: 2400 })).toBe('shown');
    expect(initialOnceState({ ...base, tier: 'lite', top: 2400 })).toBe('waiting');
  });

  it('section heads render visible on the server (no hidden content without JS)', () => {
    const html = renderToStaticMarkup(
      <LandingPage onCreate={noop} onJoin={noop} resumeCode={null} onResume={noop} />,
    );
    expect(html).not.toContain('data-reveal="waiting"');
    expect(html).toContain('data-reveal="shown"');
  });
});

describe('T-124: cast', () => {
  it('4 friends from the gd8 demo at district level, Nobita hosts, plus the viewer', () => {
    expect(CAST.map((c) => [c.id, c.district])).toEqual([
      ['Nobita', 'q1'],
      ['Doraemon', 'bt'],
      ['Xuka', 'td'],
      ['Xeko', 'q7'],
    ]);
    expect(HOST.id).toBe('Nobita');
    for (const c of CAST) {
      expect(DISTRICT_CODES).toContain(c.district);
      expect(Object.keys(c).sort()).toEqual(c.host ? ['district', 'host', 'id', 'rideColor'] : ['district', 'id', 'rideColor']);
    }
    expect(YOU_SEED).toBe('B\u1EA1n');
    expect(castMember('Xuka').district).toBe('td');
  });

  it('avatarFor is the deterministic DiceBear data URI, distinct per character', () => {
    const uris = [...CAST.map((c) => avatarFor(c.id)), avatarFor(YOU_SEED)];
    for (const u of uris) expect(u.startsWith('data:image/svg+xml')).toBe(true);
    expect(new Set(uris).size).toBe(5);
    expect(avatarFor('Nobita')).toBe(avatarFor('Nobita'));
  });

  it('every district code has a VI and EN label', () => {
    for (const code of DISTRICT_CODES) {
      expect(i18n.t(`landing.district.${code}`, { lng: 'vi' })).not.toContain('landing.');
      expect(i18n.t(`landing.district.${code}`, { lng: 'en' })).not.toContain('landing.');
    }
  });
});
