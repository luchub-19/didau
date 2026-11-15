// Khung "Vì sao?" dùng chung cho mọi số do thuật toán tính (DESIGN gđ6 §8, ALGORITHMS §7).
// Desktop (≥1024): popover neo vào liên kết; mobile: Sheet. Nội dung là `children`; chân panel ghi nguồn số liệu.
// T-89/T-90 chỉ cần truyền tiêu đề + nội dung (bảng hoà phiếu, câu cảnh báo di chuyển, nhãn ưu tiên).
import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui';
import { X } from '../ui/Icon';
import { useWorkspaceLayout } from '../shell/workspace';

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

  // Popover: focus vào panel, bấm ra ngoài hoặc Esc thì đóng; Esc trả focus về liên kết
  useEffect(() => {
    if (!open || asSheet) return;
    panelRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <span ref={wrapRef} className={`relative inline-block ${className}`}>
      {trigger}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          data-testid={`${testId}-body`}
          className={`absolute z-sheet w-[20rem] max-w-[calc(100vw-2rem)] max-h-[60dvh] overflow-y-auto rounded-card border border-line bg-surface p-3 text-body text-ink shadow-float focus:outline-none ${
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${align === 'right' ? 'right-0' : 'left-0'}`}
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
      )}
    </span>
  );
};
