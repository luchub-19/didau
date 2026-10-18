import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoPlanPreviewResponse, Place } from '../../types';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { toast } from '../ui/toastStore';
import { CategoryIcon } from '../common/CategoryIcon';
import {
  Clock,
  WarningCircle,
  XCircle,
  Info,
  Sparkle,
  CircleNotch,
} from '../ui/Icon';
import { useScheduleStore } from '../../store/useScheduleStore';
import { formatTime, formatDuration, formatMoney } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import {
  describeReasons,
  describeDropReason,
  describeApiError,
} from '../../i18n/serverText';

export interface AutoPlanPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  places: Place[];
  isHost?: boolean;
  preview?: AutoPlanPreviewResponse | null;
  onApplySuccess?: () => void;
}

export const AutoPlanPreview: React.FC<AutoPlanPreviewProps> = ({
  isOpen,
  onClose,
  roomId,
  places,
  isHost = false,
  preview: propPreview,
  onApplySuccess,
}) => {
  const { t } = useTranslation();
  const { lang: language } = useLanguage();

  const storePreview = useScheduleStore((s) => s.autoPlanPreview);
  const preview = propPreview !== undefined ? propPreview : storePreview;
  const isAutoPlanLoading = useScheduleStore((s) => s.isAutoPlanLoading);
  const durationOverrides = useScheduleStore((s) => s.durationOverrides);
  const setDurationOverride = useScheduleStore((s) => s.setDurationOverride);
  const previewAutoPlan = useScheduleStore((s) => s.previewAutoPlan);
  const applyAutoPlan = useScheduleStore((s) => s.applyAutoPlan);

  const [isApplying, setIsApplying] = useState(false);
  const [staleWarning, setStaleWarning] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const placeMap = useMemo(() => {
    return new Map<string, Place>(places.map((p) => [p.id, p]));
  }, [places]);

  if (!isOpen) return null;

  const handleRefreshPreview = async () => {
    setErrorMsg(null);
    setStaleWarning(null);
    try {
      await previewAutoPlan(roomId, {
        duration_overrides: durationOverrides,
      });
    } catch (err: unknown) {
      const message = describeApiError(err, t);
      setErrorMsg(message);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setIsApplying(true);
    setErrorMsg(null);
    setStaleWarning(null);

    try {
      await applyAutoPlan(roomId, {
        plan_hash: preview.plan_hash,
        slots: preview.slots,
      });
      toast.success(t('autoplan.applySuccess'));
      onApplySuccess?.();
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
        status?: number;
        message?: string;
      };

      const is409 =
        axiosErr?.response?.status === 409 ||
        axiosErr?.status === 409 ||
        axiosErr?.response?.data?.error?.code === 'STALE_PLAN' ||
        Boolean(axiosErr?.message?.includes('409')) ||
        Boolean(axiosErr?.message?.includes('STALE_PLAN'));

      if (is409) {
        setStaleWarning(t('autoplan.staleWarning'));
        try {
          await previewAutoPlan(roomId, {
            duration_overrides: durationOverrides,
          });
          setStaleWarning(t('autoplan.staleShort'));
        } catch {
          const reloadErr = t('autoplan.staleError');
          setErrorMsg(reloadErr);
          toast.error(reloadErr);
        }
      } else {
        const errorText = describeApiError(err, t);
        setErrorMsg(errorText);
        toast.error(errorText);
      }
    } finally {
      setIsApplying(false);
    }
  };

  const footerContent = (
    <div className="flex items-center justify-between w-full">
      <Button variant="ghost" onClick={onClose}>
        {t('autoplan.cancel')}
      </Button>

      <div className="flex items-center gap-2">
        {isHost ? (
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={isApplying || isAutoPlanLoading || !preview}
            loading={isApplying}
            data-testid="apply-auto-plan-btn"
          >
            {isApplying ? t('autoplan.applying') : t('autoplan.apply')}
          </Button>
        ) : (
          <div
            className="text-caption text-warning font-semibold bg-warning-soft px-3 py-1.5 rounded-chip border border-warning/20"
            data-testid="waiting-for-host-notice"
          >
            {t('autoplan.waitingForHost')}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Sparkle size={20} weight="fill" className="text-accent-text" />
          <span>{t('autoplan.previewTitle')}</span>
        </span>
      }
      description={t('autoplan.previewDescription')}
      footer={footerContent}
    >
      <div className="space-y-4">
        {/* Cảnh báo stale plan khi dữ liệu thay đổi */}
        {staleWarning && (
          <div
            className="p-3 bg-warning-soft border border-warning/30 rounded-card text-caption text-warning font-medium flex items-center gap-2"
            data-testid="stale-plan-alert"
          >
            <WarningCircle size={16} weight="fill" className="shrink-0" />
            <span>{staleWarning}</span>
          </div>
        )}

        {/* Thông báo lỗi */}
        {errorMsg && (
          <div className="p-3 bg-danger-soft border border-danger/30 rounded-card text-caption text-danger font-medium flex items-center gap-2">
            <XCircle size={16} weight="fill" className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Thông báo chế độ tạm (fallback) */}
        {preview?.used_fallback && (
          <div className="p-3 bg-info-soft border border-info/30 rounded-card text-caption text-info flex items-start gap-2">
            <Info size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>{t('autoplan.fallbackNotice')}</span>
          </div>
        )}

        {/* Bảng thống kê tổng quan */}
        {preview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-surface-2 border border-line rounded-card text-center">
            <div>
              <div className="text-caption text-ink-3">{t('autoplan.summaryPlaces')}</div>
              <div className="text-body font-bold text-ink">
                {t('autoplan.placesCount', { count: preview.slots.length })}
              </div>
            </div>
            <div>
              <div className="text-caption text-ink-3">{t('autoplan.summaryTravel')}</div>
              <div className="text-body font-bold text-ink tabular-nums">
                ~{formatDuration(preview.total_travel_min, language, 'short')}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-caption text-ink-3">{t('autoplan.summaryCost')}</div>
              <div className="text-body font-bold text-success tabular-nums">
                {formatMoney(preview.total_cost, language)}
              </div>
            </div>
          </div>
        )}

        {/* Trạng thái đang tính toán */}
        {isAutoPlanLoading && !preview && (
          <div className="py-8 text-center text-caption text-ink-3 flex items-center justify-center gap-2">
            <CircleNotch size={18} className="animate-spin text-ink-3" />
            <span>{t('autoplan.calculatingInitial')}</span>
          </div>
        )}

        {/* Danh sách các slot trong lịch nháp */}
        {preview && preview.slots.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-caption font-bold text-ink">
              <span>{t('autoplan.detailedRoute')}</span>
              <button
                type="button"
                onClick={handleRefreshPreview}
                disabled={isAutoPlanLoading}
                className="text-accent-text hover:underline text-caption font-medium disabled:opacity-50"
              >
                {isAutoPlanLoading
                  ? t('autoplan.recalculating')
                  : t('autoplan.recalculateDuration')}
              </button>
            </div>

            <div className="space-y-2.5">
              {preview.slots.map((slot, index) => {
                const place = placeMap.get(slot.place_id);
                const duration = slot.end_minute - slot.start_minute;
                const currentOverride =
                  durationOverrides[slot.place_id] ?? duration;

                const reasons = describeReasons(
                  slot.reason_codes,
                  slot.reasons,
                  t,
                );

                return (
                  <div
                    key={slot.place_id}
                    className="p-3.5 bg-surface border border-line rounded-card space-y-2.5 shadow-xs"
                    data-testid={`slot-${slot.place_id}`}
                  >
                    {slot.travel_from_prev_min > 0 && (
                      <div className="text-caption font-medium text-ink-2 flex items-center gap-1.5 pb-0.5">
                        <Clock size={14} className="text-ink-3" />
                        <span>
                          {t('autoplan.travelFromPrev', {
                            minutes: slot.travel_from_prev_min,
                          })}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-surface-2 text-ink text-caption flex items-center justify-center font-bold shrink-0 tabular-nums">
                          {index + 1}
                        </span>
                        <CategoryIcon category={place?.category ?? 'OTHER'} size="sm" />
                        <span className="font-bold text-body text-ink truncate">
                          {place?.name || slot.place_id}
                        </span>
                      </div>
                      <div className="text-caption font-bold text-ink bg-surface-2 px-2 py-1 rounded-chip shrink-0 tabular-nums">
                        {formatTime(slot.start_minute, language)} –{' '}
                        {formatTime(slot.end_minute, language)}
                      </div>
                    </div>

                    {/* Hiển thị lý do (nếu có; nếu null thì không chừa khoảng trống) */}
                    {reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {reasons.map((reason, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-caption bg-accent-soft text-accent-text px-2 py-0.5 rounded-chip border border-accent/20 flex items-center gap-1"
                          >
                            <Sparkle size={12} weight="fill" className="shrink-0" />
                            <span>{reason}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Chỉnh sửa thời lượng */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-line text-caption text-ink-2">
                      <span>{t('autoplan.experienceDuration')}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-surface-2 hover:bg-line text-ink flex items-center justify-center font-bold transition-colors text-body"
                          onClick={() =>
                            setDurationOverride(
                              slot.place_id,
                              Math.max(15, currentOverride - 15),
                            )
                          }
                          aria-label="-15m"
                        >
                          -
                        </button>
                        <span
                          className="font-semibold text-ink w-12 text-center tabular-nums text-caption"
                          data-testid={`duration-${slot.place_id}`}
                        >
                          {currentOverride}{language === 'vi' ? 'p' : 'm'}
                        </span>
                        <button
                          type="button"
                          className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-surface-2 hover:bg-line text-ink flex items-center justify-center font-bold transition-colors text-body"
                          onClick={() =>
                            setDurationOverride(
                              slot.place_id,
                              Math.min(360, currentOverride + 15),
                            )
                          }
                          aria-label="+15m"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Danh sách các quán bị loại */}
        {preview && preview.dropped.length > 0 && (
          <div
            className="bg-danger-soft border border-danger/20 rounded-card p-3 space-y-2"
            data-testid="dropped-places-section"
          >
            <div className="text-caption font-bold text-danger flex items-center gap-1.5">
              <WarningCircle size={16} weight="fill" />
              <span>
                {t('autoplan.droppedSection', {
                  count: preview.dropped.length,
                })}
              </span>
            </div>
            <div className="space-y-1.5">
              {preview.dropped.map((d) => {
                const place = placeMap.get(d.place_id);
                const dropReason = describeDropReason(d, t);
                return (
                  <div
                    key={d.place_id}
                    className="text-caption text-danger flex items-start justify-between gap-2 bg-surface/80 p-2.5 rounded-card border border-danger/10"
                  >
                    <span className="font-semibold text-ink">
                      {place?.name || d.place_id}
                    </span>
                    {dropReason && (
                      <span className="text-danger italic text-caption text-right">
                        {dropReason}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
