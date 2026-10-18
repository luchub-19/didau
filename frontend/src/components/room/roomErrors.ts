import type { TFunction } from 'i18next';

/**
 * Chọn câu lỗi theo mã lỗi của server (không hiển thị nguyên văn message tiếng Việt).
 * Giữ riêng khỏi describeApiError (serverText.ts) vì câu ở đây theo ngữ cảnh tạo/vào phòng
 * (ví dụ biệt danh trùng báo ở ô biệt danh); mã lạ rơi về câu chung của form.
 */
export function describeRoomError(
  err: unknown,
  t: TFunction,
  fallbackKey: 'room.create.errGeneric' | 'room.join.errGeneric',
): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return t('room.join.errNotFound');
    case 'NICKNAME_TAKEN':
      return t('room.join.errNicknameTaken');
    case 'RATE_LIMIT_EXCEEDED':
      return t('room.join.errRate');
    default:
      return t(fallbackKey);
  }
}

/** Lấy mã phòng 6 ký tự từ ô nhập: chấp nhận mã trần hoặc cả link mời (?code=XXXXXX). */
export function normalizeRoomCode(raw: string): string {
  const fromLink = raw.match(/[?&]code=([A-Za-z0-9]+)/);
  const source = fromLink ? fromLink[1] : raw;
  return source.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
}
