// Landing "Sài Gòn về đêm" (gđ11, docs/phase11/PLAN.md §4.1). Cuộn tự nhiên: không ghim, không scrub, không gsap,
// không import stage/hero/* (test `landing_shell` kiểm). Mỗi phần có id/landmark cố định; nội dung từng phần do task
// ghi bên cạnh lấp (T-126 → T-129), khung này chỉ giữ tiêu đề + phụ đề thật. Hero: T-125 (hero/**).
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMotionTier } from '../motion/useMotionTier';
import { ExploreTie } from './explore/ExploreTie';
import { Hero } from './hero/Hero';
import { ChatStory } from './sections/ChatStory';
import { Closing } from './sections/Closing';
import { FourSteps } from './sections/FourSteps';
import { LandingFooter } from './sections/LandingFooter';
import { Numbers } from './sections/Numbers';
import { PhotoBand } from './sections/PhotoBand';
import { LandingHeader } from './shell/LandingHeader';
import { LandingButton } from './shell/LandingButton';
import { showTopCreate, useInView } from './shell/ctaState';
import './landing.css';

export interface LandingPageProps {
  onCreate: () => void;
  onJoin: () => void;
  /** Mã phòng dở từ `tokenStorage.getRoomCode()`; null = không hiện "vào lại phòng". */
  resumeCode: string | null;
  onResume: () => void;
}

/** id của các phần, để task sau và test dùng chung (neo cuộn, bấm tên bước, QR…). */
export const LANDING_SECTION_IDS = ['hero', 'chat', 'photo', 'flow', 'tie', 'numbers', 'end'] as const;

export const LandingPage: React.FC<LandingPageProps> = ({ onCreate, onJoin, resumeCode, onResume }) => {
  const { t } = useTranslation();
  const tier = useMotionTier();
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const endCtaRef = useRef<HTMLDivElement>(null);
  const heroCtaVisible = useInView(heroCtaRef);
  const endCtaVisible = useInView(endCtaRef);

  const ctaRow = (ref: React.RefObject<HTMLDivElement>, extra = '', style?: React.CSSProperties) => (
    <div
      ref={ref}
      className={`mt-9 flex flex-wrap gap-3 max-[480px]:[&>button]:flex-auto ${extra}`}
      style={style}
    >
      <LandingButton data-cta="create" onClick={onCreate}>
        {t('landing.nav.create')}
      </LandingButton>
      <LandingButton data-cta="join" variant="ghost" onClick={onJoin}>
        {t('landing.nav.join')}
      </LandingButton>
    </div>
  );

  return (
    <div className="landing flex min-h-dvh flex-col bg-night font-sans text-night-moon" data-tier={tier}>
      <LandingHeader
        showCreate={showTopCreate(heroCtaVisible, endCtaVisible)}
        onCreate={onCreate}
        onJoin={onJoin}
      />

      <main className="flex-1">
        {/* 1. Hero: phố đêm + bốn bạn hội tụ + cửa sổ phòng mẫu bấm được (T-125, hero/Hero.tsx) */}
        <Hero
          tier={tier}
          cta={(className, style) => ctaRow(heroCtaRef, className, style)}
          resumeCode={resumeCode}
          onResume={onResume}
        />

        {/* 2. Nhóm chat rối (T-126, sections/ChatStory.tsx) */}
        <ChatStory />

        {/* 3. Dải ảnh Bùi Viện (T-126, sections/PhotoBand.tsx; ghi công CC BY-SA ngay trên ảnh) */}
        <PhotoBand />

        {/* 4. Một phòng, 4 bước (T-127, sections/FourSteps.tsx: khung app dính phải / khung dưới từng bước) */}
        <FourSteps />

        {/* 5. ★ Hoà phiếu, bạn là người thứ 5 (T-128, explore/ExploreTie.tsx: bản đồ lớn, chip quận, công tắc, bảng) */}
        <ExploreTie />

        {/* 6. Số đo 20 case (T-129, sections/Numbers.tsx) */}
        <Numbers />

        {/* 7. Kết: 2 CTA thật (ref cho IO thanh đỉnh) + dàn nhân vật + QR ≥ 960px (T-129, sections/Closing.tsx) */}
        <Closing cta={ctaRow(endCtaRef)} />
      </main>

      {/* 8. Footer (T-129) */}
      <LandingFooter />
    </div>
  );
};
