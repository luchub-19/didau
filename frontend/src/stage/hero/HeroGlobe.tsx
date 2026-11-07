import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motionAttrs, type MotionTier } from '../../motion';
import { GLOBE_HCM, GLOBE_LAND_PATH, GLOBE_VIEW } from './globe-land';

export type GlobeState = 'loading' | 'ready' | 'failed';

export interface HeroGlobeProps {
  state: GlobeState;
  /** Trễ trước khi hiện (ms); tải nhanh thì không nháy. 0 = hiện ngay (test). */
  delayMs?: number;
  /** Mức chuyển động; `static` thì không vẽ. Mặc định 'full' (chỉ dùng trong fallback của Hero, nơi chắc chắn không phải static). */
  tier?: MotionTier;
}

const FADE_MS = 1400; // = --t-shot

const Strip: React.FC = () => (
  <svg viewBox={`0 0 ${GLOBE_VIEW.w} ${GLOBE_VIEW.h}`} width={224} height={112} className="shrink-0 block" aria-hidden="true" focusable="false">
    <path d={GLOBE_LAND_PATH} fill="rgb(var(--stage-ink-2) / 0.55)" />
    <circle cx={GLOBE_HCM.x} cy={GLOBE_HCM.y} r={4} fill="rgb(var(--stage-accent-text))" />
  </svg>
);

/**
 * Quả địa cầu xoay lúc bản đồ 3D đang tải (DESIGN gđ6 §7). Chỉ trượt `transform` (composite).
 * Hiện sau `delayMs`; `ready` → mờ dần rồi gỡ; `failed` → gỡ ngay.
 */
export const HeroGlobe: React.FC<HeroGlobeProps> = ({ state, delayMs = 300, tier = 'full' }) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(delayMs <= 0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (state !== 'loading' || shown) return;
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [state, shown, delayMs]);

  useEffect(() => {
    if (state !== 'ready' || !shown) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [state, shown]);

  if (tier === 'static' || !shown || gone || state === 'failed') return null;
  const leaving = state === 'ready';
  const slow = tier === 'lite' || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  return (
    <div
      {...motionAttrs('hero.shot')}
      data-hero-globe=""
      className="absolute inset-x-0 top-[18%] md:top-[34%] z-[5] flex flex-col items-center gap-3 pointer-events-none"
      style={{ opacity: leaving ? 0 : 1, transition: `opacity ${FADE_MS}ms var(--ease-out)` }}
    >
      <div
        aria-hidden="true"
        className="relative h-[88px] w-[88px] md:h-[112px] md:w-[112px] rounded-full overflow-hidden border border-[rgb(var(--stage-ink)/0.12)] bg-[rgb(var(--stage-paper-2))]"
      >
        <div className="origin-top-left scale-[0.7857] md:scale-100">
          <div className={`hero-globe-track flex w-[448px] ${slow ? 'hero-globe-slow' : ''}`}>
            <Strip />
            <Strip />
          </div>
        </div>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle at 32% 28%, rgb(255 255 255 / 0.35), transparent 45%), radial-gradient(circle at 70% 75%, rgb(var(--stage-ink) / 0.28), transparent 65%)',
          }}
        />
      </div>
      <p role="status" className="text-label font-semibold text-[rgb(var(--stage-ink-2))] bg-[rgb(var(--stage-paper)/0.8)] rounded-full px-3 py-1">
        {t('hero.globeLoading')}
      </p>
    </div>
  );
};
