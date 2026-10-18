import React, { Suspense, lazy, useEffect } from 'react';
import type { Place, Room } from '../../types';
import { Skeleton } from '../../components/ui';

const MapView = lazy(() => import('../../components/map/MapView'));

export interface MapPanelProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  isVotingDisabled?: boolean;
  onOriginChange: (lat: number, lng: number) => void;
  isActive: boolean;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  room,
  places,
  isHost,
  isVotingDisabled = false,
  onOriginChange,
  isActive,
}) => {
  useEffect(() => {
    if (isActive && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  return (
    <div className={isActive ? 'block' : 'hidden'}>
      <Suspense
        fallback={
          <div className="h-[70vh] min-h-[420px] w-full rounded-card overflow-hidden">
            <Skeleton.Block className="h-full w-full" />
          </div>
        }
      >
        <MapView
          room={room}
          places={places}
          isHost={isHost}
          isVotingDisabled={isVotingDisabled}
          onOriginChange={onOriginChange}
        />
      </Suspense>
    </div>
  );
};
