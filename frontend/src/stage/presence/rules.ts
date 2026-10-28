// Luật hiện diện realtime (CR-08), hàm thuần để test không cần socket/bản đồ.
// Gửi: ≤ 5 lần/giây, không gửi khi tiêu điểm không đổi, đang giữ tiêu điểm thì gửi lại mỗi 10 s.
// Nhận: tiêu điểm của người khác hết hạn sau 15 s không cập nhật.

export type PresenceFocus =
  | { kind: 'place'; place_id: string }
  | { kind: 'map'; lng: number; lat: number }
  | null;

export interface PeerPresence {
  focus: Exclude<PresenceFocus, null>;
  /** Mốc nhận cập nhật gần nhất (ms). */
  at: number;
}

export type PeerMap = Record<string, PeerPresence>;

export const PRESENCE_TTL_MS = 15_000;
export const PRESENCE_KEEPALIVE_MS = 10_000;
/** 5 lần/giây: khớp giới hạn của server, cũng là nhịp nội suy con trỏ. */
export const PRESENCE_MIN_INTERVAL_MS = 200;
export const PRESENCE_MAX_AVATARS = 3;
/** Con trỏ bạn bè trên bản đồ chỉ hiện từ bề rộng này (desktop). */
export const PRESENCE_CURSOR_MIN_WIDTH = 1024;

// ~1 m: con trỏ nhích dưới ngưỡng này coi như không đổi
const COORD_EPS = 1e-5;

export function sameFocus(a: PresenceFocus, b: PresenceFocus): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'place' && b.kind === 'place') return a.place_id === b.place_id;
  if (a.kind === 'map' && b.kind === 'map') {
    return Math.abs(a.lng - b.lng) < COORD_EPS && Math.abs(a.lat - b.lat) < COORD_EPS;
  }
  return false;
}

/** Đọc `focus` từ server. Trả `undefined` nếu sai dạng (bỏ qua sự kiện). */
export function parseFocus(raw: unknown): PresenceFocus | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const f = raw as Record<string, unknown>;
  if (f.kind === 'place' && typeof f.place_id === 'string' && f.place_id) {
    return { kind: 'place', place_id: f.place_id };
  }
  if (f.kind === 'map' && Number.isFinite(f.lng) && Number.isFinite(f.lat)) {
    return { kind: 'map', lng: f.lng as number, lat: f.lat as number };
  }
  return undefined;
}

/** Bỏ người đã quá hạn. Không có ai hết hạn thì trả lại đúng object cũ (zustand không render lại). */
export function pruneExpired(peers: PeerMap, now: number, ttl = PRESENCE_TTL_MS): PeerMap {
  let changed = false;
  const next: PeerMap = {};
  for (const [id, p] of Object.entries(peers)) {
    if (now - p.at >= ttl) changed = true;
    else next[id] = p;
  }
  return changed ? next : peers;
}

/** Bao lâu nữa có người hết hạn (ms), `null` nếu không còn ai. */
export function nextExpiryIn(peers: PeerMap, now: number, ttl = PRESENCE_TTL_MS): number | null {
  let min: number | null = null;
  for (const p of Object.values(peers)) {
    const left = Math.max(0, p.at + ttl - now);
    if (min === null || left < min) min = left;
  }
  return min;
}

/** Ai đang xem quán nào: placeId → memberId theo thứ tự đến trước. */
export function viewersByPlace(peers: PeerMap, excludeId?: string | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const sorted = Object.entries(peers).sort((a, b) => a[1].at - b[1].at);
  for (const [id, p] of sorted) {
    if (id === excludeId || p.focus.kind !== 'place') continue;
    (out[p.focus.place_id] ??= []).push(id);
  }
  return out;
}

/** Con trỏ bản đồ của người khác: memberId → toạ độ. */
export function mapCursors(peers: PeerMap, excludeId?: string | null): Record<string, { lng: number; lat: number }> {
  const out: Record<string, { lng: number; lat: number }> = {};
  for (const [id, p] of Object.entries(peers)) {
    if (id !== excludeId && p.focus.kind === 'map') out[id] = { lng: p.focus.lng, lat: p.focus.lat };
  }
  return out;
}

/** Tối đa 3 avatar + "+N". */
/** Dải trên cùng của bản đồ bị ô tìm kiếm che (px, tính từ mép trên khung bản đồ). */
export const PIN_CHIP_SAFE_TOP = 120;
const PIN_CHIP_ABOVE: [number, number] = [0, -18];
const PIN_CHIP_BELOW: [number, number] = [0, 34];

/** Offset (Marker anchor 'bottom') của chip avatar trên ghim: ghim nằm sát mép trên thì lật chip xuống dưới ghim. */
export function pinChipOffset(pinY: number, safeTop = PIN_CHIP_SAFE_TOP): [number, number] {
  return pinY < safeTop ? PIN_CHIP_BELOW : PIN_CHIP_ABOVE;
}

export function avatarStack<T>(ids: T[], max = PRESENCE_MAX_AVATARS): { shown: T[]; extra: number } {
  if (ids.length <= max) return { shown: ids, extra: 0 };
  return { shown: ids.slice(0, max), extra: ids.length - max };
}

/** Tiêu điểm cục bộ gộp từ 3 nguồn: rê chuột trên quán > con trỏ bản đồ > quán đang mở. */
export function composeFocus(src: {
  hoverPlaceId: string | null;
  cursor: { lng: number; lat: number } | null;
  selectedPlaceId: string | null;
}): PresenceFocus {
  if (src.hoverPlaceId) return { kind: 'place', place_id: src.hoverPlaceId };
  if (src.cursor) return { kind: 'map', lng: src.cursor.lng, lat: src.cursor.lat };
  if (src.selectedPlaceId) return { kind: 'place', place_id: src.selectedPlaceId };
  return null;
}

/** Nội suy con trỏ: đi một phần quãng còn lại theo thời gian khung, tới đích sau khoảng một nhịp gửi. */
export function approach(current: number, target: number, dtMs: number, spanMs = PRESENCE_MIN_INTERVAL_MS): number {
  const k = 1 - Math.exp((-3 * Math.max(0, dtMs)) / spanMs);
  return current + (target - current) * k;
}

interface Timers {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

const defaultTimers: Timers = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface PresenceSender {
  /** Tiêu điểm cục bộ mới (có thể trùng cái cũ: không gửi). */
  update(focus: PresenceFocus): void;
  /** Tab ẩn: gửi `null` một lần rồi ngừng. */
  pause(): void;
  /** Tab hiện lại / vừa kết nối lại: gửi lại tiêu điểm hiện tại. */
  resume(): void;
  dispose(): void;
}

/**
 * Bộ gửi có throttle (cạnh sau), bỏ trùng và keepalive.
 * `send` trả false khi socket chưa mở: coi như chưa gửi, lần cập nhật sau sẽ thử lại.
 */
export function createPresenceSender(send: (focus: PresenceFocus) => boolean, timers: Timers = defaultTimers): PresenceSender {
  let desired: PresenceFocus = null;
  let lastSent: PresenceFocus = null;
  let lastSentAt = -Infinity;
  let paused = false;
  let trailing: unknown = null;
  let keepalive: unknown = null;

  const clear = () => {
    if (trailing !== null) timers.clearTimer(trailing);
    if (keepalive !== null) timers.clearTimer(keepalive);
    trailing = keepalive = null;
  };

  const sendNow = (focus: PresenceFocus) => {
    clear();
    if (!send(focus)) return;
    lastSent = focus;
    lastSentAt = timers.now();
    if (focus !== null) {
      keepalive = timers.setTimer(() => {
        keepalive = null;
        if (!paused) sendNow(lastSent);
      }, PRESENCE_KEEPALIVE_MS);
    }
  };

  const schedule = () => {
    if (paused || trailing !== null) return;
    if (sameFocus(desired, lastSent)) return;
    const wait = lastSentAt + PRESENCE_MIN_INTERVAL_MS - timers.now();
    if (wait <= 0) {
      sendNow(desired);
      return;
    }
    trailing = timers.setTimer(() => {
      trailing = null;
      if (!paused && !sameFocus(desired, lastSent)) sendNow(desired);
    }, wait);
  };

  return {
    update(focus) {
      desired = focus;
      schedule();
    },
    pause() {
      if (paused) return;
      paused = true;
      clear();
      if (lastSent !== null && send(null)) {
        lastSent = null;
        lastSentAt = timers.now();
      }
    },
    resume() {
      paused = false;
      lastSent = null;
      if (desired !== null) sendNow(desired);
    },
    dispose() {
      paused = true;
      clear();
    },
  };
}
