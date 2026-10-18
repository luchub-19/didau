import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'didau.theme';

const memoryStore = new Map<string, string>();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string): string | null => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string): void => {
      memoryStore.delete(key);
    },
  };
}

/**
 * Xác định giao diện của hệ thống (OS) qua matchMedia prefers-color-scheme.
 */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Đọc cấu hình giao diện từ localStorage (hoặc mặc định 'system').
 */
export function getSavedTheme(): Theme {
  try {
    const saved = getStorage().getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // localStorage có thể bị chặn trên trình duyệt riêng tư
  }
  return 'system';
}

/**
 * Gắn `data-theme` lên `<html>` và cập nhật meta theme-color tương ứng.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute('data-theme', theme);

  const resolved = theme === 'system' ? getSystemTheme() : theme;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]:not([media])');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', resolved === 'dark' ? '#141210' : '#FAFAF9');
  }
}

// Bộ lắng nghe thay đổi theme toàn ứng dụng (đồng bộ mọi hook useTheme)
const listeners = new Set<() => void>();
let currentTheme: Theme = getSavedTheme();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

/**
 * Đổi theme toàn cục, lưu vào localStorage và gắn data-theme lên <html>.
 */
export function setTheme(newTheme: Theme): void {
  currentTheme = newTheme;
  try {
    getStorage().setItem(THEME_STORAGE_KEY, newTheme);
  } catch {
    // Bỏ qua nếu localStorage bị vô hiệu
  }
  applyTheme(newTheme);
  listeners.forEach((listener) => listener());
}

// Lắng nghe sự kiện hệ điều hành đổi theme khi đang ở chế độ 'system'
if (typeof window !== 'undefined' && window.matchMedia) {
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (currentTheme === 'system') {
        applyTheme('system');
        listeners.forEach((listener) => listener());
      }
    };
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleMediaChange);
    } else if (typeof (mql as unknown as { addListener?: (cb: () => void) => void }).addListener === 'function') {
      (mql as unknown as { addListener: (cb: () => void) => void }).addListener(handleMediaChange);
    }
  } catch {
    // Môi trường test không hỗ trợ matchMedia listener
  }
}

/**
 * Hook quản lý chế độ giao diện Sáng / Tối / Theo hệ thống.
 */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, getSnapshot, () => 'system');
  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? getSystemTheme() : theme;

  const updateTheme = useCallback((next: Theme) => {
    setTheme(next);
  }, []);

  return {
    theme,
    setTheme: updateTheme,
    resolvedTheme,
  };
}
