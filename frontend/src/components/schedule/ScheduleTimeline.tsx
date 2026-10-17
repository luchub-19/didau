import React, { useState, useMemo } from 'react';
import type { ScheduleItem, Place } from '../../types';
import { ScheduleItemCard } from './ScheduleItemCard';
import { Button } from '../common/Button';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';

export interface ScheduleTimelineProps {
  roomId: string;
  items: ScheduleItem[];
  places: Place[];
  isHost?: boolean;
  onOpenAddModal?: () => void;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({
  roomId,
  items,
  places,
  isHost = false,
  onOpenAddModal,
}) => {
  const bulkUpdate = useScheduleStore((s) => s.bulkUpdate);
  const deleteItem = useScheduleStore((s) => s.deleteItem);
  const conflicts = useConflictStore((s) => s.conflicts);
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);

  const [selectedDay, setSelectedDay] = useState<number | 'ALL'>('ALL');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // Map of place_id -> Place
  const placeMap = useMemo(() => {
    return new Map<string, Place>(places.map((p) => [p.id, p]));
  }, [places]);

  // Map of schedule_item_id -> list of conflict messages
  const conflictMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of conflicts) {
      if (c.entity_type === 'SCHEDULE' && Array.isArray(c.entity_ids)) {
        for (const id of c.entity_ids) {
          const list = map.get(id) || [];
          list.push(c.message);
          map.set(id, list);
        }
      }
    }
    return map;
  }, [conflicts]);

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

    // Clone and rearrange items array
    const reordered = [...items];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Reassign order_index
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
      console.error('Lỗi khi sắp xếp lại lịch trình:', err);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
  };

  // Move Up / Move Down handlers
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
      console.error('Lỗi khi di chuyển mục lịch trình:', err);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa mục này khỏi lịch trình?')) {
      try {
        await deleteItem(roomId, itemId);
        await evaluateConflicts(roomId);
      } catch (err) {
        console.error('Lỗi khi xóa mục lịch trình:', err);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Day Filters and Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedDay('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              selectedDay === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tất cả ({items.length})
          </button>
          {availableDays.map((day) => {
            const count = items.filter((i) => i.day_offset === day).length;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedDay === day
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Ngày {day + 1} ({count})
              </button>
            );
          })}
        </div>

        {onOpenAddModal && (
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddModal}
            leftIcon={<span>+</span>}
          >
            Xếp lịch mới
          </Button>
        )}
      </div>

      {/* Schedule Items List */}
      {displayedItems.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="text-4xl">📅</div>
          <h3 className="text-sm font-bold text-slate-800">
            Chưa có lịch trình cho chuyến đi
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Hãy bắt đầu sắp xếp các địa điểm đã chốt theo khung giờ để cả nhóm cùng theo dõi.
          </p>
          {onOpenAddModal && (
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={onOpenAddModal}>
                + Thêm địa điểm vào lịch
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 relative before:absolute before:top-4 before:bottom-4 before:left-7 before:w-0.5 before:bg-slate-200">
          {displayedItems.map((item, idx) => {
            const place = placeMap.get(item.place_id);
            const conflictMsgs = conflictMap.get(item.id) || [];
            const isConflict = conflictMsgs.length > 0;

            return (
              <ScheduleItemCard
                key={item.id}
                item={item}
                index={idx}
                totalItems={displayedItems.length}
                category={place?.category}
                isConflict={isConflict}
                conflictMessages={conflictMsgs}
                isHost={isHost}
                onDelete={handleDeleteItem}
                onMoveUp={() => handleMove(item.id, 'UP')}
                onMoveDown={() => handleMove(item.id, 'DOWN')}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
