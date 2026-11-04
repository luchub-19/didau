import React from 'react';
import type { Member, Place, Room, ScheduleItem } from '../../types';
import { CalendarColumn } from '../../components/schedule';

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

/** Cột Kế hoạch: lịch kéo thả theo giờ (gđ6 §3). Popup ô (T-81) và kéo từ cột trái (T-80) nối ở đây. */
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
    />
  );
};
