import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const scoreColor =
    score > 0
      ? 'text-accent-text bg-accent-soft border-accent/20'
      : score < 0
      ? 'text-danger bg-danger-soft border-danger/20'
      : 'text-ink-2 bg-surface-2 border-line';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-card border text-caption font-bold tabular-nums ${scoreColor} ${className}`}
      title={t('vote.scoreTitle', { score, upvotes, downvotes })}
    >
      <span>{score > 0 ? `+${score}` : score}</span>
      <span className="text-[10px] font-medium opacity-75">
        (+{upvotes}/-{downvotes})
      </span>
    </div>
  );
};
