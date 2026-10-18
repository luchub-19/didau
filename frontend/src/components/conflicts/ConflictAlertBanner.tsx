import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConflictAlert, ConflictLevel, ScheduleItem, Place } from '../../types';
import { Button } from '../ui/Button';
import { WarningCircle, Info } from '../ui/Icon';
import { ConflictListModal } from './ConflictListModal';
import { useConflictStore } from '../../store/useConflictStore';
import { describeConflict } from '../../i18n/serverText';

export interface ConflictAlertBannerProps {
  roomId: string;
  conflicts: ConflictAlert[];
  scheduleItems?: ScheduleItem[];
  places?: Place[];
  onSwitchToSchedule?: () => void;
}

export const ConflictAlertBanner: React.FC<ConflictAlertBannerProps> = ({
  roomId,
  conflicts,
  scheduleItems,
  places,
  onSwitchToSchedule,
}) => {
  const { t } = useTranslation();
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  if (!conflicts || conflicts.length === 0) {
    return null;
  }

  // Xác định mức xung đột cao nhất
  const hasCritical = conflicts.some((c) => c.level === 'CRITICAL');
  const hasError = conflicts.some((c) => c.level === 'ERROR');
  const highestLevel: ConflictLevel = hasCritical
    ? 'CRITICAL'
    : hasError
    ? 'ERROR'
    : 'WARNING';

  const isCriticalOrError = highestLevel === 'CRITICAL' || highestLevel === 'ERROR';

  const bannerTheme = {
    CRITICAL: {
      container: 'bg-danger-soft border-b border-danger/25 text-danger',
      badge: 'bg-danger text-surface',
      title: t('conflict.bannerCriticalTitle'),
    },
    ERROR: {
      container: 'bg-danger-soft border-b border-danger/25 text-danger',
      badge: 'bg-danger text-surface',
      title: t('conflict.bannerErrorTitle'),
    },
    WARNING: {
      container: 'bg-warning-soft border-b border-warning/25 text-warning',
      badge: 'bg-warning text-surface',
      title: t('conflict.bannerWarningTitle'),
    },
    INFO: {
      container: 'bg-info-soft border-b border-info/25 text-info',
      badge: 'bg-info text-surface',
      title: t('conflict.bannerInfoTitle'),
    },
  }[highestLevel];

  // Dịch câu xung đột đầu tiên qua describeConflict thay vì đọc trực tiếp message server
  const firstConflict = conflicts[0];
  const firstTranslatedMessage = firstConflict
    ? describeConflict(firstConflict, { scheduleItems, places }, t)
    : '';

  const handleReevaluate = async () => {
    setIsEvaluating(true);
    try {
      await evaluateConflicts(roomId);
    } catch (err) {
      console.error('Failed to re-evaluate conflicts:', err);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <>
      <div
        data-testid="conflict-alert-banner"
        className={`w-full px-4 py-3 sm:px-6 transition-colors ${bannerTheme.container}`}
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            {isCriticalOrError ? (
              <WarningCircle size={22} weight="fill" className="shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <Info size={22} weight="fill" className="shrink-0 mt-0.5 sm:mt-0" />
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded-chip text-[11px] font-bold tracking-wide uppercase tabular-nums ${bannerTheme.badge}`}
                >
                  {highestLevel} ({conflicts.length})
                </span>
                <h4 className="text-caption font-bold sm:text-body truncate">
                  {bannerTheme.title}
                </h4>
              </div>

              {firstTranslatedMessage && (
                <p className="text-caption mt-0.5 opacity-90 line-clamp-1">
                  {firstTranslatedMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {onSwitchToSchedule && (
              <button
                type="button"
                onClick={onSwitchToSchedule}
                className="text-caption font-semibold underline hover:opacity-80 transition-opacity px-2 py-1"
              >
                {t('conflict.viewSchedule')}
              </button>
            )}

            <Button
              variant="secondary"
              onClick={handleReevaluate}
              loading={isEvaluating}
            >
              {t('conflict.reevaluate')}
            </Button>

            <Button
              variant="primary"
              onClick={() => setIsModalOpen(true)}
            >
              {t('conflict.detailsButton', { count: conflicts.length })}
            </Button>
          </div>
        </div>
      </div>

      <ConflictListModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        roomId={roomId}
        conflicts={conflicts}
        scheduleItems={scheduleItems}
        places={places}
      />
    </>
  );
};
