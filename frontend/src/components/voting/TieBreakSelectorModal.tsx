import React, { useState } from 'react';
import { Button, Input, Modal } from '../common';
import { usePlaceStore } from '../../store/usePlaceStore';
import type { TieBreakStrategyName } from '../../types';

export interface TieBreakSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  defaultStrategy?: TieBreakStrategyName;
  onSuccess?: () => void;
}

const STRATEGIES: {
  id: TieBreakStrategyName;
  title: string;
  desc: string;
  icon: string;
}[] = [
  {
    id: 'MOST_UPVOTES',
    title: 'Nhiều Upvote nhất (Most Upvotes)',
    desc: 'Ưu tiên địa điểm có số lượt ủng hộ (+1) tuyệt đối cao hơn.',
    icon: '👍',
  },
  {
    id: 'EARLIEST_SUBMISSION',
    title: 'Đề xuất sớm nhất (Earliest Submission)',
    desc: 'Ưu tiên địa điểm được thành viên gửi lên hệ thống sớm hơn.',
    icon: '⏱️',
  },
  {
    id: 'CREATOR_PRIORITY',
    title: 'Ưu tiên Host (Creator Priority)',
    desc: 'Ưu tiên các địa điểm do chính chủ phòng (Host) đề xuất.',
    icon: '👑',
  },
  {
    id: 'CATEGORY_DIVERSITY',
    title: 'Đa dạng danh mục (Category Diversity)',
    desc: 'Ưu tiên các danh mục chưa xuất hiện để chuyến đi đa dạng hơn.',
    icon: '🎨',
  },
  {
    id: 'RANDOM',
    title: 'Ngẫu nhiên công bằng (Random)',
    desc: 'Phân định ngẫu nhiên có kiểm soát thông qua seed ngẫu nhiên.',
    icon: '🎲',
  },
];

export const TieBreakSelectorModal: React.FC<TieBreakSelectorModalProps> = ({
  isOpen,
  onClose,
  roomId,
  defaultStrategy = 'MOST_UPVOTES',
  onSuccess,
}) => {
  const resolveVoting = usePlaceStore((s) => s.resolveVoting);
  const isLoading = usePlaceStore((s) => s.isLoading);

  const [strategy, setStrategy] = useState<TieBreakStrategyName>(defaultStrategy);
  const [maxAcceptedPlaces, setMaxAcceptedPlaces] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    if (maxAcceptedPlaces < 1) {
      setError('Số địa điểm chốt tối thiểu phải là 1.');
      return;
    }

    try {
      await resolveVoting(roomId, {
        strategy,
        max_accepted_places: maxAcceptedPlaces,
      });

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'Không thể chốt kết quả bình chọn. Vui lòng kiểm tra quyền Host.';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chốt kết quả bình chọn & Xử lý hòa phiếu"
      description="Áp dụng chiến lược TieBreak để chọn ra các địa điểm chính thức (ACCEPTED) cho chuyến đi."
      maxWidth="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <div className="w-full">
          <Input
            label="Số lượng địa điểm muốn chốt vào chuyến đi"
            type="number"
            min={1}
            max={20}
            value={maxAcceptedPlaces}
            onChange={(e) => setMaxAcceptedPlaces(parseInt(e.target.value) || 1)}
            helperText="Các địa điểm top đầu sẽ được duyệt ACCEPTED, còn lại chuyển sang REJECTED hoặc dự bị."
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Chọn thuật toán phân định khi bằng điểm (TieBreak)
          </label>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {STRATEGIES.map((item) => {
              const isSelected = strategy === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setStrategy(item.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition flex items-start gap-3 ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="text-xl mt-0.5">{item.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">
                        {item.title}
                      </span>
                      <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setStrategy(item.id)}
                        className="text-sky-600 focus:ring-sky-500 h-4 w-4"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleConfirm}
            isLoading={isLoading}
            leftIcon={<span>⚖️</span>}
          >
            Chốt địa điểm ngay
          </Button>
        </div>
      </div>
    </Modal>
  );
};
