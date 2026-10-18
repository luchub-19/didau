import React from 'react';
import type { PlaceCategory } from '../../types';
import i18n from '../../i18n';
import {
  BowlFood,
  Coffee,
  GameController,
  Camera,
  Bed,
  ShoppingBag,
  MapPin,
  type IconProps,
} from '../ui/Icon';

export type CategoryLabelKey =
  | 'category.all'
  | 'category.food'
  | 'category.drink'
  | 'category.entertainment'
  | 'category.sightseeing'
  | 'category.accommodation'
  | 'category.shopping'
  | 'category.other';

export interface CategoryMetadataItem {
  key: PlaceCategory;
  labelKey: CategoryLabelKey;
  label: string;
  icon: React.ReactNode;
  IconComponent: React.ComponentType<IconProps>;
  bg: string;
  text: string;
  border: string;
  softBg: string;
  softText: string;
}

export const CATEGORY_METADATA: Record<PlaceCategory, CategoryMetadataItem> = {
  FOOD: {
    key: 'FOOD',
    labelKey: 'category.food',
    get label() {
      return i18n.t('category.food');
    },
    IconComponent: BowlFood,
    icon: React.createElement(BowlFood, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-food-soft',
    text: 'text-cat-food',
    border: 'border-cat-food/20',
    softBg: 'bg-cat-food-soft',
    softText: 'text-cat-food',
  },
  DRINK: {
    key: 'DRINK',
    labelKey: 'category.drink',
    get label() {
      return i18n.t('category.drink');
    },
    IconComponent: Coffee,
    icon: React.createElement(Coffee, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-drink-soft',
    text: 'text-cat-drink',
    border: 'border-cat-drink/20',
    softBg: 'bg-cat-drink-soft',
    softText: 'text-cat-drink',
  },
  ENTERTAINMENT: {
    key: 'ENTERTAINMENT',
    labelKey: 'category.entertainment',
    get label() {
      return i18n.t('category.entertainment');
    },
    IconComponent: GameController,
    icon: React.createElement(GameController, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-entertainment-soft',
    text: 'text-cat-entertainment',
    border: 'border-cat-entertainment/20',
    softBg: 'bg-cat-entertainment-soft',
    softText: 'text-cat-entertainment',
  },
  SIGHTSEEING: {
    key: 'SIGHTSEEING',
    labelKey: 'category.sightseeing',
    get label() {
      return i18n.t('category.sightseeing');
    },
    IconComponent: Camera,
    icon: React.createElement(Camera, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-sightseeing-soft',
    text: 'text-cat-sightseeing',
    border: 'border-cat-sightseeing/20',
    softBg: 'bg-cat-sightseeing-soft',
    softText: 'text-cat-sightseeing',
  },
  ACCOMMODATION: {
    key: 'ACCOMMODATION',
    labelKey: 'category.accommodation',
    get label() {
      return i18n.t('category.accommodation');
    },
    IconComponent: Bed,
    icon: React.createElement(Bed, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-accommodation-soft',
    text: 'text-cat-accommodation',
    border: 'border-cat-accommodation/20',
    softBg: 'bg-cat-accommodation-soft',
    softText: 'text-cat-accommodation',
  },
  SHOPPING: {
    key: 'SHOPPING',
    labelKey: 'category.shopping',
    get label() {
      return i18n.t('category.shopping');
    },
    IconComponent: ShoppingBag,
    icon: React.createElement(ShoppingBag, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-shopping-soft',
    text: 'text-cat-shopping',
    border: 'border-cat-shopping/20',
    softBg: 'bg-cat-shopping-soft',
    softText: 'text-cat-shopping',
  },
  OTHER: {
    key: 'OTHER',
    labelKey: 'category.other',
    get label() {
      return i18n.t('category.other');
    },
    IconComponent: MapPin,
    icon: React.createElement(MapPin, { weight: 'fill', className: 'w-4 h-4 inline-block shrink-0' }),
    bg: 'bg-cat-other-soft',
    text: 'text-cat-other',
    border: 'border-cat-other/20',
    softBg: 'bg-cat-other-soft',
    softText: 'text-cat-other',
  },
};
