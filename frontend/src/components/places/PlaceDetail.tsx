import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { Place, Poi, Room } from '../../types';
import { GOOGLE_MAPS_BROWSER_KEY } from '../../config';
import { useLanguage } from '../../i18n/useLanguage';
import { formatTime } from '../../i18n/format';
import { cuisineLabel } from '../../i18n/osm';
import { describeApiError } from '../../i18n/serverText';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { useMapStore } from '../../store/useMapStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { useSharedTransitionName } from '../../motion/viewTransition';
import { getMotionTier } from '../../motion/useMotionTier';
import { duration } from '../../motion/tokens';
import { curatedLoaded, curatedPhotos, findCurated, loadCurated, type CuratedData } from '../../room/curated';
import {
  adjacentPlaceId,
  detailKeyAction,
  detailTiers,
  detailVoteAction,
  distanceToOrigin,
  formatDistance,
  formatPriceShort,
  hoursFit,
  leadingPlaceIds,
  likersOf,
  mapEmbedUrl,
  type UiKitStatus,
} from '../../room/placeView';
import { directionsUrl } from '../../stage/reveal/actions';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Avatar, Button, IconButton, toast } from '../ui';
import { ArrowLeft, Check, Clock, Heart, MapPin, MapTrifold, X } from '../ui/Icon';
import { InternalReviews, reviewKeyFor } from '../reviews';
import { GooglePlaceCard } from '../map/GooglePlaceCard';
import { MapEmbed } from '../map/MapEmbed';
import { flyToPlace } from '../map/flyToPlace';
import { PhotoGallery, type GalleryPhoto } from './PhotoGallery';

export interface PlaceDetailProps {
  room: Room;
  /** Quán trong phòng (có vote). */
  place?: Place | null;
  /** POI trên bản đồ chưa vào phòng (nút "Thêm vào lựa chọn"). */
  poi?: Poi | null;
  onClose: () => void;
  isVotingDisabled?: boolean;
  /** `panel`: nổi trên bản đồ ≥1024 (rộng `--ws-detail`); `screen`: toàn màn <1024, vuốt xuống đóng. */
  variant: 'panel' | 'screen';
}

const MAX_LIKER_AVATARS = 3;
/** Kéo xuống quá ngưỡng này (px) thì đóng trang chi tiết mobile. */
const SWIPE_CLOSE_PX = 120;

const isTextField = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

/** Thứ tự quán theo danh sách đang hiện (đã lọc/sắp xếp); không đọc được DOM thì theo điểm. */
function listOrder(places: readonly Place[]): string[] {
  if (typeof document !== 'undefined') {
    const ids = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="place-row"][data-place-id]'))
      .map((el) => el.dataset.placeId as string)
      .filter((id, i, all) => all.indexOf(id) === i);
    if (ids.length > 0) return ids;
  }
  return [...places].sort((a, b) => b.score - a.score).map((p) => p.id);
}

/**
 * Trang chi tiết quán (DESIGN gđ5 §6): ảnh → hợp với nhóm không (giá, khoảng cách, giờ so khung giờ phòng) →
 * lời người đề xuất → giới thiệu + nên thử → đánh giá (bạn bè, rồi Google) → bản đồ nhỏ + chỉ đường;
 * thanh dính đáy Không / Muốn đi (đã chốt: Chỉ đường).
 * Dữ liệu ghép 4 tầng: tuyển chọn → UI Kit → Maps Embed → OSM (`detailTiers`).
 */
export const PlaceDetail: React.FC<PlaceDetailProps> = ({
  room,
  place,
  poi,
  onClose,
  isVotingDisabled = false,
  variant,
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Phía đích của thẻ quán bay sang (PlaceRow đánh dấu thẻ gốc); ngoài lúc chuyển là undefined
  const viewTransitionName = useSharedTransitionName();

  const places = usePlaceStore((s) => s.places);
  const castVote = usePlaceStore((s) => s.castVote);
  const retractVote = usePlaceStore((s) => s.retractVote);
  const addPlaceFromPoi = usePlaceStore((s) => s.addPlaceFromPoi);
  const members = useRoomStore((s) => s.members);
  const currentMemberId = useRoomStore((s) => s.currentMember?.id);
  const pulses = usePresenceStore((s) => s.pulses);

  // Quán đã có trong phòng (kể cả khi mở từ POI đã được thêm)
  const existing = useMemo(() => {
    if (place) return places.find((p) => p.id === place.id) ?? place;
    if (poi) return places.find((p) => p.external_id === poi.external_id) ?? null;
    return null;
  }, [place, poi, places]);

  const name = existing?.name || poi?.name || t('map.place.defaultName');
  const category = existing?.category || poi?.category || 'OTHER';
  const lat = existing?.latitude ?? poi?.lat ?? null;
  const lng = existing?.longitude ?? poi?.lng ?? null;
  const externalId = existing?.external_id || poi?.external_id || null;
  const googlePlaceId = existing?.google_place_id ?? null;
  const address = existing?.address || poi?.address || null;
  const identity = existing?.id ?? poi?.external_id ?? name;

  // Tầng 1: bộ tuyển chọn (chunk JSON riêng, nạp khi mở trang)
  const [curatedData, setCuratedData] = useState<CuratedData | null>(() => curatedLoaded());
  useEffect(() => {
    if (curatedData) return;
    let alive = true;
    loadCurated()
      .then((d) => alive && setCuratedData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [curatedData]);
  const curated = useMemo(
    () => findCurated({ name, external_id: externalId, latitude: lat, longitude: lng }, curatedData),
    [name, externalId, lat, lng, curatedData],
  );
  const photos = useMemo<GalleryPhoto[]>(
    () =>
      curated
        ? curatedPhotos(curated, curatedData).map((p) => ({
            src: p.src,
            alt: t('place.detail.photoAlt', { name, kind: t(`place.detail.photoKind.${p.kind}`) }),
          }))
        : [],
    [curated, curatedData, name, t],
  );

  // Tầng 2 → 3: UI Kit thử trước, hỏng/quá 4 s thì iframe Embed
  const hasKey = Boolean(GOOGLE_MAPS_BROWSER_KEY);
  const [uiKit, setUiKit] = useState<UiKitStatus>('pending');
  useEffect(() => setUiKit('pending'), [identity]);
  const tiers = detailTiers({
    curated,
    curatedPhotoCount: photos.length,
    hasKey,
    canMatchGoogle: Boolean(googlePlaceId || (externalId && lat != null && lng != null)),
    canEmbed: Boolean(name || (lat != null && lng != null)),
    uiKit,
  });
  const embedSrc = tiers.embed
    ? mapEmbedUrl(
        GOOGLE_MAPS_BROWSER_KEY,
        { name, address, latitude: lat, longitude: lng, google_place_id: googlePlaceId },
        lang,
      )
    : null;

  // Hợp với nhóm không: giá, khoảng cách, giờ mở so với khung giờ phòng
  const meta = CATEGORY_METADATA[category] ?? CATEGORY_METADATA.OTHER;
  const cuisine = cuisineLabel(existing?.cuisine || poi?.cuisine, lang);
  // Giá nhóm đã ghi (thẻ quán cũng dùng số này) trước, thiếu thì giá tuyển chọn
  const price = formatPriceShort(existing?.estimated_cost || curated?.price_per_person);
  const meters = distanceToOrigin({ latitude: lat, longitude: lng }, room);
  const fit = hoursFit(
    { open_minute: existing?.open_minute ?? poi?.open_minute, close_minute: existing?.close_minute ?? poi?.close_minute },
    room,
  );
  const hoursRaw = existing?.opening_hours_raw || poi?.opening_hours_raw || null;
  const leading = useMemo(() => leadingPlaceIds(places), [places]);
  const badge =
    existing?.status === 'ACCEPTED' ? 'accepted' : existing && leading.has(existing.id) ? 'leading' : null;

  const submitter = existing ? members.find((m) => m.id === existing.submitted_by_id) : undefined;
  const submitterName = submitter?.nickname || existing?.submitted_by_nickname || t('place.defaultMember');

  const likers = useMemo(() => {
    if (!existing) return [];
    const others = likersOf(existing, pulses, currentMemberId);
    const ids = currentMemberId && existing.current_user_vote === 1 ? [currentMemberId, ...others] : others;
    return ids
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .slice(0, MAX_LIKER_AVATARS);
  }, [existing, pulses, currentMemberId, members]);

  const finalized = room.status === 'FINALIZED' || room.status === 'COMPLETED';
  const reviewKey = reviewKeyFor(existing, poi);
  const intro = curated ? curated.intro[lang] : null;
  const tryList = curated ? curated.try[lang] : [];
  const hoursNote = curated?.hours_note?.[lang] ?? null;

  /* ---------- Hành động ---------- */

  const [voting, setVoting] = useState(false);
  const vote = async (pressed: 1 | -1) => {
    if (!existing || voting || isVotingDisabled) return;
    const action = detailVoteAction(existing.current_user_vote, pressed);
    setVoting(true);
    try {
      if (action.kind === 'retract') await retractVote(room.id, existing.id);
      else await castVote(room.id, existing.id, action.value);
    } catch {
      toast.error(t('vote.error'));
    } finally {
      setVoting(false);
    }
  };

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const add = async () => {
    if (!poi) return;
    setAdding(true);
    setAddError(null);
    try {
      await addPlaceFromPoi(room.id, poi);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== 'PLACE_ALREADY_ADDED') {
        setAddError(describeApiError(err, t) || t('map.place.addError'));
      }
    } finally {
      setAdding(false);
    }
  };

  // Đóng: trả focus về thẻ của quán trong danh sách (nếu có), không thì để trình duyệt tự lo
  const close = useCallback(() => {
    const id = existing?.id;
    onClose();
    if (id && typeof document !== 'undefined') {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-place-id="${CSS.escape(id)}"] button`)?.focus({ preventScroll: false });
      });
    }
  }, [existing?.id, onClose]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!existing) return;
      const next = adjacentPlaceId(listOrder(places), existing.id, delta);
      if (!next) return;
      useMapStore.getState().selectPlace(next);
      const target = places.find((p) => p.id === next);
      if (target) {
        flyToPlace(target, {
          zoom: 16,
          pitch: 0,
          bearingDelta: 0,
          durationMs: getMotionTier() === 'static' ? 0 : duration('fly'),
          offsetY: 0,
        });
      }
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [existing, places],
  );

  // Focus vào tiêu đề khi mở (bàn phím: ↑ ↓ dùng được ngay); đổi quán thì giữ focus trong panel
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  // Esc đóng ở mọi chỗ (trừ khi hộp thoại khác đang mở hoặc phím đã được xử lý)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const otherDialogOpen = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
        (d) => d !== rootRef.current,
      );
      const action = detailKeyAction(e.key, {
        focusInPanel: false,
        inTextField: false,
        otherDialogOpen,
      });
      if (action?.kind === 'close') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // ↑ ↓ chỉ khi focus nằm trong panel
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return;
    const action = detailKeyAction(e.key, {
      focusInPanel: true,
      inTextField: isTextField(document.activeElement),
      otherDialogOpen: false,
      modified: e.altKey || e.ctrlKey || e.metaKey || e.shiftKey,
    });
    if (action?.kind === 'move') {
      e.preventDefault();
      move(action.delta);
    }
  };

  /* ---------- Vuốt xuống đóng (mobile) ---------- */

  const [dragY, setDragY] = useState(0);
  const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; atTop: boolean } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (variant !== 'screen') return;
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, axis: null, atTop: (scrollRef.current?.scrollTop ?? 0) <= 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s || !s.atTop) return;
    const p = e.touches[0];
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (!s.axis && Math.abs(dx) + Math.abs(dy) > 8) s.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    if (s.axis === 'y') setDragY(Math.max(0, dy));
  };
  const onTouchEnd = () => {
    const pulled = dragY;
    touch.current = null;
    setDragY(0);
    if (pulled > SWIPE_CLOSE_PX) close();
  };

  /* ---------- Giao diện ---------- */

  const hoursLine = fit ? (
    <p className="flex items-start gap-2 text-body" data-testid="detail-hours" data-fit={fit.kind}>
      <Clock size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${fit.kind === 'fits' ? 'text-success' : 'text-warning'}`} />
      <span>
        <b className={fit.kind === 'fits' ? 'text-success' : 'text-warning'}>{t(`place.detail.hours.${fit.kind}`)}</b>{' '}
        <span className="text-ink-2">
          {t(`place.detail.hours.${fit.kind}Detail`, {
            time: formatTime(fit.kind === 'opensLate' ? fit.open : fit.close, lang),
          })}
        </span>
      </span>
    </p>
  ) : hoursRaw ? (
    <p className="flex items-start gap-2 text-body text-ink-2" data-testid="detail-hours-raw">
      <Clock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
      <span>{hoursRaw}</span>
    </p>
  ) : null;

  const body = (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={variant === 'screen'}
      aria-labelledby={titleId}
      data-testid="place-detail"
      data-variant={variant}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={
        variant === 'panel'
          ? 'flex h-full w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-float'
          : 'fixed inset-0 z-sheet flex flex-col bg-surface'
      }
      style={{
        viewTransitionName,
        ...(dragY > 0 ? { transform: `translateY(${dragY}px)` } : {}),
      }}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* 1. Ảnh */}
        <div className="relative">
          <PhotoGallery photos={photos} category={category} placeName={name} size={variant} />
          {variant === 'screen' ? (
            <IconButton
              icon={<ArrowLeft size={20} />}
              variant="secondary"
              aria-label={t('place.detail.back')}
              onClick={close}
              className="absolute left-3 top-3 bg-surface shadow-float"
            />
          ) : (
            <IconButton
              icon={<X size={18} />}
              variant="secondary"
              aria-label={t('map.place.close')}
              onClick={close}
              className="absolute right-3 top-3 bg-surface shadow-float"
            />
          )}
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {/* 2. Tên + hợp với nhóm không */}
          <div className="flex flex-col gap-2">
            {badge && (
              <span
                className={`self-start rounded-chip border px-2 py-0.5 text-caption font-semibold ${
                  badge === 'accepted'
                    ? 'border-success/20 bg-success-soft text-success'
                    : 'border-accent/20 bg-accent-soft text-accent-text'
                }`}
              >
                {badge === 'accepted' ? t('place.accepted') : t('place.row.leading')}
              </span>
            )}
            <h2
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="text-[1.5rem] font-bold leading-tight tracking-tight text-ink focus:outline-none"
            >
              {name}
            </h2>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-body text-ink-2" data-testid="detail-meta">
              <span>{t(meta.labelKey)}</span>
              {cuisine && <span>{cuisine}</span>}
              <span>{price ? t('place.detail.perPerson', { price }) : t('place.row.priceUnknown')}</span>
              {meters != null && (
                <span>{t('map.place.distanceFromOrigin', { distance: formatDistance(meters, lang) })}</span>
              )}
            </p>
            {hoursLine}
            {address && (
              <p className="flex items-start gap-2 text-body text-ink-2">
                <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
                <span>{address}</span>
              </p>
            )}
          </div>

          {/* 3. Lời người đề xuất */}
          {existing?.notes && (
            <figure className="flex items-start gap-3 rounded-card bg-accent-soft p-3" data-testid="detail-note">
              <Avatar name={submitterName} avatarUrl={submitter?.avatar_url} seed={submitter?.id} size="sm" />
              <blockquote className="text-body text-ink">
                <figcaption className="font-semibold">{submitterName}</figcaption>
                <p className="mt-0.5">{existing.notes}</p>
              </blockquote>
            </figure>
          )}

          {/* 4. Giới thiệu + nên thử (tuyển chọn, theo ngôn ngữ đang chọn) */}
          {intro && (
            <section className="flex flex-col gap-2" data-testid="detail-intro">
              <h3 className="text-heading font-semibold text-ink">{t('place.detail.about')}</h3>
              <p className="text-body leading-relaxed text-ink">{intro}</p>
              {tryList.length > 0 && (
                <p className="text-body text-ink-2">
                  <b className="text-ink">{t('place.detail.tryLabel')}</b> {tryList.join(', ')}
                </p>
              )}
              {hoursNote && <p className="text-label text-ink-3">{hoursNote}</p>}
            </section>
          )}

          {/* 5. Đánh giá: bạn bè rồi Google (UI Kit, chỉ khi có key) */}
          <section className="flex flex-col gap-3" aria-label={t('place.detail.reviews')}>
            {reviewKey && (
              <InternalReviews
                key={reviewKey}
                externalKey={reviewKey}
                remindToReview={room.status === 'COMPLETED' && !!existing}
              />
            )}
            {tiers.tryUiKit && uiKit !== 'failed' && (
              <GooglePlaceCard
                key={identity}
                externalId={externalId ?? ''}
                name={name}
                lat={lat ?? 0}
                lng={lng ?? 0}
                googlePlaceId={googlePlaceId}
                onStatusChange={(s) => setUiKit(s === 'ready' ? 'ready' : 'failed')}
              />
            )}
          </section>

          {/* 6. Bản đồ nhỏ (Embed khi không có UI Kit) + chỉ đường + link của quán (OSM) */}
          <section className="flex flex-col gap-3">
            {embedSrc && <MapEmbed src={embedSrc} name={name} />}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-label">
              {(lat != null || address) && (
                <a
                  href={directionsUrl({ name, address, latitude: lat, longitude: lng })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-accent-text hover:underline"
                >
                  <MapTrifold size={18} aria-hidden="true" />
                  {t('place.detail.openInMaps')}
                </a>
              )}
              {existing?.url && (
                <a
                  href={existing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center font-semibold text-accent-text hover:underline"
                >
                  {t('place.detail.website')}
                </a>
              )}
            </div>
          </section>

          {addError && (
            <p className="rounded-field border border-danger/20 bg-danger-soft p-2.5 text-caption text-danger">{addError}</p>
          )}
        </div>
      </div>

      {/* Thanh dính đáy */}
      <div
        className={`shrink-0 border-t border-line bg-surface px-5 pt-3 ${variant === 'screen' ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-3'}`}
        data-testid="detail-bar"
      >
        {!existing ? (
          <Button variant="primary" size="lg" className="w-full" loading={adding} onClick={add}>
            {t('map.place.add')}
          </Button>
        ) : finalized ? (
          <a
            href={directionsUrl(existing)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="detail-directions"
            className="pressable inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-body font-semibold text-ink hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <MapTrifold size={20} aria-hidden="true" />
            {t('place.detail.directions')}
          </a>
        ) : (
          // Hai dòng: ai muốn đi (+ gợi ý phím trên desktop) rồi hai nút — nhãn EN dài không đè số người
          <div className="flex flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-2 text-label text-ink-2" data-testid="detail-likers">
              {likers.length > 0 && (
                <span className="flex shrink-0 -space-x-2">
                  {likers.map((m) => (
                    <Avatar
                      key={m.id}
                      name={m.nickname}
                      avatarUrl={m.avatar_url}
                      seed={m.id}
                      size="sm"
                      className="ring-2 ring-surface"
                    />
                  ))}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate tabular-nums">
                {t('place.row.wantCount', { count: existing.upvotes })}
              </span>
              {variant === 'panel' && (
                <span className="flex shrink-0 items-center gap-1.5 text-caption text-ink-3" aria-hidden="true">
                  <kbd className="rounded border border-line bg-surface-2 px-1.5 font-sans">↑</kbd>
                  <kbd className="rounded border border-line bg-surface-2 px-1.5 font-sans">↓</kbd>
                  {t('place.detail.keyHint')}
                </span>
              )}
            </div>
            <div className="flex gap-2.5">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void vote(-1)}
                disabled={isVotingDisabled || voting}
                aria-pressed={existing.current_user_vote === -1}
                data-testid="detail-vote-down"
                className="min-w-[120px] shrink-0"
                leftIcon={
                  existing.current_user_vote === -1 ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />
                }
              >
                {t('vote.disagree')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => void vote(1)}
                disabled={isVotingDisabled || voting}
                aria-pressed={existing.current_user_vote === 1}
                data-testid="detail-vote-up"
                className="flex-1"
                leftIcon={<Heart size={20} weight={existing.current_user_vote === 1 ? 'fill' : 'regular'} aria-hidden="true" />}
              >
                {t('vote.agree')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Toàn màn trên mobile: portal ra body để không bị khung bản đồ (overflow/z-index) cắt
  if (variant === 'screen' && typeof document !== 'undefined') return createPortal(body, document.body);
  return body;
};
