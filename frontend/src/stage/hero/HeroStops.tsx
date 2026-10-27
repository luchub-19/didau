import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime, formatTimeRange } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';
import { duration, easing, motionAttrs } from '../../motion';
import { HERO_STOPS, STOP_LABEL_KEY } from './shots';

export interface HeroStopsProps {
  className?: string;
  /** Số chặng đã tới khi đường nối vẽ dần; chặng chưa tới hiện mờ (chỉ đổi opacity). Mặc định: tất cả. */
  reached?: number;
}

/** Lịch 3 chặng của buổi tối mẫu (cảnh 5 và bản 'static'): chặng · tên quán · giờ. Từ md trở lên xếp ngang. */
export const HeroStops: React.FC<HeroStopsProps> = ({ className = '', reached }) => {
  // Chỉ phim cuộn truyền `reached`; bản tĩnh hiện đủ 3 chặng, không có chuyển động
  const progressive = reached !== undefined;
  const count = reached ?? HERO_STOPS.length;
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';

  return (
    <ol aria-label={t('hero.planLabel')} className={`grid gap-x-6 gap-y-1 md:gap-y-2 md:grid-cols-3 ${className}`}>
      {HERO_STOPS.map((stop, i) => (
        <li
          key={stop.id}
          {...(progressive ? motionAttrs('hero.shot') : {})}
          className="min-w-0 flex items-baseline gap-2 md:block border-l-2 border-[rgb(var(--stage-sky))] pl-3"
          style={
            progressive
              ? { opacity: i < count ? 1 : 0.35, transition: `opacity ${duration('ui')}ms ${easing('out')}` }
              : undefined
          }
        >
          {/* Mobile: một dòng mỗi chặng (giờ bắt đầu); từ md: khối 2 dòng có khoảng giờ */}
          <span className="md:hidden flex-shrink-0 text-caption tabular-nums text-[rgb(var(--stage-ink-2))]">
            {formatTime(stop.startMinute, lang)}
          </span>
          <span className="hidden md:block text-caption tabular-nums text-[rgb(var(--stage-ink-2))]">
            {formatTimeRange(stop.startMinute, stop.endMinute, lang)}
          </span>
          <span className="block min-w-0 text-label truncate">
            <span className="font-semibold text-[rgb(var(--stage-accent-text))]">{t(STOP_LABEL_KEY[stop.id])}</span>
            <span className="text-[rgb(var(--stage-ink))]"> · {stop.name}</span>
          </span>
        </li>
      ))}
    </ol>
  );
};
