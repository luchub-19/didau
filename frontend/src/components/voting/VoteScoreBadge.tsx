import React from 'react';

export interface VoteScoreBadgeProps {
  score: number;
  upvotes: number;
  downvotes: number;
  className?: string;
}

export const VoteScoreBadge: React.FC<VoteScoreBadgeProps> = ({
  score,
  upvotes,
  downvotes,
  className = '',
}) => {
  const scoreColor =
    score > 0
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : score < 0
      ? 'text-rose-700 bg-rose-50 border-rose-200'
      : 'text-slate-600 bg-slate-50 border-slate-200';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${scoreColor} ${className}`}
      title={`Điểm: ${score} (+${upvotes} / -${downvotes})`}
    >
      <span>{score > 0 ? `+${score}` : score}</span>
      <span className="text-[10px] font-medium text-slate-400">
        (+{upvotes}/-{downvotes})
      </span>
    </div>
  );
};
