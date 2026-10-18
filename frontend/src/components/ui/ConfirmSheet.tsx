import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { Button } from './Button';

export interface ConfirmSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string; // Nêu rõ hành động (ví dụ: "Xoá quán"), không dùng OK/Có (DESIGN.md §5, T-40)
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export const ConfirmSheet: React.FC<ConfirmSheetProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
}) => {
  const { t } = useTranslation();

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel || t('common.cancel')}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="text-body text-ink-2">{description}</p>}
    </Sheet>
  );
};
