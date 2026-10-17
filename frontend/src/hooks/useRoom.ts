import { useEffect, useState } from 'react';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import { useWebSocket } from './useWebSocket';

export function useRoom(roomId?: string) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const room = useRoomStore((s) => s.room);
  const members = useRoomStore((s) => s.members);
  const currentMember = useRoomStore((s) => s.currentMember);
  const fetchRoom = useRoomStore((s) => s.fetchRoom);

  const places = usePlaceStore((s) => s.places);
  const fetchPlaces = usePlaceStore((s) => s.fetchPlaces);

  const schedule = useScheduleStore((s) => s.items);
  const fetchSchedule = useScheduleStore((s) => s.fetchSchedule);

  const conflicts = useConflictStore((s) => s.conflicts);
  const fetchConflicts = useConflictStore((s) => s.fetchConflicts);

  const ws = useWebSocket(roomId);

  useEffect(() => {
    if (!roomId) {
      setIsInitializing(false);
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setInitError(null);

    Promise.all([
      fetchRoom(roomId),
      fetchPlaces(roomId),
      fetchSchedule(roomId),
      fetchConflicts(roomId),
    ])
      .catch((err) => {
        if (isMounted) {
          const msg =
            (err as { message?: string })?.message ||
            'Không thể tải dữ liệu phòng.';
          setInitError(msg);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsInitializing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [roomId, fetchRoom, fetchPlaces, fetchSchedule, fetchConflicts]);

  const isHost = currentMember?.role === 'HOST';

  return {
    roomId,
    room,
    members,
    currentMember,
    isHost,
    places,
    schedule,
    conflicts,
    isInitializing,
    initError,
    ws,
  };
}
