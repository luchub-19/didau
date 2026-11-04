import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaceCategory, ScheduleItem } from '../../types';
import type { Slot } from '../../room/calendar';
import type { DragMode } from '../../room/useCalendarDrag';
import { formatTime } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { WarningCircle } from '../ui/Icon';

/** Viền trái 3px theo danh mục (token cat-*). */
const CAT_BORDER: Record<PlaceCategory, string> = {
  FOOD: 'border-l-cat-food',
  DRINK: 'border-l-cat-drink',
  ENTERTAINMENT: 'border-l-cat-entertainment',
  SIGHTSEEING: 'border-l-cat-sightseeing',
  ACCOMMODATION: 'border-l-cat-accommodation',
  SHOPPING: 'border-l-cat-shopping',
  OTHER: 'border-l-cat-other',
};

/** Mức nội dung theo chiều cao ô (DESIGN gđ6 §3 "Ô quán"). */
export type EventDensity = 'full' | 'compact' | 'tiny';

/** ≥48px → tên + giờ (+ ghi chú khi ≥80px); 24–47px → một dòng "Tên · 18:00"; <24px → chỉ tên cỡ caption. */
function eventDensity(heightPx: number): EventDensity {
  if (heightPx >= 48) return 'full';
  if (heightPx >= 24) return 'compact';
  return 'tiny';
}

export interface CalendarEventProps {
  item: ScheduleItem;
  category?: PlaceCategory;
  /** Giờ đang hiển thị (bản nháp khi kéo/bấm phím, còn lại là giờ của mục). */
  slot: Slot;
  /** Vị trí tuyệt đối trong lớp ô (px + phần trăm bề ngang). */
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  /** Dịch dọc khi đang di (px) — chỉ đổi `transform` trong lúc kéo. */
  offsetY?: number;
  conflict?: { messages: string[] } | null;
  /** Đang được kéo (nổi lên, có bóng, nhãn giờ trên đầu). */
  dragging?: boolean;
  /** Con trỏ ra ngoài lưới: thả = huỷ. */
  dragOutside?: boolean;
  /** Bản sao mờ 40% ở chỗ cũ trong lúc kéo. */
  ghost?: boolean;
  /** Ô đã nhấc trên cảm ứng: hiện tay nắm 24px. */
  selected?: boolean;
  draggable?: boolean;
  onPointerDown?: (e: React.PointerEvent, mode: DragMode) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
}

/** Ô quán trên lưới lịch. Không tự giữ trạng thái; vị trí, bản nháp và xung đột do `CalendarColumn` tính. */
export const CalendarEvent: React.FC<CalendarEventProps> = ({
  item,
  category = 'OTHER',
  slot,
  top,
  height,
  leftPct,
  widthPct,
  offsetY = 0,
  conflict = null,
  dragging = false,
  dragOutside = false,
  ghost = false,
  selected = false,
  draggable = false,
  onPointerDown,
  onClick,
  onKeyDown,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const density = eventDensity(height);
  const start = formatTime(slot.start_minute, lang);
  const range = t('calendar.range', { start, end: formatTime(slot.end_minute, lang) });
  const hasConflict = Boolean(conflict);
  const label = [
    t('calendar.eventLabel', { name: item.place_name, range }),
    ...(conflict?.messages ?? []),
  ].join('. ');

  const style: React.CSSProperties = {
    top,
    height,
    left: `${leftPct}%`,
    width: `calc(${widthPct}% - 2px)`,
    ...(offsetY ? { transform: `translate3d(0, ${offsetY}px, 0)` } : null),
    ...(selected ? { touchAction: 'none' } : null),
  };

  const tone = [
    'absolute rounded-field border-l-[3px] bg-accent-soft text-left text-ink',
    dragging ? '' : 'overflow-hidden',
    CAT_BORDER[category] ?? CAT_BORDER.OTHER,
    hasConflict ? 'outline outline-1 -outline-offset-1 outline-danger' : '',
  ].join(' ');

  if (ghost) {
    return <div aria-hidden="true" data-testid="calendar-ghost" className={`${tone} pointer-events-none opacity-40`} style={style} />;
  }

  const showHandle = draggable && (selected || !dragging);

  return (
    <button
      type="button"
      data-testid={`calendar-event-${item.id}`}
      data-event-id={item.id}
      data-density={density}
      data-conflict={hasConflict ? 'true' : undefined}
      aria-label={label}
      title={conflict?.messages.join('\n') || undefined}
      className={`${tone} group select-none px-2 [-webkit-touch-callout:none] focus-visible:z-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        draggable ? 'cursor-grab' : 'cursor-pointer'
      } ${dragging ? 'z-content cursor-grabbing shadow-float' : ''} ${dragOutside ? 'opacity-60' : ''} ${
        selected ? 'z-content shadow-float' : ''
      }`}
      style={style}
      onPointerDown={draggable ? (e) => onPointerDown?.(e, 'move') : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {density === 'full' && (
        <span className="flex h-full flex-col py-1">
          <span className="truncate pr-4 text-label font-semibold leading-snug">{item.place_name}</span>
          <span className="truncate text-caption tabular-nums text-ink-2">{range}</span>
          {height >= 80 && item.note && (
            <span className="truncate text-caption text-ink-2">{item.note}</span>
          )}
        </span>
      )}
      {density === 'compact' && (
        <span className="flex h-full items-center truncate pr-4 text-caption leading-tight">
          <span className="truncate font-semibold">{item.place_name}</span>
          <span className="shrink-0 tabular-nums text-ink-2">&nbsp;·&nbsp;{start}</span>
        </span>
      )}
      {density === 'tiny' && (
        <span className="block truncate pr-4 text-caption font-semibold leading-[14px]">{item.place_name}</span>
      )}

      {hasConflict && (
        <WarningCircle
          size={density === 'tiny' ? 12 : 14}
          weight="fill"
          aria-hidden="true"
          className="absolute right-1 top-1 text-danger"
        />
      )}

      {/* Nhãn giờ mới ngay trên ô khi đang kéo */}
      {dragging && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-chip bg-ink px-1.5 py-0.5 text-caption font-semibold tabular-nums text-surface"
        >
          {range}
        </span>
      )}

      {/* Mép dưới kéo dãn: chuột 8px (tay nắm hiện khi hover), cảm ứng 24px sau khi nhấc */}
      {showHandle && (
        <span
          aria-hidden="true"
          data-testid="calendar-resize"
          className={`absolute inset-x-0 bottom-0 flex cursor-ns-resize items-end justify-center ${
            selected ? 'h-6 [touch-action:none]' : 'h-2'
          }`}
          onPointerDown={(e) => onPointerDown?.(e, 'resize')}
        >
          <span
            className={`mb-0.5 h-1 w-6 rounded-full bg-ink-3 ${
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
        </span>
      )}
    </button>
  );
};
