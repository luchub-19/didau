import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from '../ui';
import { describeEventDate, formatTimeWindow } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';

export interface TimeWindowChipProps {
  startMinute: number;
  endMinute: number;
  /** YYYY-MM-DD — chỉ để đọc to trong aria-label/title. */
  eventDate?: string;
  className?: string;
}

/** Chip khung giờ rảnh của nhóm trên thanh đỉnh (DESIGN gđ6 §2). Không phải nút. */
export const TimeWindowChip: React.FC<TimeWindowChipProps> = ({ startMinute, endMinute, eventDate, className = '' }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const range = formatTimeWindow(startMinute, endMinute, lang);
  const day = describeEventDate(eventDate, lang);
  const full = t('timeWindow.label', { range }) + (day ? `, ${day}` : '');
  return (
    <span
      role="group"
      aria-label={full}
      title={full}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-field bg-surface-2 text-ink-2 text-caption tabular-nums whitespace-nowrap flex-shrink-0 ${className}`}
    >
      <Clock size={13} aria-hidden="true" />
      <span aria-hidden="true">{range}</span>
    </span>
  );
};
