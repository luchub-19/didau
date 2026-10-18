import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { vi } from './locales/vi';
import { en } from './locales/en';
import { getInitialLanguage } from './useLanguage';

export const defaultNS = 'translation';
export const resources = {
  vi: { translation: vi },
  en: { translation: en },
} as const;

const initialLang = getInitialLanguage();

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLang;
}

i18n.use(initReactI18next).init({
  resources,
  lng: initialLang,
  fallbackLng: 'vi',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
