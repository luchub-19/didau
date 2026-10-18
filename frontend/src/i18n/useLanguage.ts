import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type Language = 'vi' | 'en';
export const STORAGE_KEY = 'didau.lang';

export function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'vi';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // localStorage may be unavailable
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith('vi')) return 'vi';
    if (nav.startsWith('en')) return 'en';
  }
  return 'vi';
}

export function useLanguage() {
  const { i18n } = useTranslation();
  const lang = (i18n.language === 'en' ? 'en' : 'vi') as Language;

  const setLang = useCallback(
    (newLang: Language) => {
      i18n.changeLanguage(newLang);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, newLang);
        } catch {
          // ignore
        }
      }
      if (typeof document !== 'undefined') {
        document.documentElement.lang = newLang;
      }
    },
    [i18n],
  );

  return { lang, setLang };
}
