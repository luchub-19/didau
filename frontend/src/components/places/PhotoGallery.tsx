import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { ArrowLeft, ArrowRight } from '../ui/Icon';
import { useMotionTier } from '../../motion/useMotionTier';
import type { PlaceCategory } from '../../types';

export interface GalleryPhoto {
  src: string;
  alt: string;
}

export interface PhotoGalleryProps {
  photos: readonly GalleryPhoto[];
  /** Không có ảnh → minh hoạ danh mục đầy khung. */
  category: PlaceCategory;
  /** Tên quán, dùng cho nhãn vùng ảnh. */
  placeName: string;
  /** `panel` 230px (desktop), `screen` 280px (mobile toàn màn) — DESIGN gđ5 §6.1. */
  size: 'panel' | 'screen';
}

const HEIGHT = { panel: 'h-[230px]', screen: 'h-[280px]' } as const;

/**
 * Bộ ảnh quán: cuộn ngang có snap (vuốt trên điện thoại), ← → khi focus vào vùng ảnh, nút trước/sau, chấm trang và
 * "1/N". Khung cao cố định nên ảnh tải sau không xô bố cục (CLS 0). Ảnh `loading="lazy"`.
 */
export const PhotoGallery: React.FC<PhotoGalleryProps> = ({ photos, category, placeName, size }) => {
  const { t } = useTranslation();
  const tier = useMotionTier();
  const trackId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = photos.length;

  // Đổi quán (↑ ↓) → về ảnh đầu
  const firstSrc = photos[0]?.src;
  useEffect(() => {
    setIndex(0);
    trackRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [firstSrc]);

  const goTo = useCallback(
    (next: number) => {
      const el = trackRef.current;
      if (!el || count === 0) return;
      const i = Math.max(0, Math.min(count - 1, next));
      setIndex(i);
      el.scrollTo({ left: i * el.clientWidth, behavior: tier === 'static' ? 'auto' : 'smooth' });
    },
    [count, tier],
  );

  // Vị trí cuộn (vuốt tay) → trang hiện tại
  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  if (count === 0) {
    const meta = CATEGORY_METADATA[category] ?? CATEGORY_METADATA.OTHER;
    const Icon = meta.IconComponent;
    return (
      <div
        className={`${HEIGHT[size]} w-full flex items-center justify-center ${meta.bg} ${meta.text}`}
        data-testid="gallery-illustration"
        role="img"
        aria-label={t('place.detail.illustration', { category: t(meta.labelKey) })}
      >
        <Icon size={size === 'screen' ? 96 : 80} weight="duotone" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={`relative ${HEIGHT[size]} w-full bg-surface-2 group`}
      role="region"
      aria-roledescription={t('place.detail.galleryRole')}
      aria-label={t('place.detail.galleryLabel', { name: placeName })}
      data-testid="photo-gallery"
    >
      <div
        id={trackId}
        ref={trackRef}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
        aria-label={t('place.detail.galleryHint')}
      >
        {photos.map((p, i) => (
          <img
            key={p.src}
            src={p.src}
            alt={p.alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            aria-hidden={i !== index}
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <span
            className="absolute right-3 bottom-3 rounded-chip bg-ink/70 px-2.5 py-0.5 text-caption font-semibold text-bg tabular-nums"
            aria-live="polite"
          >
            {t('place.detail.photoCount', { current: index + 1, total: count })}
          </span>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 pointer-events-none" aria-hidden="true">
            {photos.map((p, i) => (
              <span
                key={p.src}
                className={`h-1.5 rounded-full transition-[width,opacity] ${i === index ? 'w-4 bg-bg' : 'w-1.5 bg-bg/60'}`}
              />
            ))}
          </div>
          {/* Nút trước/sau: luôn có trên màn không vuốt được; ẩn khi đang ở đầu/cuối */}
          {index > 0 && (
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              aria-controls={trackId}
              aria-label={t('place.detail.prevPhoto')}
              className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-ink shadow-float focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
          )}
          {index < count - 1 && (
            <button
              type="button"
              onClick={() => goTo(index + 1)}
              aria-controls={trackId}
              aria-label={t('place.detail.nextPhoto')}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-ink shadow-float focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <ArrowRight size={20} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
};
