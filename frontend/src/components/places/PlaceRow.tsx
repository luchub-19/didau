import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../i18n/useLanguage';
import { useMapStore } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { CharacterAvatar } from '../ui/CharacterAvatar';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { Check, DotsThree, Trash, X } from '../ui/Icon';
import { toast } from '../ui/toastStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { VoteButtons } from '../voting/VoteButtons';
import { markSharedOrigin } from '../../motion/viewTransition';
import { PresenceAvatars } from '../../stage/presence/PresenceAvatars';
import { clearHoverPlace, setHoverPlace } from '../../stage/presence/channel';
import { viewersByPlace } from '../../stage/presence/rules';
import { revealMemory } from '../../stage/reveal/triggers';
import {
  badgeFor,
  distanceToOrigin,
  formatDistance,
  formatPriceShort,
  likersOf,
  placeThumb,
  type PlaceBadge,
} from '../../room/placeView';
import type { Place, Room } from '../../types';

const ACCEPTED_TOAST_DELAY_MS = 800;
const MAX_LIKER_AVATARS = 3;

export interface PlaceRowProps {
  place: Place;
  roomId: string;
  /** Điểm hẹn + ngân sách của phòng (khoảng cách, nhãn "Vượt ngân sách"). */
  room?: Pick<Room, 'origin_lat' | 'origin_lng' | 'budget_limit'> | null;
  /** Các quán đang dẫn (tính một lần ở PlaceList); mặc định không quán nào dẫn. */
  leading?: ReadonlySet<string>;
  currentMemberId?: string;
  isHost?: boolean;
  isVotingDisabled?: boolean;
  onDeletePlace?: (placeId: string) => void;
  /** Bấm thẻ: mở quán + sáng ghim trên bản đồ. */
  onOpen?: (place: Place) => void;
  className?: string;
}

/** Ảnh đại diện: ảnh thật khi có (T-70), thiếu thì ô minh hoạ theo danh mục. */
const PlaceThumbBox: React.FC<{ place: Place }> = ({ place }) => {
  const thumb = placeThumb(place);
  const meta = CATEGORY_METADATA[thumb.category] ?? CATEGORY_METADATA.OTHER;
  const Icon = meta.IconComponent;
  return (
    <span
      aria-hidden="true"
      data-testid="place-thumb"
      className={`shrink-0 inline-flex items-center justify-center overflow-hidden rounded-field w-[72px] h-[72px] md:w-[84px] md:h-[84px] ${meta.bg} ${meta.text}`}
    >
      {thumb.src ? (
        <img src={thumb.src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Icon size={32} weight="duotone" />
      )}
    </span>
  );
};

const BADGE_STYLE: Record<PlaceBadge, string> = {
  accepted: 'bg-success-soft text-success border-success/20',
  leading: 'bg-accent-soft text-accent-text border-accent/20',
  overBudget: 'bg-warning-soft text-warning border-warning/20',
};

/** Menu ⋯ của thẻ: "Không" (bình chọn −1) và "Xoá" cho người có quyền. Esc/bấm ngoài thì đóng. */
const RowMenu: React.FC<{
  label: string;
  isDownvoted: boolean;
  canDelete: boolean;
  disabled: boolean;
  onDownvote: () => void;
  onDelete: () => void;
}> = ({ label, isDownvoted, canDelete, disabled, onDownvote, onDelete }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'flex w-full min-h-11 items-center gap-2 px-3 text-left text-label text-ink hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        data-testid="row-menu-trigger"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-field text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
      >
        <DotsThree size={22} weight="bold" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-content mt-1 min-w-44 overflow-hidden rounded-field border border-line bg-surface py-1 shadow-float"
        >
          <button
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onDownvote();
            }}
            className={itemClass}
            data-testid="row-menu-no"
          >
            <X size={16} weight="bold" className={isDownvoted ? 'text-danger' : 'text-ink-2'} />
            <span>{isDownvoted ? t('vote.cancelDisagree') : t('vote.disagree')}</span>
          </button>
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className={`${itemClass} text-danger`}
              data-testid="row-menu-delete"
            >
              <Trash size={16} />
              <span>{t('place.deletePlace')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export const PlaceRow: React.FC<PlaceRowProps> = ({
  place,
  roomId,
  room,
  leading,
  currentMemberId,
  isHost = false,
  isVotingDisabled = false,
  onDeletePlace,
  onOpen,
  className = '',
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const castVote = usePlaceStore((s) => s.castVote);
  const retractVote = usePlaceStore((s) => s.retractVote);
  const members = useRoomStore((s) => s.members);
  const pulses = usePresenceStore((s) => s.pulses);
  const peers = usePresenceStore((s) => s.peers);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Khoảnh khắc chốt quán (T-53): quét sáng + toast (trừ khi màn công bố đã đọc tên quán)
  const prevStatusRef = useRef(place.status);
  const [isJustAccepted, setIsJustAccepted] = useState(false);
  useEffect(() => {
    if (prevStatusRef.current !== 'ACCEPTED' && place.status === 'ACCEPTED') {
      setIsJustAccepted(true);
      const toastTimer = setTimeout(() => {
        if (!revealMemory.recentlyRevealed(place.id)) toast.success(t('place.acceptedToast', { name: place.name }));
      }, ACCEPTED_TOAST_DELAY_MS);
      const timer = setTimeout(() => setIsJustAccepted(false), 600);
      prevStatusRef.current = place.status;
      return () => {
        clearTimeout(timer);
        clearTimeout(toastTimer);
      };
    }
    prevStatusRef.current = place.status;
  }, [place.status, place.id, place.name, t]);

  // Thẻ biến mất khi chuột còn trên nó thì không để lại tiêu điểm treo
  useEffect(() => () => clearHoverPlace(place.id), [place.id]);

  const isOwner = Boolean(currentMemberId && place.submitted_by_id === currentMemberId);
  const canDelete = Boolean((isHost || isOwner) && onDeletePlace);
  const isRejected = place.status === 'REJECTED';
  const locked = isVotingDisabled || isRejected;

  const badge = badgeFor(place, leading ?? new Set(), room?.budget_limit);
  const badgeText =
    badge === 'accepted' ? t('place.accepted') : badge === 'leading' ? t('place.row.leading') : badge === 'overBudget' ? t('place.row.overBudget') : null;

  const meta = CATEGORY_METADATA[place.category] ?? CATEGORY_METADATA.OTHER;
  const distance = distanceToOrigin(place, room);
  const price = formatPriceShort(place.estimated_cost);
  const metaParts = [
    t(meta.labelKey),
    distance != null ? formatDistance(distance, lang) : null,
    price ?? t('place.row.priceUnknown'),
  ].filter((x): x is string => Boolean(x));

  const likerIds = useMemo(() => likersOf(place, pulses, currentMemberId), [place, pulses, currentMemberId]);
  // Ai đang xem quán này hiện ở PresenceAvatars (kèm nhịp phiếu); chỉ khi họ rời đi mới còn lại ở hàng "đã thích"
  const viewerIds = useMemo(() => viewersByPlace(peers, currentMemberId)[place.id] ?? [], [peers, currentMemberId, place.id]);
  const likers = useMemo(() => {
    const others = likerIds.filter((id) => !viewerIds.includes(id));
    const ids = currentMemberId && place.current_user_vote === 1 ? [currentMemberId, ...others] : others;
    return ids
      .map((id) => members.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m))
      .slice(0, MAX_LIKER_AVATARS);
  }, [likerIds, viewerIds, members, currentMemberId, place.current_user_vote]);

  let frame = 'border-line bg-surface';
  if (place.status === 'ACCEPTED') {
    frame = isJustAccepted ? 'place-card-lock-in bg-surface' : 'border-success ring-1 ring-success/20 bg-surface';
  } else if (badge === 'leading') {
    frame = 'border-accent/40 bg-accent-soft/30';
  } else if (isRejected) {
    frame = 'border-line opacity-60 bg-surface-2';
  }

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    // Thẻ bay sang trang chi tiết ở lần chuyển ngay sau (T-62, view-transition-name động)
    markSharedOrigin(e.currentTarget.closest('article'));
    if (onOpen) onOpen(place);
    else useMapStore.getState().selectPlace(place.id);
  };

  // Rê chuột vào thẻ = đang xem quán này (chạm trên điện thoại không tính)
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHoverPlace(place.id);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHoverPlace(null);
  };

  const handleDownvote = async () => {
    if (locked) return;
    try {
      if (place.current_user_vote === -1) await retractVote(roomId, place.id);
      else await castVote(roomId, place.id, -1);
    } catch {
      toast.error(t('vote.error'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!onDeletePlace) return;
    setIsDeleting(true);
    try {
      await onDeletePlace(place.id);
      setIsConfirmDeleteOpen(false);
      toast.success(t('place.deleteSuccess'));
    } catch {
      toast.error(t('place.deleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <article
        data-testid="place-row"
        data-place-id={place.id}
        className={`flex items-center gap-3 rounded-card border p-3 transition-colors ${frame} ${className}`}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {/* Vùng bấm: ảnh + chữ = mở quán trên bản đồ */}
        <button
          type="button"
          onClick={handleOpen}
          aria-label={t('place.row.open', { name: place.name })}
          data-testid="place-row-open"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-field text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
        >
          <PlaceThumbBox place={place} />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-bold leading-snug text-ink line-clamp-2">{place.name || ''}</span>
            <span className="mt-0.5 block truncate text-label font-normal text-ink-2">{metaParts.join(' · ')}</span>
            {(badge || likers.length > 0 || viewerIds.length > 0) && (
              <span className="mt-1 flex items-center gap-2">
            {badge && badgeText && (
              <span
                data-testid={`badge-${badge}`}
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption font-semibold ${BADGE_STYLE[badge]}`}
              >
                {badge === 'accepted' && (
                  <Check size={14} weight="bold" className={`shrink-0 ${isJustAccepted ? 'checkmark-draw' : ''}`} />
                )}
                {badgeText}
              </span>
            )}
            {likers.length > 0 && (
            <span
              className="flex -space-x-1.5"
              data-testid="row-likers"
              role="img"
              aria-label={t('place.row.wantCount', { count: place.upvotes ?? 0 })}
            >
              {likers.map((m) => (
                <span key={m.id} className="inline-flex rounded-field ring-2 ring-surface">
                  <CharacterAvatar avatarUrl={m.avatar_url} fallbackSeed={m.id} name={m.nickname} size={24} />
                </span>
              ))}
            </span>
          )}
                <PresenceAvatars placeId={place.id} />
              </span>
            )}
          </span>
        </button>

        {/* Cột phải: avatar người thích/đang xem, ♥ + số, menu ⋯ */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <VoteButtons
              variant="heart"
              roomId={roomId}
              placeId={place.id}
              upvotes={place.upvotes ?? 0}
              downvotes={place.downvotes ?? 0}
              score={place.score ?? 0}
              currentUserVote={place.current_user_vote ?? 0}
              disabled={locked}
            />
            <RowMenu
              label={t('place.row.menu', { name: place.name })}
              isDownvoted={place.current_user_vote === -1}
              canDelete={canDelete}
              disabled={locked}
              onDownvote={handleDownvote}
              onDelete={() => setIsConfirmDeleteOpen(true)}
            />
          </div>
        </div>
      </article>

      {canDelete && (
        <ConfirmSheet
          isOpen={isConfirmDeleteOpen}
          onClose={() => setIsConfirmDeleteOpen(false)}
          onConfirm={handleDeleteConfirm}
          title={t('place.deleteConfirmTitle', { name: place.name })}
          description={t('place.deleteConfirmDesc')}
          confirmLabel={t('place.deletePlace')}
          variant="danger"
          loading={isDeleting}
        />
      )}
    </>
  );
};
