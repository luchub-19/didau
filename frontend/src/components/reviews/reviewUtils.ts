import type { Place, Poi } from '../../types';

// Danh sách tag nhanh cố định, khớp REVIEW_TAGS ở backend (schemas/review.py)
export const REVIEW_TAGS = [
  'ngon',
  'đáng tiền',
  'chỗ ngồi thoải mái',
  'đông',
  'phục vụ chậm',
] as const;

export const REVIEW_COMMENT_MAX = 280;

/** Khoá đánh giá: external_id nếu có, quán thêm tay thì `room_place:<uuid>`. */
export function reviewKeyFor(place?: Place | null, poi?: Poi | null): string | null {
  const externalId = place?.external_id || poi?.external_id;
  if (externalId) return externalId;
  return place ? `room_place:${place.id}` : null;
}

/** Trả thông báo lỗi tiếng Việt, hoặc null nếu hợp lệ. */
export function validateReview(rating: number, comment: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return 'Hãy chọn số sao từ 1 đến 5.';
  }
  if (comment.length > REVIEW_COMMENT_MAX) {
    return `Nhận xét tối đa ${REVIEW_COMMENT_MAX} ký tự.`;
  }
  return null;
}
