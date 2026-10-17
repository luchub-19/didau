import React, { useState, useEffect } from 'react';
import type { Place } from '../../types';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { CategoryIcon } from '../common/CategoryIcon';
import { TimeSlotPicker } from './TimeSlotPicker';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { minuteToTimeString } from '../../hooks/useMinuteFormat';

export interface AddScheduleItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  places: Place[];
  preselectedPlaceId?: string;
  onSuccess?: () => void;
}

export const AddScheduleItemModal: React.FC<AddScheduleItemModalProps> = ({
  isOpen,
  onClose,
  roomId,
  places,
  preselectedPlaceId,
  onSuccess,
}) => {
  const addItem = useScheduleStore((s) => s.addItem);
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string>('');
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [startMinute, setStartMinute] = useState<number>(540); // 09:00
  const [endMinute, setEndMinute] = useState<number>(630); // 10:30
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialPlaceId =
        preselectedPlaceId || (places.length > 0 ? places[0].id : '');
      setSelectedPlaceId(initialPlaceId);
      setDayOffset(0);
      setStartMinute(540);
      setEndMinute(630);
      setNote('');
      setErrorMessage(null);
    }
  }, [isOpen, preselectedPlaceId, places]);

  const selectedPlace = places.find((p) => p.id === selectedPlaceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlaceId) {
      setErrorMessage('Vui lòng chọn một địa điểm.');
      return;
    }
    if (startMinute >= endMinute) {
      setErrorMessage('Giờ bắt đầu phải sớm hơn giờ kết thúc.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await addItem(roomId, {
        place_id: selectedPlaceId,
        day_offset: dayOffset,
        start_minute: startMinute,
        end_minute: endMinute,
        note: note.trim() || undefined,
      });

      // Trigger conflict re-evaluation in background
      try {
        await evaluateConflicts(roomId);
      } catch {
        // Ignored if evaluation fails silently
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { message?: string })?.message ||
        'Không thể thêm địa điểm vào lịch trình.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Thêm địa điểm vào lịch trình"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Place Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Chọn địa điểm <span className="text-rose-500">*</span>
          </label>
          {places.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl border border-slate-200">
              Chưa có địa điểm nào trong chuyến đi. Hãy đề xuất quán trước!
            </p>
          ) : (
            <select
              value={selectedPlaceId}
              onChange={(e) => setSelectedPlaceId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl shadow-xs focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            >
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name} ({place.category}) {place.status === 'ACCEPTED' ? '⭐ Đã chốt' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Place info preview */}
          {selectedPlace && (
            <div className="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CategoryIcon category={selectedPlace.category} size="sm" />
                <span className="font-semibold text-slate-800">
                  {selectedPlace.name}
                </span>
              </div>
              {selectedPlace.open_minute !== undefined &&
                selectedPlace.close_minute !== undefined && (
                  <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    🕒 Mở cửa: {minuteToTimeString(selectedPlace.open_minute)} -{' '}
                    {minuteToTimeString(selectedPlace.close_minute)}
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Day Offset Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Ngày trong chuyến đi
          </label>
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setDayOffset(day)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  dayOffset === day
                    ? 'bg-sky-500 text-white border-sky-500 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Ngày {day + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Time Slot Picker */}
        <TimeSlotPicker
          startMinute={startMinute}
          endMinute={endMinute}
          onChange={(start, end) => {
            setStartMinute(start);
            setEndMinute(end);
          }}
        />

        {/* Note input */}
        <Input
          label="Ghi chú (tùy chọn)"
          placeholder="Ví dụ: Ăn nhẹ trước khi vào xem phim..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {/* Modal actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={places.length === 0 || startMinute >= endMinute}
          >
            Thêm vào lịch
          </Button>
        </div>
      </form>
    </Modal>
  );
};
