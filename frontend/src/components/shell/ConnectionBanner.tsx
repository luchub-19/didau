import React from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch } from '../ui';

export interface ConnectionBannerProps {
  isConnected: boolean;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({ isConnected }) => {
  const { t } = useTranslation();

  if (isConnected) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warning-soft text-warning border-b border-warning/20 px-4 py-2 flex items-center justify-center gap-2 text-caption font-medium transition-opacity"
    >
      <CircleNotch size={14} className="animate-spin flex-shrink-0" />
      <span>{t('connection.reconnecting')}</span>
    </div>
  );
};
