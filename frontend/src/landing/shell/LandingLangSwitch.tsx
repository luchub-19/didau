import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../i18n/useLanguage';

/**
 * VI/EN mặc áo đêm cho thanh đỉnh landing. Đổi ngôn ngữ qua `useLanguage()` của app (cùng khoá lưu `didau.lang`),
 * không tự viết localStorage riêng. Mỗi nút cao 42px + viền = vùng chạm 44px.
 */
export const LandingLangSwitch: React.FC = () => {
  const { t } = useTranslation();
  const { lang, setLang } = useLanguage();

  const item = (code: 'vi' | 'en', label: string, aria: string) => (
    <button
      type="button"
      aria-pressed={lang === code}
      aria-label={aria}
      onClick={() => setLang(code)}
      className={`relative z-[1] h-[42px] w-11 rounded-full text-[13px] font-semibold leading-none transition-colors duration-[var(--t-ui)] ${
        lang === code ? 'text-night-moon' : 'text-night-moon-2 [@media(hover:hover)]:hover:text-night-moon'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      data-lang={lang}
      className="landing-lang relative inline-flex shrink-0 rounded-full border border-night-line bg-night-2"
    >
      <span
        aria-hidden="true"
        className="landing-lang-knob absolute left-1 top-1 h-[34px] w-9 rounded-full bg-night-3"
      />
      {item('vi', 'VI', t('lang.switchToVi'))}
      {item('en', 'EN', t('lang.switchToEn'))}
    </div>
  );
};
