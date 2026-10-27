import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Button } from '../../components/ui';

export interface HeroActionsProps {
  onCreate: () => void;
  onJoin: () => void;
  /** Mã phòng vào gần đây (nếu có) → nút "Tiếp tục phòng". */
  resumeCode?: string | null;
  onResume?: () => void;
}

/** CTA Tạo phòng / Nhập mã (+ Tiếp tục phòng): luôn thấy và Tab tới được ở mọi cảnh (DESIGN §7). */
export const HeroActions: React.FC<HeroActionsProps> = ({ onCreate, onJoin, resumeCode, onResume }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3">
        <Button size="lg" className="flex-1 !px-4 whitespace-nowrap !text-[rgb(var(--stage-on-accent))]" onClick={onCreate}>
          {t('stage.createRoom')}
        </Button>
        <Button size="lg" variant="secondary" className="flex-1 !px-4 whitespace-nowrap" onClick={onJoin}>
          {t('stage.joinRoom')}
        </Button>
      </div>
      {resumeCode && onResume && (
        <button
          type="button"
          onClick={onResume}
          className="w-full min-h-[52px] px-4 flex items-center justify-between gap-3 rounded-card bg-surface border border-line text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <span className="min-w-0">
            <span className="block text-caption text-ink-3">{t('home.resumeHint')}</span>
            <span className="block text-label font-semibold text-ink truncate">
              {t('home.resume', { code: resumeCode })}
            </span>
          </span>
          <ArrowRight size={20} className="text-ink-2 flex-shrink-0" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
