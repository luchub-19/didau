// Tiến độ nhóm trong phiên quẹt: x/y người xong + thanh tiến độ. Khi có thêm người xong (DECISION_PROGRESS),
// một "+1" ẩn danh bay vào bộ đếm (`vote.flyIn`). Sự kiện không có id người → chưa có avatar (T-63, CR-08).
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motionAttrs, resolvePreset, useMotionTier } from '../../motion';
import { Users } from '../../components/ui';
import { newlyDone } from './rules';

export interface DeckProgressProps {
  done: number;
  total: number;
  currentCard: number;
  totalCards: number;
}

export const DeckProgress: React.FC<DeckProgressProps> = ({ done, total, currentCard, totalCards }) => {
  const { t } = useTranslation();
  const tier = useMotionTier();
  const prevDone = useRef(done);
  const [burst, setBurst] = useState<{ id: number; count: number } | null>(null);
  const burstRef = useRef<HTMLSpanElement>(null);
  const ratio = total > 0 ? done / total : 0;

  useEffect(() => {
    const added = newlyDone(prevDone.current, done);
    prevDone.current = done;
    if (added > 0) setBurst((b) => ({ id: (b?.id ?? 0) + 1, count: added }));
  }, [done]);

  // Bay từ dưới lên vào bộ đếm rồi tan; 'static' chỉ hiện/mờ tại chỗ
  useEffect(() => {
    const el = burstRef.current;
    if (!burst || !el || typeof el.animate !== 'function') return;
    const fly = resolvePreset('vote.flyIn', tier);
    const frames: Keyframe[] = fly.move
      ? [
          { opacity: 0, transform: 'translate3d(0, 14px, 0) scale(0.9)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.55 },
          { opacity: 0, transform: 'translate3d(0, -6px, 0) scale(1)' },
        ]
      : [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }];
    const anim = el.animate(frames, { duration: fly.durationMs, easing: fly.easing, fill: 'forwards' });
    anim.onfinish = () => setBurst(null);
    return () => anim.cancel();
  }, [burst, tier]);

  return (
    <div className="space-y-1.5 bg-surface-2 p-3 rounded-card border border-line">
      <div className="flex items-center justify-between text-caption font-medium text-ink-2">
        <span data-testid="swipe-progress-text" className="relative inline-flex items-center gap-1.5">
          <Users size={14} className="text-ink-3 shrink-0" aria-hidden="true" />
          <span
            dangerouslySetInnerHTML={{
              __html: t('decide.swipe.progressText', { done, total: total || 1 }),
            }}
          />
          {burst && (
            <span
              key={burst.id}
              ref={burstRef}
              data-testid="swipe-progress-burst"
              {...motionAttrs('vote.flyIn')}
              aria-hidden="true"
              className="absolute -top-4 left-4 rounded-full bg-accent px-1.5 text-[11px] font-bold text-ink tabular-nums opacity-0"
            >
              {t('decide.swipe.plusDone', { count: burst.count })}
            </span>
          )}
        </span>
        <span data-testid="swipe-card-counter" className="font-semibold text-ink">
          {t('decide.swipe.cardCounter', { current: currentCard, total: totalCards })}
        </span>
      </div>
      <div data-testid="swipe-progress-bar" className="w-full h-2 bg-line rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-[width] duration-300 rounded-full"
          style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  );
};
