import React, { useState } from 'react';
import type { PlaceReview } from '../../types';
import { reviewApi } from '../../services/api';
import { Button } from '../common';
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
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateReview(rating, comment);
    if (invalid) {
      setError(invalid);
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
      setError((err as { message?: string })?.message || 'Không thể gửi đánh giá.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5" data-testid="review-form">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Số sao">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sao`}
            onClick={() => setRating(n)}
            className={`text-xl leading-none transition ${
              n <= rating ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REVIEW_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={tags.includes(tag)}
            onClick={() => toggleTag(tag)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
              tags.includes(tag)
                ? 'bg-sky-100 border-sky-300 text-sky-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={REVIEW_COMMENT_MAX}
          rows={2}
          placeholder="Nhận xét ngắn về quán (không bắt buộc)"
          className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <p className="text-[10px] text-slate-400 text-right">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </p>
      </div>

      {error && (
        <p className="text-[11px] text-rose-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Hủy
          </Button>
        )}
        <Button type="submit" size="sm" isLoading={isSaving}>
          Gửi đánh giá
        </Button>
      </div>
    </form>
  );
};
