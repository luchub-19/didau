import React, { useState } from 'react';
import { usePlaceStore } from '../../store/usePlaceStore';
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
  const castVote = usePlaceStore((s) => s.castVote);
  const retractVote = usePlaceStore((s) => s.retractVote);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUpvote = async () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (currentUserVote === 1) {
        await retractVote(roomId, placeId);
      } else {
        await castVote(roomId, placeId, 1);
      }
    } catch {
      // Handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownvote = async () => {
    if (disabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (currentUserVote === -1) {
        await retractVote(roomId, placeId);
      } else {
        await castVote(roomId, placeId, -1);
      }
    } catch {
      // Handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUpvoted = currentUserVote === 1;
  const isDownvoted = currentUserVote === -1;

  const scoreColor =
    score > 0
      ? 'text-emerald-600 font-extrabold'
      : score < 0
      ? 'text-rose-600 font-extrabold'
      : 'text-slate-600 font-semibold';

  return (
    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1 select-none">
      {/* Upvote button */}
      <button
        type="button"
        onClick={handleUpvote}
        disabled={disabled || isSubmitting}
        title={isUpvoted ? 'Hủy đồng ý' : 'Đồng ý (+1)'}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
          isUpvoted
            ? 'bg-emerald-500 text-white shadow-xs'
            : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg
          className="w-4 h-4 transition-transform active:scale-125"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 15l7-7 7 7"
          />
        </svg>
        <span>{upvotes}</span>
      </button>

      {/* Score */}
      <div
        className={`px-2 text-xs min-w-[28px] text-center ${scoreColor}`}
        title={`Tổng điểm: ${score} (+${upvotes} / -${downvotes})`}
      >
        {score > 0 ? `+${score}` : score}
      </div>

      {/* Downvote button */}
      <button
        type="button"
        onClick={handleDownvote}
        disabled={disabled || isSubmitting}
        title={isDownvoted ? 'Hủy phản đối' : 'Không thích (-1)'}
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
          isDownvoted
            ? 'bg-rose-500 text-white shadow-xs'
            : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg
          className="w-4 h-4 transition-transform active:scale-125"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M19 9l-7 7-7-7"
          />
        </svg>
        <span>{downvotes}</span>
      </button>
    </div>
  );
};
