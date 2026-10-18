import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> & {
  Text: React.FC<{ lines?: number; className?: string }>;
  Block: React.FC<{ className?: string }>;
  PlaceCard: React.FC<{ className?: string }>;
} = ({ className = '', ...rest }) => {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface-2 animate-pulse rounded-field ${className}`}
      {...rest}
    />
  );
};

Skeleton.Text = function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, idx) => (
        <div
          key={idx}
          className={`h-4 bg-surface-2 animate-pulse rounded ${
            idx === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
};

Skeleton.Block = function SkeletonBlock({ className = 'h-24 w-full' }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface-2 animate-pulse rounded-card ${className}`}
    />
  );
};

Skeleton.PlaceCard = function SkeletonPlaceCard({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`p-4 rounded-card bg-surface border border-line space-y-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-field bg-surface-2 animate-pulse flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-16 bg-surface-2 animate-pulse rounded" />
            <div className="h-5 w-36 bg-surface-2 animate-pulse rounded" />
          </div>
        </div>
        <div className="h-6 w-16 rounded-full bg-surface-2 animate-pulse" />
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="h-4 w-4/5 bg-surface-2 animate-pulse rounded" />
        <div className="h-4 w-2/5 bg-surface-2 animate-pulse rounded" />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-line">
        <div className="flex items-center gap-2">
          <div className="h-10 w-16 rounded-full bg-surface-2 animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-surface-2 animate-pulse" />
        </div>
        <div className="h-4 w-20 bg-surface-2 animate-pulse rounded" />
      </div>
    </div>
  );
};
