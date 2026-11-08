// Luật `state_version` phía client (CR-13, ALGORITHMS §8, CONTRACTS §4.2). Logic thuần để test không cần socket.
//
// Client giữ SỐ LỚN NHẤT đã áp:
//  - tin có số nhỏ hơn            → bỏ (gói trễ đến sau tin mới hơn);
//  - tin có số bằng               → áp (tin tạm thời mang số hiện tại; CONFLICTS_UPDATED ngầm dùng lại số của tin gây ra nó);
//  - tin có số đúng +1            → áp, nâng số;
//  - tin có số lớn hơn +1 (nhảy cóc) → bỏ tin đó và xin đồng bộ lại (SUBSCRIBE_ROOM) vì đã lỡ ít nhất một thay đổi;
//  - `ROOM_STATE_SYNC` luôn áp và đặt lại số gốc;
//  - tin không có số (server cũ) → áp, không đụng số đang giữ.

export interface StateVersionTracker {
  /** Số lớn nhất đã áp; `null` = chưa biết (chưa nhận đồng bộ nào). */
  applied: number | null;
  /** Đã gửi yêu cầu đồng bộ lại mà chưa nhận `ROOM_STATE_SYNC`: đừng gửi dồn. */
  resyncing: boolean;
}

export type StateVersionDecision = 'apply' | 'drop' | 'resync';

export const SYNC_MESSAGE_TYPE = 'ROOM_STATE_SYNC';

export function createTracker(): StateVersionTracker {
  return { applied: null, resyncing: false };
}

/** Số `state_version` của một khung WS: ưu tiên khung ngoài, lùi về payload (ROOM_STATE_SYNC). */
export function versionOf(envelope: { state_version?: unknown; payload?: unknown }): number | null {
  const outer = envelope.state_version;
  if (typeof outer === 'number' && Number.isFinite(outer)) return outer;
  const inner = (envelope.payload as { state_version?: unknown } | null | undefined)?.state_version;
  return typeof inner === 'number' && Number.isFinite(inner) ? inner : null;
}

/**
 * Quyết định áp/bỏ/đồng bộ lại cho một tin. Trả quyết định và tracker MỚI (không sửa tracker cũ).
 * `resync` chỉ trả MỘT lần cho tới khi có `ROOM_STATE_SYNC`; các tin nhảy cóc sau đó bị bỏ im lặng (`drop`).
 */
export function decide(
  tracker: StateVersionTracker,
  type: string,
  version: number | null,
): { decision: StateVersionDecision; tracker: StateVersionTracker } {
  if (type === SYNC_MESSAGE_TYPE) {
    return {
      decision: 'apply',
      tracker: { applied: version ?? tracker.applied, resyncing: false },
    };
  }
  if (version === null) return { decision: 'apply', tracker };
  if (tracker.applied === null) {
    // Chưa có số gốc (kết nối mở nhưng chưa nhận đồng bộ): nhận số đầu tiên làm gốc
    return { decision: 'apply', tracker: { ...tracker, applied: version } };
  }
  if (version < tracker.applied) return { decision: 'drop', tracker };
  if (version <= tracker.applied + 1) {
    return { decision: 'apply', tracker: { ...tracker, applied: version } };
  }
  // Nhảy cóc: lỡ thay đổi → bỏ tin, xin đồng bộ lại (một lần)
  if (tracker.resyncing) return { decision: 'drop', tracker };
  return { decision: 'resync', tracker: { ...tracker, resyncing: true } };
}

/**
 * Cổng cho `WebSocketClient.setGate`: giữ tracker bên trong, gọi `onResync` khi nhảy cóc.
 * `reset()` đặt lại số gốc (mỗi lần mở socket, vì server gửi `ROOM_STATE_SYNC` sau `SUBSCRIBE_ROOM`).
 */
export function createStateVersionGate(onResync: () => void): {
  gate: (envelope: { type: string; state_version?: unknown; payload?: unknown }) => boolean;
  reset: () => void;
} {
  let tracker = createTracker();
  return {
    gate: (envelope) => {
      const res = decide(tracker, envelope.type, versionOf(envelope));
      tracker = res.tracker;
      if (res.decision === 'resync') onResync();
      return res.decision === 'apply';
    },
    reset: () => {
      tracker = createTracker();
    },
  };
}
