import React from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedProps<T>): React.ReactElement {
  const itemPadding =
    size === 'sm' ? 'px-3 py-1 text-caption' : 'px-4 py-1.5 text-label';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center p-1 rounded-full bg-surface-2 border border-line ${
        disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
      } ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <button
            key={String(option.value)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            disabled={isOptionDisabled}
            onClick={() => {
              if (!isOptionDisabled && !isSelected) {
                onChange(option.value);
              }
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-full ${
              !isOptionDisabled ? 'pressable' : ''
            } whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${itemPadding} ${
              isSelected
                ? 'bg-surface text-ink font-semibold shadow-sm'
                : 'text-ink-2 font-medium [@media(hover:hover)]:hover:text-ink'
            } ${isOptionDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {option.icon && (
              <span className="flex-shrink-0 inline-flex items-center">{option.icon}</span>
            )}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
