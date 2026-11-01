import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Place, PlaceCategory, Room } from '../../types';
import { GatherPanel, PlaceList } from '../../components/places';
import { LockedPlaces } from '../../components/schedule';
import type { ScheduleItem } from '../../types';
import { TieBlock, type DecideIntent } from '../../components/decide';
import { Button, Sheet } from '../../components/ui';
import { Plus } from '../../components/ui/Icon';
import type { PhaseStep, RoomPhase } from '../../room/phase';

export interface PlacesPanelProps {
  roomId: string;
  /** Điểm hẹn + ngân sách phòng (khoảng cách, nhãn "Vượt ngân sách"). */
  room?: Room | null;
  /** Giai đoạn phòng: `tie` hiện khối hoà phiếu; `vote`/`tie` hiện "x/y đã chọn". */
  phase: RoomPhase;
  /** Bước đang xem (có thể là bước cũ khi "xem lại"); 1 → bố cục giai đoạn ①. */
  viewStep?: PhaseStep;
  members?: Member[];
  /** Host đặt điểm hẹn ở giữa bản đồ (nhắc trong dải "Gần điểm hẹn"). */
  onOriginChange?: (lat: number, lng: number) => void;
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
  /** Lịch hiện tại — cột trái ③④ liệt kê quán đi kèm theo lịch. */
  schedule?: ScheduleItem[];
  /** "Xem lại quán dự bị": quay về bước ② ở chế độ xem lại. */
  onReviewVote?: () => void;
}

export const PlacesPanel: React.FC<PlacesPanelProps> = ({
  roomId,
  room,
  phase,
  viewStep,
  members = [],
  onOriginChange,
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
  schedule = [],
  onReviewVote,
}) => {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  const renderList = (hideAddButton = false) => (
    <PlaceList
      hideAddButton={hideAddButton}
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
  );

  const gatherProps = room
    ? {
        room,
        places,
        members,
        currentMemberId,
        isHost,
        onOpenPlace: onViewOnMap,
        onOpenAddModal,
        onOriginChange,
      }
    : null;

  // Giai đoạn ①: ô tìm kiếm lớn + 4 dải + khay danh sách của nhóm (T-72)
  if (gatherProps && (phase === 'gather' || viewStep === 1)) {
    return <GatherPanel {...gatherProps} variant="column" tray={places.length > 0 ? renderList(true) : undefined} />;
  }

  // Giai đoạn ③④ (không ở chế độ xem lại bước cũ): quán đã chốt + đi kèm + liên kết quán dự bị
  const viewingLocked = (phase === 'lock' || phase === 'send') && (viewStep === undefined || viewStep >= 3);
  if (viewingLocked) {
    return (
      <LockedPlaces
        places={places}
        schedule={schedule}
        onOpenPlace={onViewOnMap}
        onReviewBackups={() => onReviewVote?.()}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      {/* Khối hoà phiếu: chỉ ở giai đoạn `tie`, một nút ra kết quả ngay */}
      <TieBlock phase={phase} places={places} onDecide={onOpenDecide} />

      {/* Từ giai đoạn bình chọn: dải gợi ý thu thành một nút, mở lại trong ngăn kéo/sheet */}
      {gatherProps && (phase === 'vote' || phase === 'tie') && (
        <>
          <Button
            variant="secondary"
            onClick={() => setMoreOpen(true)}
            leftIcon={<Plus size={18} weight="bold" />}
            data-testid="btn-add-more"
          >
            {t('discovery.more')}
          </Button>
          <Sheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title={t('discovery.more')}>
            <GatherPanel {...gatherProps} variant="sheet" onNavigate={() => setMoreOpen(false)} />
          </Sheet>
        </>
      )}

      {/* Thẻ quán ngang + "x/y đã chọn" + nút ⋯ (lọc, sắp xếp, tìm khi >8 quán) + nút thêm quán */}
      {renderList()}
    </div>
  );
};
