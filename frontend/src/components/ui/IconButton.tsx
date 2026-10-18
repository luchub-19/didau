import React from 'react';
import { CircleNotch } from './Icon';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  'aria-label': string; // Bắt buộc aria-label phục vụ a11y (DESIGN.md §6)
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      'aria-label': ariaLabel,
      icon,
      variant = 'ghost',
      loading = false,
      disabled,
      className = '',
      onClick,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const isActuallyDisabled = disabled || loading;

    let variantClasses = '';
    switch (variant) {
      case 'primary':
        variantClasses =
          'bg-accent text-ink font-semibold [@media(hover:hover)]:hover:bg-accent-hover active:opacity-90';
        break;
      case 'secondary':
        variantClasses =
          'bg-surface-2 text-ink border border-line [@media(hover:hover)]:hover:bg-line active:opacity-90';
        break;
      case 'ghost':
        variantClasses =
          'bg-transparent text-ink-2 [@media(hover:hover)]:hover:bg-surface-2 [@media(hover:hover)]:hover:text-ink active:opacity-90';
        break;
      case 'danger':
        variantClasses =
          'bg-danger-soft text-danger border border-danger/20 [@media(hover:hover)]:hover:bg-danger/20 active:opacity-90';
        break;
    }

    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        aria-busy={loading ? 'true' : undefined}
        disabled={isActuallyDisabled}
        onClick={(e) => {
          if (isActuallyDisabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full inline-flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text focus-visible:outline-offset-2 ${
          isActuallyDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
        } ${variantClasses} ${className}`}
        {...rest}
      >
        {loading ? (
          <CircleNotch size={18} className="animate-spin flex-shrink-0" />
        ) : (
          icon
        )}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
