import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMapStore } from '../../store/useMapStore';
import type { PoiBrand } from '../../services/api/poiApi';
import type { Poi, PoiKind } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import {
  ArrowLeft,
  BeerStein,
  BowlFood,
  Bank,
  Cake,
  Coffee,
  Drop,
  FilmSlate,
  ForkKnife,
  GameController,
  Hamburger,
  IceCream,
  MagnifyingGlass,
  MapTrifold,
  Microphone,
  ShoppingCart,
  Storefront,
  Tree,
  X,
} from '../ui/Icon';
import type { IconProps } from '../ui/Icon';
import { formatDistance } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';
import { matchRanges, nextIndex, shortAddress } from './searchText';

export interface MapSearchBoxProps {
  /** Tâm ưu tiên kết quả gần (CR-18: nơi xuất phát của mình → điểm hẹn → tâm bản đồ, xem `searchCenter`). */
  getCenter: () => { lat: number; lng: number };
  /** Mã thành phố của phòng (CR-18): chỉ ra quán trong thành phố này. */
  city?: string;
  onPick: (poi: Poi) => void;
  className?: string;
  /** `large`: ô tìm kiếm to của giai đoạn ① (GatherPanel); mặc định là ô nhỏ nổi trên bản đồ. */
  size?: 'default' | 'large';
  /** Để nơi khác (vd. ô trống "+ quán thứ 2") đưa focus vào ô. */
  inputRef?: React.Ref<HTMLInputElement>;
}

/** Icon theo `kind` (cùng bảng `KIND_GLYPH` của lớp bản đồ, MAP-POI §3.1); thiếu `kind` thì icon category. */
const KIND_ICON: Record<PoiKind, React.ComponentType<IconProps>> = {
  restaurant: ForkKnife,
  eatery: BowlFood,
  fast_food: Hamburger,
  bakery: Cake,
  cafe: Coffee,
  tea: Drop,
  dessert: IceCream,
  bar: BeerStein,
  mall: Storefront,
  supermarket: ShoppingCart,
  cinema: FilmSlate,
  karaoke: Microphone,
  play: GameController,
  park: Tree,
  museum: Bank,
};

function PoiIcon({ poi }: { poi: Poi }) {
  const KindIcon = poi.kind ? KIND_ICON[poi.kind] : undefined;
  if (KindIcon) return <KindIcon size={18} />;
  return <>{CATEGORY_METADATA[poi.category]?.icon ?? null}</>;
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
        <PoiIcon poi={poi} />
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

/** Dòng chuỗi cửa hàng (T-102, MAP-POI §5): "**Phúc Long** · Xem 93 chi nhánh" — bấm để hiện mọi chi nhánh. */
export function BrandRow({ brand, query }: { brand: PoiBrand; query: string }) {
  const { t } = useTranslation();
  return (
    <>
      <span className="mt-0.5 shrink-0 self-start text-accent-text" aria-hidden="true">
        <MapTrifold size={18} />
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2">
        <Highlighted name={brand.name} query={query} />
        <span className="text-ink-3"> · </span>
        <span className="font-semibold text-accent-text">
          {t('map.search.brandBranches', { count: brand.count })}
        </span>
      </span>
    </>
  );
}

type SearchOption = { type: 'brand'; brand: PoiBrand } | { type: 'poi'; poi: Poi };

/** Ô tìm `/pois/search`: debounce 300 ms, ưu tiên khung đang xem (lat/lng); ↑/↓ chọn, Enter mở, Esc đóng. */
export function MapSearchBox({
  getCenter,
  onPick,
  city,
  className = '',
  size = 'default',
  inputRef,
}: MapSearchBoxProps) {
  const large = size === 'large';
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const search = useMapStore((s) => s.search);
  const clearSearch = useMapStore((s) => s.clearSearch);
  const results = useMapStore((s) => s.searchResults);
  const brandResults = useMapStore((s) => s.brandResults);
  const brandFocus = useMapStore((s) => s.brandFocus);
  const isLoadingBrand = useMapStore((s) => s.isLoadingBrand);
  const showBrand = useMapStore((s) => s.showBrand);
  const clearBrand = useMapStore((s) => s.clearBrand);
  const isSearching = useMapStore((s) => s.isSearching);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const listId = useId();

  // Chế độ chi nhánh: danh sách là mọi chi nhánh gần → xa; bình thường: dòng chuỗi (nếu có) rồi tới quán
  const options: SearchOption[] = brandFocus
    ? brandFocus.pois.map((poi) => ({ type: 'poi', poi }))
    : [
        ...brandResults.slice(0, 1).map((brand): SearchOption => ({ type: 'brand', brand })),
        ...results.map((poi): SearchOption => ({ type: 'poi', poi })),
      ];

  // Kết quả mới về thì bỏ ô đang chọn
  useEffect(() => setActive(-1), [results, brandResults, brandFocus]);

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
    clearBrand();
    clearTimeout(timer.current);
    if (!value.trim()) {
      clearSearch();
      return;
    }
    timer.current = setTimeout(() => void search(value, getCenter(), city), 300);
  };

  const pick = (poi: Poi) => {
    setOpen(false);
    onPick(poi);
  };

  const choose = (option: SearchOption) => {
    if (option.type === 'poi') pick(option.poi);
    else void showBrand(option.brand, getCenter(), city);
  };

  const listOpen = open && text.trim() !== '';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((cur) => nextIndex(cur, e.key === 'ArrowDown' ? 1 : -1, options.length));
    } else if (e.key === 'Enter') {
      const option = options[active] ?? (listOpen ? options[0] : undefined);
      if (option) {
        e.preventDefault();
        choose(option);
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
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-card border border-line bg-surface shadow-float">
          {brandFocus && (
            <div className="flex items-center gap-1.5 border-b border-line px-1 py-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearBrand}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-field text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                aria-label={t('map.search.backToResults')}
              >
                <ArrowLeft size={16} />
              </button>
              <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">
                {brandFocus.brand.name}
              </span>
              <span className="shrink-0 pr-2 text-caption text-ink-3 tabular-nums">
                {t('map.search.brandCount', { count: brandFocus.pois.length || brandFocus.brand.count })}
              </span>
            </div>
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={brandFocus ? brandFocus.brand.name : t('map.search.ariaLabel')}
            className="max-h-80 overflow-auto p-1"
          >
            {brandFocus && isLoadingBrand && (
              <li className="px-3.5 py-3 text-caption text-ink-3 text-center">
                {t('map.search.loadingBranches')}
              </li>
            )}
            {!brandFocus && isSearching && options.length === 0 && (
              <li className="px-3.5 py-3 text-caption text-ink-3 text-center">
                {t('map.search.searching')}
              </li>
            )}
            {!brandFocus && !isSearching && options.length === 0 && (
              <li className="px-3.5 py-3 text-caption text-ink-3 text-center">
                {t('map.search.noResults')}
              </li>
            )}
            {options.map((option, index) => (
              <li
                key={option.type === 'poi' ? option.poi.external_id : `brand:${option.brand.brand_key}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-field px-3 py-2 text-left text-body transition-colors hover:bg-surface-2 ${
                  index === active ? 'bg-surface-2' : ''
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.type === 'poi' ? (
                  <SearchResultRow poi={option.poi} query={brandFocus ? '' : text} lang={lang} />
                ) : (
                  <BrandRow brand={option.brand} query={text} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
