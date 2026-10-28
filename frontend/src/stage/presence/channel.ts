// Kênh hiện diện (CR-08): một chỗ nối socket ↔ store ↔ các nguồn tiêu điểm (thẻ quán, bản đồ).
// useWebSocket gắn bộ gửi khi socket mở; thẻ quán/lớp bản đồ chỉ gọi setHoverPlace/setMapCursor.
// Tab ẩn: gửi null một lần, ngừng gửi, bỏ hiện diện đã nhận và bỏ qua sự kiện tới cho đến khi tab hiện lại.
import { useMapStore } from '../../store/useMapStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { useRoomStore } from '../../store/useRoomStore';
import {
  composeFocus,
  createPresenceSender,
  nextExpiryIn,
  parseFocus,
  type PresenceFocus,
  type PresenceSender,
} from './rules';

let sender: PresenceSender | null = null;
let hoverPlaceId: string | null = null;
let cursor: { lng: number; lat: number } | null = null;

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function selectedPlaceId(): string | null {
  const sel = useMapStore.getState().selection;
  return sel?.kind === 'place' ? sel.id : null;
}

function currentFocus(): PresenceFocus {
  return composeFocus({ hoverPlaceId, cursor, selectedPlaceId: selectedPlaceId() });
}

function push(): void {
  sender?.update(currentFocus());
}

/** Rê chuột/focus vào thẻ quán hoặc ghim quán (null khi rời). */
export function setHoverPlace(placeId: string | null): void {
  if (hoverPlaceId === placeId) return;
  hoverPlaceId = placeId;
  push();
}

/** Bỏ tiêu điểm rê chuột nếu nó đang là quán này (thẻ/ghim bị gỡ). */
export function clearHoverPlace(placeId: string): void {
  if (hoverPlaceId === placeId) setHoverPlace(null);
}

/** Con trỏ chuột trên bản đồ phòng (null khi rời bản đồ). */
export function setMapCursor(lngLat: { lng: number; lat: number } | null): void {
  cursor = lngLat;
  push();
}

/** Socket vừa mở: gắn bộ gửi. Trả hàm gỡ khi socket đóng. */
export function attachPresenceTransport(send: (focus: PresenceFocus) => boolean): () => void {
  sender?.dispose();
  const own = createPresenceSender(send);
  sender = own;
  if (isHidden()) own.pause();
  else own.update(currentFocus());
  return () => {
    own.dispose();
    if (sender === own) sender = null;
  };
}

/** PRESENCE_UPDATED từ server. */
export function receivePresence(payload: { member_id?: unknown; focus?: unknown }): void {
  if (isHidden() || typeof payload.member_id !== 'string') return;
  if (payload.member_id === useRoomStore.getState().currentMember?.id) return;
  const focus = parseFocus(payload.focus ?? null);
  if (focus === undefined) return;
  usePresenceStore.getState().applyRemote(payload.member_id, focus);
}

/** VOTE_UPDATED có voter_id (CR-08); thiếu trường (server cũ) thì không làm gì. */
export function receiveVote(placeId: string, voterId: unknown): void {
  if (isHidden() || typeof voterId !== 'string') return;
  if (voterId === useRoomStore.getState().currentMember?.id) return;
  usePresenceStore.getState().pulse(voterId, placeId);
}

/** Bật kênh cho một phòng: nghe tab ẩn/hiện, quán đang mở trên bản đồ, hẹn giờ hết hạn. */
export function startPresence(): () => void {
  let expiry: ReturnType<typeof setTimeout> | null = null;

  const scheduleExpiry = () => {
    if (expiry !== null) clearTimeout(expiry);
    expiry = null;
    const left = nextExpiryIn(usePresenceStore.getState().peers, Date.now());
    if (left === null) return;
    expiry = setTimeout(() => {
      expiry = null;
      usePresenceStore.getState().prune();
    }, left + 50);
  };

  const unsubPeers = usePresenceStore.subscribe((s, prev) => {
    if (s.peers !== prev.peers) scheduleExpiry();
  });
  const unsubSelection = useMapStore.subscribe((s, prev) => {
    if (s.selection !== prev.selection) push();
  });

  const onVisibility = () => {
    if (isHidden()) {
      sender?.pause();
      usePresenceStore.getState().reset();
    } else {
      sender?.resume();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    unsubPeers();
    unsubSelection();
    if (expiry !== null) clearTimeout(expiry);
    sender?.dispose();
    sender = null;
    hoverPlaceId = null;
    cursor = null;
    usePresenceStore.getState().reset();
  };
}
