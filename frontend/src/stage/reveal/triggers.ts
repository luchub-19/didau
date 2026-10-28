// Phát hiện khoảnh khắc "nhóm vừa chốt quán" từ trạng thái các store đang có (chỉ đọc, không đổi store).
// Hàm thuần: so hai lần quan sát liên tiếp. Chỉ chuyển trạng thái thấy TRỰC TIẾP mới phát; vào phòng muộn
// (lần quan sát đầu đã chốt sẵn) thì không phát lại.
//   A. Phiên chọn hộ (SMART/WHEEL/SWIPE/LADDER) đổi OPEN → RESOLVED: host sau acceptDecision, máy khác qua
//      DECISION_RESOLVED.
//   B. Phòng đổi trạng thái chưa chốt → FINALIZED (VOTING_RESOLVED: bỏ phiếu thường / tie-break, và máy khác
//      khi host chốt phiên chọn hộ — sự kiện này tới trước DECISION_RESOLVED).
//   C. Có quán mới thành ACCEPTED khi phòng chưa chốt (host tự chốt tie-break: store chỉ đổi status quán).
import type { DecisionStatus, Place, RoomStatus } from '../../types';

export interface RevealObservation {
  roomId: string | null;
  roomStatus: RoomStatus | null;
  session: { id: string; status: DecisionStatus; resultPlaceId: string | null } | null;
  places: readonly Pick<Place, 'id' | 'status' | 'score'>[];
}

export interface RevealTrigger {
  /** Khoá nhớ "đã phát": id phiên chọn hộ, hoặc phòng + quán với bỏ phiếu thường. */
  key: string;
  placeId: string;
  /** Khoá theo quán để A/B/C của cùng một lần chốt không phát hai lần. */
  placeKey: string;
}

function acceptedIds(obs: RevealObservation): string[] {
  return obs.places.filter((p) => p.status === 'ACCEPTED').map((p) => p.id);
}

/** Quán đại diện trong các quán vừa chốt: điểm cao nhất, hoà thì quán đứng trước trong danh sách. */
export function pickWinner(obs: RevealObservation, candidateIds: readonly string[]): string | null {
  if (candidateIds.length === 0) return null;
  const preferred = obs.session?.resultPlaceId;
  if (preferred && candidateIds.includes(preferred)) return preferred;
  let best: Pick<Place, 'id' | 'score'> | null = null;
  for (const p of obs.places) {
    if (!candidateIds.includes(p.id)) continue;
    if (best === null || (p.score ?? 0) > (best.score ?? 0)) best = p;
  }
  return best?.id ?? null;
}

function trigger(roomId: string, key: string, placeId: string): RevealTrigger {
  return { key, placeId, placeKey: `place:${roomId}:${placeId}` };
}

export function detectReveal(prev: RevealObservation | null, next: RevealObservation): RevealTrigger | null {
  // Lần quan sát đầu, hoặc đổi phòng: chỉ lấy mốc
  if (!prev || !next.roomId || prev.roomId !== next.roomId) return null;
  const roomId = next.roomId;

  // A. Phiên chọn hộ vừa được chốt
  const s = next.session;
  const ps = prev.session;
  if (s && ps && s.id === ps.id && ps.status === 'OPEN' && s.status === 'RESOLVED' && s.resultPlaceId) {
    return trigger(roomId, `session:${s.id}`, s.resultPlaceId);
  }

  const before = new Set(acceptedIds(prev));
  const after = acceptedIds(next);

  // B. Phòng vừa chốt (đã biết trạng thái trước đó và nó chưa phải FINALIZED)
  if (prev.roomStatus && prev.roomStatus !== 'FINALIZED' && next.roomStatus === 'FINALIZED') {
    const fresh = after.filter((id) => !before.has(id));
    const winner = pickWinner(next, fresh.length > 0 ? fresh : after);
    if (winner) return trigger(roomId, sessionKeyOr(next, roomId, winner), winner);
  }

  // C. Quán mới thành ACCEPTED trong lúc phòng chưa chốt (danh sách trước đó đã tải xong)
  if (prev.places.length > 0 && prev.roomStatus !== 'FINALIZED') {
    const fresh = after.filter((id) => !before.has(id));
    const winner = pickWinner(next, fresh);
    if (winner) return trigger(roomId, sessionKeyOr(next, roomId, winner), winner);
  }

  return null;
}

// Máy khác nhận VOTING_RESOLVED trước DECISION_RESOLVED: phiên vẫn OPEN nhưng đúng là lần chốt của phiên đó
function sessionKeyOr(obs: RevealObservation, roomId: string, placeId: string): string {
  const s = obs.session;
  if (s && s.status !== 'CANCELLED' && s.status !== 'EXPIRED') return `session:${s.id}`;
  return `vote:${roomId}:${placeId}`;
}

/** Bộ nhớ "đã phát" trong RAM (không localStorage): tải lại trang = vào muộn = không phát lại. */
export function createRevealMemory(now: () => number = Date.now) {
  const seen = new Set<string>();
  const shownAt = new Map<string, number>();
  return {
    has(t: RevealTrigger): boolean {
      return seen.has(t.key) || seen.has(t.placeKey);
    },
    remember(t: RevealTrigger): void {
      seen.add(t.key);
      seen.add(t.placeKey);
      shownAt.set(t.placeId, now());
    },
    /** Quán này vừa được công bố (trong `withinMs`): Operate bỏ toast "Đã chốt …" để không đè lớp reveal. */
    recentlyRevealed(placeId: string, withinMs = 3000): boolean {
      const at = shownAt.get(placeId);
      return at !== undefined && now() - at <= withinMs;
    },
    clear(): void {
      seen.clear();
      shownAt.clear();
    },
  };
}

/** Bộ nhớ dùng chung của cả app: lớp phủ có remount (đổi tab, mở lại sheet) cũng không phát lần hai. */
export const revealMemory = createRevealMemory();
