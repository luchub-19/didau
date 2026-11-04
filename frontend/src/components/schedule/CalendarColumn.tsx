import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConflictAlert, Member, Place, PlaceCategory, Room, ScheduleItem } from '../../types';
import {
  DEFAULT_WINDOW,
  MAX_COLUMNS,
  PX_PER_MIN,
  dropSlot,
  gridRange,
  layoutColumns,
  yAtMinute,
  type CalendarGrid,
  type Slot,
} from '../../room/calendar';
import { keyboardSlot, useCalendarDrag } from '../../room/useCalendarDrag';
import { planBudget } from '../../room/budget';
import { useScheduleStore } from '../../store/useScheduleStore';
import { useConflictStore } from '../../store/useConflictStore';
import { useMapStore } from '../../store/useMapStore';
import { useWorkspaceLayout } from '../shell/workspace';
import { useLanguage, type Language } from '../../i18n/useLanguage';
import { formatTime, formatTimeWindow } from '../../i18n/format';
import { describeConflict } from '../../i18n/serverText';
import { buildInviteUrl, shareRoom } from '../room/shareRoom';
import { buildScheduleIcs, downloadIcs, icsFileName } from '../../stage/reveal/actions';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { toast } from '../ui/toastStore';
import { CalendarBlank, Plus, ShareNetwork, Sparkle, WarningCircle } from '../ui/Icon';
import { BudgetMeter } from './BudgetMeter';
import { AutoPlanButton } from './AutoPlanButton';
import { AutoPlanPreview } from './AutoPlanPreview';
import { CalendarEvent } from './CalendarEvent';

/** `useLayoutEffect` chỉ ở trình duyệt (render tĩnh trong test không cảnh báo). */
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Bàn phím: dừng bấm 600 ms thì lưu (DESIGN gđ6 §3). */
const KEYBOARD_SAVE_MS = 600;
/** Khe 2px giữa hai ô liền nhau. */
const EVENT_GAP_PX = 2;

/**
 * Quán đang được kéo từ ngoài lịch (T-80 nối nguồn). Cột chỉ vẽ ô xem trước 60' đã snap khi con trỏ ở trong lưới;
 * `dropped = true` ở trong lưới → gọi `onExternalDrop(placeId, slot)`.
 */
export interface ExternalCalendarDrag {
  placeId: string;
  name: string;
  category?: PlaceCategory;
  clientX: number;
  clientY: number;
  /** Thời lượng ô thả (phút), mặc định 60. */
  duration?: number;
  dropped?: boolean;
}

export interface CalendarColumnProps {
  roomId: string;
  room?: Room | null;
  items: ScheduleItem[];
  places: Place[];
  members?: Member[];
  isHost?: boolean;
  /** Mặc định đọc `useConflictStore`. */
  conflicts?: ConflictAlert[];
  onOpenAddModal?: () => void;
  onOpenDecideModal?: () => void;
  /** Mở popup ô (T-81). Thiếu → tạm mở `PlaceDetail` của quán. */
  onOpenItem?: (itemId: string, anchorRect: DOMRect) => void;
  externalDrag?: ExternalCalendarDrag | null;
  onExternalDrop?: (placeId: string, slot: Slot) => void;
  /** Giờ hiện tại (test). Thiếu → đồng hồ thật, cập nhật mỗi phút khi tab hiện. */
  now?: Date;
}

/** Nhãn giờ ở gutter: VI `18:00`, EN `6 PM`. */
function hourLabel(minute: number, lang: Language): string {
  if (lang !== 'en') return formatTime(minute, 'vi');
  const h = Math.floor(minute / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const localIsoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Đồng hồ phút cho vạch "bây giờ": `setInterval` 60 s, dừng khi tab ẩn. Chỉ chạy khi `enabled`. */
function useMinuteClock(enabled: boolean, fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed || !enabled || typeof document === 'undefined') return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      setNow(new Date());
      if (id === null) id = setInterval(() => setNow(new Date()), 60_000);
    };
    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, fixed]);
  return fixed ?? now;
}

/** Vạch kẻ và nhãn giờ của lưới. */
function gridMarks(grid: CalendarGrid) {
  const hours: number[] = [];
  const halves: number[] = [];
  for (let m = Math.ceil(grid.start / 30) * 30; m <= grid.end; m += 30) (m % 60 === 0 ? hours : halves).push(m);
  return { hours, halves };
}

export const CalendarColumn: React.FC<CalendarColumnProps> = ({
  roomId,
  room = null,
  items,
  places,
  members = [],
  isHost = false,
  conflicts: propConflicts,
  onOpenAddModal,
  onOpenDecideModal,
  onOpenItem,
  externalDrag = null,
  onExternalDrop,
  now: fixedNow,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const layout = useWorkspaceLayout();

  const moveItems = useScheduleStore((s) => s.moveItems);
  const previewAutoPlan = useScheduleStore((s) => s.previewAutoPlan);
  const isLoading = useScheduleStore((s) => s.isLoading);
  const storeConflicts = useConflictStore((s) => s.conflicts);
  const evaluateConflicts = useConflictStore((s) => s.evaluateConflicts);
  const conflicts = propConflicts ?? storeConflicts;

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [openCluster, setOpenCluster] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  // Bản nháp bàn phím (↑/↓): lưu sau 600 ms không bấm
  const [kbDraft, setKbDraft] = useState<{ id: string; slot: Slot } | null>(null);
  const kbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kbRef = useRef(kbDraft);
  kbRef.current = kbDraft;
  const refocusId = useRef<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const placeMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const firstDay = useMemo(() => items.filter((i) => (i.day_offset ?? 0) === 0), [items]);
  const otherDays = items.length - firstDay.length;
  const roomWindow = {
    start_minute: room?.start_minute ?? DEFAULT_WINDOW.start,
    end_minute: room?.end_minute ?? DEFAULT_WINDOW.end,
  };
  const grid = useMemo(
    () => gridRange(roomWindow, firstDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomWindow.start_minute, roomWindow.end_minute, firstDay],
  );
  const range = (s: Slot) =>
    t('calendar.range', { start: formatTime(s.start_minute, lang), end: formatTime(s.end_minute, lang) });

  // Xung đột theo mục: câu mô tả của mọi xung đột chứa mục (popup T-81 sẽ hiện đầy đủ)
  const itemConflicts = useMemo(() => {
    const map = new Map<string, { messages: string[] }>();
    for (const c of conflicts) {
      if (c.entity_type !== 'SCHEDULE' || !Array.isArray(c.entity_ids)) continue;
      const text = describeConflict(c, { scheduleItems: items, places }, t);
      for (const id of c.entity_ids) {
        const e = map.get(id) ?? { messages: [] };
        e.messages.push(text);
        map.set(id, e);
      }
    }
    return map;
  }, [conflicts, items, places, t]);
  // Chỉ đếm xung đột còn chạm mục đang có (xung đột cũ của mục đã xoá chờ đánh giá lại thì bỏ qua)
  const scheduleConflictCount = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    return conflicts.filter((c) => c.entity_type === 'SCHEDULE' && c.entity_ids?.some((id) => ids.has(id))).length;
  }, [conflicts, items]);

  const commit = useCallback(
    async (id: string, slot: Slot) => {
      const name = items.find((i) => i.id === id)?.place_name ?? '';
      setAnnounce(t('calendar.moved', { name, range: range(slot) }));
      try {
        await moveItems(roomId, [{ id, start_minute: slot.start_minute, end_minute: slot.end_minute }]);
        void evaluateConflicts(roomId).catch(() => {});
      } catch {
        toast.error(t('calendar.saveFailed'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, moveItems, evaluateConflicts, roomId, t, lang],
  );

  const { drag, selectedId, onPointerDown, consumeClick, clearSelection, slotAtClientY, isInsideGrid } =
    useCalendarDrag({ grid, gridRef, pxPerMin: PX_PER_MIN, onCommit: (id, slot) => void commit(id, slot) });
  const dragging = drag?.active ? drag : null;

  // Kéo từ ngoài (T-80): ô xem trước + thả
  const external = useMemo(() => {
    if (!externalDrag || !isInsideGrid(externalDrag.clientX, externalDrag.clientY)) return null;
    const m = slotAtClientY(externalDrag.clientY);
    return m === null ? null : { ...externalDrag, slot: dropSlot(m, grid, externalDrag.duration) };
  }, [externalDrag, isInsideGrid, slotAtClientY, grid]);
  useEffect(() => {
    if (external?.dropped) onExternalDrop?.(external.placeId, external.slot);
  }, [external, onExternalDrop]);

  // Bố cục cột: ô đang kéo/sửa bằng phím giữ chỗ cũ (cập nhật từ xa tới ô đang kéo bị hoãn tới khi thả)
  const layoutItems = useMemo(
    () =>
      firstDay.map((i) =>
        dragging && i.id === dragging.id ? { ...i, ...dragging.origin } : kbDraft?.id === i.id ? { ...i, ...kbDraft.slot } : i,
      ),
    [firstDay, dragging, kbDraft],
  );
  const columns = useMemo(() => layoutColumns(layoutItems), [layoutItems]);
  const itemById = useMemo(() => new Map(layoutItems.map((i) => [i.id, i])), [layoutItems]);

  // Bàn phím đổi thứ tự DOM (sắp theo giờ) → trình duyệt có thể rơi focus khi ô bị dời chỗ: trả về đúng ô
  useClientLayoutEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-event-id="${id}"]`)?.focus();
  }, [items, kbDraft]);

  useEffect(
    () => () => {
      if (kbTimer.current) clearTimeout(kbTimer.current);
    },
    [],
  );

  const flushKeyboard = () => {
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = null;
    const d = kbRef.current;
    if (!d) return;
    // Giữ ý định trả focus thêm một nhịp cho lượt `items` từ server
    setTimeout(() => {
      if (refocusId.current === d.id) refocusId.current = null;
    }, 1500);
    const cur = items.find((i) => i.id === d.id);
    setKbDraft(null);
    if (cur && (cur.start_minute !== d.slot.start_minute || cur.end_minute !== d.slot.end_minute)) {
      void commit(d.id, d.slot);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>, item: ScheduleItem) => {
    const draft = kbRef.current;
    if (e.key === 'Escape' && draft?.id === item.id) {
      e.preventDefault();
      e.stopPropagation();
      if (kbTimer.current) clearTimeout(kbTimer.current);
      setKbDraft(null);
      setAnnounce(t('calendar.cancelled'));
      return;
    }
    const base = draft?.id === item.id ? draft.slot : { start_minute: item.start_minute, end_minute: item.end_minute };
    const next = keyboardSlot(base, e.key, e.shiftKey, grid);
    if (!next) return;
    e.preventDefault();
    if (draft && draft.id !== item.id) flushKeyboard();
    refocusId.current = item.id;
    setKbDraft({ id: item.id, slot: next });
    setAnnounce(range(next));
    if (kbTimer.current) clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(flushKeyboard, KEYBOARD_SAVE_MS);
  };

  const openItem = (item: ScheduleItem, el: HTMLElement) => {
    if (onOpenItem) onOpenItem(item.id, el.getBoundingClientRect());
    else useMapStore.getState().selectPlace(item.place_id);
  };

  const handleOpenAutoPlan = async () => {
    try {
      await previewAutoPlan(roomId);
    } catch (err) {
      console.error('Failed to load auto plan preview:', err);
    } finally {
      setIsPreviewOpen(true);
    }
  };

  const handleSend = () => {
    if (room) void shareRoom({ roomId: room.id, code: room.code, title: room.title, t });
  };
  const handleAddToCalendar = () => {
    if (!room) return;
    const ics = buildScheduleIcs({ room, items, places, url: buildInviteUrl(room.id, room.code) });
    downloadIcs(ics, icsFileName(room.title));
  };
  const focusFirstConflict = () => {
    const el = gridRef.current?.querySelector<HTMLElement>('[data-conflict="true"]');
    el?.focus();
  };

  const budget = useMemo(
    () => planBudget({ schedule: items, places, budgetLimit: room?.budget_limit }),
    [items, places, room?.budget_limit],
  );

  const hasItems = items.length > 0;
  const windowText = formatTimeWindow(grid.windowStart, grid.windowEnd, lang);
  const title =
    grid.windowStart >= DEFAULT_WINDOW.start
      ? t('calendar.titleEvening', { range: windowText })
      : t('calendar.titleDay', { range: windowText });
  const heightPx = (grid.end - grid.start) * PX_PER_MIN;
  const { hours, halves } = gridMarks(grid);
  const y = (m: number) => yAtMinute(m, grid.start);

  const showNow = Boolean(room?.event_date) && localIsoDate(fixedNow ?? new Date()) === room?.event_date;
  const now = useMinuteClock(showNow, fixedNow);
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const nowVisible = showNow && nowMinute >= grid.start && nowMinute <= grid.end;

  // Ô tràn (cụm > 3 cột) gom theo cụm thành một nút "+N"
  const overflow = new Map<number, ScheduleItem[]>();
  for (const c of columns) {
    if (!c.overflow) continue;
    const it = itemById.get(c.id);
    if (it) overflow.set(c.cluster, [...(overflow.get(c.cluster) ?? []), it]);
  }

  return (
    <section data-testid="calendar-column" aria-label={t('calendar.region')} className="relative">
      {/* Đầu cột dính: tiêu đề + khung giờ, chip xung đột, ngân sách */}
      <div className="sticky top-0 z-content -mx-4 space-y-3 bg-surface px-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold leading-tight text-ink tabular-nums" data-testid="calendar-title">
            {title}
          </h3>
          {scheduleConflictCount > 0 && (
            <button
              type="button"
              onClick={focusFirstConflict}
              data-testid="calendar-conflicts"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-chip px-3 text-caption font-semibold text-danger hover:bg-danger-soft"
            >
              <WarningCircle size={16} weight="fill" aria-hidden="true" />
              {t('calendar.conflicts', { count: scheduleConflictCount })}
            </button>
          )}
        </div>
        {(hasItems || budget.limit !== null) && <BudgetMeter budget={budget} />}
      </div>

      {isLoading && !hasItems ? (
        <div className="space-y-3 py-2" data-testid="calendar-loading">
          <Skeleton className="h-16 w-full rounded-field" />
          <Skeleton className="h-24 w-full rounded-field" />
          <Skeleton className="h-16 w-full rounded-field" />
        </div>
      ) : (
        <div className="py-2">
          <div
            ref={gridRef}
            data-testid="calendar-grid"
            data-grid-start={grid.start}
            data-grid-end={grid.end}
            role="group"
            aria-label={t('calendar.gridLabel')}
            aria-describedby="calendar-kbd-hint"
            className="relative isolate"
            style={{ height: heightPx }}
            onPointerDown={(e) => {
              if (selectedId && !(e.target as HTMLElement).closest('[data-event-id]')) clearSelection();
            }}
          >
            {/* Ngoài khung giờ của phòng: sọc chéo nhạt */}
            {grid.start < grid.windowStart && (
              <div
                data-testid="calendar-outside"
                className="cal-outside absolute left-12 right-0 top-0"
                style={{ height: y(grid.windowStart) }}
              >
                <span className="ml-1 text-caption text-ink-3">{t('calendar.outside')}</span>
              </div>
            )}
            {grid.end > grid.windowEnd && (
              <div
                data-testid="calendar-outside"
                className="cal-outside absolute bottom-0 left-12 right-0 flex items-end"
                style={{ top: y(grid.windowEnd) }}
              >
                <span className="mb-0.5 ml-1 text-caption text-ink-3">{t('calendar.outside')}</span>
              </div>
            )}

            {/* Kẻ giờ (liền) và nửa giờ (đứt, 50%) + nhãn giờ ở gutter 48px */}
            {hours.map((m) => (
              <div key={`h${m}`} aria-hidden="true" className="absolute inset-x-0" style={{ top: y(m) }}>
                <span className="absolute left-0 w-11 -translate-y-1/2 pr-1 text-right text-caption leading-none text-ink-3 tabular-nums">
                  {hourLabel(m, lang)}
                </span>
                <span className="absolute left-12 right-0 border-t border-line" />
              </div>
            ))}
            {halves.map((m) => (
              <span
                key={`m${m}`}
                aria-hidden="true"
                className="absolute left-12 right-0 border-t border-dashed border-line/50"
                style={{ top: y(m) }}
              />
            ))}

            {/* Lớp ô quán */}
            <div className="absolute inset-y-0 left-12 right-0">
              {columns.map((c) => {
                if (c.overflow) return null;
                const it = itemById.get(c.id);
                if (!it) return null;
                const isDragged = dragging?.id === it.id;
                const shown = isDragged ? dragging.preview : { start_minute: it.start_minute, end_minute: it.end_minute };
                const leftPct = (c.col / c.cols) * 100;
                const widthPct = 100 / c.cols;
                const top = y(it.start_minute);
                const height = Math.max(
                  (shown.end_minute - shown.start_minute) * PX_PER_MIN - EVENT_GAP_PX,
                  8,
                );
                const place = placeMap.get(it.place_id);
                const conflict = itemConflicts.get(it.id) ?? null;
                return (
                  <React.Fragment key={it.id}>
                    {isDragged && (
                      <CalendarEvent
                        ghost
                        item={it}
                        category={place?.category}
                        slot={dragging.origin}
                        top={top}
                        height={(dragging.origin.end_minute - dragging.origin.start_minute) * PX_PER_MIN - EVENT_GAP_PX}
                        leftPct={leftPct}
                        widthPct={widthPct}
                      />
                    )}
                    <CalendarEvent
                      item={it}
                      category={place?.category}
                      slot={shown}
                      top={top}
                      height={height}
                      leftPct={leftPct}
                      widthPct={widthPct}
                      offsetY={isDragged ? (shown.start_minute - it.start_minute) * PX_PER_MIN : 0}
                      conflict={conflict}
                      dragging={isDragged}
                      dragOutside={isDragged && dragging.outside}
                      selected={selectedId === it.id}
                      draggable
                      onPointerDown={(e, mode) => {
                        const src = items.find((i) => i.id === it.id) ?? it;
                        onPointerDown(e, it.id, { start_minute: src.start_minute, end_minute: src.end_minute }, mode);
                      }}
                      onClick={(e) => {
                        if (consumeClick(it.id)) return;
                        if (selectedId === it.id) return;
                        openItem(it, e.currentTarget);
                      }}
                      onKeyDown={(e) => handleKeyDown(e, it)}
                    />
                  </React.Fragment>
                );
              })}

              {[...overflow.entries()].map(([cluster, list]) => {
                const s = Math.min(...list.map((i) => i.start_minute));
                const e = Math.max(...list.map((i) => i.end_minute));
                const isOpen = openCluster === cluster;
                const leftPct = ((MAX_COLUMNS - 1) / MAX_COLUMNS) * 100;
                return (
                  <div
                    key={`more${cluster}`}
                    className="absolute"
                    style={{ top: y(s), left: `${leftPct}%`, width: `calc(${100 / MAX_COLUMNS}% - 2px)` }}
                  >
                    <button
                      type="button"
                      data-testid="calendar-more"
                      aria-expanded={isOpen}
                      aria-label={t('calendar.moreLabel', { count: list.length })}
                      onClick={() => setOpenCluster(isOpen ? null : cluster)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Escape' && isOpen) {
                          ev.stopPropagation();
                          setOpenCluster(null);
                        }
                      }}
                      className="flex w-full items-start justify-center rounded-field bg-surface-2 pt-1 text-caption font-semibold text-ink-2 hover:bg-line"
                      style={{ height: Math.max((e - s) * PX_PER_MIN - EVENT_GAP_PX, 24) }}
                    >
                      {t('calendar.more', { count: list.length })}
                    </button>
                    {isOpen && (
                      <ul className="absolute right-0 top-full z-content mt-1 w-56 rounded-field bg-surface p-1 shadow-float">
                        {list.map((it) => (
                          <li key={it.id}>
                            <button
                              type="button"
                              className="flex min-h-[44px] w-full flex-col justify-center rounded-field px-3 text-left hover:bg-surface-2"
                              onClick={(ev) => {
                                setOpenCluster(null);
                                openItem(it, ev.currentTarget);
                              }}
                            >
                              <span className="truncate text-label font-semibold text-ink">{it.place_name}</span>
                              <span className="text-caption tabular-nums text-ink-2">{range(it)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              {/* Ô xem trước khi kéo quán từ ngoài vào (T-80) */}
              {external && (
                <div
                  aria-hidden="true"
                  data-testid="calendar-drop-preview"
                  className="pointer-events-none absolute inset-x-0 rounded-field border border-dashed border-accent bg-accent-soft/70 px-2 py-1"
                  style={{
                    top: y(external.slot.start_minute),
                    height: (external.slot.end_minute - external.slot.start_minute) * PX_PER_MIN - EVENT_GAP_PX,
                  }}
                >
                  <span className="block truncate text-label font-semibold text-ink">{external.name}</span>
                  <span className="block text-caption tabular-nums text-ink-2">{range(external.slot)}</span>
                </div>
              )}
            </div>

            {/* Vạch "bây giờ" khi ngày phòng là hôm nay */}
            {nowVisible && (
              <div
                data-testid="calendar-now"
                aria-hidden="true"
                className="pointer-events-none absolute left-12 right-0 z-content"
                style={{ top: y(nowMinute) }}
              >
                <span className="absolute -left-1 -top-[4px] h-2.5 w-2.5 rounded-full bg-danger" />
                <span className="absolute inset-x-0 -top-px h-0.5 bg-danger" />
              </div>
            )}

            {/* Lịch trống: lưới vẫn vẽ đủ, gợi ý ở giữa */}
            {!hasItems && (
              <div
                data-testid="calendar-empty"
                className="pointer-events-none absolute inset-y-0 left-12 right-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
              >
                <CalendarBlank size={24} className="text-ink-3" aria-hidden="true" />
                <p className="max-w-[16rem] text-caption leading-normal text-ink-3">
                  {layout === 'mobile' ? t('calendar.emptyHintMobile') : t('calendar.emptyHintDesktop')}
                </p>
              </div>
            )}
          </div>

          <p id="calendar-kbd-hint" className="sr-only">
            {t('calendar.keyboardHint')}
          </p>
          <p className="sr-only" aria-live="polite" data-testid="calendar-live">
            {announce}
          </p>

          {otherDays > 0 && (
            <p data-testid="calendar-other-days" className="mt-3 text-caption text-ink-2">
              {t('calendar.otherDays', { count: otherDays })}
            </p>
          )}

          {/* Tạm tới T-80 (kéo từ cột trái): thêm quán bằng form cũ */}
          {onOpenAddModal && (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={onOpenAddModal}
              data-testid="calendar-add"
              leftIcon={<Plus size={16} weight="bold" />}
            >
              {t('calendar.addPlace')}
            </Button>
          )}
        </div>
      )}

      {/* Chân cột dính đáy (§6): bước ④ gửi kế hoạch; bước ③ (lịch trống) xếp lịch tự động */}
      <div
        data-testid={hasItems ? 'plan-footer' : 'plan-footer-empty'}
        className="sticky bottom-0 z-content -mx-4 -mb-4 space-y-2 border-t border-line bg-surface px-4 pb-4 pt-3"
      >
        {hasItems ? (
          <>
            {room && (
              <Button
                variant="primary"
                className="w-full"
                onClick={handleSend}
                data-testid="send-plan-btn"
                leftIcon={<ShareNetwork size={18} weight="bold" />}
              >
                {t('plan.send')}
              </Button>
            )}
            <div className="grid grid-cols-2 gap-2">
              {room && (
                <Button
                  variant="secondary"
                  onClick={handleAddToCalendar}
                  data-testid="add-to-calendar-btn"
                  className="px-3"
                  leftIcon={<CalendarBlank size={16} />}
                >
                  {t('plan.addToCalendar')}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleOpenAutoPlan}
                data-testid="reoptimize-schedule-btn"
                leftIcon={<Sparkle size={16} />}
                className={room ? 'px-3' : 'col-span-2'}
              >
                {t('schedule.reoptimize')}
              </Button>
            </div>
          </>
        ) : (
          <AutoPlanButton
            roomId={roomId}
            places={places}
            members={members}
            isHost={isHost}
            onOpenPreview={handleOpenAutoPlan}
            onOpenDecideModal={onOpenDecideModal}
            label={t('calendar.autoPlan')}
            className="w-full"
          />
        )}
      </div>

      <AutoPlanPreview
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        roomId={roomId}
        places={places}
        isHost={isHost}
        onApplySuccess={() => {
          void evaluateConflicts(roomId);
        }}
      />
    </section>
  );
};
