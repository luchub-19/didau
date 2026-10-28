// Hiện diện realtime của người khác trong phòng (CR-08). Chỉ ở RAM, không lưu, không gọi API.
import { create } from 'zustand';
import { pruneExpired, type PeerMap, type PresenceFocus } from '../stage/presence/rules';

export interface VotePulse {
  placeId: string;
  /** Tăng mỗi lần người này bỏ phiếu: component phát nhịp một lần khi số đổi. */
  seq: number;
  /** Mốc bỏ phiếu (ms): avatar vừa hiện do chính phiếu này vẫn phát nhịp. */
  at: number;
}

interface PresenceState {
  peers: PeerMap;
  pulses: Record<string, VotePulse>;
  applyRemote: (memberId: string, focus: PresenceFocus, now?: number) => void;
  /** Ai đó vừa bỏ phiếu: coi như họ đang xem quán đó, và phát nhịp. */
  pulse: (memberId: string, placeId: string, now?: number) => void;
  remove: (memberId: string) => void;
  prune: (now?: number) => void;
  reset: () => void;
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec };
  delete next[key];
  return next;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  peers: {},
  pulses: {},

  applyRemote: (memberId, focus, now = Date.now()) =>
    set((s) => {
      if (focus === null) {
        if (!(memberId in s.peers)) return s;
        return { peers: omit(s.peers, memberId) };
      }
      return { peers: { ...s.peers, [memberId]: { focus, at: now } } };
    }),

  pulse: (memberId, placeId, now = Date.now()) =>
    set((s) => ({
      peers: { ...s.peers, [memberId]: { focus: { kind: 'place', place_id: placeId }, at: now } },
      pulses: { ...s.pulses, [memberId]: { placeId, seq: (s.pulses[memberId]?.seq ?? 0) + 1, at: now } },
    })),

  remove: (memberId) =>
    set((s) => {
      if (!(memberId in s.peers) && !(memberId in s.pulses)) return s;
      return { peers: omit(s.peers, memberId), pulses: omit(s.pulses, memberId) };
    }),

  prune: (now = Date.now()) =>
    set((s) => {
      const peers = pruneExpired(s.peers, now);
      return peers === s.peers ? s : { peers };
    }),

  reset: () => set({ peers: {}, pulses: {} }),
}));
