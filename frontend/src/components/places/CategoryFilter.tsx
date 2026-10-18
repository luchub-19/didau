import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Place, PlaceCategory } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Chip } from '../ui/Chip';
import { Sparkle } from '../ui/Icon';

export interface CategoryFilterProps {
  places: Place[];
  selectedCategory: PlaceCategory | 'ALL';
  onSelectCategory: (category: PlaceCategory | 'ALL') => void;
  className?: string;
}

const CATEGORY_KEYS: PlaceCategory[] = [
  'FOOD',
  'DRINK',
  'ENTERTAINMENT',
  'SIGHTSEEING',
  'ACCOMMODATION',
  'SHOPPING',
  'OTHER',
];

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  places,
  selectedCategory,
  onSelectCategory,
  className = '',
}) => {
  const { t } = useTranslation();

  // Đếm số lượng quán theo từng danh mục
  const counts: Record<string, number> = {
    ALL: places.length,
  };

  CATEGORY_KEYS.forEach((cat) => {
    counts[cat] = places.filter((p) => p.category === cat).length;
  });

  return (
    <div
      role="region"
      aria-label={t('category.all')}
      className={`flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none ${className}`}
    >
      {/* Nút Tất cả */}
      <Chip
        selected={selectedCategory === 'ALL'}
        onClick={() => onSelectCategory('ALL')}
        icon={<Sparkle size={16} weight="fill" />}
      >
        <span>{t('category.all')}</span>
        <span className="ml-1 text-caption font-bold opacity-75 tabular-nums">
          {counts.ALL}
        </span>
      </Chip>

      {/* 7 Danh mục */}
      {CATEGORY_KEYS.map((catKey) => {
        const meta = CATEGORY_METADATA[catKey];
        const isSelected = selectedCategory === catKey;
        const IconComp = meta.IconComponent;

        return (
          <Chip
            key={catKey}
            selected={isSelected}
            category={catKey}
            onClick={() => onSelectCategory(catKey)}
            icon={<IconComp size={16} weight="fill" />}
          >
            <span>{meta.label}</span>
            <span className="ml-1 text-caption font-bold opacity-75 tabular-nums">
              {counts[catKey] || 0}
            </span>
          </Chip>
        );
      })}
    </div>
  );
};
