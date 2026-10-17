import React, { useState, useEffect } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { Button } from '../common';
import type { DeciderHint, TriggerHint } from '../../types';

export interface DeciderBannerProps {
  roomId: string;
  hints?: DeciderHint[];
  onOpenDecide: () => void;
}

interface HintInfo {
  icon: string;
  title: string;
  description: string;
}

function getHintDisplay(type: TriggerHint, candidateCount: number): HintInfo {
  switch (type) {
    case 'TIE_AT_TOP':
      return {
        icon: '🎲',
        title: 'Hoà điểm số cao nhất!',
        description: `${candidateCount > 0 ? candidateCount : 'Các'} quán đang hoà điểm, để app chọn hộ nhé?`,
      };
    case 'NEAR_TIE':
      return {
        icon: '⚖️',
        title: 'Điểm số đang suýt soát!',
        description: 'Các lựa chọn hàng đầu chênh lệch rất ít điểm. Để app chọn hộ một quán nhé?',
      };
    case 'TOO_MANY':
      return {
        icon: '🤔',
        title: 'Quá nhiều lựa chọn?',
        description: 'Nhóm đang phân vân giữa nhiều địa điểm. Để app thu hẹp và chọn giúp bạn!',
      };
    case 'STALLED':
      return {
        icon: '⏳',
        title: 'Bình chọn đang chững lại',
        description: 'Đã lâu chưa có bình chọn mới, chốt ngay một quán để tiếp tục chuyến đi!',
      };
    case 'EMPTY':
      return {
        icon: '💡',
        title: 'Chưa có địa điểm',
        description: 'Chưa có quán nào trong danh mục này, xem gợi ý phù hợp nhất ngay!',
      };
    default:
      return {
        icon: '🎲',
        title: 'Chọn hộ khi phân vân',
        description: 'Để app tự động chọn hoặc quay vòng quay may mắn giúp nhóm bạn!',
      };
  }
}

export const DeciderBanner: React.FC<DeciderBannerProps> = ({
  hints: propHints,
  onOpenDecide,
}) => {
  const storeHints = useDecisionStore((s) => s.hints);
  const hints = propHints ?? storeHints;
  const [isDismissed, setIsDismissed] = useState(false);

  // Khi hints thay đổi (ví dụ có gợi ý mới), mở lại banner nếu trước đó bị ẩn
  useEffect(() => {
    setIsDismissed(false);
  }, [hints]);

  if (isDismissed || !hints || hints.length === 0) {
    return null;
  }

  const topHint = hints[0];
  const candidateCount = topHint.candidate_place_ids?.length || 0;
  const hintInfo = getHintDisplay(topHint.type, candidateCount);

  return (
    <div
      data-testid="decider-banner"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 border border-amber-300/80 p-4 sm:p-5 shadow-xs transition-all animate-fade-in"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-amber-100/90 text-amber-700 flex items-center justify-center text-2xl shadow-xs border border-amber-200">
            {hintInfo.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                {hintInfo.title}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                {topHint.type}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              {hintInfo.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="primary"
            size="sm"
            onClick={onOpenDecide}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs whitespace-nowrap"
            leftIcon={<span>🎲</span>}
          >
            Chọn hộ ngay
          </Button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            aria-label="Đóng banner gợi ý"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
