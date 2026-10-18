import type { Place, Poi } from '../../types';

// Danh sách tag nhanh cố định, khớp REVIEW_TAGS ở backend (schemas/review.py)
export const REVIEW_TAGS = [
  'ngon',
  '\u0111\u00e1ng ti\u1ec1n',
  'ch\u1ed7 ng\u1ed3i tho\u1ea3i m\u00e1i',
  '\u0111\u00f4ng',
  'ph\u1ee5c v\u1ee5 ch\u1eadm',
] as const;

export const REVIEW_COMMENT_MAX = 280;

/** Khoá đánh giá: external_id nếu có, quán thêm tay thì `room_place:<uuid>`. */
export function reviewKeyFor(place?: Place | null, poi?: Poi | null): string | null {
  const externalId = place?.external_id || poi?.external_id;
  if (externalId) return externalId;
  return place ? `room_place:${place.id}` : null;
}

export type ReviewValidationErrorKey = 'review.error.rating' | 'review.error.commentTooLong';

/** Tra ve khoa loi i18n, hoac null neu hop le. */
export function validateReview(
  rating: number,
  comment: string,
): ReviewValidationErrorKey | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return 'review.error.rating';
  }
  if (comment.length > REVIEW_COMMENT_MAX) {
    return 'review.error.commentTooLong';
  }
  return null;
}
