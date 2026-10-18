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
}) => {
  return (
    <div className="space-y-5">
      <DeciderBanner roomId={roomId} onOpenDecide={onOpenDecide} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-card border border-line shadow-xs">
        <CategoryFilter
          places={places}
          selectedCategory={selectedCategory}
          onSelectCategory={onSelectCategory}
        />
      </div>

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
      />
    </div>
  );
};
