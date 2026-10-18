import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import {
  Button,
  EmptyState,
  toast,
  Sparkle,
  Shuffle,
  Check,
  MapPin,
  ThumbsUp,
} from '../ui';
import { describeApiError, describeReasons } from '../../i18n/serverText';
import { formatMoney } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import type { Place, ScoredPick } from '../../types';

export interface SmartPickCardProps {
  roomId: string;
  isHost: boolean;
  smartPicks?: ScoredPick[];
  activePickIndex?: number;
  places?: Place[];
  onOpenWheel: () => void;
}

export const SmartPickCard: React.FC<SmartPickCardProps> = ({
  roomId,
  isHost,
  smartPicks: propPicks,
  activePickIndex: propActiveIndex,
  places: propPlaces,
  onOpenWheel,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const storePicks = useDecisionStore((s) => s.smartPicks);
  const smartPicks = propPicks ?? storePicks;

  const storeActiveIndex = useDecisionStore((s) => s.activePickIndex);
  const activePickIndex = propActiveIndex ?? storeActiveIndex;

  const nextPick = useDecisionStore((s) => s.nextPick);
  const createDecision = useDecisionStore((s) => s.createDecision);
  const acceptDecision = useDecisionStore((s) => s.acceptDecision);
  const isSubmitting = useDecisionStore((s) => s.isSubmitting);

  const storePlaces = usePlaceStore((s) => s.places);
  const places = propPlaces ?? storePlaces;

  const [localError, setLocalError] = useState<string | null>(null);

  if (!smartPicks || smartPicks.length === 0) {
    return (
      <EmptyState
        icon={<Sparkle size={28} className="text-accent" />}
        title={t('decide.smart.emptyTitle')}
        description={t('decide.smart.emptyDesc')}
        action={
          <Button variant="secondary" size="md" onClick={onOpenWheel} leftIcon={<Shuffle size={16} />}>
            {t('decide.smart.emptyAction')}
          </Button>
        }
      />
    );
  }

  const currentPick = smartPicks[activePickIndex] || smartPicks[0];
  const place = places.find((p) => p.id === currentPick.place_id);

  const scorePct =
    currentPick.score <= 1
      ? Math.round(currentPick.score * 100)
      : Math.min(100, Math.round(currentPick.score));

  const translatedReasons = describeReasons(currentPick.reason_codes, currentPick.reasons, t).slice(0, 3);

  const handleAcceptSmartPick = async () => {
    if (!isHost) return;
    setLocalError(null);
    try {
      const res = await createDecision(roomId, {
        mode: 'SMART',
        candidate_place_ids: [currentPick.place_id],
      });
      if (res && res.session?.id) {
        await acceptDecision(roomId, res.session.id);
        toast.success(t('decide.smart.success'));
      }
    } catch (err: unknown) {
      setLocalError(describeApiError(err, t, 'VOTE_FAILED'));
    }
  };

  return (
    <div
      data-testid="smart-pick-card"
      className="space-y-4 bg-surface rounded-card border border-line p-5 shadow-sm"
    >
      {/* Thanh tiêu đề thẻ */}
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Sparkle size={16} weight="fill" className="text-accent" aria-hidden="true" />
          <span className="text-caption font-semibold text-accent-text">
            {t('decide.smart.badge')}
          </span>
        </div>
        <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-surface-2 text-ink-2">
          {t('decide.smart.progress', {
            current: activePickIndex + 1,
            total: smartPicks.length,
          })}
        </span>
      </div>

      {localError && (
        <div className="p-3 text-caption rounded-card bg-danger-soft text-danger border border-danger/20 font-medium">
          {localError}
        </div>
      )}

      {/* Thông tin địa điểm */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-title font-bold text-ink leading-snug truncate">
              {place?.name || t('decide.smart.defaultName')}
            </h3>
            {place?.address && (
              <p className="text-caption text-ink-2 mt-1 flex items-center gap-1 line-clamp-2">
                <MapPin size={14} className="flex-shrink-0 text-ink-3" />
                <span>{place.address}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-bold bg-accent-soft text-accent-text border border-accent/20">
              <ThumbsUp size={12} weight="fill" />
              <span>{place?.score ?? 0}</span>
            </span>
            <span className="text-caption text-ink-3 font-medium">
              {t('decide.smart.upvotesCount', { count: place?.upvotes ?? 0 })}
            </span>
          </div>
        </div>

        {/* Danh mục và chi phí */}
        <div className="flex flex-wrap items-center gap-2 text-caption text-ink-2">
          {place?.category && (
            <span className="px-2 py-0.5 rounded-full font-semibold bg-surface-2 text-ink">
              {t(`category.${place.category.toLowerCase()}`, { defaultValue: t('category.other') })}
            </span>
          )}
          {place?.estimated_cost !== undefined && place.estimated_cost !== null && (
            <span className="font-medium text-ink-2">
              • ~{formatMoney(place.estimated_cost, lang)}
            </span>
          )}
        </div>

        {/* Điểm tổng hợp thanh ngang mảnh */}
        <div className="pt-1 space-y-1">
          <div className="flex items-center justify-between text-caption text-ink-2 font-medium">
            <span>{t('decide.smart.scoreLabel')}</span>
            <span className="font-semibold text-ink">
              {t('decide.smart.scoreValue', { score: scorePct })}
            </span>
          </div>
          <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-300"
              style={{ width: `${scorePct}%` }}
            />
          </div>
        </div>

        {/* Danh sách lý do tối đa 3 */}
        <div className="pt-2">
          <p className="text-caption font-semibold text-ink mb-2">
            {t('decide.smart.whyTitle')}
          </p>
          <div className="flex flex-wrap gap-2">
            {translatedReasons.length > 0 ? (
              translatedReasons.map((reason: string, idx: number) => (
                <span
                  key={idx}
                  data-testid="smart-pick-reason-chip"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-medium bg-surface-2 text-ink border border-line"
                >
                  <Check size={14} className="text-success flex-shrink-0" />
                  <span>{reason}</span>
                </span>
              ))
            ) : (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-caption text-ink-2 bg-surface-2">
                {t('decide.smart.defaultReason')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Nút hành động */}
      <div className="pt-3 border-t border-line flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {isHost ? (
          <Button
            variant="primary"
            onClick={handleAcceptSmartPick}
            loading={isSubmitting}
            leftIcon={<Sparkle size={16} />}
            className="flex-1"
          >
            {t('decide.smart.lockIn')}
          </Button>
        ) : (
          <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[10rem] px-4 py-2.5 text-center text-caption text-ink-2 bg-surface-2 rounded-card border border-line">
            {t('decide.smart.waitingHost')}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={nextPick}
            disabled={smartPicks.length <= 1 || isSubmitting}
            className="flex-1 sm:flex-initial"
          >
            {t('decide.smart.nextPick')}
          </Button>

          <Button
            variant="ghost"
            onClick={onOpenWheel}
            disabled={isSubmitting}
            leftIcon={<Shuffle size={16} />}
            className="flex-1 sm:flex-initial"
          >
            {t('decide.smart.playGame')}
          </Button>
        </div>
      </div>
    </div>
  );
};
