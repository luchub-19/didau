import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motionAttrs, type MotionTier } from '../../motion';
import { GlobeCanvas } from './globe/GlobeCanvas';
import { isGlobeOnScreen, markGlobeOnScreen } from './globe/clock';

export type GlobeState = 'loading' | 'ready' | 'failed';

export interface HeroGlobeProps {
  state: GlobeState;
  /** Trễ trước khi hiện (ms); tải nhanh thì không nháy. 0 = hiện ngay (test). */
  delayMs?: number;
  /** Mức chuyển động; `static` thì không vẽ. Mặc định 'full' (chỉ dùng trong fallback của Hero, nơi chắc chắn không phải static). */
  tier?: MotionTier;
}

const FADE_MS = 1400; // = --t-shot

/**
 * Quả địa cầu xoay lúc bản đồ 3D đang tải (gđ9 PLAN §4): canvas chấm bi chiếu trực giao (`globe/GlobeCanvas`),
 * đường kính 120 px (mobile) / 168 px (md+), góc xoay theo đồng hồ chung nên hai instance (fallback → HeroScroll) nối liền.
 * Hiện sau `delayMs`; `ready` → mờ dần rồi gỡ; `failed` → gỡ ngay; `static` → không vẽ.
 */
export const HeroGlobe: React.FC<HeroGlobeProps> = ({ state, delayMs = 300, tier = 'full' }) => {
  const { t } = useTranslation();
  // Instance trước (fallback của Hero) đang hiện ⇒ hiện ngay để nối liền, không chờ delayMs.
  const [shown, setShown] = useState(() => delayMs <= 0 || (state === 'loading' && isGlobeOnScreen()));
  const [gone, setGone] = useState(false);
  const visible = tier !== 'static' && shown && !gone && state !== 'failed';

  useEffect(() => (visible ? markGlobeOnScreen() : undefined), [visible]);

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

  if (!visible) return null;
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
        className="relative h-[120px] w-[120px] md:h-[168px] md:w-[168px] rounded-full border border-[rgb(var(--stage-ink)/0.12)]"
      >
        <GlobeCanvas slow={slow} className="rounded-full" />
      </div>
      <p role="status" className="text-label font-semibold text-[rgb(var(--stage-ink-2))] bg-[rgb(var(--stage-paper)/0.8)] rounded-full px-3 py-1">
        {t('hero.globeLoading')}
      </p>
    </div>
  );
};
