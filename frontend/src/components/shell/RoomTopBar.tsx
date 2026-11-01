import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Copy, ShareNetwork, IconButton } from '../ui';
import { copyText, shareRoom } from '../room/shareRoom';
import { useRoomPhase, type UseRoomPhaseResult } from '../../room/useRoomPhase';
import { PhaseStepper } from './PhaseStepper';

export interface RoomTopBarProps {
  title: string;
  code: string;
  roomId: string;
  onGoHome: () => void;
  /** Giai đoạn do RoomPage tính một lần, dùng chung với RoomWorkspace; thiếu thì tự tính (test, nơi gọi khác). */
  phase?: UseRoomPhaseResult;
  /** "N đang xem" — đứng trước nút mời. */
  viewers?: React.ReactNode;
  /** Avatar + tên + vai trò (IdentityMenu) — cuối thanh. */
  identity?: React.ReactNode;
}

export const RoomTopBar: React.FC<RoomTopBarProps> = ({
  title,
  code,
  roomId,
  onGoHome,
  phase,
  viewers,
  identity,
}) => {
  const { t } = useTranslation();
  const ownPhase = useRoomPhase();
  const { step, viewStep, setViewStep } = phase ?? ownPhase;

  const handleCopyCode = () =>
    copyText(code, t('room.codeCopied'), t('invite.copyFailed'));

  const handleShare = () => shareRoom({ roomId, code, title, t });

  return (
    <header className="bg-surface border-b border-line shrink-0 relative z-tabbar">
      <div className="px-3 sm:px-4 h-14 flex items-center justify-between gap-3">
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
              className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-surface-2 hover:bg-line text-ink-2 hover:text-ink text-caption tabular-nums tracking-wider font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text flex-shrink-0 before:absolute before:inset-x-0 before:-inset-y-[11px] before:content-['']"
            >
              {/* before: = vùng chạm mở rộng tới 44px mà không làm to nút (T-75) */}
              <span>{code}</span>
              <Copy size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Giữa: thanh 4 bước (desktop) */}
        <PhaseStepper step={step} viewStep={viewStep} onViewStep={setViewStep} className="hidden md:block flex-shrink-0" />

        {/* Bên phải: N đang xem · mời · avatar (viền avatar = trạng thái kết nối, DESIGN gđ5 §4) */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {viewers}

          <IconButton
            icon={<ShareNetwork size={20} />}
            aria-label={t('room.share')}
            onClick={handleShare}
          />

          {identity}
        </div>
      </div>

      {/* Mobile: "Bước x/4 · tên" dưới tên phòng */}
      <div className="md:hidden px-3 sm:px-4 pb-2 -mt-1">
        <PhaseStepper variant="compact" step={step} viewStep={viewStep} onViewStep={setViewStep} />
      </div>
    </header>
  );
};
