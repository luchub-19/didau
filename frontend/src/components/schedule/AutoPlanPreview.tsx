import React, { useMemo, useState } from 'react';
import type { AutoPlanPreviewResponse, Place } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useScheduleStore } from '../../store/useScheduleStore';
import { minuteToTimeString } from '../../hooks/useMinuteFormat';

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
      const message =
        (err as { message?: string })?.message ||
        'Không thể cập nhật xem trước lịch trình.';
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
        setStaleWarning('Dữ liệu vừa thay đổi, đang tự động xem trước lại...');
        try {
          await previewAutoPlan(roomId, {
            duration_overrides: durationOverrides,
          });
          setStaleWarning('Dữ liệu vừa thay đổi');
        } catch {
          setErrorMsg('Dữ liệu vừa thay đổi nhưng không thể tải lại bản xem trước.');
        }
      } else {
        const errorText =
          axiosErr?.response?.data?.error?.message ||
          axiosErr?.message ||
          'Không thể áp dụng lịch trình.';
        setErrorMsg(errorText);
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✨ Xem trước lịch trình tự động"
      description="Lịch trình được tối ưu hóa đường đi và sắp xếp thời gian hợp lý."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>

          <div className="flex items-center gap-2">
            {isHost ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleApply}
                disabled={isApplying || isAutoPlanLoading || !preview}
                data-testid="apply-auto-plan-btn"
              >
                {isApplying ? 'Đang áp dụng...' : 'Áp dụng lịch trình'}
              </Button>
            ) : (
              <div
                className="text-xs text-amber-700 font-semibold bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200"
                data-testid="waiting-for-host-notice"
              >
                Chờ Host chốt
              </div>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Stale Alert / Warning Banner */}
        {staleWarning && (
          <div
            className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium flex items-center gap-2"
            data-testid="stale-plan-alert"
          >
            <span>⚠️</span>
            <span>{staleWarning}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
            <span>❌</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Fallback Notice */}
        {preview?.used_fallback && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
            <span>ℹ️</span>
            <span>
              Chưa có địa điểm nào được chốt (ACCEPTED), hệ thống tạm chọn các địa điểm có điểm bình chọn cao nhất.
            </span>
          </div>
        )}

        {/* Stats summary */}
        {preview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <div>
              <div className="text-[11px] text-slate-500">Số địa điểm</div>
              <div className="text-sm font-bold text-slate-800">
                {preview.slots.length} quán
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">Di chuyển</div>
              <div className="text-sm font-bold text-sky-600">
                ~{preview.total_travel_min} phút
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[11px] text-slate-500">Chi phí ước tính</div>
              <div className="text-sm font-bold text-emerald-600">
                {preview.total_cost.toLocaleString('vi-VN')} đ
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isAutoPlanLoading && !preview && (
          <div className="py-8 text-center text-sm text-slate-500">
            Đang tính toán lịch trình tối ưu...
          </div>
        )}

        {/* Planned Slots Timeline */}
        {preview && preview.slots.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Lộ trình chi tiết</span>
              <button
                type="button"
                onClick={handleRefreshPreview}
                disabled={isAutoPlanLoading}
                className="text-sky-600 hover:text-sky-700 underline font-medium"
              >
                {isAutoPlanLoading ? 'Đang tính lại...' : '🔄 Tính lại thời lượng'}
              </button>
            </div>

            <div className="space-y-2.5">
              {preview.slots.map((slot, index) => {
                const place = placeMap.get(slot.place_id);
                const duration = slot.end_minute - slot.start_minute;
                const currentOverride =
                  durationOverrides[slot.place_id] ?? duration;

                return (
                  <div
                    key={slot.place_id}
                    className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs"
                    data-testid={`slot-${slot.place_id}`}
                  >
                    {slot.travel_from_prev_min > 0 && (
                      <div className="text-[11px] font-medium text-sky-600 flex items-center gap-1.5 pb-1">
                        <span>🚗</span>
                        <span>
                          Di chuyển ~{slot.travel_from_prev_min} phút từ điểm trước
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-800 truncate">
                          {place?.name || 'Địa điểm'}
                        </span>
                        {place?.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold shrink-0">
                            {place.category}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg shrink-0">
                        {minuteToTimeString(slot.start_minute)} -{' '}
                        {minuteToTimeString(slot.end_minute)}
                      </div>
                    </div>

                    {/* Chip reasons */}
                    {slot.reasons && slot.reasons.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {slot.reasons.map((reason, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-[11px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-100"
                          >
                            💡 {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Duration editor */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs text-slate-500">
                      <span>Thời lượng trải nghiệm:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                          onClick={() =>
                            setDurationOverride(
                              slot.place_id,
                              Math.max(15, currentOverride - 15),
                            )
                          }
                        >
                          -
                        </button>
                        <span
                          className="font-semibold text-slate-700 w-12 text-center"
                          data-testid={`duration-${slot.place_id}`}
                        >
                          {currentOverride}p
                        </span>
                        <button
                          type="button"
                          className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold"
                          onClick={() =>
                            setDurationOverride(
                              slot.place_id,
                              Math.min(360, currentOverride + 15),
                            )
                          }
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

        {/* Dropped places list */}
        {preview && preview.dropped.length > 0 && (
          <div
            className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-2"
            data-testid="dropped-places-section"
          >
            <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Không thể xếp vào lịch ({preview.dropped.length} quán):</span>
            </div>
            <div className="space-y-1.5">
              {preview.dropped.map((d) => {
                const place = placeMap.get(d.place_id);
                return (
                  <div
                    key={d.place_id}
                    className="text-xs text-rose-700 flex items-start justify-between gap-2 bg-white/70 p-2 rounded-lg"
                  >
                    <span className="font-semibold">
                      {place?.name || 'Địa điểm'}
                    </span>
                    <span className="text-rose-600 italic text-[11px]">
                      {d.reason}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
