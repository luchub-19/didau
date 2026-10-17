import React from 'react';
import {
  minuteToTimeString,
  timeStringToMinute,
  formatDuration,
} from '../../hooks/useMinuteFormat';

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
  label = 'Khung giờ hoạt động',
  error,
}) => {
  const startTimeStr = minuteToTimeString(startMinute);
  const endTimeStr = minuteToTimeString(endMinute);
  const duration = endMinute - startMinute;
  const isInvalid = startMinute >= endMinute;

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = timeStringToMinute(e.target.value);
    // If end is now before start, shift end to maintain previous duration or at least 30m
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

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            {label}
          </label>
          {!isInvalid && duration > 0 && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              Thời lượng: {formatDuration(duration)}
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 items-center">
        <div>
          <span className="block text-[11px] text-slate-500 mb-1">Bắt đầu</span>
          <input
            type="time"
            value={startTimeStr}
            onChange={handleStartTimeChange}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl shadow-xs focus:outline-hidden focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50"
            aria-label="Giờ bắt đầu"
          />
        </div>

        <div>
          <span className="block text-[11px] text-slate-500 mb-1">Kết thúc</span>
          <input
            type="time"
            value={endTimeStr}
            onChange={handleEndTimeChange}
            disabled={disabled}
            className={`w-full px-3 py-2 text-sm bg-white border rounded-xl shadow-xs focus:outline-hidden focus:ring-2 disabled:opacity-50 ${
              isInvalid
                ? 'border-rose-400 focus:ring-rose-500 focus:border-rose-500 bg-rose-50/30'
                : 'border-slate-300 focus:ring-sky-500 focus:border-sky-500'
            }`}
            aria-label="Giờ kết thúc"
          />
        </div>
      </div>

      {/* Quick duration presets */}
      {!disabled && (
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[11px] text-slate-400">Gợi ý:</span>
          {[30, 45, 60, 90, 120].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => handlePresetDuration(mins)}
              className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
                duration === mins
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              +{mins}p
            </button>
          ))}
        </div>
      )}

      {isInvalid && (
        <p className="text-xs text-rose-600 font-medium">
          ⚠️ Giờ bắt đầu ({startTimeStr}) phải sớm hơn giờ kết thúc ({endTimeStr}).
        </p>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
};
