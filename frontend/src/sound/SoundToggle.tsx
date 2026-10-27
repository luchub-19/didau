// Nút bật/tắt âm thanh khoảnh khắc (docs/phase4/DESIGN.md §5):
//   'icon'  góc phải header trang chủ, cạnh nút ngôn ngữ (aria-label sound.turnOn/turnOff)
//   'label' mục Cài đặt trong tab Nhóm (chữ "Âm thanh: bật/tắt")
// Bật trong handler click để AudioContext được tạo đúng trong cử chỉ người dùng.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpeakerHigh, SpeakerSlash } from '../components/ui/Icon';
import { useSound } from './useSound';

export interface SoundToggleProps {
  variant?: 'icon' | 'label';
  className?: string;
}

export const SoundToggle: React.FC<SoundToggleProps> = ({ variant = 'icon', className = '' }) => {
  const { t } = useTranslation();
  const { on, toggle } = useSound();
  const Icon = on ? SpeakerHigh : SpeakerSlash;

  if (variant === 'label') {
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        className={`min-h-[44px] px-4 inline-flex items-center gap-2 rounded-field border text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          on ? 'bg-accent-soft border-accent/40 text-accent-text' : 'bg-surface-2 border-line text-ink'
        } ${className}`}
      >
        <Icon size={18} aria-hidden="true" />
        {on ? t('sound.on') : t('sound.off')}
      </button>
    );
  }

  // Cao bằng khung LanguageSwitcher (44px nút + p-1 + viền) để hai nút đứng thẳng hàng
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t('sound.turnOff') : t('sound.turnOn')}
      title={on ? t('sound.turnOff') : t('sound.turnOn')}
      onClick={toggle}
      className={`h-[54px] w-[54px] inline-flex items-center justify-center rounded-field bg-surface-2 border border-line text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(hover:hover)]:hover:bg-line ${className}`}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
};
