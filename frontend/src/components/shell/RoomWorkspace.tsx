import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarBlank, IconButton } from '../ui';
import type { PhaseStep, RoomPhase } from '../../room/phase';
import type { RoomTab } from './useRoomTab';
import { useMotionTier } from '../../motion/useMotionTier';
import {
  SHEET_TOP_GAP_PX,
  defaultSheetSnap,
  resolvePlanOpen,
  settleSnap,
  snapHeights,
  toggleSnap,
  useWorkspaceLayout,
  type PlanOverride,
  type SheetSnap,
} from './workspace';

// Khung "không gian phòng" (DESIGN gđ5 §2):
//   ≥1280  3 cột: danh sách | bản đồ | kế hoạch (thu 72px / mở 440px)
//   1024–1279  danh sách 360px | bản đồ | dải kế hoạch 72px, mở thành ngăn kéo đè lên bản đồ
//   <1024  2 tab: Khám phá (bản đồ + sheet danh sách 3 nấc) / Kế hoạch
// Nội dung các cột là slot; T-69/T-72/T-73 thiết kế lại bên trong, không đổi khung.

/* ---------- Component ---------- */

export interface RoomWorkspaceProps {
  /** Tab đang chọn — chỉ có tác dụng <1024px. */
  activeTab: RoomTab;
  phase: RoomPhase;
  viewStep: PhaseStep;
  /** Slot cột trái (desktop) / nội dung sheet Khám phá (mobile). */
  list: React.ReactNode;
  /** Slot giữa: bản đồ, luôn mounted. */
  map: React.ReactNode;
  /** Slot cột phải (desktop) / tab Kế hoạch (mobile). */
  plan: React.ReactNode;
  /** Số quán — hiện trên dòng tiêu đề của sheet mobile. */
  placesCount: number;
  /** Số mục lịch — hiện trên dải Kế hoạch thu gọn. */
  scheduleCount: number;
  /** Lịch có xung đột → chấm đỏ trên dải/nút Kế hoạch (T-73 đưa cảnh báo vào mục lịch). */
  hasConflicts?: boolean;
  /** Tăng mỗi lần cần nhường chỗ cho bản đồ (vd. "xem trên bản đồ"): sheet mobile thu về nấc thấp nhất. */
  mapFocusKey?: number;
}

export const RoomWorkspace: React.FC<RoomWorkspaceProps> = ({
  activeTab,
  phase,
  viewStep,
  list,
  map,
  plan,
  placesCount,
  scheduleCount,
  hasConflicts = false,
  mapFocusKey = 0,
}) => {
  const { t } = useTranslation();
  const layout = useWorkspaceLayout();
  const tier = useMotionTier();
  const isDesktop = layout !== 'mobile';

  // Ghi đè tay cho cột Kế hoạch; tự hết hiệu lực khi giai đoạn đổi (so `override.phase`)
  const [planOverride, setPlanOverride] = useState<PlanOverride | null>(null);
  const planOpen = resolvePlanOpen(viewStep, phase, planOverride);
  const setPlanOpen = useCallback((open: boolean) => setPlanOverride({ phase, open }), [phase]);

  const leftWidth =
    layout === 'medium' ? 'var(--ws-left-md)' : viewStep === 1 ? 'var(--ws-left-gather)' : 'var(--ws-left)';

  return (
    <div
      className="ws-root relative h-full w-full flex min-h-0 overflow-hidden"
      data-layout={layout}
      data-motion-tier={tier}
      data-plan-open={planOpen ? 'true' : 'false'}
    >
      {/* Cột trái: danh sách (desktop) */}
      {isDesktop && (
        // `contain: layout` biến cột thành khối chứa của nút nổi `fixed` trong danh sách (Thêm quán): nút nằm góc
        // dưới cột trái thay vì đè lên cột Kế hoạch. Cột không cuộn, lớp trong cuộn → nút không trôi theo.
        <section
          aria-label={t('room.workspace.listRegion')}
          className="ws-col ws-list relative shrink-0 h-full bg-bg border-r border-line [contain:layout]"
          style={{ width: leftWidth }}
        >
          <div className="h-full overflow-y-auto overscroll-contain">
            <div className="p-4 pb-24">{list}</div>
          </div>
        </section>
      )}

      {/* Giữa: bản đồ luôn mounted; mobile tab Kế hoạch thì ẩn (ResizeObserver của MapView tự resize khi hiện lại) */}
      <section
        aria-label={t('room.workspace.mapRegion')}
        {...(isDesktop ? {} : { id: 'panel-explore', role: 'tabpanel', 'aria-labelledby': 'tab-explore' })}
        className={`relative flex-1 min-w-0 h-full overflow-hidden ${!isDesktop && activeTab === 'plan' ? 'hidden' : ''}`}
      >
        {map}
        {!isDesktop && (
          <ExploreSheet phase={phase} placesCount={placesCount} mapFocusKey={mapFocusKey}>
            {list}
          </ExploreSheet>
        )}
      </section>

      {/* Phải: Kế hoạch */}
      {isDesktop ? (
        <PlanColumn
          wide={layout === 'wide'}
          open={planOpen}
          onOpenChange={setPlanOpen}
          scheduleCount={scheduleCount}
          hasConflicts={hasConflicts}
        >
          {plan}
        </PlanColumn>
      ) : activeTab === 'plan' ? (
        <section
          id="panel-plan"
          role="tabpanel"
          aria-labelledby="tab-plan"
          className="flex-1 min-w-0 h-full overflow-y-auto overscroll-contain"
        >
          <div className="px-4 py-5">{plan}</div>
        </section>
      ) : null}
    </div>
  );
};

/* ---------- Cột Kế hoạch (desktop) ---------- */

interface PlanColumnProps {
  wide: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleCount: number;
  hasConflicts: boolean;
  children: React.ReactNode;
}

const PlanColumn: React.FC<PlanColumnProps> = ({ wide, open, onOpenChange, scheduleCount, hasConflicts, children }) => {
  const { t } = useTranslation();
  const panelId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  // Chỉ chuyển focus khi người dùng bấm, không khi cột tự mở theo bước
  const focusAfterToggle = useRef<'panel' | 'rail' | null>(null);

  useEffect(() => {
    const target = focusAfterToggle.current;
    focusAfterToggle.current = null;
    if (target === 'panel' && open) headingRef.current?.focus();
    if (target === 'rail' && !open) railRef.current?.focus();
  }, [open]);

  const showRail = !open || !wide;
  const asDrawer = open && !wide;

  // Ngăn kéo 1024–1279: Esc đóng và trả focus về dải Kế hoạch. Sheet đang mở thì để Sheet nhận Esc.
  useEffect(() => {
    if (!asDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      focusAfterToggle.current = 'rail';
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asDrawer, onOpenChange]);

  return (
    <aside
      aria-label={t('room.tab.plan')}
      className={`ws-col relative z-content shrink-0 h-full bg-surface border-l border-line ${wide ? 'overflow-hidden' : 'overflow-visible'}`}
      style={{ width: open && wide ? 'var(--ws-plan-open)' : 'var(--ws-plan-rail)' }}
    >
      {showRail && (
        <button
          ref={railRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            focusAfterToggle.current = 'panel';
            onOpenChange(true);
          }}
          className="absolute inset-y-0 right-0 flex flex-col items-center gap-4 py-4 text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text"
          style={{ width: 'var(--ws-plan-rail)' }}
          title={t('room.workspace.planOpen')}
          aria-label={
            hasConflicts
              ? `${t('room.workspace.planOpen')}. ${t('room.workspace.hasConflicts')}`
              : t('room.workspace.planOpen')
          }
        >
          <span className="relative inline-flex">
            <CalendarBlank size={24} aria-hidden="true" />
            {hasConflicts && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger" aria-hidden="true" />
            )}
          </span>
          <span className="text-label font-semibold text-ink [writing-mode:vertical-rl]">{t('room.tab.plan')}</span>
          {scheduleCount > 0 && (
            <span className="text-caption px-2 py-0.5 rounded-full bg-surface-2 text-ink-2 tabular-nums">{scheduleCount}</span>
          )}
          <span className="mt-auto flex flex-col items-center gap-0.5 text-caption text-ink-3">
            <span>{t('room.workspace.budget')}</span>
            {/* T-73 thay bằng tổng ngân sách cả buổi */}
            <span className="text-label font-semibold text-ink-2 tabular-nums">—</span>
          </span>
        </button>
      )}

      {open && (
        <div
          id={panelId}
          className={`absolute inset-y-0 right-0 flex flex-col bg-surface ${asDrawer ? 'ws-drawer border-l border-line shadow-float' : ''}`}
          style={{ width: 'var(--ws-plan-open)' }}
          role={asDrawer ? 'dialog' : undefined}
          aria-modal={asDrawer ? false : undefined}
          aria-labelledby={`${panelId}-title`}
        >
          <div className="flex items-center justify-between gap-2 h-14 shrink-0 px-4 border-b border-line">
            <h2
              ref={headingRef}
              id={`${panelId}-title`}
              tabIndex={-1}
              className="text-heading font-semibold text-ink leading-tight focus:outline-none"
            >
              {t('room.tab.plan')}
            </h2>
            <IconButton
              icon={<ArrowRight size={20} />}
              aria-label={t('room.workspace.planCollapse')}
              aria-expanded={true}
              aria-controls={panelId}
              title={t('room.workspace.planCollapse')}
              onClick={() => {
                focusAfterToggle.current = 'rail';
                onOpenChange(false);
              }}
            />
          </div>
          <div className="ws-plan flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
        </div>
      )}
    </aside>
  );
};

/* ---------- Sheet danh sách trên bản đồ (mobile) ---------- */

interface ExploreSheetProps {
  phase: RoomPhase;
  placesCount: number;
  mapFocusKey: number;
  children: React.ReactNode;
}

const ExploreSheet: React.FC<ExploreSheetProps> = ({ phase, placesCount, mapFocusKey, children }) => {
  const { t } = useTranslation();
  const bodyId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerPx, setContainerPx] = useState(0);
  const [snap, setSnap] = useState<SheetSnap>(() => defaultSheetSnap(phase));
  // Độ lệch đang kéo (px, dương = kéo xuống); null khi không kéo
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);
  // Cú click phát ra ngay sau khi thả kéo không được tính là bấm
  const suppressClick = useRef(false);

  // Giai đoạn đổi → về nấc mặc định của giai đoạn mới
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === phase) return;
    lastPhase.current = phase;
    setSnap(defaultSheetSnap(phase));
  }, [phase]);

  // Nhường bản đồ khi được yêu cầu (chọn "xem trên bản đồ")
  const lastFocusKey = useRef(mapFocusKey);
  useEffect(() => {
    if (lastFocusKey.current === mapFocusKey) return;
    lastFocusKey.current = mapFocusKey;
    setSnap('peek');
  }, [mapFocusKey]);

  // Đo khung chứa (phần cha = vùng bản đồ) để tính nấc theo px
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setContainerPx(parent.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const heights = snapHeights(containerPx);
  const sheetPx = heights.full;
  const restOffset = sheetPx - heights[snap];
  const offset =
    dragPx === null ? restOffset : Math.min(sheetPx - heights.peek, Math.max(0, restOffset + dragPx));

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    suppressClick.current = false;
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragPx(dy);
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      suppressClick.current = true;
      setSnap(settleSnap(sheetPx - offset, d.velocity, snap, containerPx));
    }
    setDragPx(null);
  };

  // Chuyển nấc bằng `top`, không bằng transform: transform biến sheet thành khối chứa của nút nổi `fixed`
  // trong danh sách (Thêm quán, PlaceList) và đẩy nút ra ngoài màn. T-69 đưa nút vào trong thì đổi lại transform.
  return (
    <div
      ref={rootRef}
      className={`ws-sheet absolute inset-x-0 z-content flex flex-col rounded-t-3xl border-t border-line bg-surface shadow-float ${dragPx !== null ? 'is-dragging' : ''}`}
      style={{
        height: containerPx > 0 ? `${sheetPx}px` : `calc(100% - ${SHEET_TOP_GAP_PX}px)`,
        top: containerPx > 0 ? `${containerPx - sheetPx + offset}px` : '50%',
      }}
      data-snap={snap}
    >
      {/* Tay nắm + tiêu đề: kéo để đổi nấc; bấm (hoặc Enter) để thu/mở nửa màn */}
      <div
        className="shrink-0 touch-none select-none cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          type="button"
          aria-expanded={snap !== 'peek'}
          aria-controls={bodyId}
          aria-label={t('room.workspace.sheetHandle')}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setSnap(toggleSnap(snap));
          }}
          className="w-full flex flex-col items-center pt-2 pb-1 min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text rounded-t-3xl"
        >
          <span className="w-10 h-1 rounded-full bg-line" aria-hidden="true" />
          <span className="mt-2 text-label font-semibold text-ink">
            {t('room.workspace.sheetTitle', { count: placesCount })}
          </span>
        </button>
      </div>
      {/* Nấc thu: phần thân nằm ngoài khung, không cho Tab vào (React 18 chưa có kiểu cho `inert`) */}
      <div
        id={bodyId}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4"
        style={{ paddingBottom: `${Math.max(16, offset + 16)}px` }}
        {...(snap === 'peek' && dragPx === null ? ({ inert: '' } as Record<string, string>) : {})}
      >
        {children}
      </div>
    </div>
  );
};
