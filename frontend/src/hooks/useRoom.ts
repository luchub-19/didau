import { useEffect, useState } from 'react';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useConflictStore } from '../store/useConflictStore';
import { useDecisionStore } from '../store/useDecisionStore';
import { useWebSocket } from './useWebSocket';

export function useRoom(roomId?: string) {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);

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

  const fetchHints = useDecisionStore((s) => s.fetchHints);

  const ws = useWebSocket(roomId);

  useEffect(() => {
    if (!roomId) {
      setIsInitializing(false);
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setInitError(null);
    setNeedsJoin(false);

    Promise.all([
      fetchRoom(roomId),
      fetchPlaces(roomId),
      fetchSchedule(roomId),
      fetchConflicts(roomId),
      fetchHints(roomId),
    ])
      .catch((err) => {
        if (isMounted) {
          const { code, message } = err as { code?: string; message?: string };
          // Chưa có token hoặc token thuộc phòng khác: cần nhập mã phòng để vào.
          setNeedsJoin(code === 'UNAUTHORIZED' || code === 'FORBIDDEN');
          setInitError(message || 'Không thể tải dữ liệu phòng.');
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
  }, [roomId, fetchRoom, fetchPlaces, fetchSchedule, fetchConflicts, fetchHints]);

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
    needsJoin,
    ws,
  };
}
