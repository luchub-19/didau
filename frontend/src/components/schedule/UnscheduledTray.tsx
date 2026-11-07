import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { curatedPhotos, findCurated } from '../../room/curated';
import { useCuratedData } from '../../room/useCuratedData';
import type { Slot } from '../../room/calendar';
import { usePlaceDragSource, type PlaceDragInfo } from '../../room/useCalendarDrag';
import { Button } from '../ui/Button';
import { Plus } from '../ui/Icon';

export interface UnscheduledTrayProps {
  /** Quán đã chốt (chính + đi kèm) chưa có mục trên lịch, theo thứ tự cột trái. */
  places: Place[];
  /** Thả chip xuống lưới. */
  onDrop: (info: PlaceDragInfo, slot: Slot) => void;
  /** Không kéo: "Thêm vào giờ trống đầu tiên". */
  onAddFirstFree: (info: PlaceDragInfo) => void;
}

/**
 * Khay "Chưa xếp lịch" ở tab Kế hoạch trên mobile (DESIGN gđ6 §3 "Kéo từ cột trái"): chip cuộn ngang, dính trên lưới
 * (nằm trong đầu cột dính của `CalendarColumn`). Nhấn giữ 350 ms → kéo xuống lưới; chạm chip → hiện nút
 * "Thêm vào giờ trống đầu tiên". Hết quán chưa xếp thì không vẽ gì.
 */
export const UnscheduledTray: React.FC<UnscheduledTrayProps> = ({ places, onDrop, onAddFirstFree }) => {
  const { t } = useTranslation();
  const curated = useCuratedData();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const source = usePlaceDragSource({ onDrop, touchLongPress: true });

  if (places.length === 0) return null;
  const chosen = places.find((p) => p.id === chosenId) ?? null;

  const info = (p: Place): PlaceDragInfo => {
    const entry = curated ? findCurated(p, curated) : null;
    return {
      placeId: p.id,
      name: p.name,
      category: p.category,
      photo: entry ? curatedPhotos(entry, curated)[0]?.src : undefined,
    };
  };

  return (
    <section aria-labelledby="tray-title" data-testid="unscheduled-tray" className="-mx-4 space-y-2 border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-2 px-4">
        <h4 id="tray-title" className="text-label font-semibold text-ink">
          {t('calendar.trayTitle', { count: places.length })}
        </h4>
        <span className="truncate text-caption text-ink-3">{t('calendar.trayHint')}</span>
      </div>
      <ul ref={source.touchBlockRef} className="flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none]">
        {places.map((p) => {
          const meta = CATEGORY_METADATA[p.category] ?? CATEGORY_METADATA.OTHER;
          const Icon = meta.IconComponent;
          const photo = info(p).photo;
          const isChosen = chosenId === p.id;
          return (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                data-drag-source={p.id}
                data-testid="tray-chip"
                aria-pressed={isChosen}
                onPointerDown={(e) => source.onPointerDown(e, info(p))}
                onClick={() => {
                  if (source.consumeClick(p.id)) return;
                  setChosenId(isChosen ? null : p.id);
                }}
                className={`flex min-h-[44px] max-w-[12rem] select-none items-center gap-2 rounded-chip border py-1 pl-1 pr-3 text-left [-webkit-touch-callout:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${isChosen ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
              >
                <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ${meta.bg} ${meta.text}`}>
                  {photo ? <img src={photo} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon size={16} weight="duotone" />}
                </span>
                <span className="truncate text-label font-semibold text-ink">{p.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen && (
        <div className="px-4">
          <Button
            variant="secondary"
            className="w-full"
            data-testid="tray-add-first-free"
            leftIcon={<Plus size={16} weight="bold" />}
            aria-label={t('calendar.addFirstFreeNamed', { name: chosen.name })}
            onClick={() => {
              setChosenId(null);
              onAddFirstFree(info(chosen));
            }}
          >
            {t('calendar.addFirstFree')}
          </Button>
        </div>
      )}
    </section>
  );
};
