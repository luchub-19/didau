import React, { useMemo, useState } from 'react';
import type { Place, Poi, Room } from '../../types';
import { distanceKm } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Badge, Button, CategoryIcon } from '../common';
import { VoteButtons } from '../voting/VoteButtons';
import { InternalReviews, reviewKeyFor } from '../reviews';
import { GooglePlaceCard } from './GooglePlaceCard';

export interface PlaceSheetProps {
  room: Room;
  poi?: Poi | null;
  place?: Place | null;
  onClose: () => void;
  isVotingDisabled?: boolean;
}

function formatMinutes(minutes?: number | null): string | null {
  if (minutes === undefined || minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export const PlaceSheet: React.FC<PlaceSheetProps> = ({
  room,
  poi,
  place,
  onClose,
  isVotingDisabled = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const places = usePlaceStore((s) => s.places);
  const addPlaceFromPoi = usePlaceStore((s) => s.addPlaceFromPoi);

  // Kiểm tra xem quán đã có trong phòng chưa
  const existingPlace = useMemo(() => {
    if (place) return place;
    if (poi) {
      return places.find((p) => p.external_id === poi.external_id) ?? null;
    }
    return null;
  }, [place, poi, places]);

  const name = existingPlace?.name || poi?.name || 'Địa điểm';
  const category = existingPlace?.category || poi?.category || 'OTHER';
  const cuisine = existingPlace?.cuisine || poi?.cuisine;
  const address = existingPlace?.address || poi?.address;
  const lat = existingPlace?.latitude ?? poi?.lat;
  const lng = existingPlace?.longitude ?? poi?.lng;
  const externalId = existingPlace?.external_id || poi?.external_id;
  const googlePlaceId = existingPlace?.google_place_id;
  const reviewKey = reviewKeyFor(existingPlace, poi);

  // Giờ mở cửa
  const openingHours = useMemo(() => {
    if (existingPlace?.opening_hours_raw) return existingPlace.opening_hours_raw;
    if (poi?.opening_hours_raw) return poi.opening_hours_raw;
    const open = formatMinutes(existingPlace?.open_minute ?? poi?.open_minute);
    const close = formatMinutes(existingPlace?.close_minute ?? poi?.close_minute);
    if (open && close) return `${open} - ${close}`;
    return null;
  }, [existingPlace, poi]);

  // Khoảng cách tới điểm hẹn
  const distanceFromOrigin = useMemo(() => {
    if (room.origin_lat == null || room.origin_lng == null || lat == null || lng == null) {
      return null;
    }
    const km = distanceKm(room.origin_lat, room.origin_lng, lat, lng);
    return `${km.toFixed(1)} km từ điểm hẹn`;
  }, [room.origin_lat, room.origin_lng, lat, lng]);

  const handleAdd = async () => {
    if (!poi) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addPlaceFromPoi(room.id, poi);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; details?: { place_id?: string } };
      if (errorObj?.code === 'PLACE_ALREADY_ADDED') {
        // Đã được thêm rồi -> giao diện tự chuyển sang existingPlace
        return;
      }
      setAddError(errorObj?.message || 'Không thể thêm địa điểm vào chuyến đi.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] rounded-t-3xl border-t border-slate-200 bg-white p-5 shadow-2xl overflow-y-auto sm:absolute sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-96 sm:max-h-none sm:rounded-2xl sm:border sm:border-slate-200"
      data-testid="place-sheet"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryIcon category={category} size="sm" />
            <span className="text-xs font-semibold text-slate-600">
              {CATEGORY_METADATA[category]?.label || category}
            </span>
            {cuisine && (
              <span className="text-xs text-slate-400">· {cuisine}</span>
            )}
            {existingPlace && (
              <Badge variant={existingPlace.status} size="sm">
                {existingPlace.status}
              </Badge>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900 leading-snug">{name}</h3>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition"
        >
          ✕
        </button>
      </div>

      {/* Thông tin chi tiết */}
      <div className="py-3 space-y-2 text-xs text-slate-600">
        {address && (
          <p className="flex items-start gap-1.5">
            <span className="shrink-0 mt-0.5">📍</span>
            <span>{address}</span>
          </p>
        )}

        {(distanceFromOrigin || openingHours) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 pt-1">
            {distanceFromOrigin && (
              <span className="inline-flex items-center gap-1 font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                <span>📏</span> {distanceFromOrigin}
              </span>
            )}
            {openingHours && (
              <span className="inline-flex items-center gap-1 font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                <span>🕒</span> {openingHours}
              </span>
            )}
          </div>
        )}
      </div>

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

      {/* Review nội bộ: tích luỹ qua mọi phòng theo external_key */}
      {reviewKey && (
        <InternalReviews
          key={reviewKey}
          externalKey={reviewKey}
          remindToReview={room.status === 'COMPLETED' && !!existingPlace}
        />
      )}

      {/* Lỗi thêm quán nếu có */}
      {addError && (
        <div className="mb-3 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
          {addError}
        </div>
      )}

      {/* Nút hành động */}
      <div className="pt-3 border-t border-slate-100">
        {existingPlace ? (
          <div className="flex items-center justify-between gap-3" data-testid="already-added-section">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <span>✓</span> Đã trong lựa chọn
              </span>
              <span className="text-[11px] text-slate-400">
                Điểm vote: {existingPlace.score}
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
              isLoading={isAdding}
              onClick={handleAdd}
              leftIcon={<span>+</span>}
            >
              Thêm vào lựa chọn
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
