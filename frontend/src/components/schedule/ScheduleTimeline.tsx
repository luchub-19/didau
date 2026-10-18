import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleItem, Place, Member, ConflictAlert, ConflictLevel } from '../../types';
import { ScheduleItemCard } from './ScheduleItemCard';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { AutoPlanButton } from './AutoPlanButton';
import { AutoPlanPreview } from './AutoPlanPreview';
import { ConflictListModal } from '../conflicts/ConflictListModal';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { useLanguage } from '../../i18n/useLanguage';
import { formatDuration } from '../../i18n/format';
import { describeConflict } from '../../i18n/serverText';
import {
  Clock,
  WarningCircle,
  Plus,
  Sparkle,
  CalendarBlank,
} from '../ui/Icon';

export interface ScheduleTimelineProps {
  roomId: string;
  items: ScheduleItem[];
  places: Place[];
  members?: Member[];
  isHost?: boolean;
  onOpenAddModal?: () => void;
  onOpenDecideModal?: () => void;
  conflicts?: ConflictAlert[];
}

/** Ước tính phút di chuyển theo công thức Haversine + hệ số đường vòng + gửi xe */
function estimateTravelMinutes(p1?: Place, p2?: Place): number | null {
  if (
    !p1?.latitude ||
    !p1?.longitude ||
    !p2?.latitude ||
    !p2?.longitude
  ) {
    return null;
  }
  const R = 6371;
  const dLat = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const dLon = ((p2.longitude - p1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.latitude * Math.PI) / 180) *
      Math.cos((p2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.ceil((dist * 1.3 / 30) * 60) + 10;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({
  roomId,
  items,
  places,
  members = [],
  isHost = false,
  onOpenAddModal,
  onOpenDecideModal,
  conflicts: propConflicts,
}) => {
  const { t } = useTranslation();
  const { lang: language } = useLanguage();

  const bulkUpdate = useScheduleStore((s) => s.bulkUpdate);
  const deleteItem = useScheduleStore((s) => s.deleteItem);
  const addItem = useScheduleStore((s) => s.addItem);
  const previewAutoPlan = useScheduleStore((s) => s.previewAutoPlan);
  const isScheduleLoading = useScheduleStore((s) => s.isLoading);
  const storeConflicts = useConflictStore((s) => s.conflicts);
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const conflicts = propConflicts ?? storeConflicts;

  const [selectedDay, setSelectedDay] = useState<number | 'ALL'>('ALL');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isConflictsOpen, setIsConflictsOpen] = useState(false);

  // Undo delete state
  const [lastDeletedItem, setLastDeletedItem] = useState<ScheduleItem | null>(null);

  // Map of place_id -> Place
  const placeMap = useMemo(() => {
    return new Map<string, Place>(places.map((p) => [p.id, p]));
  }, [places]);

  // Conflict list and highest level
  const highestConflictLevel: ConflictLevel = useMemo(() => {
    if (conflicts.some((c) => c.level === 'CRITICAL')) return 'CRITICAL';
    if (conflicts.some((c) => c.level === 'ERROR')) return 'ERROR';
    return 'WARNING';
  }, [conflicts]);

  // Map of schedule_item_id -> list of translated conflict messages and highest level
  const itemConflictMap = useMemo(() => {
    const map = new Map<
      string,
      { level: ConflictLevel; messages: string[] }
    >();
    // Thứ tự hiển thị của mục lịch (ngày rồi order_index), dùng để chọn thẻ hiện câu mô tả
    const rank = new Map(
      [...items]
        .sort((a, b) => a.day_offset - b.day_offset || a.order_index - b.order_index)
        .map((item, idx) => [item.id, idx]),
    );
    for (const c of conflicts) {
      if (c.entity_type === 'SCHEDULE' && Array.isArray(c.entity_ids)) {
        const text = describeConflict(c, { scheduleItems: items, places }, t);
        // V6: xung đột của một cặp chỉ hiện câu ở thẻ sau; các thẻ còn lại chỉ có huy hiệu
        const ownerId = c.entity_ids.reduce<string | undefined>(
          (best, id) =>
            best === undefined || (rank.get(id) ?? -1) > (rank.get(best) ?? -1) ? id : best,
          undefined,
        );
        for (const id of c.entity_ids) {
          const entry = map.get(id) || { level: c.level, messages: [] };
          if (id === ownerId) entry.messages.push(text);
          if (c.level === 'CRITICAL') entry.level = 'CRITICAL';
          else if (c.level === 'ERROR' && entry.level !== 'CRITICAL') entry.level = 'ERROR';
          map.set(id, entry);
        }
      }
    }
    return map;
  }, [conflicts, items, places, t]);

  // Unique day offsets present in the schedule
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    items.forEach((item) => days.add(item.day_offset));
    return Array.from(days).sort((a, b) => a - b);
  }, [items]);

  // Filter items by day offset
  const displayedItems = useMemo(() => {
    let filtered = items;
    if (selectedDay !== 'ALL') {
      filtered = items.filter((item) => item.day_offset === selectedDay);
    }
    return [...filtered].sort((a, b) => {
      if (a.day_offset !== b.day_offset) {
        return a.day_offset - b.day_offset;
      }
      return a.order_index - b.order_index;
    });
  }, [items, selectedDay]);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedItemId || draggedItemId === targetId) {
      setDraggedItemId(null);
      return;
    }

    const sourceIndex = items.findIndex((i) => i.id === draggedItemId);
    const targetIndex = items.findIndex((i) => i.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    const reordered = [...items];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const bulkItems = reordered.map((item, idx) => ({
      id: item.id,
      day_offset: item.day_offset,
      start_minute: item.start_minute,
      end_minute: item.end_minute,
      order_index: idx,
    }));

    setDraggedItemId(null);

    try {
      await bulkUpdate(roomId, { items: bulkItems });
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Failed to reorder schedule items:', err);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
  };

  // Keyboard / button Move Up / Move Down handlers
  const handleMove = async (itemId: string, direction: 'UP' | 'DOWN') => {
    const currentIndex = items.findIndex((i) => i.id === itemId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    const bulkItems = reordered.map((item, idx) => ({
      id: item.id,
      day_offset: item.day_offset,
      start_minute: item.start_minute,
      end_minute: item.end_minute,
      order_index: idx,
    }));

    try {
      await bulkUpdate(roomId, { items: bulkItems });
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Failed to move schedule item:', err);
    }
  };

  // Delete item with Undo mechanism
  const handleDeleteItem = async (itemId: string) => {
    const itemToDelete = items.find((i) => i.id === itemId);
    if (!itemToDelete) return;

    try {
      await deleteItem(roomId, itemId);
      await evaluateConflicts(roomId);
      setLastDeletedItem(itemToDelete);
      // Tự động xoá undo sau 7 giây
      setTimeout(() => {
        setLastDeletedItem((cur) => (cur?.id === itemToDelete.id ? null : cur));
      }, 7000);
    } catch (err) {
      console.error('Failed to delete schedule item:', err);
    }
  };

  const handleUndoDelete = async () => {
    if (!lastDeletedItem) return;
    const itemToRestore = lastDeletedItem;
    setLastDeletedItem(null);
    try {
      await addItem(roomId, {
        place_id: itemToRestore.place_id,
        day_offset: itemToRestore.day_offset,
        start_minute: itemToRestore.start_minute,
        end_minute: itemToRestore.end_minute,
        note: itemToRestore.note || undefined,
      });
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Failed to restore schedule item:', err);
    }
  };

  const handleOpenAutoPlan = async () => {
    try {
      await previewAutoPlan(roomId);
    } catch (err) {
      console.error('Failed to load auto plan preview:', err);
    } finally {
      setIsPreviewOpen(true);
    }
  };

  const handleReoptimize = async () => {
    try {
      await previewAutoPlan(roomId);
    } catch (err) {
      console.error('Failed to re-optimize schedule:', err);
    } finally {
      setIsPreviewOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      {/* 2. Dải tóm tắt xung đột đầu tab khi có xung đột */}
      {conflicts.length > 0 && (
        <div
          data-testid="schedule-conflicts-summary"
          className={`p-3.5 rounded-card flex items-center justify-between gap-3 transition-colors ${
            highestConflictLevel === 'CRITICAL' || highestConflictLevel === 'ERROR'
              ? 'bg-danger-soft border border-danger/30 text-danger'
              : 'bg-warning-soft border border-warning/30 text-warning'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <WarningCircle size={20} weight="fill" className="shrink-0" />
            <span className="text-body font-bold truncate">
              {t('conflict.summary', { count: conflicts.length })}
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => setIsConflictsOpen(true)}
            className="shrink-0"
          >
            {t('conflict.detailsButton', { count: conflicts.length })}
          </Button>
        </div>
      )}

      {/* Thanh lọc ngày & nút hành động */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-card border border-line shadow-xs">
        {/* Bộ lọc ngày */}
        {items.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setSelectedDay('ALL')}
              className={`px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-chip text-caption font-semibold whitespace-nowrap transition-colors ${
                selectedDay === 'ALL'
                  ? 'bg-ink text-surface shadow-xs'
                  : 'bg-surface-2 text-ink-2 hover:bg-line'
              }`}
            >
              {t('schedule.dayFilterAll', { count: items.length })}
            </button>
            {availableDays.length > 1 &&
              availableDays.map((day) => {
                const count = items.filter((i) => i.day_offset === day).length;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`px-3.5 py-2 min-h-[44px] inline-flex items-center rounded-chip text-caption font-semibold whitespace-nowrap transition-colors ${
                      selectedDay === day
                        ? 'bg-accent text-ink font-semibold shadow-xs'
                        : 'bg-surface-2 text-ink-2 hover:bg-line'
                    }`}
                  >
                    {t('schedule.dayFilter', { day: day + 1, count })}
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-caption font-bold text-ink">
            <CalendarBlank size={18} className="text-accent-text" />
            <span>{t('schedule.timelineTitle')}</span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {items.length > 0 && (
            <Button
              variant="secondary"
              onClick={handleReoptimize}
              data-testid="reoptimize-schedule-btn"
              leftIcon={<Sparkle size={16} />}
            >
              {t('schedule.reoptimize')}
            </Button>
          )}

          {/* Chưa đủ điều kiện thì ẩn khỏi thanh công cụ; trạng thái trống vẫn giải thích lý do (T-56) */}
          <AutoPlanButton
            roomId={roomId}
            places={places}
            members={members}
            isHost={isHost}
            onOpenPreview={handleOpenAutoPlan}
            onOpenDecideModal={onOpenDecideModal}
            hideWhenNotEligible
          />

          {onOpenAddModal && (
            <Button
              variant="primary"
              onClick={onOpenAddModal}
              leftIcon={<Plus size={16} weight="bold" />}
            >
              {t('schedule.newScheduleItem')}
            </Button>
          )}
        </div>
      </div>

      {/* Trạng thái đang tải (Skeleton) */}
      {isScheduleLoading && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : displayedItems.length === 0 ? (
        /* Trạng thái trống */
        <div className="text-center py-12 px-4 bg-surface rounded-card border border-line shadow-xs space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-surface-2 flex items-center justify-center text-ink-3">
            <CalendarBlank size={24} />
          </div>
          <h3 className="text-body font-bold text-ink">
            {t('schedule.emptyTitle')}
          </h3>
          <p className="text-caption text-ink-2 max-w-sm mx-auto">
            {t('schedule.emptyDescription')}
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <AutoPlanButton
              roomId={roomId}
              places={places}
              members={members}
              isHost={isHost}
              onOpenPreview={handleOpenAutoPlan}
              onOpenDecideModal={onOpenDecideModal}
              label={t('autoplan.button')}
            />
            {onOpenAddModal && (
              <Button variant="secondary" onClick={onOpenAddModal}>
                {t('schedule.addItem')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Danh sách các mục trong dòng thời gian */
        <div className="space-y-3">
          {displayedItems.map((item, idx) => {
            const place = placeMap.get(item.place_id);
            const conflictEntry = itemConflictMap.get(item.id);
            const isConflict = Boolean(conflictEntry);

            // Tính toán khoảng trống và thời gian di chuyển tới mục tiếp theo
            let travelInfoNode: React.ReactNode = null;
            if (idx < displayedItems.length - 1) {
              const nextItem = displayedItems[idx + 1];
              if (item.day_offset === nextItem.day_offset) {
                const gap = nextItem.start_minute - item.end_minute;
                const nextPlace = placeMap.get(nextItem.place_id);

                // Kiểm tra xung đột TRAVEL_TIME giữa 2 mục này nếu có
                const travelConflict = conflicts.find(
                  (c) =>
                    c.rule_code === 'TRAVEL_TIME' &&
                    c.entity_ids?.includes(item.id) &&
                    c.entity_ids?.includes(nextItem.id),
                );
                const conflictTravelMin = travelConflict?.params?.travel_min as number | undefined;

                const estimatedTravel =
                  conflictTravelMin ?? estimateTravelMinutes(place, nextPlace);

                travelInfoNode = (
                  <div className="py-1 px-4 flex items-center justify-between text-caption text-ink-3">
                    {/* Thời gian di chuyển hiển thị giữa hai mục */}
                    {estimatedTravel && estimatedTravel > 0 ? (
                      <span className="flex items-center gap-1.5 font-medium text-ink-2 bg-surface-2 px-2.5 py-0.5 rounded-chip">
                        <Clock size={12} className="text-ink-3" />
                        <span>
                          {t('schedule.travelTime', { minutes: estimatedTravel })}
                        </span>
                      </span>
                    ) : <span />}

                    {/* Khoảng trống lớn hiển thị nhạt: "Trống 1 giờ" */}
                    {gap >= 30 && (
                      <span className="italic text-ink-3">
                        {t('schedule.emptySlot', {
                          duration: formatDuration(gap, language, 'long'),
                        })}
                      </span>
                    )}
                  </div>
                );
              }
            }

            return (
              <React.Fragment key={item.id}>
                <ScheduleItemCard
                  item={item}
                  index={idx}
                  totalItems={displayedItems.length}
                  category={place?.category}
                  isConflict={isConflict}
                  conflictLevel={conflictEntry?.level}
                  conflictMessages={conflictEntry?.messages}
                  isHost={isHost}
                  onDelete={handleDeleteItem}
                  onMoveUp={() => handleMove(item.id, 'UP')}
                  onMoveDown={() => handleMove(item.id, 'DOWN')}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
                {travelInfoNode}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Floating Undo notification bar */}
      {lastDeletedItem && (
        <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-toast max-w-sm bg-ink text-surface px-4 py-3 rounded-card shadow-float flex items-center justify-between gap-3 animate-fade-in">
          <span className="text-caption truncate">
            {t('schedule.itemDeleted', { name: lastDeletedItem.place_name })}
          </span>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="text-caption font-bold text-accent-text hover:underline shrink-0"
          >
            {t('common.undo')}
          </button>
        </div>
      )}

      {/* Sheet xem trước tự động lên lịch */}
      <AutoPlanPreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        roomId={roomId}
        places={places}
        isHost={isHost}
        onApplySuccess={() => {
          void evaluateConflicts(roomId);
        }}
      />

      {/* Sheet danh sách xung đột */}
      <ConflictListModal
        isOpen={isConflictsOpen}
        onClose={() => setIsConflictsOpen(false)}
        roomId={roomId}
        conflicts={conflicts}
        scheduleItems={items}
        places={places}
      />
    </div>
  );
};
