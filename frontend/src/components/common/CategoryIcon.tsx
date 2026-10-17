import React from 'react';
import type { PlaceCategory } from '../../types';
import { CATEGORY_METADATA } from './categoryMetadata';

export interface CategoryIconProps {
  category: PlaceCategory;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  category,
  showLabel = true,
  size = 'md',
  className = '',
}) => {
  const meta = CATEGORY_METADATA[category] || CATEGORY_METADATA.OTHER;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];

  if (!showLabel) {
    return (
      <span
        title={meta.label}
        className={`inline-flex items-center justify-center rounded-lg border ${meta.bg} ${meta.border} p-1.5 ${className}`}
      >
        <span className={iconSizes}>{meta.icon}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${meta.bg} ${meta.text} ${meta.border} ${sizeClasses} ${className}`}
    >
      <span className={iconSizes}>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
};
