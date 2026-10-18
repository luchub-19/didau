import type { TFunction } from 'i18next';
import { toast } from '../ui';

export interface ShareRoomInput {
  roomId: string;
  code: string;
  title: string;
  t: TFunction;
}

/** Link mời vào phòng, kèm mã để trang vào phòng tự điền. */
export function buildInviteUrl(roomId: string, code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/rooms/${roomId}?code=${code}`;
}

/**
 * Chia sẻ link phòng: dùng navigator.share nếu có (HTTPS/localhost, thường chỉ trên điện thoại),
 * không có hoặc bị từ chối thì sao chép link và báo bằng toast.
 */
export async function shareRoom({ roomId, code, title, t }: ShareRoomInput): Promise<void> {
  const url = buildInviteUrl(roomId, code);

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text: t('invite.message', { title, app: t('app.name') }), url });
      return;
    } catch (err) {
      // Người dùng tự đóng bảng chia sẻ thì dừng, không sao chép thêm
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  await copyText(url, t('room.linkCopied'), t('invite.copyFailed'));
}

/** Sao chép văn bản vào clipboard và báo kết quả bằng toast. */
export async function copyText(text: string, okMessage: string, failMessage: string): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast.success(okMessage);
      return;
    }
  } catch {
    // Rơi xuống thông báo lỗi bên dưới
  }
  toast.error(failMessage);
}
