import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet, TextField } from '../ui';
import { useRoomStore } from '../../store/useRoomStore';
import { describeRoomError, normalizeRoomCode } from './roomErrors';

export interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
  initialCode?: string;
}

const FORM_ID = 'join-room-form';

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCode = '',
}) => {
  const { t } = useTranslation();
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const isLoading = useRoomStore((s) => s.isLoading);

  const [roomCode, setRoomCode] = useState(normalizeRoomCode(initialCode));
  const [nickname, setNickname] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  // Mở lại sheet với mã khác (ví dụ chạm "Tiếp tục phòng") thì điền lại mã
  useEffect(() => {
    if (isOpen) setRoomCode(normalizeRoomCode(initialCode));
  }, [isOpen, initialCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setCodeError(null);
    setNicknameError(null);

    const cleanCode = normalizeRoomCode(roomCode);
    if (cleanCode.length !== 6) {
      setCodeError(t('room.join.errCode'));
      return;
    }
    if (!nickname.trim()) {
      setNicknameError(t('room.join.errNickname'));
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
      const code = (err as { code?: string } | null)?.code;
      const message = describeRoomError(err, t, 'room.join.errGeneric');
      // Biệt danh trùng báo ở ô biệt danh, còn lại báo ở ô mã
      if (code === 'NICKNAME_TAKEN') setNicknameError(message);
      else setCodeError(message);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('room.join.title')}
      description={t('room.join.desc')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={isLoading}>
            {t('room.join.submit')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4 pb-2" noValidate>
        <TextField
          label={t('room.join.codeLabel')}
          hint={t('room.join.codeHint')}
          error={codeError}
          value={roomCode}
          onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          required
        />
        <TextField
          label={t('room.join.nicknameLabel')}
          placeholder={t('room.join.nicknamePlaceholder')}
          error={nicknameError}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={30}
          required
        />
      </form>
    </Sheet>
  );
};
