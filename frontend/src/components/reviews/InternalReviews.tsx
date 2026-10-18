import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReviewSummary } from '../../types';
import { reviewApi } from '../../services/api';
import { tokenStorage } from '../../services/storage/tokenStorage';
import { Button, Chip, Star } from '../ui';
import { Users } from '../ui/Icon';
import { ReviewForm } from './ReviewForm';

export interface InternalReviewsProps {
  externalKey: string;
  /** Phong da COMPLETED: hien nhac "Danh gia cac quan hom nay?" */
  remindToReview?: boolean;
  /** Du lieu co san (SSR/test); bo qua lan tai dau tien. */
  initialSummary?: ReviewSummary | null;
}

export const InternalReviews: React.FC<InternalReviewsProps> = ({
  externalKey,
  remindToReview = false,
  initialSummary = null,
}) => {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<ReviewSummary | null>(initialSummary);
  const [loadError, setLoadError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await reviewApi.getReviews(externalKey));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [externalKey]);

  useEffect(() => {
    if (initialSummary) return;
    void load();
  }, [load, initialSummary]);

  const canReview = Boolean(tokenStorage.getToken());
  const count = summary?.count ?? 0;

  return (
    <div
      className="my-3 rounded-card border border-line bg-surface-2 p-3.5 space-y-2.5"
      data-testid="internal-reviews"
    >
      <div className="flex items-center justify-between">
        <span className="text-label font-semibold text-ink flex items-center gap-1.5">
          <Users size={16} className="text-ink-2" />
          <span>{t('review.title')}</span>
        </span>
        <span className="text-caption text-ink-3 font-medium" data-testid="reviews-avg">
          {count > 0
            ? t('review.summary', { avg: summary!.avg.toFixed(1), count })
            : t('review.empty')}
        </span>
      </div>

      {remindToReview && !isEditing && (
        <p className="text-caption font-medium text-warning bg-warning-soft rounded-field px-2.5 py-1.5 border border-warning/20">
          {t('review.remind')}
        </p>
      )}

      {loadError && (
        <p className="text-caption text-danger">{t('review.loadError')}</p>
      )}

      {summary && summary.tags_top3.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.tags_top3.map((tag) => (
            <Chip key={tag} disabled className="pointer-events-none">
              {t(`review.tags.${tag}`, tag)}
            </Chip>
          ))}
        </div>
      )}

      {summary && summary.items.length > 0 && (
        <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {summary.items.map((r) => (
            <li key={r.id} className="text-caption text-ink-2 border-b border-line/60 pb-1.5 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{r.nickname}</span>
                <span
                  className="inline-flex text-warning"
                  role="img"
                  aria-label={t('review.starCount', { n: r.rating })}
                >
                  {Array.from({ length: r.rating }, (_, i) => (
                    <Star key={i} size={14} weight="fill" aria-hidden="true" />
                  ))}
                </span>
              </div>
              {r.comment && <p className="mt-0.5 text-ink-2 leading-relaxed">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {isEditing ? (
        <ReviewForm
          externalKey={externalKey}
          onCancel={() => setIsEditing(false)}
          onSubmitted={() => {
            setIsEditing(false);
            void load();
          }}
        />
      ) : (
        canReview && (
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            {t('review.write')}
          </Button>
        )
      )}
    </div>
  );
};
