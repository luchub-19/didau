import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useTheme,
  setTheme,
  getSavedTheme,
  getSystemTheme,
  applyTheme,
  THEME_STORAGE_KEY,
} from '../theme/useTheme';
import { GroupPanel } from '../pages/room/GroupPanel';
import { mockRoom, mockHostMember, mockGuestMember } from '../mocks/mockData';
import '../i18n';

describe('T-54: Dark mode and Theme Management', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const store = new Map<string, string>();
    const docElement = {
      attributes: new Map<string, string>(),
      setAttribute(name: string, val: string) {
        this.attributes.set(name, val);
      },
      getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
      },
      removeAttribute(name: string) {
        this.attributes.delete(name);
      },
    };

    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-color-scheme: dark') ? false : true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    };

    (globalThis as unknown as { document: unknown }).document = {
      documentElement: docElement,
      querySelector: vi.fn().mockReturnValue(null),
    };

    setTheme('system');
  });

  afterEach(() => {
    (globalThis as unknown as { window: unknown }).window = originalWindow;
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  });

  describe('getSavedTheme & localStorage', () => {
    it('trả về "system" khi chưa lưu gì', () => {
      expect(getSavedTheme()).toBe('system');
    });

    it('trả về "light" hoặc "dark" khi đã lưu giá trị hợp lệ', () => {
      setTheme('dark');
      expect(getSavedTheme()).toBe('dark');

      setTheme('light');
      expect(getSavedTheme()).toBe('light');
    });

    it('bỏ qua giá trị lạ và fallback về "system"', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
      expect(getSavedTheme()).toBe('system');
    });
  });

  describe('getSystemTheme', () => {
    it('nhận diện dark mode từ prefers-color-scheme', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-color-scheme: dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      expect(getSystemTheme()).toBe('dark');
    });

    it('nhận diện light mode khi prefers-color-scheme không match', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      expect(getSystemTheme()).toBe('light');
    });
  });

  describe('applyTheme', () => {
    it('gắn data-theme lên <html> đúng theo theme truyền vào', () => {
      applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      applyTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      applyTheme('system');
      expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    });
  });

  describe('setTheme', () => {
    it('chuyển sang dark mode, cập nhật localStorage và DOM', () => {
      setTheme('dark');
      expect(getSavedTheme()).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('chuyển sang light mode, cập nhật localStorage và DOM', () => {
      setTheme('light');
      expect(getSavedTheme()).toBe('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('chuyển sang system mode, cập nhật localStorage và DOM', () => {
      setTheme('dark');
      setTheme('system');
      expect(getSavedTheme()).toBe('system');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
      expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    });
  });

  describe('useTheme hook qua React component', () => {
    it('render trả về theme ban đầu và resolvedTheme', () => {
      let themeValue = '';
      let resolvedValue = '';
      function ThemeInspector() {
        const hookRes = useTheme();
        themeValue = hookRes.theme;
        resolvedValue = hookRes.resolvedTheme;
        return null;
      }
      renderToStaticMarkup(<ThemeInspector />);
      expect(themeValue).toBe('system');
      expect(resolvedValue).toBe('light');
    });
  });

  describe('GroupPanel tích hợp điều khiển Giao diện', () => {
    it('render hàng Giao diện với Segmented 3 lựa chọn (Theo máy / Sáng / Tối)', () => {
      const html = renderToStaticMarkup(
        <GroupPanel
          room={mockRoom}
          members={[mockHostMember, mockGuestMember]}
          currentMember={mockHostMember}
          isHost={true}
          placesCount={3}
          scheduleCount={2}
        />,
      );

      // Có tiêu đề Giao diện
      expect(html).toContain('Giao diện');
      // Segmented có đủ 3 nút Theo máy, Sáng, Tối
      expect(html).toContain('Theo máy');
      expect(html).toContain('Sáng');
      expect(html).toContain('Tối');
      expect(html).toContain('role="tablist"');
    });
  });
});
