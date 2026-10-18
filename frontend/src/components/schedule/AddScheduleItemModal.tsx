import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place } from '../../types';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { toast } from '../ui/toastStore';
import { CategoryIcon } from '../common/CategoryIcon';
import { TimeSlotPicker } from './TimeSlotPicker';
import { WarningCircle, Clock } from '../ui/Icon';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { formatTime } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { describeApiError } from '../../i18n/serverText';

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
  const { t } = useTranslation();
  const { lang: language } = useLanguage();
  const addItem = useScheduleStore((s) => s.addItem);
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string>(
    () => preselectedPlaceId || (places.length > 0 ? places[0].id : ''),
  );
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [startMinute, setStartMinute] = useState<number>(540); // 09:00
  const [endMinute, setEndMinute] = useState<number>(630); // 10:30
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Khởi tạo hoặc đặt lại giá trị khi form mở
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

  // Cảnh báo ngay nếu khung giờ nằm ngoài giờ mở cửa của quán
  const isOutsideHours =
    selectedPlace &&
    selectedPlace.open_minute !== undefined &&
    selectedPlace.open_minute !== null &&
    selectedPlace.close_minute !== undefined &&
    selectedPlace.close_minute !== null &&
    (startMinute < selectedPlace.open_minute ||
      endMinute > selectedPlace.close_minute);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!selectedPlaceId) {
      setErrorMessage(t('schedule.selectPlacePlaceholder'));
      return;
    }
    if (startMinute >= endMinute) {
      setErrorMessage(
        t('schedule.invalidTime', {
          start: formatTime(startMinute, language),
          end: formatTime(endMinute, language),
        }),
      );
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

      // Tự động đánh giá lại xung đột ở nền
      try {
        await evaluateConflicts(roomId);
      } catch {
        // Bỏ qua nếu đánh giá nền gặp lỗi
      }

      toast.success(t('schedule.addSuccess'));
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = describeApiError(err, t);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const footerContent = (
    <div className="flex items-center justify-end gap-3 w-full">
      <Button
        type="button"
        variant="ghost"
        onClick={onClose}
        disabled={isSubmitting}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant="primary"
        onClick={handleSubmit}
        loading={isSubmitting}
        disabled={places.length === 0 || startMinute >= endMinute}
      >
        {t('schedule.addItem')}
      </Button>
    </div>
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t('schedule.addItemTitle')}
      footer={footerContent}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-danger-soft border border-danger/30 rounded-card text-caption text-danger font-medium flex items-center gap-2">
            <WarningCircle size={16} weight="fill" className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Chọn quán */}
        <div>
          <label className="block text-caption font-semibold text-ink mb-1.5">
            {t('schedule.selectPlace')} <span className="text-danger">*</span>
          </label>
          {places.length === 0 ? (
            <p className="text-caption text-ink-3 italic p-3 bg-surface-2 rounded-card border border-line">
              {t('schedule.noPlacesAvailable')}
            </p>
          ) : (
            <select
              value={selectedPlaceId}
              onChange={(e) => setSelectedPlaceId(e.target.value)}
              className="w-full px-3 py-2 text-body bg-surface border border-line rounded-input shadow-xs text-ink focus:outline-hidden focus:border-accent focus:ring-1 focus:ring-accent"
            >
              {places.map((place) => {
                const statusTag =
                  place.status === 'ACCEPTED'
                    ? `[${t('schedule.acceptedBadge')}]`
                    : `[${t('schedule.proposedBadge')}]`;
                return (
                  <option key={place.id} value={place.id}>
                    {place.name} ({place.category}) {statusTag}
                  </option>
                );
              })}
            </select>
          )}

          {/* Xem trước quán đã chọn */}
          {selectedPlace && (
            <div className="mt-2.5 p-3 bg-surface-2 border border-line rounded-card flex items-center justify-between gap-2 text-caption text-ink-2">
              <div className="flex items-center gap-2 min-w-0">
                <CategoryIcon category={selectedPlace.category} size="sm" />
                <span className="font-semibold text-ink truncate">
                  {selectedPlace.name}
                </span>
              </div>
              {selectedPlace.open_minute !== undefined &&
                selectedPlace.open_minute !== null &&
                selectedPlace.close_minute !== undefined &&
                selectedPlace.close_minute !== null && (
                  <span className="text-caption text-ink-3 bg-surface px-2 py-0.5 rounded-chip border border-line shrink-0 flex items-center gap-1">
                    <Clock size={12} className="text-ink-3" />
                    <span>
                      {t('schedule.openingHoursBadge', {
                        open: formatTime(selectedPlace.open_minute, language),
                        close: formatTime(selectedPlace.close_minute, language),
                      })}
                    </span>
                  </span>
                )}
            </div>
          )}
        </div>

        {/* Cảnh báo ngay nếu ngoài giờ mở cửa */}
        {isOutsideHours && selectedPlace && (
          <div className="p-3 bg-warning-soft border border-warning/30 rounded-card text-caption text-warning flex items-start gap-2">
            <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5" />
            <span>
              {t('schedule.outsideOpeningHours', {
                open: formatTime(selectedPlace.open_minute, language),
                close: formatTime(selectedPlace.close_minute, language),
              })}
            </span>
          </div>
        )}

        {/* Chọn ngày trong chuyến đi */}
        <div>
          <label className="block text-caption font-semibold text-ink mb-1.5">
            {t('schedule.dayLabel')}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            {[0, 1, 2, 3].map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => setDayOffset(day)}
                className={`px-3 py-1.5 rounded-chip text-caption font-semibold border transition-colors ${
                  dayOffset === day
                    ? 'bg-accent text-ink font-semibold border-accent shadow-xs'
                    : 'bg-surface text-ink-2 border-line hover:bg-surface-2'
                }`}
              >
                {t('schedule.dayBadge', { day: day + 1 })}
              </button>
            ))}
          </div>
        </div>

        {/* Bộ chọn khung giờ */}
        <TimeSlotPicker
          startMinute={startMinute}
          endMinute={endMinute}
          onChange={(start, end) => {
            setStartMinute(start);
            setEndMinute(end);
          }}
        />

        {/* Ghi chú */}
        <TextField
          label={t('schedule.noteLabel')}
          placeholder={t('schedule.notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </form>
    </Sheet>
  );
};
