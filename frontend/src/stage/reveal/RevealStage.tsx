// Màn công bố quán thắng (T-61, chunk lazy kéo theo gsap). Cao trào duy nhất trong phòng:
//   full   lùi tối → bản đồ phòng bay tới quán (nếu tab Bản đồ đang hiện) → thẻ phóng lên → nắng quét → nút
//   lite   không bay; thẻ + nắng quét, rút ngắn
//   static hiện ngay trạng thái cuối, chỉ đổi opacity
// Kịch bản là dữ liệu ở steps.ts. Bỏ qua (Esc / bấm / nút "Bỏ qua") = nhảy tới trạng thái cuối; xong thì focus
// vào nút chính. Ghi chú: phần tử chuyển động mang data-motion="decide.reveal".
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { easingFn, motionAttrs, stageLog, type MotionTier } from '../../motion';
import { playSound } from '../../sound';
import { canFlyToPlace, flyToPlace } from '../../components/map/flyToPlace';
import { buildInviteUrl, copyText } from '../../components/room/shareRoom';
import { CATEGORY_METADATA } from '../../components/common/categoryMetadata';
import { Button, CalendarBlank, Check, MapPin, MapTrifold, ShareNetwork, toast } from '../../components/ui';
import { formatMoney, formatTimeRange } from '../../i18n/format';
import { useLanguage } from '../../i18n/useLanguage';
import { revealIntent, revealSteps, revealTotalMs, stepOf, type RevealIntent } from './steps';
import { buildIcs, directionsUrl, downloadIcs, icsFileName } from './actions';
import type { Place, Room } from '../../types';

gsap.registerPlugin(useGSAP);

/** Camera khi bay tới quán: đủ gần để thấy tòa nhà 3D quanh quán. */
const FLY_CAMERA = { zoom: 17, pitch: 58, bearingDelta: -24 } as const;

export interface RevealStageProps {
  place: Place;
  room: Room;
  tier: MotionTier;
  onClose: () => void;
}

const RevealStage: React.FC<RevealStageProps> = ({ place, room, tier, onClose }) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  // Quyết định bay một lần lúc mở màn (bản đồ có hiện hay không không đổi giữa chừng)
  const [canFly] = useState(() => tier === 'full' && canFlyToPlace(place));
  const steps = useMemo(() => revealSteps(tier, { canFly }), [tier, canFly]);
  const [finished, setFinished] = useState(tier === 'static');
  const [announced, setAnnounced] = useState(tier === 'static');

  const rootRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const meta = CATEGORY_METADATA[place.category] ?? CATEGORY_METADATA.OTHER;
  const CategoryIcon = meta.IconComponent;

  useGSAP(
    () => {
      stageLog('reveal', place.id, tier, canFly ? 'fly' : 'card-only', `${revealTotalMs(steps)}ms`);
      if (tier === 'static') {
        playSound('chime');
        return;
      }
      const sec = (ms: number) => ms / 1000;
      const out = easingFn('out');
      const tl = gsap.timeline({ onComplete: () => setFinished(true) });
      timelineRef.current = tl;

      const dim = stepOf(steps, 'dim');
      const card = stepOf(steps, 'card');
      const sweep = stepOf(steps, 'sweep');
      const actions = stepOf(steps, 'actions');
      const fly = stepOf(steps, 'fly');

      if (dim) tl.fromTo(dimRef.current, { opacity: 0 }, { opacity: 1, duration: sec(dim.duration), ease: out }, sec(dim.at));
      if (fly) {
        const offsetY = -Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.2);
        tl.call(() => flyToPlace(place, { ...FLY_CAMERA, durationMs: fly.duration, offsetY }), [], sec(fly.at));
      }
      if (card) {
        tl.fromTo(
          cardRef.current,
          tier === 'full' ? { opacity: 0, y: 48, scale: 0.92 } : { opacity: 0, y: 16 },
          { opacity: 1, y: 0, scale: 1, duration: sec(card.duration), ease: out },
          sec(card.at),
        );
        tl.call(
          () => {
            playSound('chime');
            setAnnounced(true);
          },
          [],
          sec(card.at),
        );
      }
      if (sweep) {
        tl.fromTo(
          sweepRef.current,
          { xPercent: -110, opacity: 1 },
          { xPercent: 260, opacity: 0.6, duration: sec(sweep.duration), ease: easingFn('camera') },
          sec(sweep.at),
        );
      }
      if (actions) {
        tl.fromTo(
          actionsRef.current,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: sec(actions.duration), ease: out },
          sec(actions.at),
        );
      }
    },
    { scope: rootRef },
  );

  // Xong chuỗi (hoặc bỏ qua): focus vào nút chính
  useEffect(() => {
    if (finished) primaryRef.current?.focus({ preventScroll: true });
  }, [finished]);

  const skip = useCallback(() => {
    const tl = timelineRef.current;
    if (tl && tl.progress() < 1) tl.progress(1);
    setAnnounced(true);
    setFinished(true);
  }, []);

  const apply = (intent: RevealIntent) => {
    if (intent === 'skip') skip();
    else if (intent === 'close') onClose();
  };

  // Esc nghe ở document: lúc mở màn focus có thể còn ở ngoài (nút chốt vừa biến mất cùng sheet)
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const finishedRef = useRef(finished);
  finishedRef.current = finished;
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      applyRef.current(revealIntent({ kind: 'escape' }, finishedRef.current));
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);

  // Mở màn: đưa focus vào hộp thoại để trình đọc màn hình và phím Tab ở trong nó
  useEffect(() => {
    if (!finishedRef.current) rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Tab xoay vòng trong hộp thoại
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && rootRef.current) {
      const focusables = Array.from(
        rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  // Bấm: đang chạy thì bỏ qua; đã xong thì bấm nền đóng, bấm trong thẻ để nút tự xử lý
  const onRootClick = (e: React.MouseEvent) => {
    apply(revealIntent({ kind: 'click', insideCard: Boolean(cardRef.current?.contains(e.target as Node)) }, finished));
  };

  const inviteUrl = buildInviteUrl(room.id, room.code);

  const handleShare = async () => {
    const text = t('reveal.shareText', { name: place.name, title: room.title });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: place.name, text, url: inviteUrl });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    await copyText(`${text} ${inviteUrl}`, t('reveal.copied'), t('invite.copyFailed'));
  };

  const handleCalendar = () => {
    try {
      downloadIcs(buildIcs({ room, place, url: inviteUrl }), icsFileName(place.name));
      toast.success(t('reveal.calendarDone'));
    } catch {
      toast.error(t('reveal.calendarFailed'));
    }
  };

  const when = t('reveal.when', {
    date: formatEventDate(room.event_date, lang),
    time: formatTimeRange(room.start_minute ?? 1020, room.end_minute ?? 1380, lang),
  });

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
      tabIndex={-1}
      data-testid="reveal-stage"
      data-reveal-state={finished ? 'done' : 'playing'}
      className={`fixed inset-0 z-[60] flex justify-center px-4 outline-none ${
        canFly ? 'items-end pb-6 md:pb-10' : 'items-center'
      }`}
      onKeyDown={onKeyDown}
      onClick={onRootClick}
    >
      {/* Lùi tối tông chạng vạng (#1A1420, cùng màu nền Stage tối) thay cho đen xám, giống nhau ở cả hai giao diện;
          phòng phía sau vẫn thấy mờ, bản đồ đang bay hiện qua lớp này */}
      <div
        ref={dimRef}
        {...motionAttrs('decide.reveal')}
        aria-hidden="true"
        className={`absolute inset-0 ${canFly ? 'bg-[rgb(26_20_32/0.5)]' : 'bg-[rgb(26_20_32/0.66)]'}`}
      />

      {/* Đọc tên quán một lần */}
      <p className="sr-only" aria-live="polite">
        {announced ? t('reveal.announce', { name: place.name }) : ''}
      </p>

      {!finished && (
        <button
          type="button"
          data-testid="reveal-skip"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
          className="absolute top-3 right-3 z-10 min-h-[44px] px-4 rounded-full text-label font-semibold bg-[rgb(var(--stage-paper)/0.94)] text-[rgb(var(--stage-ink))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t('reveal.skip')}
        </button>
      )}

      <div
        ref={cardRef}
        {...motionAttrs('decide.reveal')}
        style={tier === 'static' ? undefined : { opacity: 0 }}
        className="relative w-full max-w-md overflow-hidden rounded-card bg-[rgb(var(--stage-paper))] text-[rgb(var(--stage-ink))] shadow-float"
      >
        {/* Nắng quét: một dải ánh sáng chạy ngang thẻ một lần */}
        {tier !== 'static' && (
          <div
            ref={sweepRef}
            {...motionAttrs('decide.reveal')}
            aria-hidden="true"
            style={{ opacity: 0 }}
            className="pointer-events-none absolute inset-y-0 left-0 w-2/3 -skew-x-12 [background-image:var(--stage-sunlight)]"
          />
        )}

        <div className={`flex items-center justify-between px-6 py-3 ${meta.softBg} ${meta.softText}`}>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-bold bg-accent text-[rgb(var(--stage-on-accent))]">
            <Check size={14} weight="bold" aria-hidden="true" />
            {t('reveal.badge')}
          </span>
          <CategoryIcon size={32} weight="duotone" aria-hidden="true" />
        </div>

        <div className="relative px-6 pt-4 pb-6 space-y-4">
          <div>
            <p className="text-caption font-semibold text-[rgb(var(--stage-ink-2))]">
              {t(meta.labelKey)}
              {place.estimated_cost ? ` · ~${formatMoney(place.estimated_cost, lang)}` : ''}
            </p>
            <h2
              id="reveal-title"
              className="mt-1 text-[1.75rem] leading-tight font-extrabold font-[family-name:var(--stage-font-display)] break-words"
            >
              {place.name}
            </h2>
            {place.address && (
              <p className="mt-2 text-caption text-[rgb(var(--stage-ink-2))] flex items-start gap-1.5">
                <MapPin size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{place.address}</span>
              </p>
            )}
            <p className="mt-1 text-caption text-[rgb(var(--stage-ink-2))] tabular-nums">{when}</p>
          </div>

          <div
            ref={actionsRef}
            {...motionAttrs('decide.reveal')}
            style={tier === 'static' ? undefined : { opacity: 0 }}
            className="space-y-2"
          >
            <Button
              ref={primaryRef}
              data-testid="reveal-done"
              variant="primary"
              fullWidth
              onClick={onClose}
              leftIcon={<Check size={18} />}
            >
              {t('reveal.done')}
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <a
                href={directionsUrl(place)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-2 py-2 rounded-field border border-line bg-surface text-ink text-caption font-semibold flex flex-col items-center justify-center gap-1 text-center [@media(hover:hover)]:hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <MapTrifold size={18} aria-hidden="true" />
                {t('reveal.directions')}
              </a>
              <RevealAction icon={<ShareNetwork size={18} aria-hidden="true" />} onClick={handleShare}>
                {t('reveal.share')}
              </RevealAction>
              <RevealAction icon={<CalendarBlank size={18} aria-hidden="true" />} onClick={handleCalendar}>
                {t('reveal.calendar')}
              </RevealAction>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RevealAction: React.FC<{ icon: React.ReactNode; onClick: () => void; children: React.ReactNode }> = ({
  icon,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="min-h-[44px] px-2 py-2 rounded-field border border-line bg-surface text-ink text-caption font-semibold flex flex-col items-center justify-center gap-1 text-center [@media(hover:hover)]:hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  >
    {icon}
    {children}
  </button>
);

function formatEventDate(eventDate: string, lang: 'vi' | 'en'): string {
  const [y, m, d] = eventDate.split('-');
  if (!y || !m || !d) return eventDate;
  return lang === 'en' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`;
}

export default RevealStage;
