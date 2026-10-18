import React from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const meta = CATEGORY_METADATA[category] || CATEGORY_METADATA.OTHER;
  const label: string = t(meta.labelKey);

  const sizeClasses = {
    sm: 'text-caption px-2 py-0.5 gap-1',
    md: 'text-label px-2.5 py-1 gap-1.5',
    lg: 'text-body px-3 py-1.5 gap-2',
  }[size];

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  }[size];

  const IconComp = meta.IconComponent;

  if (!showLabel) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded-lg border ${meta.softBg} ${meta.softText} ${meta.border} p-1.5 ${className}`}
      >
        <IconComp size={iconSizes} weight="fill" className="shrink-0" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${meta.softBg} ${meta.softText} ${meta.border} ${sizeClasses} ${className}`}
    >
      <IconComp size={iconSizes} weight="fill" className="shrink-0" />
      <span>{label}</span>
    </span>
  );
};
