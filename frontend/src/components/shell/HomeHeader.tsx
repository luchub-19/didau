import React from 'react';
import { Wordmark } from './Wordmark';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { SoundToggle } from '../../sound';

export interface HomeHeaderProps {
  /** 'stage': nằm đè lên bản đồ hero (nền giấy mờ sau wordmark, căn với khung chữ hero). */
  variant?: 'default' | 'stage';
}

/** Thanh trên của trang chủ: wordmark bên trái, bật âm + đổi ngôn ngữ bên phải (trong phòng dùng RoomTopBar). */
export const HomeHeader: React.FC<HomeHeaderProps> = ({ variant = 'default' }) => {
  if (variant === 'stage') {
    return (
      <header className="w-full max-w-7xl mx-auto px-3 md:px-6 pt-3 md:pt-5 flex items-center justify-between">
        <span className="inline-flex items-center min-h-[44px] px-3 py-2 rounded-field bg-[rgb(var(--stage-paper)/0.94)]">
          <Wordmark size={26} inkColor="rgb(var(--stage-ink))" />
        </span>
        <div className="flex items-center gap-2">
          <SoundToggle />
          <LanguageSwitcher />
        </div>
      </header>
    );
  }

  return (
    <header className="w-full max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
      <Wordmark size={26} />
      <div className="flex items-center gap-2">
        <SoundToggle />
        <LanguageSwitcher />
      </div>
    </header>
  );
};

export const Header = HomeHeader;
