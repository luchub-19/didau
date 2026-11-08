// Popup ô quán trên lịch (T-81, DESIGN gđ6 §4): chế độ xem ↔ chế độ sửa giờ + ghi chú, cùng một khung.
// Desktop ≥1024: popover 360px neo TRÁI ô (lật sang phải / dịch cho vừa viewport); <1024: `Sheet` từ đáy.
// File này được tải lười từ `CalendarColumn` (bundle mạch A gần trần) nên KHÔNG re-export ở `schedule/index.ts`.
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Member, Place, PlaceCategory, Room, ScheduleItem } from '../../types';
import { scheduleApi } from '../../services/api/scheduleApi';
import {
  DEFAULT_WINDOW,
  DURATION_CHIPS,
  MAX_END_MINUTE,
  NOTE_COUNTER_FROM,
  NOTE_MAX,
  minuteToInput,
  parseTimeInput,
  validateEdit,
  type Slot,
} from '../../room/calendar';
import {
  curatedLoaded,
  curatedPhotos,
  findCurated,
  loadCurated,
  type CuratedData,
} from '../../room/curated';
import { formatPriceShort } from '../../room/placeView';
import { directionsUrl } from '../../stage/reveal/actions';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { useMapStore } from '../../store/useMapStore';
import { formatDuration, formatTime, formatTimeWindow } from '../../i18n/format';
import { useLanguage, type Language } from '../../i18n/useLanguage';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { useWorkspaceLayout } from '../shell/workspace';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Sheet } from '../ui/Sheet';
import { TextField } from '../ui/TextField';
import { formatMinutes } from '../algo/tieSuggestionLogic';
import { TravelWhy, type TravelNote } from './TravelStrip';
import { toast } from '../ui/toastStore';
import { ArrowLeft, Heart, MapPin, PencilSimple, Trash, WarningCircle, X } from '../ui/Icon';

/* Hình học định vị + gom dữ liệu hiển thị ở lại file này (chunk lười) để không phình bundle chính. */
/* eslint-disable react-refresh/only-export-components */

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Bề rộng popover desktop (px). */
export const POPOVER_WIDTH = 360;
/** Hoàn tác "Bỏ khỏi lịch" còn hiệu lực bao lâu (ms). */
export const UNDO_MS = 5000;

/* ---------- Định vị ---------- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Hộp của ô neo (toạ độ viewport). */
export interface RectLike {
  left: number;
  right: number;
  top: number;
  height: number;
}
export interface PopoverPlacement {
  left: number;
  top: number;
  /** Phía của popover so với ô (mũi tên ở cạnh đối diện); `over` = không đủ chỗ hai bên, đè lên ô, không mũi tên. */
  side: 'left' | 'right' | 'over';
  /** Vị trí mũi tên tính từ đỉnh popover (px), kẹp để không chạm góc bo. */
  arrowTop: number;
}

/**
 * Chỗ đặt popover `size` cạnh ô `anchor` trong viewport `vp`: ưu tiên bên TRÁI ô (cột lịch ở mép phải màn), không đủ
 * chỗ thì lật sang phải, vẫn không đủ thì đè lên và kẹp trong viewport. Theo chiều dọc căn giữa ô rồi kẹp trong viewport.
 */
export function placePopover(
  anchor: RectLike,
  size: { w: number; h: number },
  vp: { w: number; h: number },
  gap = 12,
  margin = 8,
): PopoverPlacement {
  const w = Math.min(size.w, vp.w - 2 * margin);
  const h = Math.min(size.h, vp.h - 2 * margin);
  let side: PopoverPlacement['side'] = 'left';
  let left = anchor.left - gap - w;
  if (left < margin) {
    const right = anchor.right + gap;
    if (right + w <= vp.w - margin) {
      side = 'right';
      left = right;
    } else {
      side = 'over';
      left = clamp(anchor.left - gap - w, margin, vp.w - w - margin);
    }
  }
  const cy = anchor.top + anchor.height / 2;
  const top = clamp(cy - h / 2, margin, Math.max(margin, vp.h - h - margin));
  return { left, top, side, arrowTop: clamp(cy - top, 20, Math.max(20, h - 20)) };
}

/* ---------- Dữ liệu hiển thị ---------- */

export interface ItemInfo {
  name: string;
  category: PlaceCategory;
  price: string | null;
  address: string | null;
  photo: string | null;
  intro: string | null;
  submitter: { name: string; avatarUrl?: string | null; seed?: string } | null;
  wantCount: number;
  directionsHref: string | null;
  placeId: string | null;
}

/** Gom dữ liệu hiển thị của một mục: ảnh/giới thiệu tuyển chọn, giá, người đề xuất, số người muốn đi. */
export function buildItemInfo(
  item: Pick<ScheduleItem, 'place_id' | 'place_name' | 'place_address'>,
  place: Place | null | undefined,
  members: readonly Member[],
  curatedData: CuratedData | null,
  lang: Language,
): ItemInfo {
  const name = item.place_name || place?.name || '';
  const curated = place ? findCurated(place, curatedData) : null;
  const photo = curated ? (curatedPhotos(curated, curatedData)[0]?.src ?? null) : null;
  const member = place ? members.find((m) => m.id === place.submitted_by_id) : undefined;
  const submitterName = member?.nickname || place?.submitted_by_nickname || '';
  const address = place?.address || item.place_address || null;
  return {
    name,
    category: place?.category ?? 'OTHER',
    price: formatPriceShort(place?.estimated_cost || curated?.price_per_person),
    address,
    photo,
    intro: curated ? curated.intro[lang] || null : null,
    submitter: submitterName ? { name: submitterName, avatarUrl: member?.avatar_url, seed: member?.id } : null,
    wantCount: place?.upvotes ?? 0,
    directionsHref: place
      ? directionsUrl(place)
      : address
        ? directionsUrl({ name, address, latitude: null, longitude: null })
        : null,
    placeId: place?.id ?? null,
  };
}

/* ---------- Chế độ xem ---------- */

const PlacePhoto: React.FC<{ src: string | null; category: PlaceCategory; alt: string }> = ({ src, category, alt }) => {
  const [failed, setFailed] = useState(false);
  const meta = CATEGORY_METADATA[category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <div
      data-testid="popover-photo"
      data-photo={src && !failed ? 'image' : 'illustration'}
      className={`flex aspect-video w-full items-center justify-center overflow-hidden rounded-field ${meta.bg} ${meta.text}`}
    >
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <Icon size={48} weight="duotone" aria-hidden="true" />
      )}
    </div>
  );
};

export interface ItemViewProps {
  item: ScheduleItem;
  info: ItemInfo;
  conflictMessages?: string[];
  travelNotes?: TravelNote[];
  titleId?: string;
  /** `false` khi tiêu đề do `Sheet` vẽ. */
  showTitle?: boolean;
  /** Nút ✕ (popover); `Sheet` đã có nút đóng riêng. */
  onClose?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onOpenPlace?: () => void;
}

export const ItemView: React.FC<ItemViewProps> = ({
  item,
  info,
  conflictMessages = [],
  travelNotes = [],
  titleId,
  showTitle = true,
  onClose,
  onEdit,
  onRemove,
  onOpenPlace,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_METADATA[info.category] ?? CATEGORY_METADATA.OTHER;
  const range = t('calendar.range', {
    start: formatTime(item.start_minute, lang),
    end: formatTime(item.end_minute, lang),
  });
  const timeLine = t('calendar.pop.timeLine', {
    range,
    duration: formatDuration(item.end_minute - item.start_minute, lang),
  });
  const longIntro = (info.intro?.length ?? 0) > 110;

  return (
    <div data-testid="popover-view" className="space-y-3">
      <div className="flex items-center gap-1">
        <IconButton
          data-autofocus
          data-testid="popover-edit"
          aria-label={t('calendar.pop.edit')}
          icon={<PencilSimple size={20} />}
          onClick={onEdit}
        />
        <IconButton
          data-testid="popover-remove"
          aria-label={t('calendar.pop.remove')}
          icon={<Trash size={20} />}
          onClick={onRemove}
        />
        {onClose && (
          <IconButton
            data-testid="popover-close"
            className="ml-auto"
            aria-label={t('calendar.pop.close')}
            icon={<X size={20} />}
            onClick={onClose}
          />
        )}
      </div>

      <PlacePhoto src={info.photo} category={info.category} alt={t('calendar.pop.photoAlt', { name: info.name })} />

      <div>
        {showTitle ? (
          <h2 id={titleId} tabIndex={-1} className="text-heading text-ink outline-none">
            {info.name}
          </h2>
        ) : null}
        <p className="mt-0.5 text-label text-ink-2">
          {meta.label}
          {info.price ? ` · ${info.price}` : ''}
        </p>
      </div>

      <p data-testid="popover-time" className="text-body font-semibold tabular-nums text-ink">
        {timeLine}
      </p>

      {(info.submitter || info.wantCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-2">
          {info.submitter && (
            <span data-testid="popover-submitter" className="inline-flex items-center gap-2">
              <Avatar
                name={info.submitter.name}
                avatarUrl={info.submitter.avatarUrl}
                seed={info.submitter.seed}
                size="sm"
                showTitle={false}
              />
              {t('calendar.pop.proposedBy', { name: info.submitter.name })}
            </span>
          )}
          {info.wantCount > 0 && (
            <span data-testid="popover-want" className="inline-flex items-center gap-1 tabular-nums">
              <Heart size={16} weight="fill" className="text-danger" aria-hidden="true" />
              {t('calendar.pop.wantCount', { count: info.wantCount })}
            </span>
          )}
        </div>
      )}

      {info.intro && (
        <div>
          <p data-testid="popover-intro" className={`text-label text-ink-2 ${expanded ? '' : 'line-clamp-3'}`}>
            {info.intro}
          </p>
          {longIntro && (
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 inline-flex min-h-[44px] items-center text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              {expanded ? t('calendar.pop.showLess') : t('calendar.pop.showMore')}
            </button>
          )}
        </div>
      )}

      {info.address && (
        <div className="flex items-start justify-between gap-3">
          <p className="flex min-w-0 items-start gap-1.5 text-label text-ink-2">
            <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span data-testid="popover-address">{info.address}</span>
          </p>
          {info.directionsHref && (
            <a
              href={info.directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('calendar.pop.directionsLabel', { name: info.name })}
              className="inline-flex min-h-[44px] shrink-0 items-center text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              {t('calendar.pop.directions')}
            </a>
          )}
        </div>
      )}

      {item.note && (
        <div data-testid="popover-note" className="rounded-field bg-surface-2 px-3 py-2">
          <p className="text-caption font-semibold text-ink-2">{t('calendar.pop.note')}</p>
          <p className="whitespace-pre-wrap break-words text-label text-ink">{item.note}</p>
        </div>
      )}

      {conflictMessages.length > 0 && (
        <ul data-testid="popover-conflicts" className="space-y-1.5">
          {conflictMessages.map((m, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 rounded-field bg-danger-soft px-3 py-2 text-label text-ink"
            >
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      )}

      {travelNotes.length > 0 && (
        <ul data-testid="popover-travel" className="space-y-1.5">
          {travelNotes.map((n) => (
            <TravelNoteRow key={`${n.leg.from_item_id}>${n.leg.to_item_id}`} note={n} />
          ))}
        </ul>
      )}

      {onOpenPlace && info.placeId && (
        <button
          type="button"
          data-testid="popover-open-place"
          onClick={onOpenPlace}
          className="inline-flex min-h-[44px] items-center text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('calendar.pop.viewPlace')}
        </button>
      )}
    </div>
  );
};

/* ---------- Chế độ sửa ---------- */

const CHIP_KEY = {
  30: 'calendar.pop.chip30',
  60: 'calendar.pop.chip60',
  90: 'calendar.pop.chip90',
  120: 'calendar.pop.chip120',
} as const;

export interface ItemEditProps {
  item: ScheduleItem;
  name: string;
  /** Khung giờ của phòng (câu nhắc "Ngoài khung giờ"). */
  window: Pick<Room, 'start_minute' | 'end_minute'>;
  /** Mọi mục lịch (kiểm chồng giờ + nêu tên mục trùng). */
  items: readonly ScheduleItem[];
  saving?: boolean;
  titleId?: string;
  showTitle?: boolean;
  onSave: (slot: Slot, note: string | null) => void;
  onCancel: () => void;
}

export const ItemEdit: React.FC<ItemEditProps> = ({
  item,
  name,
  window: roomWindow,
  items,
  saving = false,
  titleId,
  showTitle = true,
  onSave,
  onCancel,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [start, setStart] = useState(() => minuteToInput(item.start_minute));
  const [end, setEnd] = useState(() => minuteToInput(item.end_minute));
  const [note, setNote] = useState(item.note ?? '');

  const v = validateEdit({ start, end, note }, { itemId: item.id, window: roomWindow, others: items });
  const startMin = parseTimeInput(start);
  const duration = v.slot ? v.slot.end_minute - v.slot.start_minute : null;
  const windowText = formatTimeWindow(
    roomWindow.start_minute ?? DEFAULT_WINDOW.start,
    roomWindow.end_minute ?? DEFAULT_WINDOW.end,
    lang,
  );
  const overlapNames = v.overlapIds
    .map((id) => items.find((i) => i.id === id)?.place_name)
    .filter(Boolean)
    .join(', ');

  const startError = parseTimeInput(start) === null ? t('calendar.pop.errTime') : undefined;
  const endError =
    parseTimeInput(end) === null
      ? t('calendar.pop.errTime')
      : v.errors.includes('endNotAfterStart')
        ? t('calendar.pop.errEnd')
        : undefined;
  const counter = t('calendar.pop.noteCount', { count: v.noteLength, max: NOTE_MAX });
  const noteTooLong = v.errors.includes('noteTooLong');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !v.canSave || !v.slot) return;
    onSave(v.slot, note.trim() || null);
  };

  return (
    <form data-testid="popover-edit-form" noValidate onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-1">
        <IconButton
          data-testid="popover-back"
          aria-label={t('calendar.pop.back')}
          icon={<ArrowLeft size={20} />}
          onClick={onCancel}
          disabled={saving}
        />
        {showTitle && (
          <h2 id={titleId} tabIndex={-1} className="min-w-0 truncate text-heading text-ink outline-none">
            {t('calendar.pop.editTitle', { name })}
          </h2>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          data-autofocus
          data-testid="popover-start"
          label={t('calendar.pop.start')}
          type="time"
          step={60}
          value={start}
          onChange={(e) => setStart((e.target as HTMLInputElement).value)}
          error={startError}
          disabled={saving}
          containerClassName="min-w-0"
        />
        <TextField
          data-testid="popover-end"
          label={t('calendar.pop.end')}
          type="time"
          step={60}
          value={end}
          onChange={(e) => setEnd((e.target as HTMLInputElement).value)}
          error={endError}
          disabled={saving}
          containerClassName="min-w-0"
        />
      </div>

      <div role="group" aria-label={t('calendar.pop.chipsLabel')} className="flex flex-wrap gap-2">
        {DURATION_CHIPS.map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`popover-chip-${d}`}
            aria-pressed={duration === d}
            disabled={saving || startMin === null}
            onClick={() => startMin !== null && setEnd(minuteToInput(Math.min(MAX_END_MINUTE, startMin + d)))}
            className={`inline-flex min-h-[44px] items-center rounded-chip border px-3 text-label font-semibold tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-50 ${
              duration === d ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t(CHIP_KEY[d])}
          </button>
        ))}
      </div>

      {v.notices.length > 0 && (
        <ul data-testid="popover-notices" className="space-y-1.5">
          {v.notices.includes('outsideWindow') && (
            <li className="flex items-start gap-1.5 rounded-field bg-warning-soft px-3 py-2 text-label text-ink">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              {t('calendar.pop.warnOutside', { range: windowText })}
            </li>
          )}
          {v.notices.includes('overlap') && (
            <li className="flex items-start gap-1.5 rounded-field bg-warning-soft px-3 py-2 text-label text-ink">
              <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              {t('calendar.pop.warnOverlap', { names: overlapNames })}
            </li>
          )}
        </ul>
      )}

      <TextField
        as="textarea"
        data-testid="popover-note-input"
        label={t('calendar.pop.noteLabel')}
        rows={3}
        value={note}
        placeholder={t('calendar.pop.notePlaceholder')}
        onChange={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        error={noteTooLong ? `${t('calendar.pop.errNote', { max: NOTE_MAX })} ${counter}` : undefined}
        hint={!noteTooLong && v.noteLength > NOTE_COUNTER_FROM ? counter : undefined}
        disabled={saving}
      />

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" data-testid="popover-cancel" onClick={onCancel} disabled={saving}>
          {t('calendar.pop.cancel')}
        </Button>
        <Button type="submit" data-testid="popover-save" loading={saving} disabled={!v.canSave}>
          {saving ? t('calendar.pop.saving') : t('calendar.pop.save')}
        </Button>
      </div>
    </form>
  );
};

/* ---------- Khung: popover (desktop) hoặc Sheet (<1024) ---------- */

export interface CalendarItemPopoverProps {
  item: ScheduleItem;
  place?: Place | null;
  room?: Room | null;
  items: readonly ScheduleItem[];
  members?: readonly Member[];
  conflictMessages?: string[];
  /** Đoạn thiếu giờ chạm ô này (ALGO-03, T-90): dòng pastel + "Vì sao?". */
  travelNotes?: TravelNote[];
  /** Hộp của ô lúc này (đọc lại khi cuộn/đổi cỡ); `null` thì dùng `fallbackRect`. */
  getAnchor: () => DOMRect | null;
  fallbackRect?: DOMRect | null;
  onClose: () => void;
  /** Trả `true` khi lưu xong (về chế độ xem), `false` khi lỗi (ở lại chế độ sửa). */
  onSave: (slot: Slot, note: string | null) => Promise<boolean>;
  onRemove: () => void;
  onOpenPlace?: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const CalendarItemPopover: React.FC<CalendarItemPopoverProps> = ({
  item,
  place = null,
  room = null,
  items,
  members = [],
  conflictMessages = [],
  travelNotes = [],
  getAnchor,
  fallbackRect = null,
  onClose,
  onSave,
  onRemove,
  onOpenPlace,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const layout = useWorkspaceLayout();
  const asSheet = layout === 'mobile';
  const titleId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<PopoverPlacement | null>(null);

  // Bộ tuyển chọn (chunk JSON riêng): nạp khi mở popup, như PlaceDetail
  const [curatedData, setCuratedData] = useState<CuratedData | null>(() => curatedLoaded());
  useEffect(() => {
    if (curatedData) return;
    let alive = true;
    loadCurated()
      .then((d) => alive && setCuratedData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [curatedData]);
  const info = useMemo(
    () => buildItemInfo(item, place, members, curatedData, lang),
    [item, place, members, curatedData, lang],
  );

  const roomWindow = {
    start_minute: room?.start_minute ?? DEFAULT_WINDOW.start,
    end_minute: room?.end_minute ?? DEFAULT_WINDOW.end,
  };

  const save = useCallback(
    async (slot: Slot, note: string | null) => {
      setSaving(true);
      try {
        if (await onSave(slot, note)) setMode('view');
      } finally {
        setSaving(false);
      }
    },
    [onSave],
  );

  // Định vị popover: đo lại khi đổi chế độ/nội dung, cuộn bất kỳ phần tử nào, đổi cỡ cửa sổ
  const reposition = useCallback(() => {
    const el = bodyRef.current;
    const rect = getAnchor() ?? fallbackRect;
    if (!el || !rect) return;
    setPos(
      placePopover(
        { left: rect.left, right: rect.right, top: rect.top, height: rect.height },
        { w: POPOVER_WIDTH, h: el.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
      ),
    );
  }, [getAnchor, fallbackRect]);
  useClientLayoutEffect(() => {
    if (!asSheet) reposition();
  }, [asSheet, reposition, mode, item, info, conflictMessages.length, curatedData]);
  useEffect(() => {
    if (asSheet) return;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    const ro = typeof ResizeObserver === 'undefined' || !bodyRef.current ? null : new ResizeObserver(reposition);
    if (ro && bodyRef.current) ro.observe(bodyRef.current);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      ro?.disconnect();
    };
  }, [asSheet, reposition]);

  // Focus: mở → nút đầu; đổi chế độ → điều khiển đầu của chế độ đó (Sheet tự đặt focus vào tiêu đề lúc mở)
  const firstRun = useRef(true);
  const ready = pos !== null;
  useEffect(() => {
    const first = firstRun.current;
    firstRun.current = false;
    if (asSheet && first) return;
    if (!asSheet && !ready) return; // chờ định vị xong mới focus được (ô còn ẩn)
    wrapRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }, [mode, asSheet, ready]);

  // Esc: chế độ sửa → về xem; chế độ xem → đóng (popover). Chặn ở pha capture để `Sheet` không đóng cả popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (mode === 'edit') {
        if (saving) return;
        e.preventDefault();
        e.stopPropagation();
        setMode('view');
      } else if (!asSheet) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, saving, asSheet, onClose]);

  // Bấm ra ngoài đóng popover; bấm vào một ô thì để ô tự xử lý (đổi/ngắt popup)
  useEffect(() => {
    if (asSheet) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || wrapRef.current?.contains(target) || target.closest('[data-event-id]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [asSheet, onClose]);

  // Tab vòng trong popover
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || asSheet) return;
    const list = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !wrapRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !wrapRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  const showTitle = !asSheet;
  const body =
    mode === 'view' ? (
      <ItemView
        item={item}
        info={info}
        conflictMessages={conflictMessages}
        travelNotes={travelNotes}
        titleId={titleId}
        showTitle={showTitle}
        onClose={asSheet ? undefined : onClose}
        onEdit={() => setMode('edit')}
        onRemove={onRemove}
        onOpenPlace={onOpenPlace}
      />
    ) : (
      <ItemEdit
        item={item}
        name={info.name}
        window={roomWindow}
        items={items}
        saving={saving}
        titleId={titleId}
        showTitle={showTitle}
        onSave={(slot, note) => void save(slot, note)}
        onCancel={() => setMode('view')}
      />
    );

  if (asSheet) {
    return (
      <Sheet
        isOpen
        onClose={onClose}
        title={mode === 'view' ? info.name : t('calendar.pop.editTitle', { name: info.name })}
      >
        <div ref={wrapRef} data-testid="calendar-popover" data-variant="sheet" className="pb-4">
          {body}
        </div>
      </Sheet>
    );
  }

  const arrow = pos && pos.side !== 'over';
  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="calendar-popover"
      data-variant="popover"
      data-side={pos?.side}
      onKeyDown={onKeyDown}
      className="fixed z-sheet"
      style={{
        width: POPOVER_WIDTH,
        maxWidth: 'calc(100vw - 16px)',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        // Chưa đo xong: giữ ở trong DOM (để focus được) nhưng chưa hiện
        opacity: pos ? 1 : 0,
      }}
    >
      {arrow && (
        <span
          aria-hidden="true"
          className={`absolute h-3 w-3 rotate-45 bg-surface ${
            pos.side === 'left' ? '-right-1.5 border-r border-t border-line' : '-left-1.5 border-b border-l border-line'
          }`}
          style={{ top: pos.arrowTop - 6 }}
        />
      )}
      <div
        ref={bodyRef}
        className="relative max-h-[70vh] overflow-y-auto rounded-card border border-line bg-surface p-3 shadow-float"
      >
        {body}
      </div>
    </div>
  );
};

/* ---------- Thanh Hoàn tác ---------- */

export interface UndoRemoveBarProps {
  name: string;
  onUndo: () => void;
  /** Hết hạn (5 s) hoặc bị đóng. */
  onDone: () => void;
  ms?: number;
}

/**
 * "Đã bỏ … · Hoàn tác" 5 s. `toast` chưa có nút hành động (Toast.tsx ngoài phạm vi T-81) nên vẽ thanh riêng, cùng kiểu thẻ toast.
 */
export const UndoRemoveBar: React.FC<UndoRemoveBarProps> = ({ name, onUndo, onDone, ms = UNDO_MS }) => {
  const { t } = useTranslation();
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => doneRef.current(), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-36 z-toast flex justify-center px-4 md:bottom-20">
      <div
        role="status"
        aria-live="polite"
        data-testid="undo-remove"
        className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-card border border-line bg-surface p-3.5 shadow-float toast-enter"
      >
        <span className="min-w-0 flex-1 truncate text-label font-medium text-ink">
          {t('calendar.pop.removed', { name })}
        </span>
        <button
          type="button"
          data-testid="undo-remove-btn"
          onClick={onUndo}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-field px-3 text-label font-semibold text-accent-text hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('common.undo')}
        </button>
      </div>
    </div>
  );
};

/* ---------- Lớp nối store: mở popup, lưu, bỏ khỏi lịch + hoàn tác ---------- */

/** Dòng cảnh báo di chuyển trong popup ô: pastel (không đỏ), "Vì sao?" mở công thức ngay bên dưới (không lồng popup). */
const TravelNoteRow: React.FC<{ note: TravelNote }> = ({ note }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const id = useId();
  const minutes = formatMinutes(Math.max(0, -note.leg.slack_min), lang);
  return (
    <li className="rounded-field bg-warning-soft px-3 py-2 text-label text-ink" data-testid="popover-travel-line">
      <div className="flex items-start gap-1.5">
        <WarningCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1 tabular-nums">
          {note.direction === 'out'
            ? t('algo.travel.popoverLine', { to: note.toName, minutes })
            : t('algo.travel.popoverLineIn', { from: note.fromName, minutes })}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          data-testid="popover-travel-why"
          className="-my-2.5 inline-flex min-h-[44px] shrink-0 items-center rounded-field px-1 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('algo.why.link')}
        </button>
      </div>
      {open && (
        <div id={id} className="mt-2 border-t border-warning/30 pt-2">
          <TravelWhy leg={note.leg} fromName={note.fromName} toName={note.toName} />
          <p className="mt-2 text-caption text-ink-2">
            {note.leg.source === 'GOOGLE' ? t('algo.why.sourceGoogle') : t('algo.why.sourceEstimate')}
          </p>
        </div>
      )}
    </li>
  );
};

export interface CalendarItemLayerProps {
  roomId: string;
  room?: Room | null;
  items: ScheduleItem[];
  places: Place[];
  members?: Member[];
  /** Câu xung đột theo mục (đã dịch). */
  itemConflicts: Map<string, { messages: string[] }>;
  /** Đoạn thiếu giờ theo mục (T-90). */
  travelNotes?: Map<string, TravelNote[]>;
  /** Popup đang mở, hoặc `null` khi đóng (lớp vẫn sống để thanh Hoàn tác chạy hết 5 s). */
  popup: { id: string; rect: DOMRect | null } | null;
  getAnchor: (id: string) => DOMRect | null;
  /** `restoreFocusId`: trả focus về ô đó. */
  onClose: (restoreFocusId?: string) => void;
}

export const CalendarItemLayer: React.FC<CalendarItemLayerProps> = ({
  roomId,
  room = null,
  items,
  places,
  members = [],
  itemConflicts,
  travelNotes,
  popup,
  getAnchor,
  onClose,
}) => {
  const { t } = useTranslation();
  const [removed, setRemoved] = useState<ScheduleItem | null>(null);
  const item = popup ? items.find((i) => i.id === popup.id) : undefined;
  const popupId = popup?.id;

  // Mục biến mất (người khác xoá, hoặc vừa bỏ) → đóng popup
  useEffect(() => {
    if (popupId && !item) onClose();
  }, [popupId, item, onClose]);

  const evaluate = useCallback(() => void useConflictStore.getState().evaluateConflicts(roomId).catch(() => {}), [roomId]);
  const getPopupAnchor = useCallback(() => (popupId ? getAnchor(popupId) : null), [getAnchor, popupId]);
  const close = useCallback(() => onClose(popupId), [onClose, popupId]);

  const save = useCallback(
    async (slot: Slot, note: string | null): Promise<boolean> => {
      if (!popupId) return false;
      try {
        // `note` có mặt trong thay đổi (null = xoá ghi chú) — CR-10
        await useScheduleStore.getState().moveItems(roomId, [{ id: popupId, ...slot, note }]);
        evaluate();
        return true;
      } catch {
        toast.error(t('calendar.saveFailed'));
        return false;
      }
    },
    [popupId, roomId, evaluate, t],
  );

  const remove = useCallback(async () => {
    if (!item) return;
    const snapshot = item;
    const store = useScheduleStore.getState();
    onClose();
    store.removeItem(snapshot.id); // xoá ngay trên màn, server theo sau
    try {
      await scheduleApi.deleteScheduleItem(roomId, snapshot.id);
      setRemoved(snapshot);
      evaluate();
    } catch {
      useScheduleStore.getState().upsertItem(snapshot);
      toast.error(t('calendar.pop.removeFailed'));
    }
  }, [item, onClose, roomId, evaluate, t]);

  const undo = useCallback(async () => {
    const snapshot = removed;
    setRemoved(null);
    if (!snapshot) return;
    try {
      const created = await scheduleApi.createScheduleItem(roomId, {
        place_id: snapshot.place_id,
        day_offset: snapshot.day_offset,
        start_minute: snapshot.start_minute,
        end_minute: snapshot.end_minute,
        ...(snapshot.note ? { note: snapshot.note } : null),
      });
      const store = useScheduleStore.getState();
      store.upsertItem(created); // trùng id với bản WS tới trước thì thay, không nhân đôi
      // Mục mới nhận `order_index` cuối: sắp lại theo giờ; ghi chú server không nhận ở POST thì bù lại
      const fix = (created.note ?? null) !== (snapshot.note ?? null) ? [{ id: created.id, note: snapshot.note ?? null }] : [];
      await store.moveItems(roomId, fix).catch(() => {});
      evaluate();
    } catch {
      toast.error(t('calendar.pop.restoreFailed'));
    }
  }, [removed, roomId, evaluate, t]);

  const openPlace = useCallback(() => {
    if (!item) return;
    onClose();
    useMapStore.getState().selectPlace(item.place_id);
  }, [item, onClose]);

  // Portal ra `body`: ngăn kéo 1024–1279 (`.ws-drawer`) giữ `transform` sau hiệu ứng nên làm
  // `position: fixed` của popup/thanh Hoàn tác tính theo ngăn kéo thay vì viewport.
  return createPortal(
    <>
      {popup && item && (
        // `key`: mở popup ô khác thì dựng lại (về chế độ xem, focus lại), không chồng hai popup
        <CalendarItemPopover
          key={item.id}
          item={item}
          place={places.find((p) => p.id === item.place_id) ?? null}
          room={room}
          items={items}
          members={members}
          conflictMessages={itemConflicts.get(item.id)?.messages ?? []}
          travelNotes={travelNotes?.get(item.id)}
          getAnchor={getPopupAnchor}
          fallbackRect={popup.rect}
          onClose={close}
          onSave={save}
          onRemove={() => void remove()}
          onOpenPlace={openPlace}
        />
      )}
      {removed && (
        <UndoRemoveBar
          key={removed.id}
          name={removed.place_name}
          onUndo={() => void undo()}
          onDone={() => setRemoved(null)}
        />
      )}
    </>,
    document.body,
  );
};
