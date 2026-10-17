import React, { useState } from 'react';
import { Button, Input, Modal } from '../common';
import { useRoomStore } from '../../store/useRoomStore';

export interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
  initialCode?: string;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCode = '',
}) => {
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const isLoading = useRoomStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);

  const [roomCode, setRoomCode] = useState(initialCode);
  const [nickname, setNickname] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = roomCode.trim().toUpperCase();
    if (!cleanCode) {
      setError('Vui lòng nhập mã phòng 6 ký tự.');
      return;
    }
    if (!nickname.trim()) {
      setError('Vui lòng nhập biệt danh của bạn.');
      return;
    }

    try {
      const res = await joinRoom({
        room_code: cleanCode,
        nickname: nickname.trim(),
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
          nickname.trim(),
        )}`,
      });

      onClose();
      onSuccess(res.room.id);
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'Không thể tham gia phòng. Vui lòng kiểm tra lại mã phòng hoặc thử nickname khác.';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tham gia phòng lập kế hoạch"
      description="Nhập mã phòng do bạn bè chia sẻ để cùng chọn quán và bỏ phiếu."
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <Input
          label="Mã phòng (Room Code)"
          placeholder="Ví dụ: DIDAU8"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          maxLength={10}
          required
          autoFocus
        />

        <Input
          label="Biệt danh của bạn"
          placeholder="Ví dụ: ThuTrang"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
        />

        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Vào phòng
          </Button>
        </div>
      </form>
    </Modal>
  );
};
