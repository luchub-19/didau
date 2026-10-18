import React from 'react';
import type { Member, Place, ScheduleItem } from '../../types';
import { ScheduleTimeline } from '../../components/schedule';

export interface SchedulePanelProps {
  roomId: string;
  items: ScheduleItem[];
  places: Place[];
  members: Member[];
  isHost: boolean;
  onOpenAddModal: () => void;
  onOpenDecideModal: () => void;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  roomId,
  items,
  places,
  members,
  isHost,
  onOpenAddModal,
  onOpenDecideModal,
}) => {
  return (
    <div className="space-y-5">
      <ScheduleTimeline
        roomId={roomId}
        items={items}
        places={places}
        members={members}
        isHost={isHost}
        onOpenAddModal={onOpenAddModal}
        onOpenDecideModal={onOpenDecideModal}
      />
    </div>
  );
};
