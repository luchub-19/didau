import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScheduleItem, Place, Member, ConflictAlert, ConflictLevel, Room } from '../../types';
import { ScheduleItemCard, TIMELINE_GRID, TimelineRail } from './ScheduleItemCard';
import { BudgetMeter } from './BudgetMeter';
import { TimeSlotPicker } from './TimeSlotPicker';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { Skeleton } from '../ui/Skeleton';
import { AutoPlanButton } from './AutoPlanButton';
import { AutoPlanPreview } from './AutoPlanPreview';
import { buildInviteUrl, shareRoom } from '../room/shareRoom';
import { buildScheduleIcs, downloadIcs, icsFileName } from '../../stage/reveal/actions';
import { planBudget } from '../../room/budget';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { useLanguage } from '../../i18n/useLanguage';
import { formatDuration } from '../../i18n/format';
import { describeConflict } from '../../i18n/serverText';
import { Clock, Plus, Sparkle, CalendarBlank, ShareNetwork } from '../ui/Icon';

export interface ScheduleTimelineProps {
  roomId: string;
  items: ScheduleItem[];
  places: Place[];
  members?: Member[];
  isHost?: boolean;
  onOpenAddModal?: () => void;
  onOpenDecideModal?: () => void;
  conflicts?: ConflictAlert[];
  /** Phòng: ngân sách (`budget_limit`), chia sẻ và tệp .ics. Thiếu thì ẩn các phần này. */
  room?: Room | null;
}

/**
 * Ước tính phút di chuyển = Haversine / 30 km/h, làm tròn lên: cùng công thức với `TravelTimeConflictRule`
 * ở backend, để con số không nhảy khi xung đột TRAVEL_TIME (có `travel_min`) xuất hiện hoặc biến mất
 */
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
  return Math.ceil((dist / 30) * 60);
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
  room = null,
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
  // Mục đang sửa giờ (mở từ nút "Sửa" trên chip xung đột)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // Undo delete state
  const [lastDeletedItem, setLastDeletedItem] = useState<ScheduleItem | null>(null);

  // Map of place_id -> Place
  const placeMap = useMemo(() => {
    return new Map<string, Place>(places.map((p) => [p.id, p]));
  }, [places]);

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

  const budget = useMemo(
    () => planBudget({ schedule: items, places, budgetLimit: room?.budget_limit }),
    [items, places, room?.budget_limit],
  );

  const editingItem = editingId ? items.find((i) => i.id === editingId) ?? null : null;
  const openEdit = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setEditSlot({ start: item.start_minute, end: item.end_minute });
    setEditingId(id);
  };
  const editInvalid = editSlot.start >= editSlot.end;
  const handleSaveEdit = async () => {
    if (!editingItem || editInvalid) return;
    const bulkItems = items.map((item, idx) => ({
      id: item.id,
      day_offset: item.day_offset,
      start_minute: item.id === editingItem.id ? editSlot.start : item.start_minute,
      end_minute: item.id === editingItem.id ? editSlot.end : item.end_minute,
      order_index: idx,
    }));
    setEditingId(null);
    try {
      await bulkUpdate(roomId, { items: bulkItems });
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Failed to edit schedule item:', err);
    }
  };

  // Gửi kế hoạch = chia sẻ link phòng (shareRoom); "Thêm vào lịch" = một tệp .ics cho cả lịch
  const handleSend = () => {
    if (room) void shareRoom({ roomId: room.id, code: room.code, title: room.title, t });
  };
  const handleAddToCalendar = () => {
    if (!room) return;
    const ics = buildScheduleIcs({ room, items, places, url: buildInviteUrl(room.id, room.code) });
    downloadIcs(ics, icsFileName(room.title));
  };

  const hasItems = items.length > 0;

  return (
    <div className="space-y-4">
      {/* Ngân sách cả buổi: có lịch, hoặc phòng có đặt ngân sách */}
      {(hasItems || budget.limit !== null) && <BudgetMeter budget={budget} />}

      {/* Lọc ngày (chỉ khi lịch kéo dài nhiều ngày) + thêm điểm */}
      {(availableDays.length > 1 || (hasItems && onOpenAddModal)) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {availableDays.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedDay('ALL')}
                className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-chip px-3.5 py-2 text-caption font-semibold transition-colors ${
                  selectedDay === 'ALL' ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-2 hover:bg-line'
                }`}
              >
                {t('schedule.dayFilterAll', { count: items.length })}
              </button>
              {availableDays.map((day) => {
                const count = items.filter((i) => i.day_offset === day).length;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`inline-flex min-h-[44px] items-center whitespace-nowrap rounded-chip px-3.5 py-2 text-caption font-semibold transition-colors ${
                      selectedDay === day ? 'bg-accent text-ink' : 'bg-surface-2 text-ink-2 hover:bg-line'
                    }`}
                  >
                    {t('schedule.dayFilter', { day: day + 1, count })}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          {onOpenAddModal && hasItems && (
            <Button variant="secondary" onClick={onOpenAddModal} leftIcon={<Plus size={16} weight="bold" />}>
              {t('schedule.newScheduleItem')}
            </Button>
          )}
        </div>
      )}

      {/* Trạng thái đang tải (Skeleton) */}
      {isScheduleLoading && items.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-24 w-full rounded-card" />
        </div>
      ) : displayedItems.length === 0 ? (
        /* Trạng thái trống: ở giai đoạn `lock` nút chính là "Xếp lịch tự động" */
        <div className="space-y-3 rounded-card border border-line bg-surface px-4 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-3">
            <CalendarBlank size={24} />
          </div>
          <h3 className="text-body font-semibold text-ink">{t('schedule.emptyTitle')}</h3>
          <p className="mx-auto max-w-sm text-caption text-ink-2">{t('schedule.emptyDescription')}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
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
        /* Dòng thời gian: giờ | chấm + đường dọc | thẻ; giữa hai điểm ghi thời gian di chuyển */
        <div data-testid="schedule-list">
          {displayedItems.map((item, idx) => {
            const place = placeMap.get(item.place_id);
            const conflictEntry = itemConflictMap.get(item.id);
            const isLast = idx === displayedItems.length - 1;

            let travelRow: React.ReactNode = null;
            if (!isLast) {
              const nextItem = displayedItems[idx + 1];
              if (item.day_offset === nextItem.day_offset) {
                const gap = nextItem.start_minute - item.end_minute;
                const nextPlace = placeMap.get(nextItem.place_id);
                const travelConflict = conflicts.find(
                  (c) =>
                    c.rule_code === 'TRAVEL_TIME' &&
                    c.entity_ids?.includes(item.id) &&
                    c.entity_ids?.includes(nextItem.id),
                );
                const conflictTravelMin = travelConflict?.params?.travel_min as number | undefined;
                const estimatedTravel = conflictTravelMin ?? estimateTravelMinutes(place, nextPlace);
                const hasTravel = Boolean(estimatedTravel && estimatedTravel > 0);
                if (hasTravel || gap >= 30) {
                  travelRow = (
                    <div className={TIMELINE_GRID}>
                      <span />
                      <div className="relative">
                        <TimelineRail from="top" to="bottom" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 text-caption text-ink-3">
                        {hasTravel && (
                          <span className="inline-flex items-center gap-1.5 text-ink-2">
                            <Clock size={12} className="text-ink-3" />
                            {t('schedule.travelTime', { minutes: estimatedTravel })}
                          </span>
                        )}
                        {gap >= 30 && (
                          <span>{t('schedule.emptySlot', { duration: formatDuration(gap, language, 'long') })}</span>
                        )}
                      </div>
                    </div>
                  );
                }
              }
            }

            return (
              <React.Fragment key={item.id}>
                <ScheduleItemCard
                  item={item}
                  index={idx}
                  totalItems={displayedItems.length}
                  isLast={isLast}
                  place={place}
                  category={place?.category}
                  isConflict={Boolean(conflictEntry)}
                  conflictLevel={conflictEntry?.level}
                  conflictMessages={conflictEntry?.messages}
                  onFixConflict={openEdit}
                  isHost={isHost}
                  onDelete={handleDeleteItem}
                  onMoveUp={() => handleMove(item.id, 'UP')}
                  onMoveDown={() => handleMove(item.id, 'DOWN')}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
                {travelRow}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Chân cột: Gửi kế hoạch cho nhóm (nút chính) · Thêm vào lịch · Xếp lại tự động */}
      {hasItems && (
        <div
          data-testid="plan-footer"
          className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-line bg-surface px-4 pb-4 pt-3"
        >
          {room && (
            <Button
              variant="primary"
              className="w-full"
              onClick={handleSend}
              data-testid="send-plan-btn"
              leftIcon={<ShareNetwork size={18} weight="bold" />}
            >
              {t('plan.send')}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {room && (
              <Button
                variant="secondary"
                onClick={handleAddToCalendar}
                data-testid="add-to-calendar-btn"
                className="px-3"
                leftIcon={<CalendarBlank size={16} />}
              >
                {t('plan.addToCalendar')}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleReoptimize}
              data-testid="reoptimize-schedule-btn"
              leftIcon={<Sparkle size={16} />}
              className={room ? 'px-3' : 'col-span-2'}
            >
              {t('schedule.reoptimize')}
            </Button>
          </div>
        </div>
      )}

      {/* Floating Undo notification bar */}
      {lastDeletedItem && (
        <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:right-6 z-toast max-w-sm bg-ink text-surface px-4 py-3 rounded-card shadow-float flex items-center justify-between gap-3 animate-fade-in">
          <span className="text-caption truncate">{t('schedule.itemDeleted', { name: lastDeletedItem.place_name })}</span>
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

      {/* Sửa giờ một mục (mở từ chip xung đột) */}
      <Sheet
        isOpen={editingItem !== null}
        onClose={() => setEditingId(null)}
        title={t('schedule.editTitle', { name: editingItem?.place_name ?? '' })}
        footer={
          <Button variant="primary" className="w-full" disabled={editInvalid} onClick={handleSaveEdit} data-testid="edit-save">
            {t('common.save')}
          </Button>
        }
      >
        <TimeSlotPicker
          startMinute={editSlot.start}
          endMinute={editSlot.end}
          onChange={(start, end) => setEditSlot({ start, end })}
        />
      </Sheet>
    </div>
  );
};
