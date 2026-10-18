import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Copy, ShareNetwork, IconButton } from '../ui';
import { copyText, shareRoom } from '../room/shareRoom';

export interface RoomTopBarProps {
  title: string;
  code: string;
  roomId: string;
  isConnected: boolean;
  onGoHome: () => void;
  children?: React.ReactNode;
}

export const RoomTopBar: React.FC<RoomTopBarProps> = ({
  title,
  code,
  roomId,
  isConnected,
  onGoHome,
  children,
}) => {
  const { t } = useTranslation();

  const handleCopyCode = () =>
    copyText(code, t('room.codeCopied'), t('invite.copyFailed'));

  const handleShare = () => shareRoom({ roomId, code, title, t });

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-tabbar">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Bên trái: Nút về trang chủ + Tên phòng + Mã phòng */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <IconButton
            icon={<ArrowLeft size={20} />}
            aria-label={t('common.back')}
            onClick={onGoHome}
            className="flex-shrink-0"
          />

          <div className="min-w-0 flex items-center gap-2">
            <h1 className="text-heading font-semibold text-ink truncate max-w-[140px] sm:max-w-xs md:max-w-md">
              {title}
            </h1>

            <button
              type="button"
              onClick={handleCopyCode}
              aria-label={t('room.copyCode')}
              title={t('room.copyCode')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-surface-2 hover:bg-line text-ink-2 hover:text-ink text-caption font-mono font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text flex-shrink-0"
            >
              <span>{code}</span>
              <Copy size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Bên phải: Trạng thái kết nối + Nút chia sẻ */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold bg-success-soft text-success border border-success/20">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="hidden sm:inline">{t('connection.live')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold bg-warning-soft text-warning border border-warning/20">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span className="hidden sm:inline">{t('connection.offline')}</span>
            </span>
          )}

          <IconButton
            icon={<ShareNetwork size={20} />}
            aria-label={t('room.share')}
            onClick={handleShare}
          />
        </div>
      </div>

      {children}
    </header>
  );
};
