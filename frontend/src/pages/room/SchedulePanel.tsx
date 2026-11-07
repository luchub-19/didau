import React, { useMemo } from 'react';
import type { Member, Place, Room, ScheduleItem } from '../../types';
import { CalendarColumn, UnscheduledTray } from '../../components/schedule';
import { useWorkspaceLayout } from '../../components/shell/workspace';
import { splitLockedPlaces } from '../../room/budget';
import { useCalendarPlacement } from '../../room/useCalendarDrag';

export interface SchedulePanelProps {
  roomId: string;
  room?: Room | null;
  items: ScheduleItem[];
  places: Place[];
  members: Member[];
  isHost: boolean;
  onOpenAddModal: () => void;
  onOpenDecideModal: () => void;
}

/**
 * Cột Kế hoạch: lịch kéo thả theo giờ (gđ6 §3). Mobile: khay "Chưa xếp lịch" (quán đã chốt chưa có trên lịch)
 * dính trên lưới — nguồn kéo của tab Kế hoạch (T-80). Popup ô (T-81) nối ở đây.
 */
export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  roomId,
  room,
  items,
  places,
  members,
  isHost,
  onOpenAddModal,
  onOpenDecideModal,
}) => {
  const layout = useWorkspaceLayout();
  const placement = useCalendarPlacement(roomId, room);
  // Quán đã chốt = chính + đi kèm (DESIGN gđ5 §3); khay chỉ giữ quán chưa có mục lịch
  const unscheduled = useMemo(() => {
    if (layout !== 'mobile') return [];
    const { main, companions } = splitLockedPlaces(places, items);
    const scheduled = new Set(items.map((i) => i.place_id));
    return [main, ...companions].filter((p): p is Place => Boolean(p) && !scheduled.has(p!.id));
  }, [layout, places, items]);

  return (
    <CalendarColumn
      roomId={roomId}
      room={room}
      items={items}
      places={places}
      members={members}
      isHost={isHost}
      onOpenAddModal={onOpenAddModal}
      onOpenDecideModal={onOpenDecideModal}
      tray={
        unscheduled.length > 0 ? (
          <UnscheduledTray places={unscheduled} onDrop={placement.drop} onAddFirstFree={placement.add} />
        ) : undefined
      }
    />
  );
};
