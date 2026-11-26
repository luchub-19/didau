// Mô hình thuần của phần "Nhóm chat rối" (T-126, PLAN §4.5): thứ tự tin, nhịp tới lần lượt, bộ đếm 53.
import type { CastId } from '../cast';

export interface ChatMsg {
  key: 'm1' | 'm2' | 'm3' | 'm4' | 'm5';
  who: CastId;
  /** Người ở xa (Xeko) mờ hơn. */
  dim?: boolean;
}

/** Các tin trước mốc "Thứ Bảy" và tin chốt câu. */
export const CHAT_BEFORE: readonly ChatMsg[] = [
  { key: 'm1', who: 'Nobita' },
  { key: 'm2', who: 'Doraemon' },
  { key: 'm3', who: 'Xuka' },
  { key: 'm4', who: 'Xeko', dim: true },
];
export const CHAT_LAST: ChatMsg = { key: 'm5', who: 'Nobita' };

export const UNREAD_TOTAL = 53;
/** Mỗi tin tới cách nhau 280 ms; "đang gõ" ≤ 1,1 s; bộ đếm chạy 900 ms (PLAN §4.5). */
export const CHAT_STEP_MS = 280;
export const TYPING_MS = 1100;
export const COUNT_MS = 900;

/** Số phần tử `.seq`: mốc Thứ Tư + 4 tin + bộ đếm + mốc Thứ Bảy + tin chốt. */
export const SEQ_COUNT = 1 + CHAT_BEFORE.length + 1 + 1 + 1;

/** Trễ chuyển của phần tử thứ i (0 = mốc Thứ Tư). */
export const seqDelay = (i: number): number => i * CHAT_STEP_MS;

/** Bộ đếm chạy sau khi 5 phần tử đầu đã tới. */
export const COUNT_START_MS = 5 * CHAT_STEP_MS;
/** "Đang gõ" bật khi phần tử trước tin chốt đã tới, tắt sau TYPING_MS thì tin chốt hiện. */
export const TYPING_START_MS = (SEQ_COUNT - 1) * CHAT_STEP_MS;

/** Giá trị bộ đếm tại tiến độ p ∈ [0,1]. */
export const unreadAt = (p: number): number => Math.round(UNREAD_TOTAL * Math.max(0, Math.min(1, p)));
