import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConflictAlert, ScheduleItem, Place } from '../../types';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { WarningCircle, CheckCircle } from '../ui/Icon';
import { useConflictStore } from '../../store/useConflictStore';
import { useScheduleStore } from '../../store/useScheduleStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { describeConflict } from '../../i18n/serverText';

export interface ConflictListModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  conflicts: ConflictAlert[];
  scheduleItems?: ScheduleItem[];
  places?: Place[];
}

export const ConflictListModal: React.FC<ConflictListModalProps> = ({
  isOpen,
  onClose,
  roomId,
  conflicts,
  scheduleItems: propScheduleItems,
  places: propPlaces,
}) => {
  const { t } = useTranslation();
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const storeScheduleItems = useScheduleStore((s) => s.items);
  const storePlaces = usePlaceStore((s) => s.places);

  const scheduleItems = propScheduleItems ?? storeScheduleItems;
  const places = propPlaces ?? storePlaces;

  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

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

  const footerContent = (
    <div className="flex items-center justify-between w-full">
      <Button
        type="button"
        variant="secondary"
        onClick={handleReevaluate}
        loading={isEvaluating}
      >
        {t('conflict.reevaluate')}
      </Button>
      <Button variant="ghost" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('conflict.modalTitle')}
      description={
        conflicts.length > 0
          ? t('conflict.modalDescription', { count: conflicts.length })
          : undefined
      }
      footer={footerContent}
    >
      <div className="space-y-4">
        {conflicts.length === 0 ? (
          <div className="text-center py-8 px-4 bg-success-soft rounded-card border border-success/25">
            <CheckCircle
              size={36}
              weight="fill"
              className="mx-auto text-success"
            />
            <p className="text-body font-bold text-success mt-2">
              {t('conflict.emptyTitle')}
            </p>
            <p className="text-caption text-ink-2 mt-1">
              {t('conflict.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {conflicts.map((conflict) => {
              const isCriticalOrError =
                conflict.level === 'CRITICAL' || conflict.level === 'ERROR';

              const ruleTitle = (t as unknown as (k: string, opts?: { defaultValue?: string }) => string)(
                `conflict.ruleLabels.${conflict.rule_code}`,
                { defaultValue: conflict.rule_code },
              );

              // Dịch mô tả xung đột qua describeConflict
              const translatedMessage = describeConflict(
                conflict,
                { scheduleItems, places },
                t,
              );

              return (
                <div
                  key={conflict.id}
                  data-testid={`conflict-item-${conflict.id}`}
                  className={`p-4 rounded-card border transition-colors ${
                    isCriticalOrError
                      ? 'bg-danger-soft/40 border-danger/25'
                      : 'bg-warning-soft/40 border-warning/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-chip text-caption font-bold ${
                        isCriticalOrError
                          ? 'bg-danger text-surface'
                          : 'bg-warning text-surface'
                      }`}
                    >
                      <WarningCircle size={14} weight="fill" />
                      <span>{t(`conflict.levelLabel.${conflict.level}`)}</span>
                    </span>

                    <span className="text-caption font-semibold text-ink-3">
                      {ruleTitle}
                    </span>
                  </div>

                  <p className="text-body text-ink font-medium leading-relaxed">
                    {translatedMessage}
                  </p>

                  {Array.isArray(conflict.entity_ids) &&
                    conflict.entity_ids.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-line flex items-center gap-1.5 text-caption text-ink-3">
                        <span>
                          {t('conflict.relatedEntities', {
                            count: conflict.entity_ids.length,
                          })}
                        </span>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
};
