import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
// Tay nắm ⠿: Icon.tsx chưa re-export (ngoài phạm vi T-80), lấy thẳng từ Phosphor
import { DotsSixVertical } from '@phosphor-icons/react';
import type { Place, ScheduleItem } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { curatedPhotos, findCurated, type CuratedData } from '../../room/curated';
import { useCuratedData } from '../../room/useCuratedData';
import { formatPriceShort } from '../../room/placeView';
import { splitLockedPlaces } from '../../room/budget';
import { placeScheduleItem, type Slot } from '../../room/calendar';
import { usePlaceDragSource, type PlaceDragInfo } from '../../room/useCalendarDrag';
import { useLanguage } from '../../i18n/useLanguage';
import { formatTime } from '../../i18n/format';
import { ArrowRight, CalendarBlank, CaretDown, DotsThree, MapPin } from '../ui/Icon';

/** Nối thẻ cột trái với lịch (T-80). */
export interface LockedPlacesCalendar {
  /** Kéo được bằng chuột/bút (desktop có lịch cạnh bên). Mobile: `false`, thêm qua menu ⋯ hoặc khay ở tab Kế hoạch. */
  draggable: boolean;
  /** Thả trong lưới: thêm mới hoặc dời mục cũ. */
  onDrop: (info: PlaceDragInfo, slot: Slot) => void;
  /** Menu ⋯ "Thêm vào lịch": giờ trống đầu tiên. */
  onAdd: (info: PlaceDragInfo) => void;
  /** Menu ⋯ "Xem trên lịch" (quán đã xếp). */
  onShow: (itemId: string) => void;
}

export interface LockedPlacesProps {
  places: Place[];
  schedule: ScheduleItem[];
  /** Bấm một quán: sáng ghim + mở chi tiết (cùng hành vi `onViewOnMap` của danh sách). */
  onOpenPlace: (place: Place) => void;
  /** "Xem lại bình chọn": quay về bước ② ở chế độ xem lại. */
  onReviewBackups: () => void;
  /** Thiếu → thẻ chỉ mở chi tiết (không tay nắm, không menu). */
  calendar?: LockedPlacesCalendar;
}

const photoOf = (place: Place, curated: CuratedData | null): string | undefined => {
  const entry = curated ? findCurated(place, curated) : null;
  return entry ? curatedPhotos(entry, curated)[0]?.src : undefined;
};

/** Ảnh lớn khi có ảnh tuyển chọn; thiếu thì ô minh hoạ theo danh mục. */
const PlaceCover: React.FC<{ place: Place; tall?: boolean }> = ({ place, tall = false }) => {
  const curated = useCuratedData();
  const src = photoOf(place, curated);
  const meta = CATEGORY_METADATA[place.category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <span
      aria-hidden="true"
      data-testid="locked-cover"
      className={`flex items-center justify-center overflow-hidden ${tall ? 'aspect-[4/3] w-full' : 'h-16 w-16 shrink-0 rounded-field'} ${meta.bg} ${meta.text}`}
    >
      {src ? <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" /> : <Icon size={tall ? 56 : 24} weight="duotone" />}
    </span>
  );
};

/** Menu ⋯ của thẻ: "Thêm vào lịch" (chưa xếp) hoặc "Xem trên lịch" (đã xếp). Esc/bấm ngoài đóng, trả focus. */
const CardMenu: React.FC<{ name: string; scheduled: boolean; onAdd: () => void; onShow: () => void; className?: string }> = ({
  name,
  scheduled,
  onAdd,
  onShow,
  className = '',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={className || 'relative'}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('calendar.cardMenu', { name })}
        onClick={() => setOpen((v) => !v)}
        data-testid="locked-menu-trigger"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-field bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
      >
        <DotsThree size={22} weight="bold" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-content mt-1 min-w-44 overflow-hidden rounded-field border border-line bg-surface py-1 shadow-float"
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            data-testid={scheduled ? 'locked-menu-show' : 'locked-menu-add'}
            onClick={() => {
              setOpen(false);
              if (scheduled) onShow();
              else onAdd();
            }}
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-label text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
          >
            <CalendarBlank size={16} className="text-ink-2" />
            <span>{scheduled ? t('calendar.showOnCalendar') : t('calendar.addToCalendar')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Cột trái ở giai đoạn ③④: quán đã chốt (ảnh lớn), các điểm đi kèm trong lịch, mục gập "Dự bị (N)".
 * Có `calendar`: mọi thẻ là nguồn kéo vào lịch (tay nắm ⠿, nhãn giờ khi đã xếp, kéo lại = dời mục cũ) + menu ⋯.
 * Phiếu bầu đã xong nên không còn nút ♥ ở đây (DESIGN gđ5 §3).
 */
export const LockedPlaces: React.FC<LockedPlacesProps> = ({ places, schedule, onOpenPlace, onReviewBackups, calendar }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const curated = useCuratedData();
  const backupsId = useId();
  const [backupsOpen, setBackupsOpen] = useState(false);
  const { main, companions, backups } = useMemo(() => splitLockedPlaces(places, schedule), [places, schedule]);
  const source = usePlaceDragSource({
    onDrop: (info, slot) => calendar?.onDrop(info, slot),
    disabled: !calendar?.draggable,
  });

  if (!main) {
    return (
      <p className="rounded-card border border-line bg-surface-2 p-4 text-caption text-ink-2" data-testid="locked-empty">
        {t('plan.locked.empty')}
      </p>
    );
  }

  const drag = calendar?.draggable ?? false;
  const info = (p: Place): PlaceDragInfo => {
    const it = placeScheduleItem(p.id, schedule);
    return {
      placeId: p.id,
      name: p.name,
      category: p.category,
      photo: photoOf(p, curated),
      ...(it ? { duration: it.end_minute - it.start_minute } : {}),
    };
  };
  const timeLabel = (p: Place) => {
    const it = placeScheduleItem(p.id, schedule);
    if (!it) return null;
    const time = formatTime(it.start_minute, lang);
    return it.day_offset > 0 ? `${t('schedule.dayBadge', { day: it.day_offset + 1 })} · ${time}` : time;
  };
  // Thuộc tính chung của thẻ nguồn: bấm = mở chi tiết, kéo (desktop) = đặt vào lịch
  const cardProps = (p: Place) => ({
    onClick: () => {
      if (source.consumeClick(p.id)) return;
      onOpenPlace(p);
    },
    ...(drag
      ? {
          onPointerDown: (e: React.PointerEvent) => source.onPointerDown(e, info(p)),
          'data-drag-source': p.id,
          'aria-describedby': `${backupsId}-drag-hint`,
        }
      : {}),
  });
  const handle = drag ? (
    <DotsSixVertical size={18} weight="bold" aria-hidden="true" className="shrink-0 text-ink-3" data-testid="locked-handle" />
  ) : null;
  const menu = (p: Place, className?: string) => {
    if (!calendar) return null;
    const it = placeScheduleItem(p.id, schedule);
    return (
      <CardMenu
        name={p.name}
        scheduled={Boolean(it)}
        onAdd={() => calendar.onAdd(info(p))}
        onShow={() => it && calendar.onShow(it.id)}
        className={className}
      />
    );
  };
  const timeChip = (p: Place) => {
    const label = timeLabel(p);
    return label ? (
      <span
        data-testid="locked-time"
        className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-accent-soft px-2 py-0.5 text-caption font-semibold tabular-nums text-ink"
      >
        <CalendarBlank size={12} aria-hidden="true" />
        <span className="sr-only">{t('calendar.scheduledAt')}</span>
        {label}
      </span>
    ) : null;
  };

  const row = (p: Place) => (
    <li key={p.id} className="flex items-center gap-1">
      <button
        type="button"
        {...cardProps(p)}
        className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-card border border-line bg-surface p-2 text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${drag ? 'cursor-grab select-none' : ''}`}
      >
        <PlaceCover place={p} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink">{p.name}</span>
          <span className="flex items-center gap-2 text-caption tabular-nums text-ink-2">
            <span className="truncate">{formatPriceShort(p.estimated_cost) ?? t('budget.unknownShort')}</span>
            {timeChip(p)}
          </span>
        </span>
        {handle}
      </button>
      {menu(p)}
    </li>
  );

  const price = formatPriceShort(main.estimated_cost);
  return (
    <div className="space-y-5" data-testid="locked-places">
      {drag && (
        <p id={`${backupsId}-drag-hint`} className="sr-only">
          {t('calendar.dragHint')}
        </p>
      )}
      <section aria-labelledby="locked-main-title" className="space-y-3">
        <h2 id="locked-main-title" className="text-title text-ink">
          {t('plan.locked.title')}
        </h2>
        <div className="relative">
          <button
            type="button"
            {...cardProps(main)}
            data-testid="locked-main"
            className={`block w-full overflow-hidden rounded-card border border-line bg-surface text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${drag ? 'cursor-grab select-none' : ''}`}
          >
            <PlaceCover place={main} tall />
            <span className="block space-y-1 p-4">
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-heading font-semibold text-ink">{main.name}</span>
                {handle && <span className="pt-1">{handle}</span>}
              </span>
              {main.address && (
                <span className="flex items-center gap-1 text-caption text-ink-2">
                  <MapPin size={14} className="shrink-0 text-ink-3" />
                  <span className="truncate">{main.address}</span>
                </span>
              )}
              <span className="flex items-center gap-2 text-caption tabular-nums text-ink-2">
                <span>{price ?? t('budget.unknownShort')}</span>
                {timeChip(main)}
              </span>
            </span>
          </button>
          {menu(main, 'absolute right-2 top-2')}
        </div>
      </section>

      {companions.length > 0 && (
        <section aria-labelledby="locked-companions-title" className="space-y-2">
          <h3 id="locked-companions-title" className="text-label font-semibold text-ink-2">
            {t('plan.locked.companions')}
          </h3>
          <ul className="space-y-2">{companions.map(row)}</ul>
        </section>
      )}

      {backups.length > 0 && (
        <section className="space-y-2" data-testid="locked-backups">
          <button
            type="button"
            aria-expanded={backupsOpen}
            aria-controls={`${backupsId}-list`}
            onClick={() => setBackupsOpen((v) => !v)}
            data-testid="locked-backups-toggle"
            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-field text-left text-label font-semibold text-ink-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
          >
            <span>{t('plan.locked.backupsToggle', { count: backups.length })}</span>
            <CaretDown size={16} aria-hidden="true" className={backupsOpen ? 'rotate-180' : ''} />
          </button>
          <div id={`${backupsId}-list`} hidden={!backupsOpen} className="space-y-2">
            <ul className="space-y-2">{backups.map(row)}</ul>
            <button
              type="button"
              onClick={onReviewBackups}
              data-testid="review-backups"
              className="inline-flex min-h-[44px] items-center gap-1 text-label font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              {t('plan.locked.reviewVote')}
              <ArrowRight size={14} weight="bold" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
