import React, { useState } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Button } from '../common';
import type { Place, ScoredPick } from '../../types';

export interface SmartPickCardProps {
  roomId: string;
  isHost: boolean;
  smartPicks?: ScoredPick[];
  activePickIndex?: number;
  places?: Place[];
  onOpenWheel: () => void;
}

export const SmartPickCard: React.FC<SmartPickCardProps> = ({
  roomId,
  isHost,
  smartPicks: propPicks,
  activePickIndex: propActiveIndex,
  places: propPlaces,
  onOpenWheel,
}) => {
  const storePicks = useDecisionStore((s) => s.smartPicks);
  const smartPicks = propPicks ?? storePicks;

  const storeActiveIndex = useDecisionStore((s) => s.activePickIndex);
  const activePickIndex = propActiveIndex ?? storeActiveIndex;

  const nextPick = useDecisionStore((s) => s.nextPick);
  const createDecision = useDecisionStore((s) => s.createDecision);
  const acceptDecision = useDecisionStore((s) => s.acceptDecision);
  const isSubmitting = useDecisionStore((s) => s.isSubmitting);

  const storePlaces = usePlaceStore((s) => s.places);
  const places = propPlaces ?? storePlaces;

  const [localError, setLocalError] = useState<string | null>(null);

  if (!smartPicks || smartPicks.length === 0) {
    return (
      <div className="text-center py-10 px-4 space-y-3">
        <div className="text-4xl">💡</div>
        <h4 className="text-sm font-bold text-slate-800">
          Chưa có đủ dữ liệu để tính toán gợi ý
        </h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Hãy thêm các địa điểm hoặc bỏ phiếu bình chọn để hệ thống phân tích quán tối ưu nhất cho nhóm.
        </p>
        <Button variant="outline" size="sm" onClick={onOpenWheel}>
          🎡 Chuyển sang Vòng quay may mắn
        </Button>
      </div>
    );
  }

  const currentPick = smartPicks[activePickIndex] || smartPicks[0];
  const place = places.find((p) => p.id === currentPick.place_id);

  const handleAcceptSmartPick = async () => {
    if (!isHost) return;
    setLocalError(null);
    try {
      const res = await createDecision(roomId, {
        mode: 'SMART',
        candidate_place_ids: [currentPick.place_id],
      });
      if (res && res.session?.id) {
        await acceptDecision(roomId, res.session.id);
      }
    } catch (err: unknown) {
      setLocalError((err as { message?: string })?.message || 'Không thể chốt địa điểm này.');
    }
  };

  return (
    <div
      data-testid="smart-pick-card"
      className="space-y-5 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs"
    >
      {/* Header bar of the card */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Gợi ý 1 chạm thông minh
          </span>
        </div>
        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
          Gợi ý {activePickIndex + 1} / {smartPicks.length}
        </span>
      </div>

      {localError && (
        <div className="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-medium">
          {localError}
        </div>
      )}

      {/* Place details */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 leading-snug">
              {place?.name || 'Địa điểm được chọn'}
            </h3>
            {place?.address && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                📍 {place.address}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
              ⭐ {place?.score ?? 0}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">
              {place?.upvotes ?? 0} lượt thích
            </span>
          </div>
        </div>

        {/* Category & info */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {place?.category && (
            <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700">
              {place.category}
            </span>
          )}
          {place?.estimated_cost && (
            <span className="font-medium text-slate-500">
              • ~{place.estimated_cost.toLocaleString('vi-VN')} đ
            </span>
          )}
        </div>

        {/* Reasons as chips */}
        <div className="pt-2">
          <p className="text-xs font-bold text-slate-700 mb-2">
            Vì sao app chọn quán này?
          </p>
          <div className="flex flex-wrap gap-2">
            {currentPick.reasons && currentPick.reasons.length > 0 ? (
              currentPick.reasons.map((reason: string, idx: number) => (
                <span
                  key={idx}
                  data-testid="smart-pick-reason-chip"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs"
                >
                  <span className="text-emerald-600">✓</span>
                  {reason}
                </span>
              ))
            ) : (
              <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600">
                Điểm bình chọn và mức độ phù hợp cao nhất nhóm
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons (Chốt luôn / Đổi quán khác / Chơi trò) */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Chốt luôn button */}
        {isHost ? (
          <Button
            variant="primary"
            onClick={handleAcceptSmartPick}
            isLoading={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex-1 shadow-xs"
            leftIcon={<span>✨</span>}
          >
            Chốt luôn quán này
          </Button>
        ) : (
          <div className="flex-1 px-4 py-2 text-center text-xs text-slate-500 italic bg-slate-50 rounded-xl border border-slate-200">
            Chờ Host chốt quán này
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Đổi quán khác button */}
          <Button
            variant="outline"
            onClick={nextPick}
            disabled={smartPicks.length <= 1 || isSubmitting}
            className="flex-1 sm:flex-initial text-xs font-bold"
            leftIcon={<span>🔄</span>}
          >
            Đổi quán khác
          </Button>

          {/* Chơi trò button */}
          <Button
            variant="secondary"
            onClick={onOpenWheel}
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
            leftIcon={<span>🎡</span>}
          >
            Chơi vòng quay
          </Button>
        </div>
      </div>
    </div>
  );
};
