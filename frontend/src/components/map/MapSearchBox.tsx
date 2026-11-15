import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '../../store/useMapStore';
import type { Poi } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { MagnifyingGlass, X } from '../ui/Icon';
import { formatDistance } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';
import { matchRanges, nextIndex, shortAddress } from './searchText';

export interface MapSearchBoxProps {
  /** Tam ban do hien tai, de uu tien ket qua gan. */
  getCenter: () => { lat: number; lng: number };
  onPick: (poi: Poi) => void;
  className?: string;
  /** `large`: ô tìm kiếm to của giai đoạn ① (GatherPanel); mặc định là ô nhỏ nổi trên bản đồ. */
  size?: 'default' | 'large';
  /** Để nơi khác (vd. ô trống "+ quán thứ 2") đưa focus vào ô. */
  inputRef?: React.Ref<HTMLInputElement>;
}

function Highlighted({ name, query }: { name: string; query: string }) {
  const chars = Array.from(name);
  const out: React.ReactNode[] = [];
  let pos = 0;
  for (const [start, end] of matchRanges(name, query)) {
    if (start > pos) out.push(chars.slice(pos, start).join(''));
    out.push(
      <strong key={start} className="font-semibold text-ink">
        {chars.slice(start, end).join('')}
      </strong>,
    );
    pos = end;
  }
  if (pos < chars.length) out.push(chars.slice(pos).join(''));
  return <>{out}</>;
}

/** Một dòng kết quả: icon loại · tên (phần khớp in đậm) + dòng phụ địa chỉ/quận · khoảng cách. */
export function SearchResultRow({ poi, query, lang }: { poi: Poi; query: string; lang: Language }) {
  const sub = shortAddress(poi);
  return (
    <>
      <span className="mt-0.5 shrink-0 self-start text-ink-2" aria-hidden="true">
        {CATEGORY_METADATA[poi.category]?.icon ?? null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-normal text-ink-2">
          <Highlighted name={poi.name} query={query} />
        </span>
        {sub && <span className="block truncate text-caption text-ink-3">{sub}</span>}
      </span>
      {poi.distance_km != null && (
        <span className="shrink-0 self-start pt-0.5 text-caption text-ink-3 tabular-nums">
          {formatDistance(poi.distance_km, lang)}
        </span>
      )}
    </>
  );
}

/** Ô tìm `/pois/search`: debounce 300 ms, ưu tiên khung đang xem (lat/lng); ↑/↓ chọn, Enter mở, Esc đóng. */
export function MapSearchBox({ getCenter, onPick, className = '', size = 'default', inputRef }: MapSearchBoxProps) {
  const large = size === 'large';
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
  const [active, setActive] = useState(-1);
  const listId = useId();

  // Kết quả mới về thì bỏ ô đang chọn
  useEffect(() => setActive(-1), [results]);

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

  const pick = (poi: Poi) => {
    setOpen(false);
    onPick(poi);
  };

  const listOpen = open && text.trim() !== '';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((cur) => nextIndex(cur, e.key === 'ArrowDown' ? 1 : -1, results.length));
    } else if (e.key === 'Enter') {
      const poi = results[active] ?? (listOpen ? results[0] : undefined);
      if (poi) {
        e.preventDefault();
        pick(poi);
      }
    } else if (e.key === 'Escape') {
      if (listOpen) {
        e.preventDefault();
        setOpen(false);
      } else if (text) {
        handleClear();
      }
    }
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
          size={large ? 22 : 18}
          className={`pointer-events-none absolute text-ink-3 ${large ? 'left-4' : 'left-3.5'}`}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={t('map.search.placeholder')}
          aria-label={t('map.search.ariaLabel')}
          className={`w-full rounded-full border border-line bg-surface/95 [&::-webkit-search-cancel-button]:appearance-none text-ink placeholder:text-ink-3 outline-none transition-colors focus:border-accent-text focus:ring-2 focus:ring-accent-text/20 ${
            large ? 'min-h-[52px] pl-12 pr-11 py-3.5 text-[1.0625rem] shadow-sm' : 'pl-10 pr-9 py-2.5 text-body shadow-float'
          }`}
        />
        {text && (
          <button
            type="button"
            onClick={handleClear}
            className={`absolute text-ink-3 hover:text-ink transition-colors p-1 ${large ? 'right-4' : 'right-3'}`}
            aria-label={t('common.clear', 'Clear')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('map.search.ariaLabel')}
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-card border border-line bg-surface p-1 shadow-float"
        >
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
          {results.map((poi, index) => (
            <li
              key={poi.external_id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-field px-3 py-2 text-left text-body transition-colors hover:bg-surface-2 ${
                index === active ? 'bg-surface-2' : ''
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(poi)}
            >
              <SearchResultRow poi={poi} query={text} lang={lang} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
