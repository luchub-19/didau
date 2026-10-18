import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { Button, IconButton, Sparkle, Shuffle, X } from '../ui';
import type { DeciderHint } from '../../types';

export interface DeciderBannerProps {
  roomId: string;
  hints?: DeciderHint[];
  onOpenDecide: () => void;
}

export const DeciderBanner: React.FC<DeciderBannerProps> = ({
  hints: propHints,
  onOpenDecide,
}) => {
  const { t } = useTranslation();
  const storeHints = useDecisionStore((s) => s.hints);
  const hints = propHints ?? storeHints;
  const [isDismissed, setIsDismissed] = useState(false);

  // Khi hints thay đổi loại gợi ý, mở lại banner nếu trước đó bị ẩn
  const hintType = hints?.[0]?.type;
  useEffect(() => {
    setIsDismissed(false);
  }, [hintType]);

  if (isDismissed || !hints || hints.length === 0) {
    return null;
  }

  const topHint = hints[0];
  const candidateCount = topHint.candidate_place_ids?.length || 0;

  const isTie = topHint.type === 'TIE_AT_TOP' || topHint.type === 'NEAR_TIE';
  const icon = isTie ? <Shuffle size={20} /> : <Sparkle size={20} weight="fill" />;

  const title = t(`decide.banner.title.${topHint.type}`, {
    defaultValue: t('decide.banner.title.default'),
  });

  const desc =
    topHint.type === 'TIE_AT_TOP' && candidateCount <= 0
      ? t('decide.banner.desc.TIE_AT_TOP_general')
      : t(`decide.banner.desc.${topHint.type}`, {
          count: candidateCount,
          defaultValue: t('decide.banner.desc.default'),
        });

  return (
    <div
      data-testid="decider-banner"
      className="relative overflow-hidden rounded-card bg-surface border border-accent/25 p-4 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-soft text-accent-text flex items-center justify-center"
            aria-hidden="true"
          >
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-label font-bold text-ink">{title}</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-surface-2 text-ink-2">
                {topHint.type}
              </span>
            </div>
            <p className="text-caption text-ink-2 mt-0.5">{desc}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={onOpenDecide}
            leftIcon={<Sparkle size={16} />}
          >
            {t('decide.banner.button')}
          </Button>
          <IconButton
            aria-label={t('decide.banner.dismiss')}
            icon={<X size={18} />}
            onClick={() => setIsDismissed(true)}
          />
        </div>
      </div>
    </div>
  );
};
