import React from 'react';
import { useTranslation } from 'react-i18next';

export interface HeroPosterProps {
  className?: string;
}

/**
 * Ảnh tĩnh cảnh 1 (chụp từ chính bản đồ hero): hiện ngay khi tải trang để làm LCP,
 * nằm dưới bản đồ cho tới khi bản đồ vẽ xong; cũng là nền của mức 'static'.
 */
export const HeroPoster: React.FC<HeroPosterProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  return (
    <picture>
      <source media="(max-width: 640px)" type="image/avif" srcSet="/hero/hero-1-tall.avif" />
      <source media="(max-width: 640px)" type="image/webp" srcSet="/hero/hero-1-tall.webp" />
      <source type="image/avif" srcSet="/hero/hero-1-wide.avif" />
      <img
        src="/hero/hero-1-wide.webp"
        alt={t('hero.posterAlt')}
        className={`w-full h-full object-cover ${className}`}
        loading="eager"
        decoding="async"
      />
    </picture>
  );
};
