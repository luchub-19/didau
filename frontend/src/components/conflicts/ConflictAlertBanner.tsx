import React, { useState } from 'react';
import type { ConflictAlert, ConflictLevel } from '../../types';
import { Button } from '../common/Button';
import { ConflictListModal } from './ConflictListModal';
import { useConflictStore } from '../../store/useConflictStore';

export interface ConflictAlertBannerProps {
  roomId: string;
  conflicts: ConflictAlert[];
  onSwitchToSchedule?: () => void;
}

export const ConflictAlertBanner: React.FC<ConflictAlertBannerProps> = ({
  roomId,
  conflicts,
  onSwitchToSchedule,
}) => {
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  // Determine highest conflict level
  const hasCritical = conflicts.some((c) => c.level === 'CRITICAL');
  const hasError = conflicts.some((c) => c.level === 'ERROR');
  const highestLevel: ConflictLevel = hasCritical
    ? 'CRITICAL'
    : hasError
    ? 'ERROR'
    : 'WARNING';

  const bannerTheme = {
    CRITICAL: {
      container: 'bg-rose-50 border-rose-300 text-rose-900',
      badge: 'bg-rose-600 text-white',
      icon: '🚨',
      title: 'Xung đột nghiêm trọng cần xử lý ngay',
    },
    ERROR: {
      container: 'bg-orange-50 border-orange-300 text-orange-900',
      badge: 'bg-orange-600 text-white',
      icon: '⚠️',
      title: 'Lỗi lịch trình cần điều chỉnh',
    },
    WARNING: {
      container: 'bg-amber-50 border-amber-300 text-amber-900',
      badge: 'bg-amber-500 text-white',
      icon: '⚠️',
      title: 'Cảnh báo xung đột lịch trình',
    },
    INFO: {
      container: 'bg-sky-50 border-sky-300 text-sky-900',
      badge: 'bg-sky-500 text-white',
      icon: 'ℹ️',
      title: 'Thông tin lịch trình',
    },
  }[highestLevel];

  const firstMessage = conflicts[0]?.message;

  const handleReevaluate = async () => {
    setIsEvaluating(true);
    try {
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Lỗi khi đánh giá lại xung đột:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <>
      <div
        data-testid="conflict-alert-banner"
        className={`w-full border-b px-4 py-3 sm:px-6 transition-all duration-200 ${bannerTheme.container}`}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <span className="text-xl shrink-0 animate-bounce">{bannerTheme.icon}</span>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${bannerTheme.badge}`}
                >
                  {highestLevel} ({conflicts.length})
                </span>
                <h4 className="text-xs font-bold sm:text-sm">
                  {bannerTheme.title}
                </h4>
              </div>

              {firstMessage && (
                <p className="text-xs mt-0.5 opacity-90 line-clamp-1">
                  {firstMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onSwitchToSchedule && (
              <button
                type="button"
                onClick={onSwitchToSchedule}
                className="text-xs font-semibold underline hover:opacity-80 transition-opacity px-2 py-1"
              >
                Xem lịch trình
              </button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleReevaluate}
              isLoading={isEvaluating}
            >
              Đánh giá lại
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsModalOpen(true)}
            >
              Chi tiết ({conflicts.length})
            </Button>
          </div>
        </div>
      </div>

      <ConflictListModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        roomId={roomId}
        conflicts={conflicts}
      />
    </>
  );
};
