// Footer (T-129, PLAN §4.1 dòng 8, §4.8): câu thương hiệu + ghi công bản đồ.
import React from 'react';
import { useTranslation } from 'react-i18next';

export const LandingFooter: React.FC = () => {
  const { t } = useTranslation();
  return (
    <footer className="border-t border-night-line">
      <div className="landing-wrap flex flex-wrap justify-between gap-3 py-6 text-[13px] text-night-moon-3">
        <span>{t('landing.footer.brand')}</span>
        <span>{t('landing.footer.mapCredit')}</span>
      </div>
    </footer>
  );
};
