import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place, Poi, Room } from '../../types';
import { distanceKm } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Badge, CategoryIcon } from '../common';
import { Button, Check, IconButton } from '../ui';
import { CaretDown, CaretUp, Clock, MapPin, X } from '../ui/Icon';
import { VoteButtons } from '../voting/VoteButtons';
import { InternalReviews, reviewKeyFor } from '../reviews';
import { GooglePlaceCard } from './GooglePlaceCard';
import { formatDistance, formatTimeRange } from '../../i18n/format';
import { cuisineLabel } from '../../i18n/osm';
import { describeApiError } from '../../i18n/serverText';
import type { Language } from '../../i18n/useLanguage';

export interface PlaceSheetProps {
  room: Room;
  poi?: Poi | null;
  place?: Place | null;
  onClose: () => void;
  isVotingDisabled?: boolean;
  isDesktopColumn?: boolean;
}

export const PlaceSheet: React.FC<PlaceSheetProps> = ({
  room,
  poi,
  place,
  onClose,
  isVotingDisabled = false,
  isDesktopColumn = false,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';

  const [snap, setSnap] = useState<'summary' | 'detail'>('summary');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const places = usePlaceStore((s) => s.places);
  const addPlaceFromPoi = usePlaceStore((s) => s.addPlaceFromPoi);

  // Kiem tra xem quan da co trong phong chua
  const existingPlace = useMemo(() => {
    if (place) return place;
    if (poi) {
      return places.find((p) => p.external_id === poi.external_id) ?? null;
    }
    return null;
  }, [place, poi, places]);

  const name = existingPlace?.name || poi?.name || t('map.place.defaultName');
  const category = existingPlace?.category || poi?.category || 'OTHER';
  const rawCuisine = existingPlace?.cuisine || poi?.cuisine;
  const cuisine = cuisineLabel(rawCuisine, lang);
  const address = existingPlace?.address || poi?.address;
  const lat = existingPlace?.latitude ?? poi?.lat;
  const lng = existingPlace?.longitude ?? poi?.lng;
  const externalId = existingPlace?.external_id || poi?.external_id;
  const googlePlaceId = existingPlace?.google_place_id;
  const reviewKey = reviewKeyFor(existingPlace, poi);

  // Gio mo cua chi lay tu open_minute va close_minute da dinh dang
  const openingHours = useMemo(() => {
    const openMin = existingPlace?.open_minute ?? poi?.open_minute;
    const closeMin = existingPlace?.close_minute ?? poi?.close_minute;
    if (openMin != null && closeMin != null) {
      return formatTimeRange(openMin, closeMin, lang);
    }
    return null;
  }, [existingPlace, poi, lang]);

  // Khoang cach toi diem hen
  const distanceFromOrigin = useMemo(() => {
    if (room.origin_lat == null || room.origin_lng == null || lat == null || lng == null) {
      return null;
    }
    const km = distanceKm(room.origin_lat, room.origin_lng, lat, lng);
    return t('map.place.distanceFromOrigin', { distance: formatDistance(km, lang) });
  }, [room.origin_lat, room.origin_lng, lat, lng, t, lang]);

  const handleAdd = async () => {
    if (!poi) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addPlaceFromPoi(room.id, poi);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === 'PLACE_ALREADY_ADDED') {
        return;
      }
      setAddError(describeApiError(err, t) || t('map.place.addError'));
    } finally {
      setIsAdding(false);
    }
  };

  const containerClasses = isDesktopColumn
    ? 'flex flex-col h-full overflow-y-auto'
    : 'fixed inset-x-0 bottom-0 z-30 max-h-[85vh] rounded-t-3xl border-t border-line bg-surface p-4 sm:p-5 shadow-float overflow-y-auto sm:absolute sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-96 sm:max-h-none sm:rounded-card sm:border sm:border-line pointer-events-auto';

  return (
    <div
      className={containerClasses}
      data-testid="place-sheet"
      onTouchStart={(e) => e.stopPropagation()}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Keo nac tren dien thoai (chi hien khi khong phai cot desktop) */}
      {!isDesktopColumn && (
        <div className="flex sm:hidden justify-center pb-2">
          <button
            type="button"
            onClick={() => setSnap((s) => (s === 'summary' ? 'detail' : 'summary'))}
            className="flex items-center gap-1 px-3 py-1 text-caption text-ink-3 rounded-full hover:bg-surface-2 transition-colors"
            aria-label={snap === 'summary' ? t('map.place.viewDetails') : t('map.place.collapseDetails')}
          >
            <span className="w-8 h-1 rounded-full bg-line block" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryIcon category={category} size="sm" />
            <span className="text-label font-semibold text-ink-2">
              {CATEGORY_METADATA[category]?.label || category}
            </span>
            {cuisine && (
              <span className="text-label text-ink-3">· {cuisine}</span>
            )}
            {existingPlace && (
              <Badge variant={existingPlace.status} size="sm">
                {existingPlace.status}
              </Badge>
            )}
          </div>
          <h3 className="text-h3 font-bold text-ink leading-snug truncate">
            {name}
          </h3>
        </div>

        <IconButton
          icon={<X size={16} />}
          variant="ghost"
          aria-label={t('map.place.close')}
          onClick={onClose}
          className="shrink-0"
        />
      </div>

      {/* Thong tin tom tat (luon hien) */}
      <div className="py-2.5 space-y-1.5 text-body text-ink-2">
        {(distanceFromOrigin || openingHours) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption font-medium pt-0.5">
            {distanceFromOrigin && (
              <span className="inline-flex items-center gap-1 text-accent-text bg-accent-soft px-2 py-0.5 rounded-field">
                <MapPin size={13} />
                <span>{distanceFromOrigin}</span>
              </span>
            )}
            {openingHours && (
              <span className="inline-flex items-center gap-1 text-ink-2 bg-surface-2 px-2 py-0.5 rounded-field">
                <Clock size={13} />
                <span>{openingHours}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Nut toggle nac tom tat / chi tiet tren mobile */}
      {!isDesktopColumn && (
        <div className="flex sm:hidden justify-center py-1">
          <button
            type="button"
            onClick={() => setSnap((s) => (s === 'summary' ? 'detail' : 'summary'))}
            className="flex items-center gap-1 text-caption font-medium text-accent-text hover:underline py-1"
          >
            {snap === 'summary' ? (
              <>
                <span>{t('map.place.viewDetails')}</span>
                <CaretUp size={14} />
              </>
            ) : (
              <>
                <span>{t('map.place.collapseDetails')}</span>
                <CaretDown size={14} />
              </>
            )}
          </button>
        </div>
      )}

      {/* Thong tin chi tiet (nac 2): dia chi, google card, review */}
      <div
        className={`space-y-3 pt-1 ${
          !isDesktopColumn && snap === 'summary' ? 'hidden sm:block' : 'block'
        }`}
      >
        {address && (
          <p className="flex items-start gap-2 text-body text-ink-2">
            <MapPin size={16} className="shrink-0 mt-0.5 text-ink-3" />
            <span>{address}</span>
          </p>
        )}

        {/* Google Places UI Kit Card */}
        {externalId && lat != null && lng != null && (
          <GooglePlaceCard
            externalId={externalId}
            name={name}
            lat={lat}
            lng={lng}
            googlePlaceId={googlePlaceId}
          />
        )}

        {/* Review noi bo */}
        {reviewKey && (
          <InternalReviews
            key={reviewKey}
            externalKey={reviewKey}
            remindToReview={room.status === 'COMPLETED' && !!existingPlace}
          />
        )}
      </div>

      {/* Loi them quan neu co */}
      {addError && (
        <div className="my-2.5 text-caption text-danger bg-danger-soft p-2.5 rounded-field border border-danger/20">
          {addError}
        </div>
      )}

      {/* Nut hanh dong (luon o duoi de bam nhanh) */}
      <div className="pt-3 border-t border-line mt-auto">
        {existingPlace ? (
          <div className="flex items-center justify-between gap-3" data-testid="already-added-section">
            <div className="flex flex-col">
              <span className="text-label font-semibold text-success flex items-center gap-1">
                <Check size={16} weight="bold" aria-hidden="true" /> {t('map.place.alreadyAdded')}
              </span>
              <span className="text-caption text-ink-3 tabular-nums">
                {t('map.place.voteScore', { score: existingPlace.score })}
              </span>
            </div>
            <VoteButtons
              roomId={room.id}
              placeId={existingPlace.id}
              upvotes={existingPlace.upvotes}
              downvotes={existingPlace.downvotes}
              score={existingPlace.score}
              currentUserVote={existingPlace.current_user_vote}
              disabled={isVotingDisabled}
            />
          </div>
        ) : (
          <div data-testid="add-to-room-section">
            <Button
              variant="primary"
              className="w-full"
              loading={isAdding}
              onClick={handleAdd}
            >
              {t('map.place.add')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
