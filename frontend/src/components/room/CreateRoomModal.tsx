import React, { useState } from 'react';
import { Button, Input, Modal } from '../common';
import { useRoomStore } from '../../store/useRoomStore';
import type { TieBreakStrategyName } from '../../types';

export interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (roomId: string) => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const createRoom = useRoomStore((s) => s.createRoom);
  const isLoading = useRoomStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);

  // Default event date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().split('T')[0];

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(defaultDate);
  const [nickname, setNickname] = useState('');
  const [description, setDescription] = useState('');
  const [budgetLimit, setBudgetLimit] = useState<string>('');
  const [strategy, setStrategy] = useState<TieBreakStrategyName>('EARLIEST_SUBMISSION');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Vui lòng nhập tiêu đề chuyến đi.');
      return;
    }
    if (!eventDate) {
      setError('Vui lòng chọn ngày đi.');
      return;
    }
    if (!nickname.trim()) {
      setError('Vui lòng nhập biệt danh của bạn.');
      return;
    }

    try {
      const res = await createRoom({
        title: title.trim(),
        event_date: eventDate,
        creator_nickname: nickname.trim(),
        creator_avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
          nickname.trim(),
        )}`,
        description: description.trim() || undefined,
        budget_limit: budgetLimit ? Number(budgetLimit) : undefined,
        tie_break_strategy: strategy,
      });

      onClose();
      onSuccess(res.room.id);
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'Đã xảy ra lỗi khi tạo phòng. Vui lòng thử lại.';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tạo phòng lập kế hoạch mới"
      description="Khởi tạo chuyến đi và mời bạn bè cùng vào bình chọn địa điểm."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <Input
          label="Tên chuyến đi / Tiêu đề"
          placeholder="Ví dụ: Cuối tuần ăn sập Sài Gòn"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Ngày hẹn đi"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            required
          />

          <Input
            label="Biệt danh của bạn (Host)"
            placeholder="Ví dụ: HoangNam"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Ngân sách dự kiến (VNĐ/người)"
            type="number"
            min="0"
            step="10000"
            placeholder="Ví dụ: 500000"
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(e.target.value)}
            helperText="Không bắt buộc, hệ thống sẽ cảnh báo nếu vượt"
          />

          <div className="w-full space-y-1">
            <label
              htmlFor="tie-break-strategy"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              Chiến lược hòa phiếu
            </label>
            <select
              id="tie-break-strategy"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as TieBreakStrategyName)}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="EARLIEST_SUBMISSION">Đề xuất sớm nhất</option>
              <option value="MOST_UPVOTES">Nhiều upvote nhất</option>
              <option value="CREATOR_PRIORITY">Ưu tiên người tạo (Host)</option>
              <option value="CATEGORY_DIVERSITY">Đa dạng hóa danh mục</option>
              <option value="RANDOM">Ngẫu nhiên có kiểm soát</option>
            </select>
            <p className="text-xs text-slate-500">Quy tắc tự động khi các quán bằng điểm</p>
          </div>
        </div>

        <div className="w-full space-y-1">
          <label
            htmlFor="room-description"
            className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
          >
            Mô tả / Ghi chú cho cả nhóm
          </label>
          <textarea
            id="room-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Lên kèo ăn uống từ sáng tới đêm thứ 7..."
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Hủy
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Tạo phòng ngay
          </Button>
        </div>
      </form>
    </Modal>
  );
};
