import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleItem, Place, PlaceCategory, ConflictLevel } from '../../types';
import { formatTime, formatDuration } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { placeThumb, formatPriceShort } from '../../room/placeView';
import { useCuratedData } from '../../room/useCuratedData';
import { MapPin, WarningCircle, CaretUp, CaretDown, Trash, DotsThree, PencilSimple } from '../ui/Icon';

export interface ScheduleItemCardProps {
  item: ScheduleItem;
  index: number;
  totalItems: number;
  /** Quán của mục (ảnh nhỏ, giá, danh mục); thiếu thì chỉ có tên. */
  place?: Pick<Place, 'category' | 'name' | 'external_id' | 'latitude' | 'longitude' | 'estimated_cost'>;
  /** Giữ để tương thích: dùng khi chưa có `place`. */
  category?: PlaceCategory;
  isConflict?: boolean;
  conflictLevel?: ConflictLevel;
  conflictMessages?: string[];
  /** Bấm "Sửa" trên chip xung đột → mở sửa giờ của mục này. */
  onFixConflict?: (id: string) => void;
  isHost?: boolean;
  onDelete?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  /** Mục cuối của danh sách: đường dọc dừng ở chấm. */
  isLast?: boolean;
}

/** Cột giờ | chấm + đường dọc | nội dung — dùng chung cho mục lịch và hàng "di chuyển" giữa hai mục. */
export const TIMELINE_GRID = 'grid grid-cols-[4.25rem_1.5rem_minmax(0,1fr)] gap-x-2';

/** Đường dọc nối các chấm (DESIGN §8). */
export const TimelineRail: React.FC<{ from?: 'top' | 'dot'; to?: 'bottom' | 'dot' }> = ({ from = 'top', to = 'bottom' }) => (
  <span
    aria-hidden="true"
    className={`absolute left-1/2 w-px -translate-x-1/2 bg-line ${from === 'top' ? 'top-0' : 'top-5'} ${
      to === 'bottom' ? 'bottom-0' : 'bottom-auto h-5'
    }`}
  />
);

/** Ảnh nhỏ của điểm dừng: ảnh tuyển chọn khi có, không thì ô minh hoạ theo danh mục. */
const StopThumb: React.FC<{ place?: ScheduleItemCardProps['place']; category: PlaceCategory }> = ({ place, category }) => {
  const curated = useCuratedData();
  const thumb = place ? placeThumb(place, curated) : { src: null, category };
  const meta = CATEGORY_METADATA[thumb.category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <span
      aria-hidden="true"
      data-testid="stop-thumb"
      className={`shrink-0 inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-field ${meta.bg} ${meta.text}`}
    >
      {thumb.src ? <img src={thumb.src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon size={24} weight="duotone" />}
    </span>
  );
};

export const ScheduleItemCard: React.FC<ScheduleItemCardProps> = ({
  item,
  index,
  totalItems,
  place,
  category,
  isConflict = false,
  conflictLevel = 'CRITICAL',
  conflictMessages = [],
  onFixConflict,
  isHost = false,
  onDelete,
  onMoveUp,
  onMoveDown,
  isDraggable = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isLast = false,
}) => {
  const { t } = useTranslation();
  const { lang: language } = useLanguage();

  let duration = item.end_minute - item.start_minute;
  const isNextDay = item.end_minute < item.start_minute || item.end_minute >= 1440;
  if (isNextDay && item.end_minute < item.start_minute) {
    duration = item.end_minute + 1440 - item.start_minute;
  }
  const endMinuteNormalized = item.end_minute % 1440;
  const startText = formatTime(item.start_minute, language);
  const endText = `${formatTime(endMinuteNormalized, language)}${isNextDay ? ` ${t('schedule.nextDay')}` : ''}`;

  const isCriticalOrError = conflictLevel === 'CRITICAL' || conflictLevel === 'ERROR';
  const resolvedCategory = place?.category ?? category ?? 'OTHER';
  const price = formatPriceShort(place?.estimated_cost);

  return (
    <div data-testid={`schedule-item-${item.id}`} className={TIMELINE_GRID}>
      {/* Giờ ở trái */}
      <div className="pt-3 text-right">
        <p className={`whitespace-nowrap text-label font-semibold tabular-nums ${isConflict ? (isCriticalOrError ? 'text-danger' : 'text-warning') : 'text-ink'}`}>
          {startText}
        </p>
        <p className="text-caption tabular-nums text-ink-3">{endText}</p>
      </div>

      {/* Chấm + đường dọc */}
      <div className="relative flex justify-center">
        <TimelineRail from={index === 0 ? 'dot' : 'top'} to={isLast ? 'dot' : 'bottom'} />
        <span
          className={`relative z-[1] mt-3 flex h-6 w-6 items-center justify-center rounded-full text-caption font-semibold tabular-nums ${
            isConflict ? (isCriticalOrError ? 'bg-danger text-surface' : 'bg-warning text-surface') : 'bg-accent text-ink'
          }`}
        >
          {index + 1}
        </span>
      </div>

      {/* Thẻ điểm dừng + chip xung đột ngay dưới */}
      <div className="min-w-0 pb-2">
        <div
          draggable={isDraggable}
          onDragStart={(e) => onDragStart?.(e, item.id)}
          onDragOver={(e) => onDragOver?.(e, item.id)}
          onDrop={(e) => onDrop?.(e, item.id)}
          onDragEnd={onDragEnd}
          className={`group rounded-card border bg-surface p-3 transition-colors duration-150 ${
            isConflict ? (isCriticalOrError ? 'border-danger/50' : 'border-warning/50') : 'border-line'
          } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
          <div className="flex items-start gap-3">
            <StopThumb place={place} category={resolvedCategory} />
            <div className="min-w-0 flex-1">
              <h4 className="text-body font-semibold leading-snug text-ink line-clamp-2">{item.place_name}</h4>
              {item.place_address && (
                <p className="mt-0.5 flex items-center gap-1 text-caption text-ink-2">
                  <MapPin size={14} className="shrink-0 text-ink-3" />
                  <span className="truncate">{item.place_address}</span>
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
                <span className="tabular-nums">{formatDuration(duration, language, 'short')}</span>
                <span aria-hidden="true">·</span>
                <span className={`tabular-nums ${price ? 'font-medium text-ink' : 'text-ink-3'}`}>{price ?? t('budget.unknownShort')}</span>
                {item.day_offset > 0 && (
                  <span className="rounded-chip border border-line bg-surface-2 px-2 text-ink-2">
                    {t('schedule.dayBadge', { day: item.day_offset + 1 })}
                  </span>
                )}
              </p>
            </div>
            {isDraggable && (
              <span className="hidden select-none text-ink-3 sm:flex" title={t('schedule.dragHandle')} aria-hidden="true">
                <DotsThree size={16} weight="bold" />
              </span>
            )}
          </div>

          {item.note && (
            <p className="mt-2 rounded-field border border-line bg-surface-2 p-2 text-caption italic text-ink-2">
              &ldquo;{item.note}&rdquo;
            </p>
          )}

          {/* Lên, Xuống, Xoá: vùng chạm 44px, dồn về bên phải một hàng riêng để không bóp tên quán */}
          <div className="-mb-1 mt-1 flex items-center justify-end gap-0.5">
            {onMoveUp && (
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMoveUp(item.id)}
                title={t('schedule.moveUp')}
                aria-label={t('schedule.moveUp')}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <CaretUp size={16} weight="bold" />
              </button>
            )}
            {onMoveDown && (
              <button
                type="button"
                disabled={index === totalItems - 1}
                onClick={() => onMoveDown(item.id)}
                title={t('schedule.moveDown')}
                aria-label={t('schedule.moveDown')}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-20 disabled:hover:bg-transparent"
              >
                <CaretDown size={16} weight="bold" />
              </button>
            )}
            {(isHost || onDelete) && (
              <button
                type="button"
                onClick={() => onDelete?.(item.id)}
                title={t('schedule.deleteItem')}
                aria-label={t('schedule.deleteItem')}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Xung đột hiện ngay dưới mục bị trùng: chip warning/danger + "Sửa" (DESIGN §8). Huy hiệu ngắn nếu không có câu mô tả */}
        {isConflict && (
          <div
            data-testid="item-conflict"
            role="alert"
            className={`mt-1.5 flex items-start gap-2 rounded-field p-2.5 text-caption ${
              isCriticalOrError ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
            }`}
          >
            <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-semibold">{t('schedule.conflictBadge')}</p>
              {conflictMessages.map((msg, i) => (
                <p key={i} className="leading-snug">
                  {msg}
                </p>
              ))}
            </div>
            {onFixConflict && (
              <button
                type="button"
                onClick={() => onFixConflict(item.id)}
                data-testid="conflict-fix"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-chip px-3 font-semibold underline-offset-2 hover:underline"
              >
                <PencilSimple size={14} />
                {t('schedule.fix')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
