import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../i18n/useLanguage';
import { formatMoney, formatTimeRange } from '../../i18n/format';
import { useMapStore } from '../../store/useMapStore';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { IconButton } from '../ui/IconButton';
import {
  DotsThree,
  Clock,
  CurrencyCircleDollar,
  MapPin,
  MapTrifold,
  ArrowRight,
  Check,
} from '../ui/Icon';
import { CategoryIcon } from '../common/CategoryIcon';
import { VoteButtons } from '../voting/VoteButtons';
import { toast } from '../ui/toastStore';
import { markSharedOrigin } from '../../motion/viewTransition';
import { PresenceAvatars } from '../../stage/presence/PresenceAvatars';
import { clearHoverPlace, setHoverPlace } from '../../stage/presence/channel';
import { revealMemory } from '../../stage/reveal/triggers';
import type { Place } from '../../types';

const ACCEPTED_TOAST_DELAY_MS = 800;

export interface PlaceCardProps {
  place: Place;
  roomId: string;
  currentMemberId?: string;
  isHost?: boolean;
  isVotingDisabled?: boolean;
  isTopPick?: boolean;
  onDeletePlace?: (placeId: string) => void;
  onViewOnMap?: (place: Place) => void;
  className?: string;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({
  place,
  roomId,
  currentMemberId,
  isHost = false,
  isVotingDisabled = false,
  isTopPick = false,
  onDeletePlace,
  onViewOnMap,
  className = '',
}) => {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Khoảnh khắc chốt quán đặc trưng (T-53)
  const prevStatusRef = useRef(place.status);
  const [isJustAccepted, setIsJustAccepted] = useState(false);

  useEffect(() => {
    if (prevStatusRef.current !== 'ACCEPTED' && place.status === 'ACCEPTED') {
      setIsJustAccepted(true);
      // Màn công bố (T-61) đã đọc tên quán: không chồng thêm toast lên lớp reveal. Chờ một nhịp vì WS báo quán
      // ACCEPTED có thể tới trước phiên RESOLVED (lúc đó reveal chưa bắt đầu)
      const toastTimer = setTimeout(() => {
        if (!revealMemory.recentlyRevealed(place.id)) toast.success(t('place.acceptedToast', { name: place.name }));
      }, ACCEPTED_TOAST_DELAY_MS);
      const timer = setTimeout(() => {
        setIsJustAccepted(false);
      }, 600);
      return () => {
        clearTimeout(timer);
        clearTimeout(toastTimer);
      };
    }
    prevStatusRef.current = place.status;
  }, [place.status, place.id, place.name, t]);

  const isOwner = Boolean(currentMemberId && place.submitted_by_id === currentMemberId);
  const canDelete = isHost || isOwner;

  const hasHours = place.open_minute != null && place.close_minute != null;
  const hoursDisplay = hasHours
    ? formatTimeRange(place.open_minute as number, place.close_minute as number, lang)
    : null;

  const hasCoordinates =
    (place.latitude != null && place.longitude != null) || Boolean(place.external_id);

  const handleViewOnMap = (e: React.MouseEvent<HTMLElement>) => {
    // Thẻ này bay sang sheet quán ở lần chuyển tab ngay sau (T-62, view-transition-name động)
    markSharedOrigin(e.currentTarget.closest('article'));
    if (onViewOnMap) {
      onViewOnMap(place);
    } else {
      useMapStore.getState().selectPlace(place.id);
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

  const isOsm = place.source === 'OSM' || (place.source as unknown as string) === 'osm';
  const isGoogle =
    place.source === 'GOOGLE' ||
    (place.source as unknown as string) === 'google' ||
    Boolean(place.google_place_id);

  // Viền và nền thẻ: chốt > dẫn đầu > bình thường
  let borderAndBg = 'border-line bg-surface';
  if (place.status === 'ACCEPTED') {
    borderAndBg = isJustAccepted
      ? 'place-card-lock-in bg-surface'
      : 'border-success ring-1 ring-success/20 bg-surface';
  } else if (isTopPick) {
    borderAndBg = 'border-accent/40 bg-accent-soft/30';
  } else if (place.status === 'REJECTED') {
    borderAndBg = 'border-line opacity-60 bg-surface-2';
  }

  const proposerName = place.submitted_by_nickname || t('place.defaultMember');

  // Thẻ biến mất khi chuột còn trên nó thì không để lại tiêu điểm treo
  useEffect(() => () => clearHoverPlace(place.id), [place.id]);

  // Hiện diện (CR-08): rê chuột vào thẻ = đang xem quán này (chạm trên điện thoại không tính)
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHoverPlace(place.id);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') setHoverPlace(null);
  };

  return (
    <>
      <Card
        as="article"
        className={`flex flex-col justify-between overflow-hidden p-4 sm:p-5 transition-colors ${borderAndBg} ${className}`}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <div className="space-y-3">
          {/* Hàng trên: Danh mục + Trạng thái + Nguồn + Menu thao tác */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <CategoryIcon category={place.category} size="sm" />

              {place.status === 'ACCEPTED' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-success-soft text-success border border-success/20">
                  <Check
                    size={14}
                    weight="bold"
                    className={`mr-1 shrink-0 ${isJustAccepted ? 'checkmark-draw' : ''}`}
                  />
                  <span>{t('place.accepted')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium bg-surface-2 text-ink-3 border border-line">
                  {t(`place.statusLabel.${place.status}`)}
                </span>
              )}

              {isOsm && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-caption font-semibold bg-surface-2 text-ink-2 border border-line"
                  title="OpenStreetMap"
                  data-testid="badge-source-osm"
                >
                  OSM
                </span>
              )}
              {isGoogle && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-caption font-semibold bg-surface-2 text-ink-2 border border-line"
                  title="Google Places"
                  data-testid="badge-source-google"
                >
                  Google
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <PresenceAvatars placeId={place.id} />
              {canDelete && onDeletePlace && (
                <IconButton
                  icon={<DotsThree size={20} weight="bold" />}
                  aria-label={t('place.deletePlace')}
                  onClick={() => setIsConfirmDeleteOpen(true)}
                  variant="ghost"
                />
              )}
            </div>
          </div>

          {/* Tên quán và địa chỉ */}
          <div>
            <h4 className="text-body font-bold text-ink leading-snug line-clamp-2">
              {place.name || ''}
            </h4>

            {place.address && (
              <p className="mt-1 text-caption text-ink-2 flex items-start gap-1">
                <MapPin size={14} className="shrink-0 mt-0.5 text-ink-3" />
                <span className="line-clamp-2">{place.address}</span>
              </p>
            )}
          </div>

          {/* Chi tiết: Giá, Giờ mở cửa, Link ngoài, Xem bản đồ */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-2 pt-2 border-t border-line/60">
            {(place.estimated_cost ?? 0) > 0 && (
              <div className="flex items-center gap-1 font-semibold text-ink">
                <CurrencyCircleDollar size={15} className="text-ink-2" />
                <span>{formatMoney(place.estimated_cost, lang)}</span>
              </div>
            )}

            {hoursDisplay && (
              <div className="flex items-center gap-1 text-ink-2">
                <Clock size={15} className="text-ink-3" />
                <span>{hoursDisplay}</span>
              </div>
            )}

            {place.url && (
              <a
                href={place.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent-text hover:underline font-medium"
              >
                <span>{t('place.openLink')}</span>
                <ArrowRight size={13} />
              </a>
            )}

            {hasCoordinates && (
              <button
                type="button"
                onClick={handleViewOnMap}
                className="inline-flex items-center gap-1 text-accent-text hover:underline font-medium cursor-pointer"
                title={t('place.viewOnMap')}
                data-testid="btn-view-on-map"
              >
                <MapTrifold size={14} />
                <span>{t('place.viewOnMap')}</span>
              </button>
            )}
          </div>

          {/* Ghi chú */}
          {place.notes && (
            <p className="text-caption text-ink-2 italic bg-surface-2 p-2.5 rounded-field border border-line">
              &ldquo;{place.notes}&rdquo;
            </p>
          )}
        </div>

        {/* Chân thẻ: Người đề xuất + Khối vote */}
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar name={proposerName} size="sm" />
            <span className="text-caption text-ink-2 truncate">
              {t('place.suggestedBy', { name: proposerName })}
            </span>
          </div>

          <VoteButtons
            roomId={roomId}
            placeId={place.id}
            upvotes={place.upvotes ?? 0}
            downvotes={place.downvotes ?? 0}
            score={place.score ?? 0}
            currentUserVote={place.current_user_vote ?? 0}
            disabled={isVotingDisabled}
          />
        </div>
      </Card>

      {/* Xác nhận xoá quán qua Sheet */}
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
