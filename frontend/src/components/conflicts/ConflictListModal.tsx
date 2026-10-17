import React, { useState } from 'react';
import type { ConflictAlert, ConflictLevel } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useConflictStore } from '../../store/useConflictStore';

export interface ConflictListModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  conflicts: ConflictAlert[];
}

const ruleCodeLabels: Record<string, string> = {
  TIME_OVERLAP: 'Trùng lặp thời gian',
  TRAVEL_TIME: 'Thời gian di chuyển',
  OPENING_HOURS: 'Giờ mở cửa quán',
  DUPLICATE_PLACE: 'Địa điểm trùng lặp',
  BUDGET_THRESHOLD: 'Vượt ngân sách',
};

const levelBadgeStyles: Record<ConflictLevel, { bg: string; text: string; border: string; icon: string }> = {
  CRITICAL: {
    bg: 'bg-rose-100',
    text: 'text-rose-800',
    border: 'border-rose-200',
    icon: '🚨',
  },
  ERROR: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-200',
    icon: '⚠️',
  },
  WARNING: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-200',
    icon: '⚠️',
  },
  INFO: {
    bg: 'bg-sky-100',
    text: 'text-sky-800',
    border: 'border-sky-200',
    icon: 'ℹ️',
  },
};

export const ConflictListModal: React.FC<ConflictListModalProps> = ({
  isOpen,
  onClose,
  roomId,
  conflicts,
}) => {
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chi tiết cảnh báo xung đột lịch trình"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Hệ thống phát hiện {conflicts.length} vấn đề cần điều chỉnh trong kế hoạch chuyến đi.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReevaluate}
            isLoading={isEvaluating}
          >
            🔄 Đánh giá lại
          </Button>
        </div>

        {conflicts.length === 0 ? (
          <div className="text-center py-8 px-4 bg-emerald-50 rounded-2xl border border-emerald-200">
            <span className="text-3xl">🎉</span>
            <p className="text-sm font-bold text-emerald-800 mt-2">
              Tuyệt vời! Lịch trình không có xung đột nào.
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              Mọi khung giờ, địa điểm và thời gian di chuyển đều hợp lệ.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {conflicts.map((conflict) => {
              const badgeStyle = levelBadgeStyles[conflict.level] || levelBadgeStyles.WARNING;
              const ruleTitle = ruleCodeLabels[conflict.rule_code] || conflict.rule_code;

              return (
                <div
                  key={conflict.id}
                  data-testid={`conflict-item-${conflict.id}`}
                  className={`p-4 rounded-2xl border transition-all ${
                    conflict.level === 'CRITICAL'
                      ? 'bg-rose-50/50 border-rose-200'
                      : conflict.level === 'ERROR'
                      ? 'bg-orange-50/50 border-orange-200'
                      : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                    >
                      <span>{badgeStyle.icon}</span>
                      <span>{conflict.level}</span>
                    </span>

                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      {ruleTitle}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-medium leading-relaxed">
                    {conflict.message}
                  </p>

                  {Array.isArray(conflict.entity_ids) && conflict.entity_ids.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span>Mục liên quan:</span>
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded-md border border-slate-200 text-slate-600">
                        {conflict.entity_type} ({conflict.entity_ids.length} mục)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
};
