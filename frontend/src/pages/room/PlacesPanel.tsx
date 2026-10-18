import React from 'react';
import type { Place, PlaceCategory } from '../../types';
import { CategoryFilter, PlaceList } from '../../components/places';
import { DeciderBanner } from '../../components/decide';

export interface PlacesPanelProps {
  roomId: string;
  places: Place[];
  selectedCategory: PlaceCategory | 'ALL';
  onSelectCategory: (cat: PlaceCategory | 'ALL') => void;
  currentMemberId?: string;
  isHost: boolean;
  isVotingDisabled: boolean;
  onOpenAddModal: () => void;
  onDeletePlace: (placeId: string) => void;
  onViewOnMap: (place: Place) => void;
  onOpenDecide: () => void;
  onSwitchToMap?: () => void;
}

export const PlacesPanel: React.FC<PlacesPanelProps> = ({
  roomId,
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
    <div className="space-y-4">
      {/* Banner chọn hộ (T-48 giữ nguyên vị trí) */}
      <DeciderBanner roomId={roomId} onOpenDecide={onOpenDecide} />

      {/* Dải cuộn chip lọc danh mục */}
      <div className="bg-surface p-2.5 sm:p-3 rounded-card border border-line">
        <CategoryFilter
          places={places}
          selectedCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
        />
      </div>

      {/* Danh sách thẻ quán + sắp xếp + tìm kiếm + nút thêm */}
      <PlaceList
        places={places}
        roomId={roomId}
        selectedCategory={selectedCategory}
        currentMemberId={currentMemberId}
        isHost={isHost}
        isVotingDisabled={isVotingDisabled}
        onOpenAddModal={onOpenAddModal}
        onDeletePlace={onDeletePlace}
        onViewOnMap={onViewOnMap}
        onSwitchToMap={onSwitchToMap}
        onResetCategory={() => onSelectCategory('ALL')}
      />
    </div>
  );
};
