import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place, ScheduleItem } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { curatedPhotos, findCurated } from '../../room/curated';
import { useCuratedData } from '../../room/useCuratedData';
import { formatPriceShort } from '../../room/placeView';
import { splitLockedPlaces } from '../../room/budget';
import { ArrowRight, MapPin } from '../ui/Icon';

export interface LockedPlacesProps {
  places: Place[];
  schedule: ScheduleItem[];
  /** Bấm một quán: sáng ghim + mở chi tiết (cùng hành vi `onViewOnMap` của danh sách). */
  onOpenPlace: (place: Place) => void;
  /** "Xem lại N quán dự bị": quay về bước ② ở chế độ xem lại. */
  onReviewBackups: () => void;
}

/** Ảnh lớn khi có ảnh tuyển chọn; thiếu thì ô minh hoạ theo danh mục. */
const PlaceCover: React.FC<{ place: Place; tall?: boolean }> = ({ place, tall = false }) => {
  const curated = useCuratedData();
  const entry = curated ? findCurated(place, curated) : null;
  const src = entry ? curatedPhotos(entry, curated)[0]?.src : undefined;
  const meta = CATEGORY_METADATA[place.category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <span
      aria-hidden="true"
      data-testid="locked-cover"
      className={`flex w-full items-center justify-center overflow-hidden ${tall ? 'aspect-[4/3]' : 'h-16 w-16 shrink-0 rounded-field'} ${meta.bg} ${meta.text}`}
    >
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon size={tall ? 56 : 24} weight="duotone" />}
    </span>
  );
};

/**
 * Cột trái ở giai đoạn ③④: quán đã chốt (ảnh lớn), các điểm đi kèm trong lịch, liên kết xem lại quán dự bị.
 * Phiếu bầu đã xong nên không còn nút ♥ ở đây (DESIGN gđ5 §3).
 */
export const LockedPlaces: React.FC<LockedPlacesProps> = ({ places, schedule, onOpenPlace, onReviewBackups }) => {
  const { t } = useTranslation();
  const { main, companions, backups } = useMemo(() => splitLockedPlaces(places, schedule), [places, schedule]);

  if (!main) {
    return (
      <p className="rounded-card border border-line bg-surface-2 p-4 text-caption text-ink-2" data-testid="locked-empty">
        {t('plan.locked.empty')}
      </p>
    );
  }

  const price = formatPriceShort(main.estimated_cost);
  return (
    <div className="space-y-5" data-testid="locked-places">
      <section aria-labelledby="locked-main-title" className="space-y-3">
        <h2 id="locked-main-title" className="text-title text-ink">
          {t('plan.locked.title')}
        </h2>
        <button
          type="button"
          onClick={() => onOpenPlace(main)}
          className="block w-full overflow-hidden rounded-card border border-line bg-surface text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <PlaceCover place={main} tall />
          <span className="block space-y-1 p-4">
            <span className="block text-heading font-semibold text-ink">{main.name}</span>
            {main.address && (
              <span className="flex items-center gap-1 text-caption text-ink-2">
                <MapPin size={14} className="shrink-0 text-ink-3" />
                <span className="truncate">{main.address}</span>
              </span>
            )}
            <span className="block text-caption tabular-nums text-ink-2">{price ?? t('budget.unknownShort')}</span>
          </span>
        </button>
      </section>

      {companions.length > 0 && (
        <section aria-labelledby="locked-companions-title" className="space-y-2">
          <h3 id="locked-companions-title" className="text-label font-semibold text-ink-2">
            {t('plan.locked.companions')}
          </h3>
          <ul className="space-y-2">
            {companions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenPlace(p)}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-card border border-line bg-surface p-2 text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
                >
                  <PlaceCover place={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-ink">{p.name}</span>
                    <span className="block text-caption tabular-nums text-ink-2">
                      {formatPriceShort(p.estimated_cost) ?? t('budget.unknownShort')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {backups.length > 0 && (
        <button
          type="button"
          onClick={onReviewBackups}
          data-testid="review-backups"
          className="inline-flex min-h-[44px] items-center gap-1 text-label font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('plan.locked.backups', { count: backups.length })}
          <ArrowRight size={14} weight="bold" />
        </button>
      )}
    </div>
  );
};
