import { useEffect, useState } from 'react';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useDecisionStore } from '../store/useDecisionStore';
import { nextReview, phaseStep, resolveViewStep, roomPhase, type PhaseReview, type PhaseStep, type RoomPhase } from './phase';

export interface UseRoomPhaseResult {
  phase: RoomPhase;
  step: PhaseStep;
  /** Bước đang được xem; bằng `step` khi không ở chế độ xem lại. */
  viewStep: PhaseStep;
  /** Xem lại bước cũ (chỉ nhận bước ≤ `step`); truyền `null` hoặc đúng `step` để thoát. */
  setViewStep: (s: PhaseStep | null) => void;
}

/** Gom dữ liệu từ store → giai đoạn. `viewStep` tự xoá khi `phase` đổi. */
export function useRoomPhase(): UseRoomPhaseResult {
  const room = useRoomStore((s) => s.room);
  const places = usePlaceStore((s) => s.places);
  const schedule = useScheduleStore((s) => s.items);
  const hints = useDecisionStore((s) => s.hints);

  const phase = roomPhase({ room, places, schedule, hints });
  const step = phaseStep(phase);

  const [review, setReview] = useState<PhaseReview | null>(null);

  // Giai đoạn đổi (do dữ liệu) → bỏ chế độ xem lại.
  useEffect(() => {
    setReview(null);
  }, [phase]);

  const viewStep = resolveViewStep(review, phase);
  const setViewStep = (s: PhaseStep | null) => setReview(nextReview(phase, s));

  return { phase, step, viewStep, setViewStep };
}
