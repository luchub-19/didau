import React from 'react';
import { CircleNotch } from './Icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      onClick,
      type = 'button',
      ...rest
    },
    ref,
  ) => {
    const isActuallyDisabled = disabled || loading;

    // Kích thước chuẩn vùng chạm (DESIGN.md §4: md 44px, lg 52px)
    const sizeClasses =
      size === 'lg'
        ? 'min-h-[52px] px-6 py-3 text-body'
        : 'min-h-[44px] px-5 py-2.5 text-label';

    // Biến thể màu qua token thiết kế (DESIGN.md §2, cấm chữ trắng trên coral)
    let variantClasses = '';
    switch (variant) {
      case 'primary':
        variantClasses =
          'bg-accent text-ink font-semibold [@media(hover:hover)]:hover:bg-accent-hover';
        break;
      case 'secondary':
        variantClasses =
          'bg-surface-2 text-ink font-semibold border border-line [@media(hover:hover)]:hover:bg-line';
        break;
      case 'ghost':
        variantClasses =
          'bg-transparent text-ink-2 font-medium [@media(hover:hover)]:hover:bg-surface-2 [@media(hover:hover)]:hover:text-ink';
        break;
      case 'danger':
        variantClasses =
          'bg-danger-soft text-danger font-semibold border border-danger/20 [@media(hover:hover)]:hover:bg-danger/20';
        break;
    }

    const spinnerSize = size === 'lg' ? 20 : 18;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isActuallyDisabled}
        aria-busy={loading ? 'true' : undefined}
        onClick={(e) => {
          if (isActuallyDisabled) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        className={`inline-flex items-center justify-center gap-2 rounded-full pressable focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text focus-visible:outline-offset-2 ${
          fullWidth ? 'w-full' : ''
        } ${
          isActuallyDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''
        } ${sizeClasses} ${variantClasses} ${className}`}
        {...rest}
      >
        {loading ? (
          <CircleNotch size={spinnerSize} className="animate-spin flex-shrink-0" />
        ) : (
          leftIcon && <span className="flex-shrink-0 inline-flex items-center">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && rightIcon && (
          <span className="flex-shrink-0 inline-flex items-center">{rightIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
