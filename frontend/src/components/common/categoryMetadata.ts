import type { PlaceCategory } from '../../types';

export const CATEGORY_METADATA: Record<
  PlaceCategory,
  { label: string; icon: string; bg: string; text: string; border: string }
> = {
  FOOD: {
    label: 'Ăn uống',
    icon: '🍜',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  DRINK: {
    label: 'Cà phê & Đồ uống',
    icon: '☕',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  ENTERTAINMENT: {
    label: 'Vui chơi giải trí',
    icon: '🎮',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  SIGHTSEEING: {
    label: 'Tham quan check-in',
    icon: '🏛️',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  ACCOMMODATION: {
    label: 'Khách sạn / Homestay',
    icon: '🏨',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  SHOPPING: {
    label: 'Mua sắm',
    icon: '🛍️',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
  },
  OTHER: {
    label: 'Khác',
    icon: '📍',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  },
};
