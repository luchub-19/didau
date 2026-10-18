import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleItem, PlaceCategory, ConflictLevel } from '../../types';
import { formatTime, formatDuration } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { CategoryIcon } from '../common/CategoryIcon';
import {
  Clock,
  MapPin,
  WarningCircle,
  CaretUp,
  CaretDown,
  Trash,
  DotsThree,
} from '../ui/Icon';

export interface ScheduleItemCardProps {
  item: ScheduleItem;
  index: number;
  totalItems: number;
  category?: PlaceCategory;
  isConflict?: boolean;
  conflictLevel?: ConflictLevel;
  conflictMessages?: string[];
  isHost?: boolean;
  onDelete?: (id: string) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragOver?: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export const ScheduleItemCard: React.FC<ScheduleItemCardProps> = ({
  item,
  index,
  totalItems,
  category = 'OTHER',
  isConflict = false,
  conflictLevel = 'CRITICAL',
  conflictMessages = [],
  isHost = false,
  onDelete,
  onMoveUp,
  onMoveDown,
  isDraggable = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const { t } = useTranslation();
  const { lang: language } = useLanguage();

  let duration = item.end_minute - item.start_minute;
  const isNextDay = item.end_minute < item.start_minute || item.end_minute >= 1440;
  if (isNextDay && item.end_minute < item.start_minute) {
    duration = item.end_minute + 1440 - item.start_minute;
  }
  const endMinuteNormalized = item.end_minute % 1440;
  const formattedTimeRange = `${formatTime(item.start_minute, language)} - ${formatTime(
    endMinuteNormalized,
    language,
  )}${isNextDay ? ` ${t('schedule.nextDay')}` : ''}`;

  const isCriticalOrError =
    conflictLevel === 'CRITICAL' || conflictLevel === 'ERROR';

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => onDragStart?.(e, item.id)}
      onDragOver={(e) => onDragOver?.(e, item.id)}
      onDrop={(e) => onDrop?.(e, item.id)}
      onDragEnd={onDragEnd}
      data-testid={`schedule-item-${item.id}`}
      className={`group relative flex items-start gap-3.5 p-4 rounded-card bg-surface border transition-colors duration-150 ${
        isConflict
          ? isCriticalOrError
            ? 'border-danger/50 ring-1 ring-danger/25 shadow-xs'
            : 'border-warning/50 ring-1 ring-warning/25 shadow-xs'
          : 'border-line hover:border-line shadow-xs'
      } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Số thứ tự và tay nắm kéo */}
      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-caption font-bold tabular-nums ${
            isConflict
              ? isCriticalOrError
                ? 'bg-danger text-surface'
                : 'bg-warning text-surface'
              : 'bg-surface-2 text-ink group-hover:bg-accent-soft group-hover:text-accent-text'
          }`}
        >
          {index + 1}
        </span>
        {isDraggable && (
          <span
            className="text-ink-3 group-hover:text-ink select-none flex items-center justify-center"
            title={t('schedule.dragHandle')}
            aria-hidden="true"
          >
            <DotsThree size={16} weight="bold" />
          </span>
        )}
      </div>

      {/* Chi tiết mục lịch trình */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {/* Khung giờ */}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-chip text-caption font-semibold ${
              isConflict
                ? isCriticalOrError
                  ? 'bg-danger-soft text-danger border border-danger/20'
                  : 'bg-warning-soft text-warning border border-warning/20'
                : 'bg-surface-2 text-ink border border-line'
            }`}
          >
            <Clock size={14} className="shrink-0" />
            <span className="tabular-nums">{formattedTimeRange}</span>
          </span>

          <span className="text-caption text-ink-3 font-medium">
            ({formatDuration(duration, language, 'short')})
          </span>

          {item.day_offset > 0 && (
            <span className="px-2 py-0.5 rounded-chip text-caption font-semibold bg-surface-2 text-ink-2 border border-line">
              {t('schedule.dayBadge', { day: item.day_offset + 1 })}
            </span>
          )}

          {isConflict && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-chip text-caption font-bold ${
                isCriticalOrError
                  ? 'bg-danger text-surface'
                  : 'bg-warning text-surface'
              }`}
            >
              <WarningCircle size={12} weight="fill" className="shrink-0" />
              <span>{t('schedule.conflictBadge')}</span>
            </span>
          )}
        </div>

        {/* Tên quán và icon danh mục */}
        <div className="flex items-center gap-2 mt-1">
          <CategoryIcon category={category} size="sm" />
          <h4 className="text-body font-bold text-ink truncate">
            {item.place_name}
          </h4>
        </div>

        {/* Địa chỉ */}
        {item.place_address && (
          <p className="text-caption text-ink-2 truncate mt-0.5 flex items-center gap-1">
            <MapPin size={14} className="shrink-0 text-ink-3" />
            <span className="truncate">{item.place_address}</span>
          </p>
        )}

        {/* Ghi chú */}
        {item.note && (
          <p className="text-caption text-ink-2 bg-surface-2 rounded-card p-2.5 mt-2 border border-line italic">
            &ldquo;{item.note}&rdquo;
          </p>
        )}

        {/* Cảnh báo xung đột (nếu có): icon + một dòng mô tả từ describeConflict */}
        {isConflict && conflictMessages.length > 0 && (
          <div
            className={`mt-2.5 p-2.5 rounded-card text-caption space-y-1 ${
              isCriticalOrError
                ? 'bg-danger-soft border border-danger/30 text-danger'
                : 'bg-warning-soft border border-warning/30 text-warning'
            }`}
          >
            {conflictMessages.map((msg, i) => (
              <p key={i} className="flex items-start gap-1.5 leading-relaxed">
                <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
                <span className="line-clamp-2">{msg}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Nút hành động: Lên, Xuống, Xoá */}
      <div className="flex items-center gap-0.5 self-start pt-0.5 shrink-0">
        {onMoveUp && (
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMoveUp(item.id)}
            title={t('schedule.moveUp')}
            aria-label={t('schedule.moveUp')}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full text-ink-3 hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:hover:bg-transparent transition-colors flex items-center justify-center"
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
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full text-ink-3 hover:text-ink hover:bg-surface-2 disabled:opacity-20 disabled:hover:bg-transparent transition-colors flex items-center justify-center"
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
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors flex items-center justify-center"
          >
            <Trash size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
