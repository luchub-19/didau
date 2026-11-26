// T-126: nhóm chat rối + dải ảnh. File nằm trong landing/** nên i18n_guard quét: tên test tiếng Anh, chữ qua i18n.t().
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { ChatStory } from '../ChatStory';
import { PhotoBand } from '../PhotoBand';
import { PHOTO_CREDIT_URL, PHOTO_SRC } from '../photo';
import {
  CHAT_BEFORE,
  COUNT_MS,
  COUNT_START_MS,
  SEQ_COUNT,
  TYPING_MS,
  TYPING_START_MS,
  UNREAD_TOTAL,
  unreadAt,
} from '../chatStory';
import { initialOnceState } from '../../shell/useOnceInView';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/\x22/g, '&quot;').replace(/\x27/g, '&#x27;');

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-126: chat story', () => {
  it('renders the full conversation at once (SSR = static tier): 5 messages, both day marks, count 53', () => {
    const html = renderToStaticMarkup(<ChatStory />);
    for (const k of ['m1', 'm2', 'm3', 'm4', 'm5'] as const) expect(html).toContain(esc(i18n.t(`landing.chat.${k}`)));
    expect(html).toContain(esc(i18n.t('landing.chat.wed')));
    expect(html).toContain(esc(i18n.t('landing.chat.sat')));
    expect(html).toContain(esc(i18n.t('landing.chat.unread', { n: UNREAD_TOTAL })));
    expect(html).not.toContain('chat-typing');
    expect(html).not.toContain('opacity:0');
  });

  it('chat block is one role=img with the description label; avatars are decorative; the far friend is dimmed', () => {
    const html = renderToStaticMarkup(<ChatStory />);
    expect(html).toContain(`role="img" aria-label="${esc(i18n.t('landing.chat.label'))}"`);
    expect(html.match(/class="chat-av"/g)).toHaveLength(5);
    expect(html.match(/<img[^>]*alt=""/g)).toHaveLength(5);
    expect(html.match(/is-dim/g)).toHaveLength(1);
    expect(CHAT_BEFORE.find((m) => m.dim)?.who).toBe('Xeko');
  });

  it('heading and sub are real i18n copy in both languages', async () => {
    expect(renderToStaticMarkup(<ChatStory />)).toContain('id="chat-title"');
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<ChatStory />);
    expect(html).toContain(esc(i18n.t('landing.chat.title')));
    expect(html).toContain(esc(i18n.t('landing.chat.unread', { n: 53 })));
  });

  it('timeline: 8 sequenced items, count after 5, typing right before the last message and at most 1.1 s', () => {
    expect(SEQ_COUNT).toBe(8);
    expect(COUNT_START_MS).toBe(5 * 280);
    expect(TYPING_START_MS).toBe(7 * 280);
    expect(TYPING_MS).toBeLessThanOrEqual(1100);
    expect(COUNT_MS).toBe(900);
    expect(unreadAt(0)).toBe(0);
    expect(unreadAt(1)).toBe(53);
    expect(unreadAt(2)).toBe(53);
    expect(unreadAt(-1)).toBe(0);
  });

  it('runs once: below the fold waits, in the first screen or static shows at once', () => {
    const base = { hasObserver: true, viewportHeight: 800 };
    expect(initialOnceState({ ...base, tier: 'full', top: 1400 })).toBe('waiting');
    expect(initialOnceState({ ...base, tier: 'full', top: 300 })).toBe('shown');
    expect(initialOnceState({ ...base, tier: 'static', top: 1400 })).toBe('shown');
  });
});

describe('T-126: photo band', () => {
  it('has srcset 1200/2000, sizes 100vw, intrinsic size, lazy, described alt', () => {
    const html = renderToStaticMarkup(<PhotoBand />);
    expect(html).toContain(`srcSet="${PHOTO_SRC.small} 1200w, ${PHOTO_SRC.large} 2000w"`);
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain(`width="${PHOTO_SRC.width}" height="${PHOTO_SRC.height}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain(`alt="${esc(i18n.t('landing.photo.alt'))}"`);
    expect(html).toContain('id="photo-caption"');
  });

  it('credit is a visible Commons link opening in a new tab with noopener', () => {
    const html = renderToStaticMarkup(<PhotoBand />);
    expect(html).toContain(`href="${esc(PHOTO_CREDIT_URL)}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain(esc(i18n.t('landing.photo.credit')));
    expect(PHOTO_CREDIT_URL).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:Bui_Vien/);
  });

  it('image files exist and the aspect ratio matches the reserved size (CLS 0)', () => {
    const dir = path.resolve(__dirname, '../../../../public/landing');
    expect(fs.existsSync(path.join(dir, 'bui-vien-night-1200.webp'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'bui-vien-night-2000.webp'))).toBe(true);
    expect(PHOTO_SRC.width / PHOTO_SRC.height).toBeCloseTo(2000 / 1303, 3);
    expect(PHOTO_SRC.largeW).toBe(PHOTO_SRC.width);
  });

  it('section keeps the id and landmark label the page skeleton expects', () => {
    expect(renderToStaticMarkup(<PhotoBand />)).toMatch(/<section id="photo" aria-labelledby="photo-caption"/);
  });
});
