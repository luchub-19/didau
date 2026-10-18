import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlaceStore } from '../../store/usePlaceStore';
import { toast } from '../ui/toastStore';
import { ThumbsUp, ThumbsDown } from '../ui/Icon';
import type { VoteValue } from '../../types';

export interface VoteButtonsProps {
  roomId: string;
  placeId: string;
  upvotes: number;
  downvotes: number;
  score: number;
  currentUserVote: VoteValue;
  disabled?: boolean;
}

export const VoteButtons: React.FC<VoteButtonsProps> = ({
  roomId,
  placeId,
  upvotes,
  downvotes,
  score,
  currentUserVote,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const castVote = usePlaceStore((s) => s.castVote);
  const retractVote = usePlaceStore((s) => s.retractVote);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isUpvoted = currentUserVote === 1;
  const isDownvoted = currentUserVote === -1;

  const handleUpvote = async () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (isUpvoted) {
        await retractVote(roomId, placeId);
      } else {
        await castVote(roomId, placeId, 1);
      }
    } catch {
      toast.error(t('vote.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownvote = async () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (isDownvoted) {
        await retractVote(roomId, placeId);
      } else {
        await castVote(roomId, placeId, -1);
      }
    } catch {
      toast.error(t('vote.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const scoreColor =
    score > 0
      ? 'text-accent-text font-bold'
      : score < 0
      ? 'text-danger font-bold'
      : 'text-ink-2 font-medium';

  return (
    <div
      role="group"
      aria-label={t('vote.scoreTitle', { score, upvotes, downvotes })}
      className="inline-flex items-center bg-surface-2 border border-line rounded-card p-0.5 select-none"
    >
      {/* Nút Thích (+1) */}
      <button
        type="button"
        onClick={handleUpvote}
        disabled={disabled || isSubmitting}
        aria-pressed={isUpvoted}
        aria-label={isUpvoted ? t('vote.cancelAgree') : t('vote.agree')}
        title={isUpvoted ? t('vote.cancelAgree') : t('vote.agree')}
        className={`min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-field inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-50 disabled:cursor-not-allowed ${
          isUpvoted
            ? 'bg-accent-soft text-accent-text border border-accent/30 font-bold'
            : 'text-ink-2 [@media(hover:hover)]:hover:bg-surface [@media(hover:hover)]:hover:text-ink active:bg-line'
        }`}
      >
        <ThumbsUp
          size={18}
          weight={isUpvoted ? 'fill' : 'regular'}
          className="transition-transform active:scale-125 shrink-0"
        />
        <span className="text-caption font-semibold tabular-nums">{upvotes}</span>
      </button>

      {/* Điểm tổng */}
      <div
        className={`px-1.5 text-caption min-w-[28px] text-center tabular-nums ${scoreColor}`}
        title={t('vote.scoreTitle', { score, upvotes, downvotes })}
      >
        {score > 0 ? `+${score}` : score}
      </div>

      {/* Nút Không thích (-1) */}
      <button
        type="button"
        onClick={handleDownvote}
        disabled={disabled || isSubmitting}
        aria-pressed={isDownvoted}
        aria-label={isDownvoted ? t('vote.cancelDisagree') : t('vote.disagree')}
        title={isDownvoted ? t('vote.cancelDisagree') : t('vote.disagree')}
        className={`min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-field inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-50 disabled:cursor-not-allowed ${
          isDownvoted
            ? 'bg-danger-soft text-danger border border-danger/30 font-bold'
            : 'text-ink-2 [@media(hover:hover)]:hover:bg-surface [@media(hover:hover)]:hover:text-ink active:bg-line'
        }`}
      >
        <ThumbsDown
          size={18}
          weight={isDownvoted ? 'fill' : 'regular'}
          className="transition-transform active:scale-125 shrink-0"
        />
        <span className="text-caption font-semibold tabular-nums">{downvotes}</span>
      </button>
    </div>
  );
};
