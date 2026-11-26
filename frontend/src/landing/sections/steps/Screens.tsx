// 4 màn của khung app ở phần "Một phòng, bốn bước" (T-127): Tìm quán, Bình chọn, Chốt, Gửi lịch. Trang trí thuần
// (cha đặt aria-hidden), dùng dàn nhân vật + số ca demo. Chuyển động nằm ở CSS (`.fs-st` so le 90 ms), mức static tắt hết.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BowlFood, Check, Coffee, Heart, MagnifyingGlass } from '../../../components/ui/Icon';
import { HOST, avatarFor, type CastId } from '../../cast';
import {
  CAL_EVENTS,
  CAL_HOURS,
  EXPORT_KEYS,
  FIND_ROWS,
  LOCK,
  TYPED_TEXT,
  TYPE_STEP_MS,
  VOTED,
  VOTE_OPEN_ROW,
  VOTE_ROWS,
  lockFarthestMin,
  placeName,
  typedAt,
} from './model';

const stagger = (i: number): React.CSSProperties => ({ ['--i' as string]: i });

const Av: React.FC<{ who: CastId; size?: number; className?: string; style?: React.CSSProperties }> = ({
  who,
  size = 22,
  className = '',
  style,
}) => <img className={`fs-av ${className}`} src={avatarFor(who)} alt="" width={size} height={size} style={style} />;

interface PlaceLineProps {
  name: string;
  meta: string;
  right: React.ReactNode;
  i: number;
  drink?: boolean;
}
const PlaceLine: React.FC<PlaceLineProps> = ({ name, meta, right, i, drink }) => (
  <div className="fs-place fs-st" style={stagger(i)}>
    <span className="fs-place-ico" data-drink={drink ? 'true' : undefined}>
      {drink ? <Coffee size={18} weight="fill" aria-hidden="true" /> : <BowlFood size={18} weight="fill" aria-hidden="true" />}
    </span>
    <span className="min-w-0">
      <span className="fs-place-name">{name}</span>
      <span className="fs-place-meta">{meta}</span>
    </span>
    {right}
  </div>
);

export type TypeMode = 'full' | 'hold' | 'run';

/**
 * Ô tìm "pizza": `full` hiện đủ; `hold` để trống (khung còn dưới màn hình, chờ tới); `run` gõ một ký tự mỗi 80 ms
 * rồi gọi `onDone`. Đổi `hold` -> `run` không dựng lại nên không nháy.
 */
export const Typed: React.FC<{ mode: TypeMode; onDone?: () => void }> = ({ mode, onDone }) => {
  const [text, setText] = useState(mode === 'full' ? TYPED_TEXT : '');
  useEffect(() => {
    if (mode !== 'run') return;
    const t0 = performance.now();
    let timer = 0;
    const tick = () => {
      const s = typedAt(performance.now() - t0);
      setText(s);
      if (s.length < TYPED_TEXT.length) timer = window.setTimeout(tick, TYPE_STEP_MS);
      else onDone?.();
    };
    tick();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDone chỉ là thông báo xong
  }, [mode]);
  return <b className="fs-typed">{mode === 'full' ? TYPED_TEXT : text}</b>;
};

export const FindScreen: React.FC<{ typeMode: TypeMode; onTyped?: () => void }> = ({ typeMode, onTyped }) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="fs-search">
        <MagnifyingGlass size={15} aria-hidden="true" />
        <Typed mode={typeMode} onDone={onTyped} />
        <span className="fs-caret" />
      </div>
      {FIND_ROWS.map((r, k) => (
        <PlaceLine
          key={r.id}
          i={k + 2}
          drink={r.drink}
          name={r.id === 'cafe' ? t('landing.flow.cafe') : placeName(r.id)}
          meta={
            r.id === 'cafe'
              ? `${t('landing.flow.coffee')} · ${t('landing.flow.cafeAddr')}`
              : `${t('landing.room.food')} · ${r.district === 'q7' ? t('landing.district.q7') : t('landing.district.td')}`
          }
          right={
            <span className="fs-by">
              <Av who={r.who} />
              {t('landing.flow.added', { name: r.who })}
            </span>
          }
        />
      ))}
    </>
  );
};

export const VoteScreen: React.FC = () => {
  const { t } = useTranslation();
  let i = 0;
  return (
    <>
      {VOTE_ROWS.map((r) => {
        const row = (
          <PlaceLine
            key={r.id}
            i={i++}
            name={placeName(r.id)}
            meta={`${t('landing.room.food')} · ${t('landing.flow.wantN', { n: r.voters.length })}`}
            right={
              <span className="fs-voters">
                {r.voters.map((w, k) => (
                  <Av key={w} who={w} size={20} style={stagger(k)} />
                ))}
              </span>
            }
          />
        );
        if (r.id !== VOTE_OPEN_ROW) return row;
        return (
          <React.Fragment key={r.id}>
            {row}
            <div className="fs-voterow fs-st" style={stagger(i++)}>
              <span className="fs-vbtn" data-yes="true">
                <Heart size={14} weight="fill" aria-hidden="true" />
                {t('landing.flow.agree')}
              </span>
              <span className="fs-vbtn">{t('landing.flow.disagree')}</span>
            </div>
          </React.Fragment>
        );
      })}
      <div className="fs-lead fs-st" style={stagger(i)}>
        <span>{t('landing.flow.voted')}</span>
        <span className="fs-bar">
          <i />
        </span>
        <span className="fs-num">
          {VOTED.done}/{VOTED.of}
        </span>
      </div>
    </>
  );
};

export const LockScreen: React.FC = () => {
  const { t } = useTranslation();
  const far = lockFarthestMin();
  return (
    <>
      <div className="fs-done">
        <div className="fs-stamp">
          <Check size={24} weight="bold" aria-hidden="true" />
        </div>
        <div className="fs-done-name fs-st" style={stagger(2)}>
          {placeName(LOCK.placeId)}
        </div>
        <div className="fs-done-meta fs-st" style={stagger(3)}>
          <Av who={HOST.id} />
          {t('landing.flow.lockedBy', { host: HOST.id })}
        </div>
      </div>
      <div className="fs-lead fs-st" style={stagger(4)}>
        <span>{t('landing.flow.farthestShort')}</span>
        <span className="fs-bar">
          <i style={{ width: '60%' }} />
        </span>
        <span className="fs-num">{t('landing.hero.minutes', { min: far })}</span>
      </div>
    </>
  );
};

export const SendScreen: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <div className="fs-cal">
        <span className="fs-hour">{CAL_HOURS[0]}</span>
        <div className="fs-lane">
          {CAL_EVENTS.map((e, k) => (
            <div
              key={e.title}
              className="fs-ev"
              data-kind={e.kind}
              style={{ top: e.top, height: e.height, ...stagger(k) }}
            >
              <b>{e.title === 'place' ? placeName(LOCK.placeId) : t(`landing.flow.${e.title}`)}</b>
              {e.note ? `${t(`landing.flow.${e.note}`)} · ${e.range}` : e.range}
            </div>
          ))}
        </div>
        {CAL_HOURS.slice(1).map((h) => (
          <span key={h} className="fs-hour">
            {h}
          </span>
        ))}
        <span className="fs-hour" />
      </div>
      <div className="fs-export">
        {EXPORT_KEYS.map((k, n) => (
          <span key={k} className="fs-st" style={stagger(n + 3)}>
            {t(`landing.flow.exports.${k}`)}
          </span>
        ))}
      </div>
    </>
  );
};

/** Màn của bước `step` (0..3); `typeMode` chỉ có nghĩa ở màn 1. */
export const StepScreen: React.FC<{ step: number; typeMode?: TypeMode; onTyped?: () => void }> = ({
  step,
  typeMode = 'full',
  onTyped,
}) => {
  if (step === 0) return <FindScreen typeMode={typeMode} onTyped={onTyped} />;
  if (step === 1) return <VoteScreen />;
  if (step === 2) return <LockScreen />;
  return <SendScreen />;
};
