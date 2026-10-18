import React, { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from './Icon';
import { IconButton } from './IconButton';

// Ngăn xếp các Sheet đang mở: chỉ Sheet trên cùng nhận Esc, và khoá cuộn chỉ trả lại khi Sheet cuối đóng.
const openSheets: symbol[] = [];
let overflowBeforeLock = '';

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeLabel?: string;
  className?: string;
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  className = '',
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();

  const titleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const sheetId = useRef(Symbol('sheet'));
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isRendered, setIsRendered] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  // Kéo xuống để đóng trên mobile (DESIGN.md §8, T-52)
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const currentDeltaY = useRef<number>(0);

  const handleRequestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      setIsRendered(false);
      setIsClosing(false);
      closeTimerRef.current = null;
    }, 220); // Thời lượng đóng thoát 220ms (--t-ui)
  }, [isClosing, onClose]);

  useEffect(() => {
    if (isOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsRendered(true);
      setIsClosing(false);
    } else if (isRendered && !isClosing) {
      setIsClosing(true);
      closeTimerRef.current = setTimeout(() => {
        setIsRendered(false);
        setIsClosing(false);
        closeTimerRef.current = null;
      }, 220);
    }
  }, [isOpen, isRendered, isClosing]);

  useEffect(() => {
    if (!isRendered) return;

    if (typeof document !== 'undefined') {
      previousActiveElement.current = document.activeElement as HTMLElement | null;

      // Khoá cuộn nền khi Sheet mở (DESIGN.md §5, T-40)
      const id = sheetId.current;
      if (openSheets.length === 0) {
        overflowBeforeLock = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      }
      if (!openSheets.includes(id)) {
        openSheets.push(id);
      }

      // Chuyển focus vào tiêu đề dialog
      const timer = setTimeout(() => {
        titleRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(timer);
        const idx = openSheets.indexOf(id);
        if (idx !== -1) openSheets.splice(idx, 1);
        if (openSheets.length === 0) document.body.style.overflow = overflowBeforeLock;
        // Trả focus về phần tử đã mở Sheet
        previousActiveElement.current?.focus?.();
      };
    }
  }, [isRendered]);

  useEffect(() => {
    if (!isRendered) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Sheet chồng nhau: chỉ Sheet trên cùng xử lý phím
      if (openSheets[openSheets.length - 1] !== sheetId.current) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        handleRequestClose();
        return;
      }

      // Bẫy focus bên trong Sheet
      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        // Focus đang nằm ngoài dialog (ví dụ trên nền): kéo vào lại
        if (!dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? lastElement : firstElement).focus();
          return;
        }

        if (event.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === titleRef.current) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRendered, handleRequestClose]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    currentDeltaY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null || !dialogRef.current) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartY.current;
    if (delta > 0) {
      currentDeltaY.current = delta;
      dialogRef.current.style.transition = 'none';
      dialogRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null || !dialogRef.current) return;
    const delta = currentDeltaY.current;
    const duration = Date.now() - touchStartTime.current;
    const velocity = duration > 0 ? delta / duration : 0;
    const height = dialogRef.current.offsetHeight || 300;
    const ratio = delta / height;

    touchStartY.current = null;

    if (ratio > 0.3 || velocity > 0.5) {
      dialogRef.current.style.transition = 'transform 220ms var(--ease-out)';
      dialogRef.current.style.transform = 'translateY(100%)';
      handleRequestClose();
    } else if (delta > 0) {
      dialogRef.current.style.transition = 'transform 220ms var(--ease-out)';
      dialogRef.current.style.transform = 'translateY(0)';
      setTimeout(() => {
        if (dialogRef.current) {
          dialogRef.current.style.transition = '';
          dialogRef.current.style.transform = '';
        }
      }, 220);
    }
  };

  if (!isRendered) return null;

  const content = (
    <div
      className={`fixed inset-0 z-sheet bg-ink/40 flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4 ${
        isClosing ? 'sheet-backdrop-exit' : 'sheet-backdrop-enter'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleRequestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`w-full max-h-[90dvh] rounded-t-card flex flex-col bg-surface shadow-float overflow-hidden md:rounded-card md:max-h-[85vh] md:w-full md:max-w-lg ${
          isClosing ? 'sheet-content-exit' : 'sheet-content-enter'
        } ${className}`}
      >
        {/* Khu vực tay nắm kéo và header cho phép vuốt kéo xuống trên mobile */}
        <div
          className="touch-none flex-shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Tay nắm kéo trên mobile (DESIGN.md §5, T-52) */}
          <div className="md:hidden flex justify-center pt-3 pb-1 cursor-grab" aria-hidden="true">
            <div className="w-10 h-1 rounded-full bg-line" />
          </div>

          {/* Tiêu đề và nút đóng X */}
          <div className="flex items-start justify-between gap-4 p-4 md:p-6 pb-2 md:pb-4">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                ref={titleRef}
                tabIndex={-1}
                className="text-title font-bold text-ink outline-none"
              >
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-caption text-ink-2 mt-1">
                  {description}
                </p>
              )}
            </div>
            <IconButton
              aria-label={closeLabel || t('ui.close')}
              icon={<X size={20} />}
              onClick={handleRequestClose}
            />
          </div>
        </div>

        {/* Nội dung cuộn bên trong */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-2 text-body text-ink">
          {children}
        </div>

        {/* Chân trang nếu có nút hành động */}
        {footer && (
          <div className="p-4 md:p-6 pt-3 border-t border-line flex items-center justify-end gap-3 flex-shrink-0 bg-surface">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }

  return content;
};

