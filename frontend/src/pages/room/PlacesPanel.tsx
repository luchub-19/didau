import React from 'react';
import type { Place, PlaceCategory, Room } from '../../types';
import { PlaceList } from '../../components/places';
import { TieBlock, type DecideIntent } from '../../components/decide';
import type { RoomPhase } from '../../room/phase';

export interface PlacesPanelProps {
  roomId: string;
  /** Điểm hẹn + ngân sách phòng (khoảng cách, nhãn "Vượt ngân sách"). */
  room?: Pick<Room, 'origin_lat' | 'origin_lng' | 'budget_limit'> | null;
  /** Giai đoạn phòng: `tie` hiện khối hoà phiếu; `vote`/`tie` hiện "x/y đã chọn". */
  phase: RoomPhase;
  places: Place[];
  selectedCategory: PlaceCategory | 'ALL';
  onSelectCategory: (cat: PlaceCategory | 'ALL') => void;
  currentMemberId?: string;
  isHost: boolean;
  isVotingDisabled: boolean;
  onOpenAddModal: () => void;
  onDeletePlace: (placeId: string) => void;
  onViewOnMap: (place: Place) => void;
  onOpenDecide: (intent?: DecideIntent) => void;
  onSwitchToMap?: () => void;
}

export const PlacesPanel: React.FC<PlacesPanelProps> = ({
  roomId,
  room,
  phase,
  places,
  selectedCategory,
  onSelectCategory,
  currentMemberId,
  isHost,
  isVotingDisabled,
  onOpenAddModal,
  onDeletePlace,
  onViewOnMap,
  onOpenDecide,
  onSwitchToMap,
}) => {
  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Khối hoà phiếu: chỉ ở giai đoạn `tie`, một nút ra kết quả ngay */}
      <TieBlock phase={phase} places={places} onDecide={onOpenDecide} />

      {/* Thẻ quán ngang + "x/y đã chọn" + nút ⋯ (lọc, sắp xếp, tìm khi >8 quán) + nút thêm quán */}
      <PlaceList
        places={places}
        roomId={roomId}
        room={room}
        phase={phase}
        className="flex-1"
        selectedCategory={selectedCategory}
        currentMemberId={currentMemberId}
        isHost={isHost}
        isVotingDisabled={isVotingDisabled}
        onOpenAddModal={onOpenAddModal}
        onDeletePlace={onDeletePlace}
        onViewOnMap={onViewOnMap}
        onSwitchToMap={onSwitchToMap}
        onResetCategory={() => onSelectCategory('ALL')}
        onSelectCategory={onSelectCategory}
      />
    </div>
  );
};
