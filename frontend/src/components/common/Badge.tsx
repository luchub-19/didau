import React from 'react';
import type { MemberRole, PlaceStatus, RoomStatus } from '../../types';

export type BadgeVariant =
  | MemberRole
  | PlaceStatus
  | RoomStatus
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 font-semibold',
    md: 'text-xs px-2.5 py-1 font-semibold',
  }[size];

  const variantStyles: Record<BadgeVariant, string> = {
    // Roles
    HOST: 'bg-amber-100 text-amber-800 border-amber-200',
    MEMBER: 'bg-slate-100 text-slate-700 border-slate-200',

    // Place Status
    PROPOSED: 'bg-sky-50 text-sky-700 border-sky-200',
    VOTING: 'bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse',
    ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold',
    REJECTED: 'bg-rose-50 text-rose-700 border-rose-200 line-through opacity-70',
    VISITED: 'bg-purple-50 text-purple-700 border-purple-200',

    // Room Status
    PLANNING: 'bg-sky-100 text-sky-800 border-sky-300',
    FINALIZED: 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold',
    COMPLETED: 'bg-purple-100 text-purple-800 border-purple-300',
    ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-300',

    // General semantic
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-rose-100 text-rose-800 border-rose-200',
    info: 'bg-sky-100 text-sky-800 border-sky-200',
  };

  const style = variantStyles[variant] || variantStyles.default;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border tracking-wide uppercase ${sizeStyles} ${style} ${className}`}
    >
      {children}
    </span>
  );
};
