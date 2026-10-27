import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '../ui/Icon';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

export interface HomeHeaderProps {
  /** 'stage': nằm đè lên bản đồ hero (nền giấy mờ sau wordmark, căn với khung chữ hero). */
  variant?: 'default' | 'stage';
}

/** Thanh trên của trang chủ: wordmark bên trái, đổi ngôn ngữ bên phải (trong phòng dùng RoomTopBar). */
export const HomeHeader: React.FC<HomeHeaderProps> = ({ variant = 'default' }) => {
  const { t } = useTranslation();

  if (variant === 'stage') {
    return (
      <header className="w-full max-w-7xl mx-auto px-3 md:px-6 pt-3 md:pt-5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-field bg-[rgb(var(--stage-paper)/0.9)] backdrop-blur-md text-heading font-bold text-[rgb(var(--stage-ink))] font-[family-name:var(--stage-font-display)]">
          <MapPin size={22} weight="fill" className="text-accent" aria-hidden="true" />
          {t('app.name')}
        </span>
        <LanguageSwitcher />
      </header>
    );
  }

  return (
    <header className="w-full max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-heading font-bold text-ink">
        <MapPin size={22} weight="fill" className="text-accent" aria-hidden="true" />
        {t('app.name')}
      </span>
      <LanguageSwitcher />
    </header>
  );
};

export const Header = HomeHeader;
