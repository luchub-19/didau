// Cửa sổ phòng mẫu ở hero (PLAN §4.1 dòng 1): luôn SÁNG dù landing tối (ép token sáng trong hero.css `.hero-app`).
// Thanh trên (ô logo, tên phòng, nhãn "Phòng mẫu", 3 avatar đang xem → Xeko vào đúng một lần + toast), panel trái
// (RoomPanel), bản đồ thật bên phải (HeroMiniMap, chỉ màn > 960px). Không gọi backend; âm `tick`/`chime` qua engine
// app (tắt sẵn). Xeko vào phòng 3,6 s sau khi mount (static: 1,2 s, không pop).
import { forwardRef, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '../../components/ui/Icon';
import { Wordmark } from '../../components/shell/Wordmark';
import type { MotionTier } from '../../motion/useMotionTier';
import { playSound } from '../../sound/useSound';
import { CAST, avatarFor } from '../cast';
import type { PlaceId } from '../logic/types';
import { HeroMiniMap, type PinModel } from './HeroMiniMap';
import { RoomPanel } from './RoomPanel';
import {
  DEMO,
  JOINER,
  PRESENCE_TIMING,
  heroReducer,
  initialHero,
  presentCast,
  type HeroAction,
} from './heroState';

export interface RoomWindowProps {
  tier: MotionTier;
}

type FocusTarget = 'undo' | 'lock' | null;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const RoomWindow = forwardRef<HTMLDivElement, RoomWindowProps>(({ tier }, ref) => {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(heroReducer, undefined, () => initialHero());
  const [hot, setHot] = useState<PlaceId | null>(null);
  const [pop, setPop] = useState<{ id: PlaceId; key: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const presenceRef = useRef<HTMLSpanElement>(null);
  const focusNext = useRef<FocusTarget>(null);
  const tierRef = useRef(tier);
  tierRef.current = tier;

  const act = (a: HeroAction) => dispatch(a);

  // Thẻ dẫn/chốt thấp hơn thẻ hoà: giữ chiều cao tối thiểu = chiều cao lúc đầu để cửa sổ (và phố + xe bên dưới)
  // không nhảy khi bấm. Đo lại khi đổi cỡ màn, chỉ lúc phòng đang ở trạng thái đầu (đo đúng thẻ hoà, "Vì sao?" đóng).
  const bodyRef = useRef<HTMLDivElement>(null);
  const pristineRef = useRef(true);
  pristineRef.current = state.room.locked === null && !state.room.why && Object.keys(state.room.mine).every((k) => !state.room.mine[k]);
  useIsoLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      body.style.minHeight = '';
      body.style.minHeight = `${body.offsetHeight}px`;
    };
    measure();
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive && pristineRef.current) measure();
    });
    const onResize = () => {
      if (pristineRef.current) measure();
    };
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Hiện diện: người thứ tư vào đúng một lần; toast tự tắt sau 2,6 s
  useEffect(() => {
    const at = tierRef.current === 'static' ? PRESENCE_TIMING.joinAtStaticMs : PRESENCE_TIMING.joinAtMs;
    const timer = setTimeout(() => dispatch({ type: 'join' }), at);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state.toast) return;
    const last = presenceRef.current?.lastElementChild as HTMLElement | null;
    if (last && tierRef.current !== 'static' && typeof last.animate === 'function') {
      last.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }], {
        duration: PRESENCE_TIMING.popMs,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      });
    }
    const timer = setTimeout(() => dispatch({ type: 'toastDone' }), PRESENCE_TIMING.toastMs);
    return () => clearTimeout(timer);
  }, [state.toast]);

  // Sau chốt → focus "Làm lại"; sau làm lại → focus nút Chốt (bàn phím không bị rơi về đầu trang)
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const sel = target === 'undo' ? '[data-undo]' : '[data-lock]';
    panelRef.current?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }, [state.room.locked]);

  const onToggleVote = (id: PlaceId) => {
    if (state.room.locked) return;
    const adding = !state.room.mine[id];
    act({ type: adding ? 'vote' : 'unvote', placeId: id });
    setPop(adding ? { id, key: (pop?.key ?? 0) + 1 } : null);
    playSound('tick');
  };
  const onLock = (id: PlaceId) => {
    focusNext.current = 'undo';
    act({ type: 'lock', placeId: id });
    playSound('chime');
  };
  const onUndo = () => {
    focusNext.current = 'lock';
    act({ type: 'undo' });
    setPop(null);
  };

  const present = presentCast(state);
  const pins: PinModel[] = DEMO.places.map((p) => ({
    id: p.id,
    short: p.short,
    ll: p.ll,
    votes: state.room.votes[p.id],
    state: state.room.locked ? (state.room.locked === p.id ? 'done' : 'faded') : 'normal',
    hot: hot === p.id,
    bumpKey: pop && pop.id === p.id && tier !== 'static' ? pop.key : 0,
  }));

  return (
    <div ref={ref} className="hero-app" role="group" aria-label={t('landing.hero.roomLabel')}>
      <div className="hero-app-bar">
        <Wordmark variant="mark" size={26} />
        <span className="hero-app-title">{t('landing.room.title')}</span>
        <span className="hero-app-chip">{t('landing.hero.sample')}</span>
        <span
          ref={presenceRef}
          className="hero-presence"
          role="img"
          aria-label={t('landing.room.online', { n: present.length })}
        >
          {present.map((id) => (
            <img key={id} src={avatarFor(id)} alt="" width={26} height={26} />
          ))}
        </span>
      </div>
      <div ref={bodyRef} className="hero-app-body">
        <div ref={panelRef} className="contents">
          <RoomPanel
            state={state}
            onToggleVote={onToggleVote}
            onLock={onLock}
            onUndo={onUndo}
            onToggleWhy={() => act({ type: 'toggleWhy' })}
            hot={hot}
            onHover={setHot}
            pop={tier === 'static' ? null : pop}
          />
        </div>
        <div className="hero-map" aria-hidden="true">
          <HeroMiniMap pins={pins} onHover={setHot} />
          <span className="hero-map-chip">
            <MapPin size={13} weight="fill" />
            {t('landing.room.center', { n: CAST.length })}
          </span>
        </div>
      </div>
      <div className="hero-toast" data-show={state.toast ? 'true' : 'false'} role="status">
        {state.joined ? (
          <>
            <img src={avatarFor(JOINER)} alt="" width={22} height={22} />
            <span>{t('landing.room.joined', { name: JOINER })}</span>
          </>
        ) : null}
      </div>
    </div>
  );
});
RoomWindow.displayName = 'RoomWindow';
