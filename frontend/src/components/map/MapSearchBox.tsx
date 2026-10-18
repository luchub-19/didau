import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '../../store/useMapStore';
import type { Poi } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { MagnifyingGlass, X } from '../ui/Icon';
import { formatDistance } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';

export interface MapSearchBoxProps {
  /** Tam ban do hien tai, de uu tien ket qua gan. */
  getCenter: () => { lat: number; lng: number };
  onPick: (poi: Poi) => void;
  className?: string;
}

/** O tim `/pois/search` (osm mode): debounce 300 ms, ket qua khong dau xep theo do khop roi khoang cach. */
export function MapSearchBox({ getCenter, onPick, className = '' }: MapSearchBoxProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useMapStore((s) => s.search);
  const clearSearch = useMapStore((s) => s.clearSearch);
  const results = useMapStore((s) => s.searchResults);
  const isSearching = useMapStore((s) => s.isSearching);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Dong goi y khi click ra ngoai
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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

  const handleClear = () => {
    setText('');
    clearSearch();
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <MagnifyingGlass
          size={18}
          className="pointer-events-none absolute left-3.5 text-ink-3"
          aria-hidden="true"
        />
        <input
          type="search"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={t('map.search.placeholder')}
          aria-label={t('map.search.ariaLabel')}
          className="w-full rounded-full border border-line bg-surface/95 pl-10 pr-9 py-2.5 text-body text-ink placeholder:text-ink-3 shadow-float outline-none transition-all focus:border-accent-text focus:ring-2 focus:ring-accent-text/20"
        />
        {text && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 text-ink-3 hover:text-ink transition-colors p-1"
            aria-label={t('common.clear', 'Clear')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && text.trim() !== '' && (
        <ul className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-card border border-line bg-surface p-1 shadow-float">
          {isSearching && results.length === 0 && (
            <li className="px-3.5 py-3 text-caption text-ink-3 text-center">
              {t('map.search.searching')}
            </li>
          )}
          {!isSearching && results.length === 0 && (
            <li className="px-3.5 py-3 text-caption text-ink-3 text-center">
              {t('map.search.noResults')}
            </li>
          )}
          {results.map((poi) => (
            <li key={poi.external_id}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-field px-3 py-2 text-left text-body transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
                onClick={() => {
                  setOpen(false);
                  onPick(poi);
                }}
              >
                <span className="shrink-0 text-ink-2">
                  {CATEGORY_METADATA[poi.category]?.icon ?? null}
                </span>
                <span className="flex-1 truncate font-medium text-ink">
                  {poi.name}
                </span>
                {poi.distance_km != null && (
                  <span className="text-caption text-ink-3 shrink-0 tabular-nums">
                    {formatDistance(poi.distance_km, lang)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
