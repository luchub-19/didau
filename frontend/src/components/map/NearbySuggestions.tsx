import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place, Poi, Room } from '../../types';
import { CITY_CENTER } from '../../config';
import { distanceKm } from '../../store/useMapStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { Sparkle, X } from '../ui/Icon';
import { formatDistance } from '../../i18n/format';
import { cuisineLabel } from '../../i18n/osm';
import type { Language } from '../../i18n/useLanguage';

export interface NearbySuggestionsProps {
  room: Room;
  places: Place[];
  pois: Poi[];
  onSelectPoi: (poi: Poi) => void;
  onAddPoi?: (poi: Poi) => void;
  isDesktopColumn?: boolean;
}

export const NearbySuggestions: React.FC<NearbySuggestionsProps> = ({
  room,
  places,
  pois,
  onSelectPoi,
  onAddPoi,
  isDesktopColumn = false,
}) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';
  const [isDismissed, setIsDismissed] = useState(false);

  // Chi hien khi phong trong (places.length === 0) va chua bi dong
  const show = places.length === 0 && !isDismissed && pois.length > 0;

  const origin = useMemo(() => {
    if (room.origin_lat != null && room.origin_lng != null) {
      return { lat: room.origin_lat, lng: room.origin_lng };
    }
    return CITY_CENTER[room.city ?? 'HCM'] ?? CITY_CENTER.HCM;
  }, [room.origin_lat, room.origin_lng, room.city]);

  const suggestions = useMemo(() => {
    if (!show && !isDesktopColumn) return [];
    if (pois.length === 0) return [];

    // Tinh khoang cach toi origin
    const withDistance = pois.map((poi) => ({
      poi,
      dist: distanceKm(origin.lat, origin.lng, poi.lat, poi.lng),
    }));

    withDistance.sort((a, b) => a.dist - b.dist);

    // Lay toi da 5 quan gan nhat, uu tien da dang category
    const selected: Poi[] = [];
    const usedCategories = new Set<string>();

    for (const item of withDistance) {
      if (selected.length >= 5) break;
      if (!usedCategories.has(item.poi.category)) {
        selected.push(item.poi);
        usedCategories.add(item.poi.category);
      }
    }

    if (selected.length < 5) {
      const selectedIds = new Set(selected.map((p) => p.external_id));
      for (const item of withDistance) {
        if (selected.length >= 5) break;
        if (!selectedIds.has(item.poi.external_id)) {
          selected.push(item.poi);
          selectedIds.add(item.poi.external_id);
        }
      }
    }

    return selected;
  }, [show, isDesktopColumn, pois, origin]);

  if (!isDesktopColumn && (!show || suggestions.length === 0)) return null;
  if (isDesktopColumn && suggestions.length === 0) return null;

  const containerClasses = isDesktopColumn
    ? 'flex flex-col h-full'
    : 'absolute bottom-3 left-3 right-3 sm:right-auto sm:w-96 z-10 rounded-card border border-line bg-surface p-4 shadow-float';

  return (
    <div className={containerClasses} data-testid="nearby-suggestions">
      <div className="flex items-center justify-between pb-2.5 border-b border-line">
        <div>
          <h4 className="text-label font-bold text-ink flex items-center gap-1.5">
            <Sparkle size={16} className="text-accent" />
            <span>{t('map.nearby.title')}</span>
          </h4>
          <p className="text-caption text-ink-3 mt-0.5">
            {t('map.nearby.emptyDesc')}
          </p>
        </div>
        {!isDesktopColumn && (
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="text-ink-3 hover:text-ink p-1 rounded-field transition-colors"
            title={t('map.nearby.close')}
            aria-label={t('map.nearby.close')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2 overflow-y-auto pr-1 flex-1 max-h-56 sm:max-h-72">
        {suggestions.map((poi) => {
          const dist = distanceKm(origin.lat, origin.lng, poi.lat, poi.lng);
          const meta = CATEGORY_METADATA[poi.category];
          const cuisine = cuisineLabel(poi.cuisine, lang);
          return (
            <div
              key={poi.external_id}
              className="flex items-center justify-between gap-2.5 p-2.5 rounded-field bg-surface-2 hover:bg-line/60 transition-colors border border-line/60"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelectPoi(poi)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-2 shrink-0">{meta?.icon ?? null}</span>
                  <span className="font-semibold text-body text-ink truncate">
                    {poi.name}
                  </span>
                </div>
                <div className="text-caption text-ink-3 flex items-center gap-1.5 mt-0.5">
                  <span className="tabular-nums">{formatDistance(dist, lang)}</span>
                  {cuisine && <span>· {cuisine}</span>}
                </div>
              </div>

              {onAddPoi && (
                <button
                  type="button"
                  onClick={() => onAddPoi(poi)}
                  className="shrink-0 px-2.5 py-1 text-label font-semibold text-accent-text bg-accent-soft hover:bg-accent/20 rounded-field transition-colors border border-accent/20"
                  title={t('map.place.add')}
                >
                  {t('map.nearby.add')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
