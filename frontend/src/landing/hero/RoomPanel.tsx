// Panel trái của cửa sổ phòng mẫu (mock v3 `renderRoom`): thẻ trên cùng theo `roomSim.view()` — hoà (gợi ý + "bớt N′"
// + Chốt + "Vì sao?" mở tại chỗ), dẫn (Chốt), đã chốt (dấu tích + "Làm lại") — rồi 3 dòng quán có nút tim.
// Thuần trình bày: nhận state + callback, nên test render tĩnh được từng trạng thái.
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BowlFood, CaretDown, Check, Heart } from '../../components/ui/Icon';
import { HOST } from '../cast';
import type { PlaceId } from '../logic/types';
import { panelModel, placeById, type HeroState, type PlaceRowModel } from './heroState';

export interface RoomPanelProps {
  state: HeroState;
  onToggleVote: (id: PlaceId) => void;
  onLock: (id: PlaceId) => void;
  onUndo: () => void;
  onToggleWhy: () => void;
  /** Rê chuột vào dòng quán → ghim trên bản đồ nổi lên (và ngược lại). */
  hot: PlaceId | null;
  onHover: (id: PlaceId | null) => void;
  /** Quán vừa được thả tim (để nảy tim); đổi `popKey` để chạy lại. */
  pop: { id: PlaceId; key: number } | null;
}

const WHY_ID = 'hero-why';

export const RoomPanel: React.FC<RoomPanelProps> = ({
  state,
  onToggleVote,
  onLock,
  onUndo,
  onToggleWhy,
  hot,
  onHover,
  pop,
}) => {
  const { t } = useTranslation();
  const { view: v, rows } = panelModel(state);
  const kindKey = v.kind === 'locked' ? 'locked' : `${v.kind}:${v.tops.join(',')}:${v.max}`;
  // Thẻ chỉ "trượt vào" khi trạng thái đổi do thao tác, không chạy ở lần vẽ đầu
  const firstKind = useRef(kindKey);
  const changed = useRef(false);
  if (kindKey !== firstKind.current) changed.current = true;
  const swap = changed.current ? ' hero-swap' : '';

  const best = placeById(v.best);
  const maxFar = Math.max(...rows.map((r) => r.far));

  const lockBtn = (
    <button type="button" className="hero-chot" data-lock={v.best} onClick={() => onLock(v.best)}>
      <Check size={14} weight="bold" aria-hidden="true" />
      {t('landing.room.lockIn', { name: best.short })}
    </button>
  );

  let card: React.ReactNode;
  if (v.kind === 'locked') {
    card = (
      <div key={kindKey} className="hero-card hero-locked">
        <div className="hero-stamp" aria-hidden="true">
          <Check size={22} weight="bold" />
        </div>
        <div className="hero-locked-badge">{t('landing.room.locked')}</div>
        <div className="hero-locked-name">{best.name}</div>
        <div className="hero-locked-sub">{t('landing.room.lockedSub', { host: HOST.id })}</div>
        <button type="button" className="hero-linkbtn" data-undo onClick={onUndo}>
          {t('landing.room.undo')}
        </button>
      </div>
    );
  } else if (v.kind === 'tie') {
    card = (
      <div key={kindKey} className={`hero-card${swap}`}>
        <div className="hero-card-head">{t('landing.room.tieTitle', { n: v.tops.length, votes: v.max })}</div>
        <div className="hero-card-sub">{v.tops.map((id) => placeById(id).short).join(' · ')}</div>
        <div className="hero-sugg">
          <div className="hero-sugg-title">{t('landing.room.suggest', { name: best.name })}</div>
          <div className="hero-sugg-meta">{t('landing.room.saves', { min: v.savesMin })}</div>
          {lockBtn}
          <button
            type="button"
            className="hero-linkbtn"
            aria-expanded={state.room.why}
            aria-controls={WHY_ID}
            onClick={onToggleWhy}
          >
            {t('landing.room.why')}
            <CaretDown size={12} weight="bold" aria-hidden="true" className="hero-caret" />
          </button>
          <div id={WHY_ID} className="hero-why" data-open={state.room.why ? 'true' : 'false'}>
            <div>
              <div className="hero-why-in">
                <p className="hero-why-rule">{t('landing.room.whyRule')}</p>
                {v.tops.map((id) => {
                  const far = state.room.far[id];
                  return (
                    <div key={id} className="hero-mini" data-best={id === v.best ? 'true' : undefined}>
                      <span>{placeById(id).short}</span>
                      <span className="hero-mini-track">
                        <i style={{ width: `${Math.round((far / maxFar) * 100)}%` }} />
                      </span>
                      <span className="hero-mini-v">{t('landing.hero.minutes', { min: far })}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    card = (
      <div key={kindKey} className={`hero-card${swap}`}>
        <div className="hero-card-head">{t('landing.room.leadTitle', { name: best.name })}</div>
        <div className="hero-card-sub">{t('landing.room.leadSub', { votes: v.max })}</div>
        {lockBtn}
      </div>
    );
  }

  return (
    <div className="hero-panel">
      <div aria-live="polite">{card}</div>
      <ul className="hero-places">
        {rows.map((r) => (
          <PlaceRow
            key={r.id}
            row={r}
            hot={hot === r.id}
            popKey={pop && pop.id === r.id ? pop.key : 0}
            onToggleVote={onToggleVote}
            onHover={onHover}
          />
        ))}
      </ul>
    </div>
  );
};

interface PlaceRowProps {
  row: PlaceRowModel;
  hot: boolean;
  popKey: number;
  onToggleVote: (id: PlaceId) => void;
  onHover: (id: PlaceId | null) => void;
}

const PlaceRow: React.FC<PlaceRowProps> = ({ row, hot, popKey, onToggleVote, onHover }) => {
  const { t } = useTranslation();
  const p = placeById(row.id);
  return (
    <li
      className="hero-place"
      data-id={row.id}
      data-tone={row.tone}
      data-hot={hot && row.tone !== 'hot' ? 'true' : undefined}
      onPointerEnter={() => onHover(row.id)}
      onPointerLeave={() => onHover(null)}
    >
      <span className="hero-place-ico" aria-hidden="true">
        <BowlFood size={18} weight="fill" />
      </span>
      <span className="min-w-0">
        <span className="hero-place-name">{p.name}</span>
        <span className="hero-place-meta">
          {t('landing.room.food')} · {t('landing.room.farthest', { min: row.far })}
        </span>
        {row.proposed ? <span className="hero-tag">{t('landing.room.proposed')}</span> : null}
      </span>
      <button
        type="button"
        className="hero-heart"
        data-vote={row.id}
        aria-pressed={row.mine}
        aria-label={t(row.mine ? 'landing.room.voteRemove' : 'landing.room.voteAdd', { name: p.name })}
        disabled={row.disabled}
        onClick={() => onToggleVote(row.id)}
        onFocus={() => onHover(row.id)}
        onBlur={() => onHover(null)}
      >
        <Heart key={popKey} size={17} weight={row.mine ? 'fill' : 'regular'} aria-hidden="true" data-pop={popKey ? 'true' : undefined} />
        <span className="tabular-nums">{row.votes}</span>
      </button>
    </li>
  );
};
