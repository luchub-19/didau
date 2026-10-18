import React from 'react';
import { describe, it, expect } from 'vitest';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const VI_CHAR_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function getLeafPaths(
  obj: Record<string, unknown>,
  prefix = '',
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      map.set(fullPath, value);
    } else if (value && typeof value === 'object') {
      const nested = getLeafPaths(value as Record<string, unknown>, fullPath);
      nested.forEach((val, k) => map.set(k, val));
    }
  }
  return map;
}

function extractInterpolations(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map((m) => m.slice(2, -2).trim()).sort();
}

describe('i18n parity test (tính tương đồng vi / en)', () => {
  const viMap = getLeafPaths(vi as unknown as Record<string, unknown>);
  const enMap = getLeafPaths(en as unknown as Record<string, unknown>);

  it('tập khoá vi và en phải trùng khớp tuyệt đối', () => {
    const viKeys = Array.from(viMap.keys()).sort();
    const enKeys = Array.from(enMap.keys()).sort();

    expect(enKeys).toEqual(viKeys);
  });

  it('không có giá trị rỗng ở cả hai từ điển', () => {
    for (const [key, value] of viMap.entries()) {
      expect(
        value.trim().length,
        `Khoá "${key}" trong vi.ts không được để rỗng`,
      ).toBeGreaterThan(0);
    }
    for (const [key, value] of enMap.entries()) {
      expect(
        value.trim().length,
        `Khoá "${key}" trong en.ts không được để rỗng`,
      ).toBeGreaterThan(0);
    }
  });

  it('bản dịch en không chứa ký tự có dấu tiếng Việt (ngoại trừ app.name và lang.vi)', () => {
    const ALLOWED_VI_IN_EN = new Set(['app.name', 'lang.vi']);

    for (const [key, value] of enMap.entries()) {
      if (ALLOWED_VI_IN_EN.has(key)) {
        continue;
      }
      const hasVietnamese = VI_CHAR_REGEX.test(value);
      expect(
        hasVietnamese,
        `Khoá "${key}" trong en.ts chứa ký tự tiếng Việt: "${value}"`,
      ).toBe(false);
    }
  });

  it('biến nội suy {{x}} phải khớp chính xác giữa vi và en', () => {
    for (const [key, viValue] of viMap.entries()) {
      const enValue = enMap.get(key) || '';
      const viVars = extractInterpolations(viValue);
      const enVars = extractInterpolations(enValue);

      expect(
        enVars,
        `Biến nội suy của khoá "${key}" không khớp: vi=${JSON.stringify(viVars)}, en=${JSON.stringify(enVars)}`,
      ).toEqual(viVars);
    }
  });

  describe('LanguageSwitcher Component & App Integration', () => {
    it('render LanguageSwitcher đúng aria-pressed và text cho cả vi và en', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { LanguageSwitcher } = await import('../components/ui/LanguageSwitcher');
      const { default: i18n } = await import('../i18n');

      await i18n.changeLanguage('vi');
      const htmlVi = renderToStaticMarkup(React.createElement(LanguageSwitcher));
      expect(htmlVi).toContain('aria-pressed="true"');
      expect(htmlVi).toContain('VI');
      expect(htmlVi).toContain('EN');
      expect(htmlVi).toContain('Chuyển sang Tiếng Việt');
      expect(htmlVi).toContain('Chuyển sang Tiếng Anh');

      await i18n.changeLanguage('en');
      const htmlEn = renderToStaticMarkup(React.createElement(LanguageSwitcher));
      expect(htmlEn).toContain('Switch to Vietnamese');
      expect(htmlEn).toContain('Switch to English');

      // Khôi phục về vi
      await i18n.changeLanguage('vi');
    });

    it('App render màn waking và error chuẩn song ngữ qua t()', async () => {
      const { renderToStaticMarkup } = await import('react-dom/server');
      const { default: App } = await import('../App');
      const { coldStartManager } = await import('../services/api/coldStart');
      const { default: i18n } = await import('../i18n');

      await i18n.changeLanguage('vi');
      coldStartManager.setStatus('waking');
      const wakingVi = renderToStaticMarkup(React.createElement(App));
      expect(wakingVi).toContain('Đang đánh thức máy chủ');

      await i18n.changeLanguage('en');
      const wakingEn = renderToStaticMarkup(React.createElement(App));
      expect(wakingEn).toContain('Waking up the server');

      coldStartManager.setStatus('error', '');
      await i18n.changeLanguage('vi');
      const errorVi = renderToStaticMarkup(React.createElement(App));
      expect(errorVi).toContain('Không kết nối được máy chủ');

      await i18n.changeLanguage('en');
      const errorEn = renderToStaticMarkup(React.createElement(App));
      expect(errorEn).toContain('connect to server');
      expect(errorEn).toContain('Try again');

      // Khôi phục trạng thái
      coldStartManager.markCompleted();
      await i18n.changeLanguage('vi');
      // import động cả cây App mất ~3s, quá 5s mặc định khi chạy song song (T-56)
    }, 20000);
  });
});
