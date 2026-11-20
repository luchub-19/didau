import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motionAttrs, type MotionTier } from '../../motion';
import { GlobeCanvas } from './globe/GlobeCanvas';
import { isGlobeOnScreen, markGlobeOnScreen, signalGlobe } from './globe/clock';
import { CREEP_MS, isPendingStage, ringProgress, SNAP_MS, statusKey, type GlobeState } from './globe/progress';

export type { GlobeState } from './globe/progress';

export interface HeroGlobeProps {
  state: GlobeState;
  /** Trễ trước khi hiện (ms); tải nhanh thì không nháy. 0 = hiện ngay (test). */
  delayMs?: number;
  /** Mức chuyển động; `static` thì không vẽ. Mặc định 'full' (chỉ dùng trong fallback của Hero, nơi chắc chắn không phải static). */
  tier?: MotionTier;
}

const FADE_MS = 1400; // = --t-shot
// Layout effect chạy trước mọi passive effect của cùng commit (kể cả effect mount của GlobeCanvas con) ⇒ khung đầu tiên
// đã thấy mốc mới. Không có `window` (render markup) thì dùng useEffect cho khỏi cảnh báo.
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Trần trễ (G1 câu 3): sau `ready`, cầu bắt đầu rời sân khấu muộn nhất 600 ms dù biên đạo chưa xong (tab ẩn, rAF dừng…). */
export const GLOBE_STORY_CAP_MS = 600;

/**
 * Quả địa cầu xoay lúc bản đồ 3D đang tải (gđ9 PLAN §4): canvas chấm bi chiếu trực giao (`globe/GlobeCanvas`),
 * đường kính 120 px (mobile) / 168 px (md+), góc xoay theo đồng hồ chung nên hai instance (fallback → HeroScroll) nối liền.
 * Hiện sau `delayMs`; `ready` → chờ biên đạo kể nốt (≤ `GLOBE_STORY_CAP_MS`, T-113) rồi mờ dần, gỡ; `failed` → gỡ ngay;
 * `static` → không vẽ. Mốc được ghi vào đồng hồ chung (`signalGlobe`) cả khi cầu chưa hiện.
 */
export const HeroGlobe: React.FC<HeroGlobeProps> = ({ state, delayMs = 300, tier = 'full' }) => {
  const { t } = useTranslation();
  // Instance trước (fallback của Hero) đang hiện ⇒ hiện ngay để nối liền, không chờ delayMs.
  const pending = isPendingStage(state);
  const [shown, setShown] = useState(() => delayMs <= 0 || (pending && isGlobeOnScreen()));
  const [gone, setGone] = useState(false);
  const visible = tier !== 'static' && shown && !gone && state !== 'failed';

  useEffect(() => (visible ? markGlobeOnScreen() : undefined), [visible]);
  useClientLayoutEffect(() => signalGlobe(state), [state]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Phụ thuộc `pending` (không phải `state`): đổi mốc trong 300 ms đầu không làm hẹn giờ hiện bắt đầu lại.
  useEffect(() => {
    if (!pending || shown) return;
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [pending, shown, delayMs]);

  // Vòng tiến độ: mỗi mốc mới nhảy tới đúng mốc (SNAP_MS), rồi sau đó nhích dần về phía mốc kế (CREEP_MS, CSS transition).
  const [creeping, setCreeping] = useState(false);
  useEffect(() => {
    setCreeping(false);
    if (!pending) return;
    const id = setTimeout(() => setCreeping(true), SNAP_MS);
    return () => clearTimeout(id);
  }, [state, pending]);

  // `ready`: biên đạo báo xong (onStoryEnd) hoặc hết trần 600 ms ⇒ bắt đầu mờ; mờ xong ⇒ gỡ.
  const [storyEnded, setStoryEnded] = useState(false);
  useEffect(() => {
    if (state !== 'ready' || !shown || storyEnded) return;
    const id = setTimeout(() => setStoryEnded(true), GLOBE_STORY_CAP_MS);
    return () => clearTimeout(id);
  }, [state, shown, storyEnded]);
  const leaving = state === 'ready' && storyEnded;

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(id);
  }, [leaving]);

  if (!visible) return null;
  const slow = tier === 'lite' || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // lite/reduced: nhảy thẳng tới mốc, không nhích (PLAN §4.4)
  const fraction = ringProgress(state, creeping && !slow);
  const ringMs = slow ? 0 : creeping ? CREEP_MS : SNAP_MS;

  return (
    <div
      {...motionAttrs('hero.shot')}
      data-hero-globe=""
      className="absolute inset-x-0 top-[18%] md:top-[34%] z-[5] flex flex-col items-center gap-3 pointer-events-none"
      style={{ opacity: leaving ? 0 : 1, transition: `opacity ${FADE_MS}ms var(--ease-out)` }}
    >
      <div aria-hidden="true" className="relative">
        <div className="h-[120px] w-[120px] md:h-[168px] md:w-[168px] rounded-full border border-[rgb(var(--stage-ink)/0.12)]">
          <GlobeCanvas slow={slow} className="rounded-full" onStoryEnd={() => stateRef.current === 'ready' && setStoryEnded(true)} />
        </div>
        {/* Vòng tiến độ: pathLength=100 nên dashoffset không phụ thuộc đường kính (120/168 px) */}
        <svg viewBox="0 0 100 100" className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] -rotate-90" data-globe-ring={fraction.toFixed(3)}>
          <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgb(var(--stage-ink) / 0.12)" strokeWidth="1.2" />
          <circle
            cx="50"
            cy="50"
            r="48.5"
            fill="none"
            stroke="rgb(var(--stage-accent-text))"
            strokeWidth="1.8"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            style={{ strokeDashoffset: 100 * (1 - fraction), transition: ringMs ? `stroke-dashoffset ${ringMs}ms var(--ease-out)` : 'none' }}
          />
        </svg>
      </div>
      <p role="status" className="text-label font-semibold text-[rgb(var(--stage-ink-2))] bg-[rgb(var(--stage-paper)/0.8)] rounded-full px-3 py-1">
        {t(statusKey(state))}
      </p>
    </div>
  );
};
