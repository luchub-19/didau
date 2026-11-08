import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Shuffle } from '../ui';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { TieSuggestionCard, type TieSuggestionCardProps } from '../algo/TieSuggestion';
import { TIE_CHOOSE_INTENT, placeThumb, tieInfo } from '../../room/placeView';
import type { RoomPhase } from '../../room/phase';
import type { DeciderHint, Place } from '../../types';
import type { DecideIntent } from './DecideModal';

const MAX_NAMES = 3;

export interface TieBlockProps {
  /** Chỉ vẽ ở giai đoạn `tie` (DESIGN §3); giai đoạn khác trả null. */
  phase: RoomPhase;
  hints?: DeciderHint[];
  places?: Place[];
  /** Host bấm "Cách khác" → mở bảng chọn hộ ở bước chọn kiểu (không bao giờ tự mở). */
  onDecide: (intent: DecideIntent) => void;
  /** Ghi đè nguồn đề xuất (test, vì SSR đọc store ở trạng thái đầu). */
  suggestionSource?: TieSuggestionCardProps['source'];
}

/** Ảnh nhỏ của quán đề xuất: ảnh thật khi có, thiếu thì biểu tượng danh mục. */
const Thumb: React.FC<{ place: Place }> = ({ place }) => {
  const thumb = placeThumb(place);
  const meta = CATEGORY_METADATA[thumb.category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <span
      aria-hidden="true"
      data-testid="tie-thumb"
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-field ${meta.bg} ${meta.text}`}
    >
      {thumb.src ? <img src={thumb.src} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon size={24} weight="duotone" />}
    </span>
  );
};

/**
 * Khối hoà phiếu đầu danh sách (ALGO-02, DESIGN gđ6 §8): tiêu đề + đề xuất quán đi chung kèm số, host chốt bằng một nút,
 * "Cách khác" mở các kiểu chọn hộ cũ, "Vì sao?" cho bảng ma trận.
 */
export const TieBlock: React.FC<TieBlockProps> = ({ phase, hints: propHints, places: propPlaces, onDecide, suggestionSource }) => {
  const { t } = useTranslation();
  const storeHints = useDecisionStore((s) => s.hints);
  const storePlaces = usePlaceStore((s) => s.places);
  const places = propPlaces ?? storePlaces;
  const info = phase === 'tie' ? tieInfo(propHints ?? storeHints, places) : null;
  if (!info) return null;

  const shown = info.names.slice(0, MAX_NAMES);
  const extra = info.names.length - shown.length;

  return (
    <section
      data-testid="tie-block"
      aria-label={t('decide.tie.title', { count: info.count, votes: info.votes })}
      className="relative rounded-card border border-accent/30 bg-accent-soft/40 p-4"
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

      <TieSuggestionCard
        source={suggestionSource}
        onOther={() => onDecide(TIE_CHOOSE_INTENT)}
        thumbFor={(id) => {
          const p = places.find((x) => x.id === id);
          return p ? <Thumb place={p} /> : null;
        }}
      />
    </section>
  );
};
