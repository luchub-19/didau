import React, { useState, useEffect, useRef } from 'react';
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
  upvotes = 0,
  downvotes = 0,
  score = 0,
  currentUserVote = 0,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const castVote = usePlaceStore((s) => s.castVote);
  const retractVote = usePlaceStore((s) => s.retractVote);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation states & previous value refs (T-53)
  const [popButton, setPopButton] = useState<'up' | 'down' | null>(null);
  const [scoreAnim, setScoreAnim] = useState<'up' | 'down' | null>(null);
  const [upvotesAnim, setUpvotesAnim] = useState<'up' | 'down' | null>(null);
  const [downvotesAnim, setDownvotesAnim] = useState<'up' | 'down' | null>(null);

  const prevScoreRef = useRef(score);
  const prevUpvotesRef = useRef(upvotes);
  const prevDownvotesRef = useRef(downvotes);

  const popTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upvotesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downvotesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hiệu ứng chuyển số mượt mà khi điểm/vote thay đổi (kể cả khi nhận qua WebSocket)
  useEffect(() => {
    if (score !== prevScoreRef.current) {
      const dir = score > prevScoreRef.current ? 'up' : 'down';
      prevScoreRef.current = score;
      if (scoreTimeoutRef.current) clearTimeout(scoreTimeoutRef.current);
      setScoreAnim(dir);
      scoreTimeoutRef.current = setTimeout(() => setScoreAnim(null), 180);
    }
  }, [score]);

  useEffect(() => {
    if (upvotes !== prevUpvotesRef.current) {
      const dir = upvotes > prevUpvotesRef.current ? 'up' : 'down';
      prevUpvotesRef.current = upvotes;
      if (upvotesTimeoutRef.current) clearTimeout(upvotesTimeoutRef.current);
      setUpvotesAnim(dir);
      upvotesTimeoutRef.current = setTimeout(() => setUpvotesAnim(null), 180);
    }
  }, [upvotes]);

  useEffect(() => {
    if (downvotes !== prevDownvotesRef.current) {
      const dir = downvotes > prevDownvotesRef.current ? 'up' : 'down';
      prevDownvotesRef.current = downvotes;
      if (downvotesTimeoutRef.current) clearTimeout(downvotesTimeoutRef.current);
      setDownvotesAnim(dir);
      downvotesTimeoutRef.current = setTimeout(() => setDownvotesAnim(null), 180);
    }
  }, [downvotes]);

  useEffect(() => {
    return () => {
      if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
      if (scoreTimeoutRef.current) clearTimeout(scoreTimeoutRef.current);
      if (upvotesTimeoutRef.current) clearTimeout(upvotesTimeoutRef.current);
      if (downvotesTimeoutRef.current) clearTimeout(downvotesTimeoutRef.current);
    };
  }, []);

  const isUpvoted = currentUserVote === 1;
  const isDownvoted = currentUserVote === -1;

  const handleUpvote = async () => {
    if (disabled || isSubmitting) return;
    if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
    setPopButton('up');
    popTimeoutRef.current = setTimeout(() => setPopButton(null), 180);

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
    if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
    setPopButton('down');
    popTimeoutRef.current = setTimeout(() => setPopButton(null), 180);

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
          popButton === 'up' ? 'vote-pop' : ''
        } ${
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
        <span
          className={`text-caption font-semibold tabular-nums inline-block ${
            upvotesAnim === 'up' ? 'num-slide-up' : upvotesAnim === 'down' ? 'num-slide-down' : ''
          }`}
        >
          {upvotes}
        </span>
      </button>

      {/* Điểm tổng */}
      <div
        className={`px-1.5 text-caption min-w-[28px] text-center tabular-nums overflow-hidden ${scoreColor}`}
        title={t('vote.scoreTitle', { score, upvotes, downvotes })}
      >
        <span
          className={`inline-block ${
            scoreAnim === 'up' ? 'num-slide-up' : scoreAnim === 'down' ? 'num-slide-down' : ''
          }`}
        >
          {score > 0 ? `+${score}` : score}
        </span>
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
          popButton === 'down' ? 'vote-pop' : ''
        } ${
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
        <span
          className={`text-caption font-semibold tabular-nums inline-block ${
            downvotesAnim === 'up' ? 'num-slide-up' : downvotesAnim === 'down' ? 'num-slide-down' : ''
          }`}
        >
          {downvotes}
        </span>
      </button>
    </div>
  );
};
