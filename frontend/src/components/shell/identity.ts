// Logic thuần của "N đang xem" và menu danh tính (DESIGN gđ5 §4).
import type { Member } from '../../types';
import { PRESENCE_TTL_MS, type PeerMap } from '../../stage/presence/rules';

export interface ViewerSplit {
  /** Đang xem: mình + người còn hạn hiện diện (mình luôn đứng đầu). */
  viewing: Member[];
  /** Vắng: thành viên còn lại. */
  away: Member[];
}

/** Id những người đang xem: mình + peer còn hạn (TTL 15 s), bỏ trùng và peer không còn trong phòng. */
export function viewerIds(
  peers: PeerMap,
  meId: string | undefined,
  members: Member[],
  now: number,
  ttl = PRESENCE_TTL_MS,
): string[] {
  const known = new Set(members.map((m) => m.id));
  const ids: string[] = [];
  if (meId) ids.push(meId);
  for (const [id, p] of Object.entries(peers)) {
    if (id === meId || !known.has(id)) continue;
    if (now - p.at < ttl) ids.push(id);
  }
  return ids;
}

/** Chia thành viên theo "Đang xem" / "Vắng"; giữ thứ tự gốc trong từng nhóm, mình lên đầu nhóm xem. */
export function splitViewers(members: Member[], ids: string[]): ViewerSplit {
  const set = new Set(ids);
  const viewing = members.filter((m) => set.has(m.id));
  const away = members.filter((m) => !set.has(m.id));
  const meId = ids[0];
  viewing.sort((a, b) => Number(b.id === meId) - Number(a.id === meId));
  return { viewing, away };
}

/** Việc nào hiện trong menu avatar, theo vai trò và trạng thái phòng. */
export function identityMenuItems(isHost: boolean, status: string): {
  tieBreak: boolean;
} {
  return { tieBreak: isHost && status !== 'FINALIZED' };
}
