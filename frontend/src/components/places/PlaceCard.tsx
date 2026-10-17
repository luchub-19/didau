import { Badge, CategoryIcon } from '../common';
import { VoteButtons } from '../voting/VoteButtons';
import { useMapStore } from '../../store/useMapStore';
import type { Place } from '../../types';

export interface PlaceCardProps {
  place: Place;
  roomId: string;
  currentMemberId?: string;
  isHost?: boolean;
  isVotingDisabled?: boolean;
  onDeletePlace?: (placeId: string) => void;
  onViewOnMap?: (place: Place) => void;
  className?: string;
}

// Convert minutes from 0:00 to "HH:mm"
function formatMinutes(minutes?: number | null): string | null {
  if (minutes === undefined || minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export const PlaceCard: React.FC<PlaceCardProps> = ({
  place,
  roomId,
  currentMemberId,
  isHost = false,
  isVotingDisabled = false,
  onDeletePlace,
  onViewOnMap,
  className = '',
}) => {
  const isOwner = currentMemberId && place.submitted_by_id === currentMemberId;
  const canDelete = isHost || isOwner;

  const openStr = formatMinutes(place.open_minute);
  const closeStr = formatMinutes(place.close_minute);
  const hoursDisplay = openStr && closeStr ? `${openStr} - ${closeStr}` : null;
  const hasCoordinates =
    (place.latitude != null && place.longitude != null) || Boolean(place.external_id);

  const handleViewOnMap = () => {
    if (onViewOnMap) {
      onViewOnMap(place);
    } else {
      useMapStore.getState().selectPlace(place.id);
    }
  };

  const isOsm = place.source === 'OSM' || (place.source as unknown as string) === 'osm';
  const isGoogle =
    place.source === 'GOOGLE' ||
    (place.source as unknown as string) === 'google' ||
    Boolean(place.google_place_id);

  return (
    <div
      className={`bg-white rounded-2xl border transition-all hover:shadow-md overflow-hidden flex flex-col justify-between ${
        place.status === 'ACCEPTED'
          ? 'border-emerald-300 ring-2 ring-emerald-500/20'
          : place.status === 'REJECTED'
          ? 'border-slate-200 opacity-70 bg-slate-50/50'
          : 'border-slate-200 shadow-xs'
      } ${className}`}
    >
      <div className="p-4 sm:p-5 space-y-3">
        {/* Header: Category + Status Badge + Source Badge + Delete */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryIcon category={place.category} size="sm" />
            <Badge variant={place.status} size="sm">
              {place.status}
            </Badge>

            {isOsm && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200"
                title="Nguồn: OpenStreetMap"
                data-testid="badge-source-osm"
              >
                🗺️ OSM
              </span>
            )}
            {isGoogle && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                title="Nguồn: Google Places"
                data-testid="badge-source-google"
              >
                G Google
              </span>
            )}
          </div>

          {canDelete && onDeletePlace && (
            <button
              type="button"
              onClick={() => onDeletePlace(place.id)}
              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition"
              title="Xóa địa điểm này"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Place Title & Info */}
        <div>
          <h4 className="text-base font-bold text-slate-900 tracking-tight leading-snug">
            {place.name}
          </h4>

          {place.address && (
            <p className="mt-1 text-xs text-slate-500 flex items-start gap-1">
              <span className="shrink-0 mt-0.5">📍</span>
              <span className="line-clamp-2">{place.address}</span>
            </p>
          )}
        </div>

        {/* Details: Cost & Opening Hours */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1 border-t border-slate-50">
          {place.estimated_cost > 0 && (
            <div className="flex items-center gap-1 font-semibold text-slate-800">
              <span>💰</span>
              <span>{place.estimated_cost.toLocaleString('vi-VN')} đ</span>
            </div>
          )}

          {hoursDisplay && (
            <div className="flex items-center gap-1 text-slate-500">
              <span>🕒</span>
              <span>{hoursDisplay}</span>
            </div>
          )}

          {place.url && (
            <a
              href={place.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 hover:underline font-medium"
            >
              <span>🔗 Link</span>
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}

          {hasCoordinates && (
            <button
              type="button"
              onClick={handleViewOnMap}
              className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 hover:underline font-medium cursor-pointer"
              title="Xem vị trí quán trên bản đồ"
              data-testid="btn-view-on-map"
            >
              <span>🗺️ Xem trên bản đồ</span>
            </button>
          )}
        </div>

        {/* Notes */}
        {place.notes && (
          <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-xl border border-slate-100">
            &ldquo;{place.notes}&rdquo;
          </p>
        )}
      </div>

      {/* Card Footer: Proposer & Vote Buttons */}
      <div className="bg-slate-50/60 px-4 sm:px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-400 truncate">
          Gợi ý bởi:{' '}
          <span className="font-semibold text-slate-700">
            {place.submitted_by_nickname || 'Thành viên'}
          </span>
        </div>

        {/* T-20 Voting action buttons */}
        <VoteButtons
          roomId={roomId}
          placeId={place.id}
          upvotes={place.upvotes}
          downvotes={place.downvotes}
          score={place.score}
          currentUserVote={place.current_user_vote}
          disabled={isVotingDisabled}
        />
      </div>
    </div>
  );
};
