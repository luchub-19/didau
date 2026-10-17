import React from 'react';
import type { ScheduleItem, PlaceCategory } from '../../types';
import { formatMinuteRange, formatDuration } from '../../hooks/useMinuteFormat';
import { CategoryIcon } from '../common/CategoryIcon';

export interface ScheduleItemCardProps {
  item: ScheduleItem;
  index: number;
  totalItems: number;
  category?: PlaceCategory;
  isConflict?: boolean;
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
  const duration = item.end_minute - item.start_minute;

  return (
    <div
      draggable={isDraggable}
      onDragStart={(e) => onDragStart?.(e, item.id)}
      onDragOver={(e) => onDragOver?.(e, item.id)}
      onDrop={(e) => onDrop?.(e, item.id)}
      onDragEnd={onDragEnd}
      data-testid={`schedule-item-${item.id}`}
      className={`group relative flex items-start gap-3.5 p-4 rounded-2xl bg-white border transition-all duration-150 ${
        isConflict
          ? 'border-rose-300 ring-2 ring-rose-100 shadow-xs'
          : 'border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm'
      } ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Drag handle / Order index */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            isConflict
              ? 'bg-rose-500 text-white'
              : 'bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700'
          }`}
        >
          {index + 1}
        </span>
        {isDraggable && (
          <span
            className="text-slate-300 group-hover:text-slate-400 select-none text-xs"
            title="Kéo thả để sắp xếp"
          >
            ⋮⋮
          </span>
        )}
      </div>

      {/* Main item details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {/* Time range pill */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              isConflict
                ? 'bg-rose-100 text-rose-800'
                : 'bg-sky-50 text-sky-800 border border-sky-100'
            }`}
          >
            🕒 {formatMinuteRange(item.start_minute, item.end_minute)}
          </span>

          <span className="text-[11px] text-slate-400 font-medium">
            ({formatDuration(duration)})
          </span>

          {item.day_offset > 0 && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
              Ngày {item.day_offset + 1}
            </span>
          )}

          {isConflict && (
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500 text-white animate-pulse">
              ⚠️ Xung đột
            </span>
          )}
        </div>

        {/* Place title and category */}
        <div className="flex items-center gap-2 mt-1">
          <CategoryIcon category={category} size="sm" />
          <h4 className="text-sm font-bold text-slate-900 truncate">
            {item.place_name}
          </h4>
        </div>

        {/* Address */}
        {item.place_address && (
          <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
            <span>📍</span>
            <span>{item.place_address}</span>
          </p>
        )}

        {/* Note */}
        {item.note && (
          <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 mt-2 border border-slate-100 italic">
            &ldquo;{item.note}&rdquo;
          </p>
        )}

        {/* Conflict messages if any */}
        {isConflict && conflictMessages.length > 0 && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
            {conflictMessages.map((msg, i) => (
              <p key={i} className="flex items-start gap-1">
                <span className="shrink-0">⚠️</span>
                <span>{msg}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons (Move Up, Move Down, Delete) */}
      <div className="flex items-center gap-1 self-start pt-0.5">
        {onMoveUp && (
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMoveUp(item.id)}
            title="Di chuyển lên"
            aria-label="Di chuyển lên"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ▲
          </button>
        )}

        {onMoveDown && (
          <button
            type="button"
            disabled={index === totalItems - 1}
            onClick={() => onMoveDown(item.id)}
            title="Di chuyển xuống"
            aria-label="Di chuyển xuống"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ▼
          </button>
        )}

        {(isHost || onDelete) && (
          <button
            type="button"
            onClick={() => onDelete?.(item.id)}
            title="Xóa khỏi lịch trình"
            aria-label="Xóa khỏi lịch trình"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
