import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaceReview } from '../../types';
import { reviewApi } from '../../services/api';
import { Button, Chip, TextField, Star } from '../ui';
import { describeApiError } from '../../i18n/serverText';
import { REVIEW_COMMENT_MAX, REVIEW_TAGS, validateReview } from './reviewUtils';

export interface ReviewFormProps {
  externalKey: string;
  initial?: Pick<PlaceReview, 'rating' | 'comment' | 'tags'> | null;
  onSubmitted: (review: PlaceReview) => void;
  onCancel?: () => void;
}

export const ReviewForm: React.FC<ReviewFormProps> = ({
  externalKey,
  initial,
  onSubmitted,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const errorKey = validateReview(rating, comment);
    if (errorKey === 'review.error.commentTooLong') {
      setError(t('review.error.commentTooLong', { max: REVIEW_COMMENT_MAX }));
      return;
    }
    if (errorKey) {
      setError(t(errorKey));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const saved = await reviewApi.submitReview({
        external_key: externalKey,
        rating,
        comment: comment.trim() || null,
        tags,
      });
      onSubmitted(saved);
    } catch (err: unknown) {
      setError(describeApiError(err, t) || t('review.error.submitFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid="review-form">
      <div>
        <label className="block text-label font-medium text-ink mb-1">
          {t('review.starsAria')}
        </label>
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label={t('review.starsAria')}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t('review.starCount', { n })}
              onClick={() => {
                setRating(n);
                if (error) setError(null);
              }}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center text-2xl leading-none transition-colors rounded-field focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${
                n <= rating
                  ? 'text-warning'
                  : 'text-ink-3 hover:text-warning'
              }`}
            >
              <Star size={28} weight={n <= rating ? 'fill' : 'regular'} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('review.tagsLabel')}>
          {REVIEW_TAGS.map((tag) => (
            <Chip
              key={tag}
              selected={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            >
              {t(`review.tags.${tag}`, tag)}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <TextField
          as="textarea"
          label={t('review.commentLabel')}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            if (error) setError(null);
          }}
          maxLength={REVIEW_COMMENT_MAX}
          rows={3}
          placeholder={t('review.commentPlaceholder')}
          hint={`${comment.length}/${REVIEW_COMMENT_MAX}`}
          error={error ?? undefined}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('review.cancel')}
          </Button>
        )}
        <Button type="submit" variant="primary" loading={isSaving}>
          {t('review.submit')}
        </Button>
      </div>
    </form>
  );
};
