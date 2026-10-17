import React from 'react';
import type { Place, PlaceCategory } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';

export interface CategoryFilterProps {
  places: Place[];
  selectedCategory: PlaceCategory | 'ALL';
  onSelectCategory: (category: PlaceCategory | 'ALL') => void;
  className?: string;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  places,
  selectedCategory,
  onSelectCategory,
  className = '',
}) => {
  // Compute counts
  const counts: Record<string, number> = {
    ALL: places.length,
  };

  (Object.keys(CATEGORY_METADATA) as PlaceCategory[]).forEach((cat) => {
    counts[cat] = places.filter((p) => p.category === cat).length;
  });

  const categories: Array<{ id: PlaceCategory | 'ALL'; label: string; icon: string }> = [
    { id: 'ALL', label: 'Tất cả', icon: '✨' },
    { id: 'FOOD', label: 'Ăn uống', icon: '🍜' },
    { id: 'DRINK', label: 'Cà phê', icon: '☕' },
    { id: 'ENTERTAINMENT', label: 'Vui chơi', icon: '🎮' },
    { id: 'SIGHTSEEING', label: 'Check-in', icon: '🏛️' },
    { id: 'ACCOMMODATION', label: 'Lưu trú', icon: '🏨' },
    { id: 'SHOPPING', label: 'Mua sắm', icon: '🛍️' },
    { id: 'OTHER', label: 'Khác', icon: '📍' },
  ];

  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none ${className}`}>
      {categories.map((cat) => {
        const isSelected = selectedCategory === cat.id;
        const count = counts[cat.id] || 0;

        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
              isSelected
                ? 'bg-sky-500 text-white border-sky-500 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
            <span
              className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                isSelected
                  ? 'bg-white/25 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
