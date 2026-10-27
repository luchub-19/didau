import React from 'react';
import { useTranslation } from 'react-i18next';
import { HeroStops } from './HeroStops';
import type { HeroShot } from './shots';

/** Chữ font tiêu đề Stage (Bricolage Grotesque), cỡ theo DESIGN §3. */
export const DISPLAY_CLASS =
  'font-[family-name:var(--stage-font-display)] font-extrabold tracking-[-0.02em] leading-[1.2] text-[rgb(var(--stage-ink))]';

/** Chữ của một cảnh: cảnh 1 là khẩu hiệu (h1), cảnh 5 kèm lịch 3 chặng. */
export interface HeroCaptionProps {
  shot: HeroShot;
  /** Cảnh cuối: số chặng đường nối đã tới (chặng chưa tới hiện mờ). Mặc định: tất cả. */
  reached?: number;
}

export const HeroCaption: React.FC<HeroCaptionProps> = ({ shot, reached }) => {
  const { t } = useTranslation();

  if (shot.id === 'overview') {
    return (
      <>
        <h1 className={`${DISPLAY_CLASS} text-[clamp(2.5rem,6vw,5.5rem)]`}>{t('stage.tagline')}</h1>
        <p className="mt-3 text-body text-[rgb(var(--stage-ink-2))]">{t('stage.subline')}</p>
      </>
    );
  }

  return (
    <>
      <h2 className={`${DISPLAY_CLASS} text-[clamp(2rem,4.4vw,4rem)]`}>{t(shot.captionKey)}</h2>
      {shot.detailKey && <p className="mt-3 text-body text-[rgb(var(--stage-ink-2))]">{t(shot.detailKey)}</p>}
      {shot.id === 'night' && <HeroStops className="mt-4" reached={reached} />}
    </>
  );
};
