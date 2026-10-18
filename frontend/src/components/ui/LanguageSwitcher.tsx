import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../i18n/useLanguage';

interface LanguageSwitcherProps {
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { lang, setLang } = useLanguage();
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className={`inline-flex items-center p-1 rounded-field bg-surface-2 border border-line ${className}`}
    >
      <button
        type="button"
        aria-pressed={lang === 'vi'}
        aria-label={t('lang.switchToVi')}
        onClick={() => setLang('vi')}
        className={`min-h-[44px] min-w-[44px] px-3 py-1 rounded-[6px] text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          lang === 'vi'
            ? 'bg-surface text-ink font-semibold shadow-sm'
            : 'text-ink-2 hover:text-ink font-medium'
        }`}
      >
        VI
      </button>
      <button
        type="button"
        aria-pressed={lang === 'en'}
        aria-label={t('lang.switchToEn')}
        onClick={() => setLang('en')}
        className={`min-h-[44px] min-w-[44px] px-3 py-1 rounded-[6px] text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          lang === 'en'
            ? 'bg-surface text-ink font-semibold shadow-sm'
            : 'text-ink-2 hover:text-ink font-medium'
        }`}
      >
        EN
      </button>
    </div>
  );
};
