// Giới hạn số quán mỗi người được đề xuất (CR-14, ALGORITHMS §9). Logic thuần.
import type { Place, Room } from '../types';

export interface PlaceQuota {
  /** `null` = không giới hạn (phòng cũ, hoặc host bỏ giới hạn). */
  limit: number | null;
  used: number;
  /** Đã đủ số quán: khoá nút Thêm. Không giới hạn thì luôn false. */
  reached: boolean;
}

/** Các lựa chọn host chỉnh được: số quán/người hoặc không giới hạn (`null`). Mặc định phòng mới = 2 (CR-14). */
export const PLACE_LIMIT_CHOICES: readonly (number | null)[] = [1, 2, 3, null];
export const DEFAULT_PLACE_LIMIT = 2;

/** Số quán `memberId` đã đề xuất còn trong danh sách (quán đã xoá không còn nên không tính). */
export function placesUsedBy(places: readonly Pick<Place, 'submitted_by_id'>[], memberId: string | undefined): number {
  if (!memberId) return 0;
  return places.filter((p) => p.submitted_by_id === memberId).length;
}

export function placeQuota(
  room: Pick<Room, 'max_places_per_member'> | null | undefined,
  places: readonly Pick<Place, 'submitted_by_id'>[],
  memberId: string | undefined,
): PlaceQuota {
  const raw = room?.max_places_per_member;
  const limit = typeof raw === 'number' && raw > 0 ? raw : null;
  const used = placesUsedBy(places, memberId);
  return { limit, used, reached: limit !== null && used >= limit };
}

/** Nhãn "x/y" cho nút Thêm quán; `null` khi không giới hạn (nút giữ nhãn thường). */
export function quotaLabel(q: PlaceQuota): string | null {
  return q.limit === null ? null : `${Math.min(q.used, q.limit)}/${q.limit}`;
}

/** Lỗi 409 `PLACE_LIMIT_REACHED` từ server → `{limit, used}` (đọc `details`), hoặc `null` nếu không phải lỗi này. */
export function parseLimitError(err: unknown): { limit: number; used: number } | null {
  const e = err as { code?: string; details?: { limit?: unknown; used?: unknown } | null } | null;
  if (e?.code !== 'PLACE_LIMIT_REACHED') return null;
  const limit = Number(e.details?.limit);
  const used = Number(e.details?.used);
  return {
    limit: Number.isFinite(limit) ? limit : 0,
    used: Number.isFinite(used) ? used : 0,
  };
}
