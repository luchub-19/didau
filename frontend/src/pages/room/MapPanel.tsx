import React, { Suspense, lazy } from 'react';
import type { Place, Room } from '../../types';
import { Skeleton } from '../../components/ui';

const MapView = lazy(() => import('../../components/map/MapView'));

export interface MapPanelProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  isVotingDisabled?: boolean;
  onOriginChange: (lat: number, lng: number) => void;
}

/** Cột giữa của không gian phòng: bản đồ luôn mounted, tràn khung (T-67). MapView tự `resize()` qua ResizeObserver. */
export const MapPanel: React.FC<MapPanelProps> = ({
  room,
  places,
  isHost,
  isVotingDisabled = false,
  onOriginChange,
}) => {
  return (
    <Suspense fallback={<Skeleton.Block className="h-full w-full" />}>
      <MapView
        room={room}
        places={places}
        isHost={isHost}
        isVotingDisabled={isVotingDisabled}
        onOriginChange={onOriginChange}
      />
    </Suspense>
  );
};
