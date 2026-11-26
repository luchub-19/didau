// T-129: số đo, kết, QR, footer. File trong landing/** nên i18n_guard quét: tên test tiếng Anh, chữ qua i18n.t().
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import '../../../i18n';
import i18n from 'i18next';
import { Numbers } from '../Numbers';
import { Closing, QR_SRC } from '../Closing';
import { LandingFooter } from '../LandingFooter';
import {
  BIG_NUMBERS,
  CHART_FAR,
  CHART_SUM,
  SCALE_MAX,
  TABLE_ROWS,
  barWidthPct,
  countValue,
  decimalsOf,
  formatNumber,
  labelInside,
} from '../numbers';

afterEach(async () => {
  await i18n.changeLanguage('vi');
});

describe('T-129: numbers model', () => {
  it('keeps every figure identical to the 20-case table (script §1.1)', () => {
    expect(CHART_SUM.map((d) => d.value)).toEqual([44.7, 20.1, 13.9, 1.13]);
    expect(CHART_FAR.map((d) => d.value)).toEqual([35.7, 9.37]);
    expect(BIG_NUMBERS.map((b) => b.value)).toEqual([1.13, 9.37]);
    expect(TABLE_ROWS.map((r) => r.algo)).toEqual(['random', 'greedy', 'weighted', 'life', 'sum', 'us']);
  });

  it('uses one 0-50% scale and puts the label inside only long bars', () => {
    expect(SCALE_MAX).toBe(50);
    expect(barWidthPct(25)).toBe(50);
    expect(labelInside(44.7)).toBe(true);
    expect(labelInside(35.7)).toBe(true);
    expect(labelInside(20.1)).toBe(false);
    expect(labelInside(1.13)).toBe(false);
  });

  it('counts from 0 to the target and clamps progress', () => {
    expect(countValue(9.37, 0)).toBe(0);
    expect(countValue(9.37, 1)).toBeCloseTo(9.37, 10);
    expect(countValue(9.37, 2)).toBeCloseTo(9.37, 10);
    expect(countValue(9.37, -1)).toBe(0);
    expect(countValue(9.37, 0.5)).toBeGreaterThan(9.37 / 2);
  });

  it('formats decimals per language and keeps source precision', () => {
    expect(formatNumber(1.13, 2, 'vi')).toBe('1,13');
    expect(formatNumber(1.13, 2, 'en')).toBe('1.13');
    expect([44.7, 1.13, 9.37, 20].map(decimalsOf)).toEqual([1, 2, 2, 0]);
  });
});

describe('T-129: numbers section', () => {
  it('renders final values, both charts, the table inside <details> and the source note (vi)', () => {
    const html = renderToStaticMarkup(<Numbers />);
    expect(html).toContain('id="numbers"');
    expect(html).toContain('+1,13%');
    expect(html).toContain('9,37%');
    expect(html).toContain('44,7%');
    expect(html).toContain('35,7%');
    expect(html).toContain('<details');
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain(i18n.t('landing.numbers.source'));
    expect((html.match(/<tr/g) ?? []).length).toBe(1 + TABLE_ROWS.length);
  });

  it('uses dot decimals in English', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(<Numbers />);
    expect(html).toContain('+1.13%');
    expect(html).not.toContain('+1,13%');
  });

  it('wraps the wide table in its own scroll box so the page never overflows at 360px', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../sections.css'), 'utf8');
    expect(css).toMatch(/\.num-tbl-wrap\s*{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.num-charts\[data-state='waiting'\] \.num-bar-tr i\s*{[^}]*scaleX\(0\)/);
  });
});

describe('T-129: closing, QR and footer', () => {
  it('keeps the end id, both CTAs, four cast avatars and a described QR', () => {
    const html = renderToStaticMarkup(<Closing cta={<div data-cta-row="1" />} />);
    expect(html).toContain('id="end"');
    expect(html).toContain('data-cta-row="1"');
    expect((html.match(/class="end-cast"[\s\S]*?<\/div>/)?.[0].match(/<img/g) ?? []).length).toBe(4);
    expect(html).toContain(`src="${QR_SRC}"`);
    expect(html).toContain(`alt="${i18n.t('landing.end.qrLabel')}"`);
  });

  it('shows the QR only from 960px up and the QR file exists', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../sections.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 960px\)[\s\S]*\.end-qr\s*{\s*display:\s*none/);
    expect(fs.existsSync(path.resolve(__dirname, '../../../../public', 'landing/qr-deploy.svg'))).toBe(true);
  });

  it('renders the brand line and the map credit', () => {
    const html = renderToStaticMarkup(<LandingFooter />);
    expect(html).toContain(i18n.t('landing.footer.brand'));
    expect(html).toContain('OpenFreeMap');
    expect(html).toContain('OpenStreetMap');
  });
});
