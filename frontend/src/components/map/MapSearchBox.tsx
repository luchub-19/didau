import { useEffect, useRef, useState } from 'react';
import { useMapStore } from '../../store/useMapStore';
import type { Poi } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';

export interface MapSearchBoxProps {
  /** Tâm bản đồ hiện tại, để ưu tiên kết quả gần. */
  getCenter: () => { lat: number; lng: number };
  onPick: (poi: Poi) => void;
}

/** Ô tìm `/pois/search` (osm mode): debounce 300 ms, kết quả không dấu xếp theo độ khớp rồi khoảng cách. */
export function MapSearchBox({ getCenter, onPick }: MapSearchBoxProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useMapStore((s) => s.search);
  const clearSearch = useMapStore((s) => s.clearSearch);
  const results = useMapStore((s) => s.searchResults);
  const isSearching = useMapStore((s) => s.isSearching);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChange = (value: string) => {
    setText(value);
    setOpen(true);
    clearTimeout(timer.current);
    if (!value.trim()) {
      clearSearch();
      return;
    }
    timer.current = setTimeout(() => void search(value, getCenter()), 300);
  };

  return (
    <div className="relative w-full">
      <input
        type="search"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Tìm quán: bún bò, cafe acoustic…"
        aria-label="Tìm địa điểm trên bản đồ"
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-md outline-none focus:ring-2 focus:ring-sky-400"
      />
      {open && text.trim() !== '' && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {isSearching && results.length === 0 && (
            <li className="px-3.5 py-2 text-xs text-slate-500">Đang tìm…</li>
          )}
          {!isSearching && results.length === 0 && (
            <li className="px-3.5 py-2 text-xs text-slate-500">Không thấy kết quả phù hợp.</li>
          )}
          {results.map((poi) => (
            <li key={poi.external_id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setOpen(false);
                  onPick(poi);
                }}
              >
                <span>{CATEGORY_METADATA[poi.category]?.icon ?? '📍'}</span>
                <span className="flex-1 truncate font-medium text-slate-800">{poi.name}</span>
                {poi.distance_km != null && (
                  <span className="text-xs text-slate-500">{poi.distance_km.toFixed(1)} km</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
