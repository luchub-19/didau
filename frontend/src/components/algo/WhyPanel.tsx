// Khung "Vì sao?" dùng chung cho mọi số do thuật toán tính (DESIGN gđ6 §8, ALGORITHMS §7).
// Desktop (≥1024): popover neo vào liên kết; mobile: Sheet. Nội dung là `children`; chân panel ghi nguồn số liệu.
// T-89/T-90 chỉ cần truyền tiêu đề + nội dung (bảng hoà phiếu, câu cảnh báo di chuyển, nhãn ưu tiên).
// T-108: `size="lg"` (24rem) rộng hơn cột danh sách (cột cuộn nên cắt mọi thứ tràn ra) → popover lên portal,
// `position: fixed` neo theo khối cha có định vị của nút mở, kẹp trong khung nhìn để hiện trọn không phải cuộn.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui';
import { X } from '../ui/Icon';
import { useWorkspaceLayout } from '../shell/workspace';

// Không có `window` (render phía server/test markup) thì useLayoutEffect chỉ sinh cảnh báo → dùng useEffect
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export type WhySource = 'ESTIMATE' | 'GOOGLE' | 'VALHALLA' | 'MIXED';

const SOURCE_KEY = {
  ESTIMATE: 'algo.why.sourceEstimate',
  GOOGLE: 'algo.why.sourceGoogle',
  VALHALLA: 'algo.why.sourceValhalla',
  MIXED: 'algo.why.sourceMixed',
} as const satisfies Record<WhySource, string>;

export interface WhyPanelProps {
  title: string;
  children: React.ReactNode;
  /** Nguồn km/phút: "Ước lượng · xe máy", "Google Maps", "Valhalla · xe máy" (CR-15) hoặc lẫn. Bỏ qua khi số không liên quan di chuyển. */
  source?: WhySource | null;
  /** Hướng mở của popover desktop (widget ở đáy bản đồ mở lên trên). */
  placement?: 'top' | 'bottom';
  align?: 'left' | 'right';
  /** Nhãn liên kết; mặc định "Vì sao?". T-90: có thể là nút dạng chip (nhãn ưu tiên, dải di chuyển). */
  label?: React.ReactNode;
  /** T-90: thay kiểu mặc định (liên kết chữ) của nút mở — vd. chip nhãn ưu tiên, dải di chuyển trên lịch. */
  triggerClassName?: string;
  /** Tên đọc màn hình của nút mở khi `label` không phải chữ thuần. */
  triggerAriaLabel?: string;
  /** Độ rộng popover desktop: `md` 20rem (mặc định), `lg` 24rem cho nội dung có biểu đồ thanh (T-108). Mobile luôn là Sheet. */
  size?: 'md' | 'lg';
  className?: string;
  'data-testid'?: string;
}

export const WhyPanel: React.FC<WhyPanelProps> = ({
  title,
  children,
  source,
  placement = 'bottom',
  align = 'left',
  label,
  triggerClassName,
  triggerAriaLabel,
  size = 'md',
  className = '',
  'data-testid': testId = 'why-panel',
}) => {
  const { t } = useTranslation();
  const layout = useWorkspaceLayout();
  const asSheet = layout === 'mobile';
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const floating = size === 'lg' && !asSheet;
  const [pos, setPos] = useState<React.CSSProperties | null>(null);

  // Popover nổi (lg): tính vị trí theo khung nhìn; tính lại khi cuộn/đổi cỡ/nội dung đổi cao
  useIsoLayoutEffect(() => {
    if (!open || !floating) {
      setPos(null);
      return;
    }
    const GAP = 16;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger) return;
      const t = trigger.getBoundingClientRect();
      const anchorEl = (wrapRef.current?.offsetParent as HTMLElement | null) ?? trigger;
      const a = anchorEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(panel?.offsetWidth || 384, vw - 2 * GAP);
      const height = Math.min(panel?.scrollHeight || 0, vh - 2 * GAP);
      const rawLeft = align === 'right' ? a.right - width : a.left;
      const left = Math.max(GAP, Math.min(rawLeft, vw - GAP - width));
      const rawTop = placement === 'top' ? t.top - 4 - height : t.bottom + 4;
      const top = Math.max(GAP, Math.min(rawTop, vh - GAP - height));
      setPos({ position: 'fixed', left, top, maxHeight: vh - 2 * GAP });
    };
    place();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver !== 'undefined' && panelRef.current ? new ResizeObserver(schedule) : null;
    if (ro && panelRef.current) ro.observe(panelRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
    };
  }, [open, floating, align, placement]);

  // Popover: focus vào panel, bấm ra ngoài hoặc Esc thì đóng; Esc trả focus về liên kết
  useEffect(() => {
    if (!open || asSheet) return;
    panelRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, asSheet]);

  const sourceLine = source ? (
    <p className="mt-3 border-t border-line pt-2 text-caption text-ink-2" data-testid="why-source" data-source={source}>
      {t(SOURCE_KEY[source] ?? SOURCE_KEY.ESTIMATE)}
    </p>
  ) : null;

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open && !asSheet ? panelId : undefined}
      aria-label={triggerAriaLabel}
      data-testid={`${testId}-link`}
      className={
        triggerClassName ??
        'inline-flex min-h-[44px] items-center rounded-field px-2 text-label font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text'
      }
    >
      {label ?? t('algo.why.link')}
    </button>
  );

  if (asSheet) {
    return (
      <span className={className}>
        {trigger}
        <Sheet isOpen={open} onClose={() => setOpen(false)} title={title}>
          <div className="pb-2 text-body text-ink" data-testid={`${testId}-body`}>
            {children}
            {sourceLine}
          </div>
        </Sheet>
      </span>
    );
  }

  const panel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-testid={`${testId}-body`}
      style={floating ? (pos ?? { position: 'fixed', left: 0, top: 0, opacity: 0 }) : undefined}
      className={`z-sheet overflow-y-auto rounded-card border border-line bg-surface p-3 text-body text-ink shadow-float focus:outline-none ${
        floating
          ? 'w-[24rem] max-w-[calc(100vw-2rem)]'
          : `absolute w-[20rem] max-w-[calc(100vw-2rem)] max-h-[60dvh] ${placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'} ${
              align === 'right' ? 'right-0' : 'left-0'
            }`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-heading text-ink">{title}</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          aria-label={t('algo.why.close')}
          className="-mr-1 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-ink-2 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1">{children}</div>
      {sourceLine}
    </div>
  ) : null;

  return (
    <span ref={wrapRef} className={`relative inline-block ${className}`}>
      {trigger}
      {floating && panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </span>
  );
};
