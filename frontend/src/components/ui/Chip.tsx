import React from 'react';
import { X } from './Icon';
import { useTranslation } from 'react-i18next';

export interface ChipProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
  category?:
    | 'FOOD'
    | 'DRINK'
    | 'ENTERTAINMENT'
    | 'SIGHTSEEING'
    | 'ACCOMMODATION'
    | 'SHOPPING'
    | 'OTHER';
}

const CATEGORY_STYLES: Record<
  NonNullable<ChipProps['category']>,
  { soft: string; text: string; activeRing: string }
> = {
  FOOD: {
    soft: 'bg-cat-food-soft',
    text: 'text-cat-food',
    activeRing: 'ring-1 ring-cat-food',
  },
  DRINK: {
    soft: 'bg-cat-drink-soft',
    text: 'text-cat-drink',
    activeRing: 'ring-1 ring-cat-drink',
  },
  ENTERTAINMENT: {
    soft: 'bg-cat-entertainment-soft',
    text: 'text-cat-entertainment',
    activeRing: 'ring-1 ring-cat-entertainment',
  },
  SIGHTSEEING: {
    soft: 'bg-cat-sightseeing-soft',
    text: 'text-cat-sightseeing',
    activeRing: 'ring-1 ring-cat-sightseeing',
  },
  ACCOMMODATION: {
    soft: 'bg-cat-accommodation-soft',
    text: 'text-cat-accommodation',
    activeRing: 'ring-1 ring-cat-accommodation',
  },
  SHOPPING: {
    soft: 'bg-cat-shopping-soft',
    text: 'text-cat-shopping',
    activeRing: 'ring-1 ring-cat-shopping',
  },
  OTHER: {
    soft: 'bg-cat-other-soft',
    text: 'text-cat-other',
    activeRing: 'ring-1 ring-cat-other',
  },
};

export const Chip: React.FC<ChipProps> = ({
  children,
  selected = false,
  onClick,
  icon,
  onRemove,
  disabled = false,
  className = '',
  category,
}) => {
  const { t } = useTranslation();

  let stateClasses = 'bg-surface-2 text-ink-2 [@media(hover:hover)]:hover:bg-line';

  if (selected) {
    if (category && CATEGORY_STYLES[category]) {
      const cat = CATEGORY_STYLES[category];
      stateClasses = `${cat.soft} ${cat.text} ${cat.activeRing} font-semibold`;
    } else {
      stateClasses =
        'bg-accent-soft text-accent-text border border-accent/20 font-semibold';
    }
  }

  const isClickable = !!onClick && !disabled;

  return (
    <button
      type="button"
      role="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={isClickable ? onClick : undefined}
      className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-label font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text focus-visible:outline-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
      } ${!isClickable ? 'cursor-default' : 'cursor-pointer'} ${stateClasses} ${className}`}
    >
      {icon && <span className="flex-shrink-0 inline-flex items-center">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={t('ui.clear')}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-ink/10 transition-colors inline-flex items-center justify-center text-current"
        >
          <X size={14} />
        </button>
      )}
    </button>
  );
};
