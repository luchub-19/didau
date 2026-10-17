import React, { useMemo, useState } from 'react';
import type { Place, Poi, Room } from '../../types';
import { CITY_CENTER } from '../../config';
import { distanceKm } from '../../store/useMapStore';
import { CATEGORY_METADATA } from '../common/categoryMetadata';

export interface NearbySuggestionsProps {
  room: Room;
  places: Place[];
  pois: Poi[];
  onSelectPoi: (poi: Poi) => void;
  onAddPoi?: (poi: Poi) => void;
}

export const NearbySuggestions: React.FC<NearbySuggestionsProps> = ({
  room,
  places,
  pois,
  onSelectPoi,
  onAddPoi,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Chỉ hiện khi phòng trống (places.length === 0) và chưa bị đóng
  const show = places.length === 0 && !isDismissed && pois.length > 0;

  const origin = useMemo(() => {
    if (room.origin_lat != null && room.origin_lng != null) {
      return { lat: room.origin_lat, lng: room.origin_lng };
    }
    return CITY_CENTER[room.city ?? 'HCM'] ?? CITY_CENTER.HCM;
  }, [room.origin_lat, room.origin_lng, room.city]);

  const suggestions = useMemo(() => {
    if (!show) return [];
    // Tính khoảng cách tới origin
    const withDistance = pois.map((poi) => ({
      poi,
      dist: distanceKm(origin.lat, origin.lng, poi.lat, poi.lng),
    }));

    withDistance.sort((a, b) => a.dist - b.dist);

    // Lấy tối đa 5 quán gần nhất, ưu tiên đa dạng category
    const selected: Poi[] = [];
    const usedCategories = new Set<string>();

    for (const item of withDistance) {
      if (selected.length >= 5) break;
      if (!usedCategories.has(item.poi.category)) {
        selected.push(item.poi);
        usedCategories.add(item.poi.category);
      }
    }

    // Nếu chưa đủ 5 do ít category, lấy tiếp các quán gần nhất còn lại
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
  }, [show, pois, origin]);

  if (!show || suggestions.length === 0) return null;

  return (
    <div
      className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-96 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-xs"
      data-testid="nearby-suggestions"
    >
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div>
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <span>✨</span> Gợi ý quanh điểm hẹn
          </h4>
          <p className="text-[11px] text-slate-500">Phòng chưa có địa điểm nào. Thử các quán gần nhất:</p>
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-slate-400 hover:text-slate-700 text-xs p-1"
          title="Đóng gợi ý"
        >
          ✕
        </button>
      </div>

      <div className="mt-2.5 space-y-2 max-h-56 overflow-y-auto pr-1">
        {suggestions.map((poi) => {
          const dist = distanceKm(origin.lat, origin.lng, poi.lat, poi.lng);
          const meta = CATEGORY_METADATA[poi.category];
          return (
            <div
              key={poi.external_id}
              className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition text-xs border border-slate-100"
            >
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={() => onSelectPoi(poi)}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{meta?.icon || '📍'}</span>
                  <span className="font-semibold text-slate-800 truncate">{poi.name}</span>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <span>{dist.toFixed(1)} km</span>
                  {poi.cuisine && <span>· {poi.cuisine}</span>}
                </div>
              </div>

              {onAddPoi && (
                <button
                  type="button"
                  onClick={() => onAddPoi(poi)}
                  className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition border border-sky-200"
                  title="Thêm quán này vào chuyến đi"
                >
                  + Thêm
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
