import React, { useState } from 'react';
import { Button, Input, Modal } from '../common';
import { usePlaceStore } from '../../store/usePlaceStore';
import type { PlaceCategory } from '../../types';

export interface PlaceFormProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

// Convert "HH:mm" to minutes (0 - 1439)
function timeToMinutes(timeStr: string): number | undefined {
  if (!timeStr) return undefined;
  const parts = timeStr.split(':');
  if (parts.length !== 2) return undefined;
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(mins)) return undefined;
  return hours * 60 + mins;
}

export const PlaceForm: React.FC<PlaceFormProps> = ({
  isOpen,
  onClose,
  roomId,
}) => {
  const addPlace = usePlaceStore((s) => s.addPlace);
  const isLoading = usePlaceStore((s) => s.isLoading);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('OTHER');
  const [address, setAddress] = useState('');
  const [url, setUrl] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName('');
    setCategory('OTHER');
    setAddress('');
    setUrl('');
    setEstimatedCost('');
    setOpenTime('');
    setCloseTime('');
    setNotes('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Vui lòng nhập tên địa điểm hoặc quán ăn.');
      return;
    }

    try {
      await addPlace(roomId, {
        name: name.trim(),
        category: category,
        address: address.trim() || undefined,
        url: url.trim() || undefined,
        estimated_cost: estimatedCost ? Number(estimatedCost) : undefined,
        open_minute: timeToMinutes(openTime),
        close_minute: timeToMinutes(closeTime),
        notes: notes.trim() || undefined,
      });

      resetForm();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'Không thể thêm địa điểm. Vui lòng thử lại.';
      setError(msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Đề xuất địa điểm mới"
      description="Thêm quán ăn, cafe hoặc điểm vui chơi để cả nhóm cùng bình chọn."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
            {error}
          </div>
        )}

        <Input
          label="Tên địa điểm / Quán"
          placeholder="Ví dụ: Cà Phê Trứng 3T, Phở Lệ..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          helperText="Hệ thống tự động phát hiện danh mục nếu để 'Tự động (OTHER)'"
          required
          autoFocus
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="w-full space-y-1">
            <label
              htmlFor="place-category"
              className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
            >
              Danh mục
            </label>
            <select
              id="place-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as PlaceCategory)}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="OTHER">✨ Tự động nhận diện (OTHER)</option>
              <option value="FOOD">🍜 Quán ăn / Nhà hàng (FOOD)</option>
              <option value="DRINK">☕ Cà phê / Đồ uống (DRINK)</option>
              <option value="ENTERTAINMENT">🎮 Giải trí / Vui chơi (ENTERTAINMENT)</option>
              <option value="SIGHTSEEING">🏛️ Tham quan / Check-in (SIGHTSEEING)</option>
              <option value="ACCOMMODATION">🏨 Khách sạn / Homestay (ACCOMMODATION)</option>
              <option value="SHOPPING">🛍️ Mua sắm (SHOPPING)</option>
            </select>
          </div>

          <Input
            label="Chi phí ước lượng (VNĐ/người)"
            type="number"
            min="0"
            step="5000"
            placeholder="Ví dụ: 55000"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
          />
        </div>

        <Input
          label="Địa chỉ"
          placeholder="Ví dụ: 1A Tôn Đức Thắng, Bến Nghé, Quận 1..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <Input
          label="Link tham khảo (Google Maps / ShopeeFood / TikTok)"
          placeholder="https://shopeefood.vn/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Giờ mở cửa"
            type="time"
            value={openTime}
            onChange={(e) => setOpenTime(e.target.value)}
          />
          <Input
            label="Giờ đóng cửa"
            type="time"
            value={closeTime}
            onChange={(e) => setCloseTime(e.target.value)}
          />
        </div>

        <div className="w-full space-y-1">
          <label
            htmlFor="place-notes"
            className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
          >
            Lý do đề xuất / Món nên gọi
          </label>
          <textarea
            id="place-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="View bờ sông Sài Gòn cực đẹp, nhớ thử cà phê trứng..."
            className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={isLoading}
          >
            Hủy
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Thêm địa điểm
          </Button>
        </div>
      </form>
    </Modal>
  );
};
