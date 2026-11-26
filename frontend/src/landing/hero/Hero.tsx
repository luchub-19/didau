// Hero landing (T-125, PLAN §4.1 dòng 1): tiêu đề 2 dòng + lede + 2 CTA + "vào lại phòng" + gợi ý "bấm thử" ở cột
// trái; cửa sổ phòng mẫu bấm được ở cột phải (> 960px) hoặc dưới chữ (≤ 960px); phố đêm + bốn bạn hội tụ ôm đáy.
// Một khoảnh khắc cho màn này: bốn bạn hội tụ (một lần/lượt tải). Còn lại chỉ phản hồi thao tác.
// LCP phải là tiêu đề: bản đồ mini chụp sang canvas 2D (không phải <img>), nạp sau `load` của trang.
import React, { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { MotionTier } from '../../motion/useMotionTier';
import { NightStreet } from './NightStreet';
import { Riders } from './Riders';
import { RoomWindow } from './RoomWindow';
import './hero.css';

export interface HeroProps {
  tier: MotionTier;
  /** Hàng 2 CTA (Tạo phòng / Nhập mã) do LandingPage dựng, vì nó giữ ref cho IntersectionObserver của thanh đỉnh. */
  cta: (className: string, style: React.CSSProperties) => React.ReactNode;
  resumeCode: string | null;
  onResume: () => void;
}

const STRONG = { strong: <strong className="font-semibold text-night-moon" /> };

/** Bàn tay chỉ (Phosphor "hand-pointing", như mock v3 `#i-hand`) — Icon.tsx chưa re-export nên vẽ tại chỗ. */
const HandIcon: React.FC = () => (
  <svg viewBox="0 0 256 256" width={18} height={18} aria-hidden="true" focusable="false" className="shrink-0 text-lamp">
    <path
      fill="currentColor"
      d="M196 88a27.86 27.86 0 0 0-13.35 3.39A28 28 0 0 0 144 74.7V44a28 28 0 0 0-56 0v80l-3.82-6.13a28 28 0 0 0-48.41 28.17l29.32 50A80 80 0 0 0 224 168v-52a28 28 0 0 0-28-28Zm12 80a64 64 0 0 1-119.11 32.5l-29.33-50a12 12 0 0 1 20.77-12.11l.12.2 18.68 30A8 8 0 0 0 104 164V44a12 12 0 0 1 24 0v68a8 8 0 0 0 16 0v-12a12 12 0 0 1 24 0v20a8 8 0 0 0 16 0v-4a12 12 0 0 1 24 0Z"
    />
  </svg>
);

// Chữ hero "lên theo dòng" một lần lúc tải; --i = bậc trễ theo bước so le 90 ms (landing.css)
const intro = (i: number) => ({ className: 'landing-intro', style: { '--i': i } as React.CSSProperties });

export const Hero: React.FC<HeroProps> = ({ tier, cta, resumeCode, onResume }) => {
  const { t } = useTranslation();
  const appRef = useRef<HTMLDivElement>(null);
  // Phố "bật đèn" ở khung hình sau mount để chuyển tiếp chạy; static thì sáng ngay
  const [lit, setLit] = useState(tier === 'static');
  useEffect(() => {
    if (lit) return;
    const id = requestAnimationFrame(() => setLit(true));
    return () => cancelAnimationFrame(id);
  }, [lit]);

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero">
      <div className="landing-wrap hero-grid">
        <div>
          <h1 id="hero-title" className="landing-h1">
            <span className={`block ${intro(0).className}`} style={intro(0).style}>
              {t('landing.hero.titleA')}
            </span>{' '}
            <span className={`block text-lamp ${intro(1).className}`} style={intro(1).style}>
              {t('landing.hero.titleB')}
            </span>
          </h1>
          <p
            className={`mt-6 max-w-[30em] text-[17px] leading-[1.6] text-night-moon-2 sm:text-[19px] ${intro(2.2).className}`}
            style={intro(2.2).style}
          >
            <Trans i18nKey="landing.hero.lede" components={STRONG} />
          </p>
          {cta(intro(3.1).className, intro(3.1).style)}
          {resumeCode ? (
            <p className={`mt-[18px] text-sm text-night-moon-3 ${intro(3.8).className}`} style={intro(3.8).style}>
              {t('landing.hero.resume')}{' '}
              <button
                type="button"
                data-cta="resume"
                onClick={onResume}
                className="inline-flex min-h-[44px] items-center rounded text-night-moon-2 underline underline-offset-4 [@media(hover:hover)]:hover:text-night-moon"
              >
                {t('landing.hero.resumeLink', { code: resumeCode })}
              </button>
            </p>
          ) : null}
          <p className="hero-try">
            <HandIcon />
            <span>{t('landing.hero.try')}</span>
          </p>
        </div>
        <RoomWindow ref={appRef} tier={tier} />
      </div>
      <NightStreet lit={lit}>
        <Riders anchorRef={appRef} tier={tier} />
      </NightStreet>
    </section>
  );
};
