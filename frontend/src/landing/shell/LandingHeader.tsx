import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '../../components/shell/Wordmark';
import { SoundToggle } from '../../sound/SoundToggle';
import { LandingButton } from './LandingButton';
import { LandingLangSwitch } from './LandingLangSwitch';
import { useScrolledPast } from './ctaState';

export interface LandingHeaderProps {
  /** Hiện nút "Tạo phòng" trên thanh (khi CTA hero khuất và CTA cuối chưa hiện, xem `showTopCreate`). */
  showCreate: boolean;
  onCreate: () => void;
  onJoin: () => void;
}

/**
 * Thanh đỉnh landing (PLAN §4.1 mục 0): Wordmark · Tạo phòng · Nhập mã · loa · VI/EN.
 * Dính đầu trang, trong suốt ở đỉnh, có nền khi `scrollY > 24`. Dưới 440px logo đổi sang ô "H." để 3 nút
 * + VI/EN vừa 360px; dưới 480px nút "Tạo phòng" trên thanh luôn ẩn (CTA hero/cuối trang vẫn có).
 */
export const LandingHeader: React.FC<LandingHeaderProps> = ({ showCreate, onCreate, onJoin }) => {
  const { t } = useTranslation();
  const scrolled = useScrolledPast(24);

  return (
    <header id="top" className="landing-top" data-scrolled={scrolled}>
      <div className="landing-wrap flex items-center justify-between gap-3 py-3.5">
        <a
          href="#hero"
          aria-label={t('landing.nav.home')}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg"
        >
          <span className="hidden min-[440px]:inline-flex">
            <Wordmark size={26} inkColor="rgb(var(--night-moon))" accentColor="rgb(var(--coral-on-dark))" />
          </span>
          <span className="inline-flex min-[440px]:hidden">
            <Wordmark variant="mark" size={36} />
          </span>
        </a>
        <nav aria-label={t('landing.nav.label')} className="landing-top-actions flex items-center gap-1.5 sm:gap-2">
          <LandingButton
            size="sm"
            data-show={showCreate}
            aria-hidden={!showCreate}
            tabIndex={showCreate ? 0 : -1}
            onClick={onCreate}
            className="landing-top-create max-[480px]:hidden"
          >
            {t('landing.nav.create')}
          </LandingButton>
          <LandingButton size="sm" variant="ghost" onClick={onJoin}>
            {t('landing.nav.join')}
          </LandingButton>
          <SoundToggle className="!h-11 !w-11 shrink-0 !rounded-full !text-night-moon-2 aria-pressed:!text-lamp" />
          <LandingLangSwitch />
        </nav>
      </div>
    </header>
  );
};
