import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '../ui/Icon';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

/** Thanh trên của trang chủ: wordmark bên trái, đổi ngôn ngữ bên phải (trong phòng dùng RoomTopBar). */
export const HomeHeader: React.FC = () => {
  const { t } = useTranslation();

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
