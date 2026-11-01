import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, PlaceCategory } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Avatar } from '../ui/Avatar';
import { Check, Plus } from '../ui/Icon';

export interface DiscoveryCardProps {
  name: string;
  category: PlaceCategory;
  /** Ảnh thu nhỏ thật; null → ô minh hoạ theo danh mục. */
  thumb: string | null;
  /** Một dòng meta (khoảng cách · giá · món). */
  meta: string;
  /** Đã trong danh sách → nút ＋ thành ✓ "Đã thêm". */
  added: boolean;
  adding?: boolean;
  /** Bấm thẻ = mở trang chi tiết. */
  onOpen: () => void;
  /** Thiếu thì không có nút ＋ (quán đã trong danh sách ở dải "Nhóm đang để ý"). */
  onAdd?: () => void;
  /** Dải "Nhóm đang để ý": người đang xem (tối đa 3 + "+N"). */
  viewers?: Member[];
  extraViewers?: number;
}

/** Thẻ gợi ý 200px: ảnh 4:3 · tên · 1 dòng meta · nút ＋ 44px thêm một chạm (DESIGN gđ5 §7). */
export const DiscoveryCard: React.FC<DiscoveryCardProps> = ({
  name,
  category,
  thumb,
  meta,
  added,
  adding = false,
  onOpen,
  onAdd,
  viewers,
  extraViewers = 0,
}) => {
  const { t } = useTranslation();
  const cat = CATEGORY_METADATA[category] ?? CATEGORY_METADATA.OTHER;
  const Icon = cat.IconComponent;

  return (
    <div
      data-testid="discovery-card"
      data-added={added ? 'true' : 'false'}
      className="group relative w-[200px] shrink-0 snap-start rounded-card border border-line bg-surface"
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-card text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
      >
        <span
          aria-hidden="true"
          className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-t-card ${cat.bg} ${cat.text}`}
        >
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <Icon size={36} weight="duotone" />
          )}
        </span>
        <span className="block px-3 pb-3 pt-2.5">
          <span className="block truncate text-[16px] font-semibold leading-snug text-ink">{name}</span>
          <span className="mt-0.5 block truncate text-[14px] text-ink-2">{meta}</span>
        </span>
      </button>

      {viewers && viewers.length > 0 && (
        <span className="absolute left-2 top-2 flex items-center -space-x-2" data-testid="discovery-viewers">
          {viewers.map((m) => (
            <Avatar
              key={m.id}
              name={m.nickname}
              avatarUrl={m.avatar_url}
              seed={m.id}
              size="sm"
              className="ring-2 ring-surface"
            />
          ))}
          {extraViewers > 0 && (
            <span className="ml-1 inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-surface px-1.5 text-caption font-semibold text-ink-2 ring-2 ring-surface">
              +{extraViewers}
            </span>
          )}
        </span>
      )}

      {added ? (
        <span
          data-testid="discovery-added"
          className="absolute right-2 top-2 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-surface px-3 text-label font-semibold text-success shadow-float"
        >
          <Check size={16} weight="bold" aria-hidden="true" />
          {t('discovery.added')}
        </span>
      ) : (
        onAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            aria-label={t('discovery.addAria', { name })}
            title={t('discovery.add')}
            data-testid="discovery-add"
            className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-ink shadow-float [@media(hover:hover)]:hover:bg-accent-hover transition-transform active:scale-95 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <Plus size={20} weight="bold" aria-hidden="true" />
          </button>
        )
      )}
    </div>
  );
};

/** Khung chờ của một thẻ (skeleton dải). */
export const DiscoveryCardSkeleton: React.FC = () => (
  <div aria-hidden="true" className="w-[200px] shrink-0 snap-start rounded-card border border-line bg-surface">
    <div className="aspect-[4/3] w-full animate-pulse rounded-t-card bg-surface-2" />
    <div className="space-y-2 px-3 pb-3 pt-2.5">
      <div className="h-4 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="h-3.5 w-3/5 animate-pulse rounded bg-surface-2" />
    </div>
  </div>
);
