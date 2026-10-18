import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToastStore, type ToastItem } from './toastStore';
import { CheckCircle, WarningCircle, XCircle, Info, X } from './Icon';

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const duration = item.duration ?? 4000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(item.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [item.id, item.duration, onDismiss]);

  const isError = item.type === 'error';

  let iconNode = <Info size={20} weight="fill" className="text-info flex-shrink-0" />;
  if (item.type === 'success') {
    iconNode = <CheckCircle size={20} weight="fill" className="text-success flex-shrink-0" />;
  } else if (item.type === 'error') {
    iconNode = <XCircle size={20} weight="fill" className="text-danger flex-shrink-0" />;
  } else if (item.type === 'warning') {
    iconNode = <WarningCircle size={20} weight="fill" className="text-warning flex-shrink-0" />;
  }

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className="pointer-events-auto w-full max-w-md p-3.5 rounded-card bg-surface border border-line shadow-float flex items-center justify-between gap-3 animate-fade-in"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {iconNode}
        <span className="text-label text-ink font-medium truncate">{item.message}</span>
      </div>
      <button
        type="button"
        aria-label={t('ui.close')}
        onClick={() => onDismiss(item.id)}
        className="p-1 rounded-full text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors flex-shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export const ToastViewport: React.FC = () => {
  const { t } = useTranslation();
  const storeToasts = useToastStore((state) => state.toasts);
  const toasts = typeof window === 'undefined' ? useToastStore.getState().toasts : storeToasts;
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label={t('ui.notifications')}
      className="fixed bottom-20 md:bottom-6 left-0 right-0 z-toast pointer-events-none flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={removeToast} />
      ))}
    </div>
  );
};
