import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  minuteToTimeString,
  timeStringToMinute,
  formatDuration,
} from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { WarningCircle } from '../ui/Icon';

export interface TimeSlotPickerProps {
  startMinute: number;
  endMinute: number;
  onChange: (start: number, end: number) => void;
  disabled?: boolean;
  label?: string;
  error?: string;
}

export const TimeSlotPicker: React.FC<TimeSlotPickerProps> = ({
  startMinute,
  endMinute,
  onChange,
  disabled = false,
  label,
  error,
}) => {
  const { t } = useTranslation();
  const { lang: language } = useLanguage();

  const startTimeStr = minuteToTimeString(startMinute);
  const endTimeStr = minuteToTimeString(endMinute);
  const duration = endMinute - startMinute;
  const isInvalid = startMinute >= endMinute;

  const resolvedLabel = label ?? t('schedule.timeSlotLabel');

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = timeStringToMinute(e.target.value);
    const currentDuration = Math.max(30, endMinute - startMinute);
    let newEnd = endMinute;
    if (newStart >= endMinute) {
      newEnd = Math.min(1439, newStart + currentDuration);
    }
    onChange(newStart, newEnd);
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = timeStringToMinute(e.target.value);
    onChange(startMinute, newEnd);
  };

  const handlePresetDuration = (minutes: number) => {
    const newEnd = Math.min(1439, startMinute + minutes);
    onChange(startMinute, newEnd);
  };

  const presetValues = [30, 45, 60, 90, 120];

  return (
    <div className="space-y-2">
      {resolvedLabel && (
        <div className="flex items-center justify-between">
          <label className="block text-caption font-semibold text-ink">
            {resolvedLabel}
          </label>
          {!isInvalid && duration > 0 && (
            <span className="text-caption font-medium text-ink-2 bg-surface-2 px-2 py-0.5 rounded-chip">
              {t('schedule.duration', { duration: formatDuration(duration, language, 'short') })}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 items-center">
        <div>
          <span className="block text-[11px] font-medium text-ink-3 mb-1">
            {t('schedule.startTime')}
          </span>
          <input
            type="time"
            value={startTimeStr}
            onChange={handleStartTimeChange}
            disabled={disabled}
            className="w-full px-3 py-2 text-body bg-surface border border-line rounded-input shadow-xs text-ink focus:outline-hidden focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
            aria-label={t('schedule.startTime')}
          />
        </div>

        <div>
          <span className="block text-[11px] font-medium text-ink-3 mb-1">
            {t('schedule.endTime')}
          </span>
          <input
            type="time"
            value={endTimeStr}
            onChange={handleEndTimeChange}
            disabled={disabled}
            className={`w-full px-3 py-2 text-body bg-surface border rounded-input shadow-xs text-ink focus:outline-hidden focus:ring-1 disabled:opacity-50 ${
              isInvalid
                ? 'border-danger focus:border-danger focus:ring-danger bg-danger-soft/30'
                : 'border-line focus:border-accent focus:ring-accent'
            }`}
            aria-label={t('schedule.endTime')}
          />
        </div>
      </div>

      {/* Quick duration presets */}
      {!disabled && (
        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
          <span className="text-[11px] text-ink-3">{t('schedule.presets')}:</span>
          {presetValues.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => handlePresetDuration(mins)}
              className={`px-2.5 py-1 text-[11px] rounded-chip font-medium transition-colors ${
                duration === mins
                  ? 'bg-accent text-ink font-semibold'
                  : 'bg-surface-2 text-ink-2 hover:bg-line'
              }`}
            >
              +{mins}{language === 'vi' ? 'p' : 'm'}
            </button>
          ))}
        </div>
      )}

      {isInvalid && (
        <div className="flex items-center gap-1.5 text-caption text-danger font-medium">
          <WarningCircle size={16} className="shrink-0" />
          <span>
            {t('schedule.invalidTime', { start: startTimeStr, end: endTimeStr })}
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-caption text-danger">
          <WarningCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
