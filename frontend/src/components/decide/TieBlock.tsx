import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Button, Shuffle, Sparkle } from '../ui';
import { TIE_CHOOSE_INTENT, TIE_RUN_INTENT, tieInfo } from '../../room/placeView';
import type { RoomPhase } from '../../room/phase';
import type { DeciderHint, Place } from '../../types';
import type { DecideIntent } from './DecideModal';

const MAX_NAMES = 3;

export interface TieBlockProps {
  /** Chỉ vẽ ở giai đoạn `tie` (DESIGN §3); giai đoạn khác trả null. */
  phase: RoomPhase;
  hints?: DeciderHint[];
  places?: Place[];
  /** Mở bảng chọn hộ: mặc định chạy luôn kiểu mặc định; "Đổi cách chọn" mở ở bước chọn kiểu. */
  onDecide: (intent: DecideIntent) => void;
}

/** Khối hoà phiếu đầu danh sách: một nút "Để trọng tài chọn" ra kết quả ngay, không bắt chọn kiểu trước. */
export const TieBlock: React.FC<TieBlockProps> = ({ phase, hints: propHints, places: propPlaces, onDecide }) => {
  const { t } = useTranslation();
  const storeHints = useDecisionStore((s) => s.hints);
  const storePlaces = usePlaceStore((s) => s.places);
  const info = phase === 'tie' ? tieInfo(propHints ?? storeHints, propPlaces ?? storePlaces) : null;
  if (!info) return null;

  const shown = info.names.slice(0, MAX_NAMES);
  const extra = info.names.length - shown.length;

  return (
    <section
      data-testid="tie-block"
      aria-label={t('decide.tie.title', { count: info.count, votes: info.votes })}
      className="rounded-card border border-accent/30 bg-accent-soft/40 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"
        >
          <Shuffle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-bold leading-snug text-ink">
            {t('decide.tie.title', { count: info.count, votes: info.votes })}
          </h3>
          <p className="mt-0.5 text-label text-ink-2">
            {shown.join(' · ')}
            {extra > 0 && <span className="ml-1 text-ink-3">{t('decide.tie.more', { count: extra })}</span>}
          </p>
        </div>
      </div>

      <Button
        variant="primary"
        size="lg"
        className="mt-3 w-full"
        leftIcon={<Sparkle size={18} weight="fill" />}
        onClick={() => onDecide(TIE_RUN_INTENT)}
        data-testid="tie-cta"
      >
        {t('decide.tie.cta')}
      </Button>
      <div className="mt-1 flex justify-center">
        <button
          type="button"
          onClick={() => onDecide(TIE_CHOOSE_INTENT)}
          data-testid="tie-change"
          className="min-h-11 px-3 text-label font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          {t('decide.tie.change')}
        </button>
      </div>
    </section>
  );
};
