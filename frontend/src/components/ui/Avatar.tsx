import React from 'react';

export interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showTitle?: boolean;
}

// 6 cặp màu đạt tương phản cao từ token danh mục (DESIGN.md §2, §6, T-40)
const AVATAR_COLOR_PAIRS = [
  'bg-cat-food-soft text-cat-food border border-cat-food/20',
  'bg-cat-drink-soft text-cat-drink border border-cat-drink/20',
  'bg-cat-entertainment-soft text-cat-entertainment border border-cat-entertainment/20',
  'bg-cat-sightseeing-soft text-cat-sightseeing border border-cat-sightseeing/20',
  'bg-cat-accommodation-soft text-cat-accommodation border border-cat-accommodation/20',
  'bg-cat-shopping-soft text-cat-shopping border border-cat-shopping/20',
] as const;

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  size = 'md',
  className = '',
  showTitle = true,
}) => {
  const trimmed = name.trim();
  const firstChar = trimmed ? trimmed[0].toUpperCase() : '?';

  const colorIndex = hashString(trimmed || 'anonymous') % AVATAR_COLOR_PAIRS.length;
  const colorClasses = AVATAR_COLOR_PAIRS[colorIndex];

  let sizeClasses = 'w-10 h-10 text-label font-bold';
  if (size === 'sm') {
    sizeClasses = 'w-8 h-8 text-caption font-semibold';
  } else if (size === 'lg') {
    sizeClasses = 'w-12 h-12 text-heading font-bold';
  }

  return (
    <div
      title={showTitle ? name : undefined}
      aria-label={name}
      className={`rounded-field inline-flex items-center justify-center flex-shrink-0 select-none ${sizeClasses} ${colorClasses} ${className}`}
    >
      <span>{firstChar}</span>
    </div>
  );
};
