import type { DeciderHint, Place, Room, ScheduleItem } from '../types';

/** Giai đoạn của phòng (DESIGN gđ5 §3). `tie` thuộc bước ② nhưng có bố cục riêng. */
export type RoomPhase = 'gather' | 'vote' | 'tie' | 'lock' | 'send';

export type PhaseStep = 1 | 2 | 3 | 4;

export const PHASE_STEPS: readonly PhaseStep[] = [1, 2, 3, 4];

export interface RoomPhaseInput {
  room: Pick<Room, 'status'> | null | undefined;
  places: readonly Pick<Place, 'status'>[];
  schedule: readonly Pick<ScheduleItem, 'id'>[];
  hints: readonly Pick<DeciderHint, 'type'>[];
}

/** Thứ tự ưu tiên: send > lock > tie > vote > gather. Quán REJECTED không được đếm. */
export function roomPhase({ room, places, schedule, hints }: RoomPhaseInput): RoomPhase {
  if (room?.status === 'FINALIZED' || schedule.length > 0) return 'send';
  if (places.some((p) => p.status === 'ACCEPTED')) return 'lock';
  const alive = places.filter((p) => p.status !== 'REJECTED').length;
  if (alive >= 2) {
    const top = hints[0]?.type;
    return top === 'TIE_AT_TOP' || top === 'NEAR_TIE' ? 'tie' : 'vote';
  }
  return 'gather';
}

export function phaseStep(phase: RoomPhase): PhaseStep {
  switch (phase) {
    case 'gather':
      return 1;
    case 'vote':
    case 'tie':
      return 2;
    case 'lock':
      return 3;
    case 'send':
      return 4;
  }
}

/** "Xem lại" bước cũ, gắn với giai đoạn lúc bấm; giai đoạn đổi thì mất hiệu lực. */
export interface PhaseReview {
  phase: RoomPhase;
  step: PhaseStep;
}

export function resolveViewStep(review: PhaseReview | null, phase: RoomPhase): PhaseStep {
  const step = phaseStep(phase);
  return review && review.phase === phase && review.step < step ? review.step : step;
}

/** Bước tương lai hoặc đúng bước hiện tại = thoát chế độ xem lại. */
export function nextReview(phase: RoomPhase, target: PhaseStep | null): PhaseReview | null {
  if (target == null || target >= phaseStep(phase)) return null;
  return { phase, step: target };
}
