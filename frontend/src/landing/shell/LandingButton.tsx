import React from 'react';

export interface LandingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = coral, chữ đêm (cấm chữ trắng trên coral); ghost = viền đêm, chữ trăng. */
  variant?: 'primary' | 'ghost';
  /** md = 52px (CTA hero/cuối trang); sm = 44px (thanh đỉnh). */
  size?: 'md' | 'sm';
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold leading-[1.2] whitespace-nowrap ' +
  'transition-[background-color,border-color,transform] duration-[var(--t-hover)] ease-[var(--ease-out)] ' +
  'active:scale-[0.97] motion-reduce:active:scale-100';

const VARIANT = {
  primary: 'bg-accent text-night [@media(hover:hover)]:hover:bg-accent-hover',
  ghost:
    'border border-night-line bg-transparent text-night-moon [@media(hover:hover)]:hover:border-night-moon-3 [@media(hover:hover)]:hover:bg-night-3',
} as const;

const SIZE = {
  md: 'min-h-[52px] px-[26px] py-3 text-base',
  sm: 'min-h-[44px] px-[18px] py-2.5 text-sm',
} as const;

/** Nút trên nền đêm của landing (mock v3 `.btn`). Mặc định `type="button"`. */
export const LandingButton: React.FC<LandingButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}) => (
  <button type={type} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest} />
);
