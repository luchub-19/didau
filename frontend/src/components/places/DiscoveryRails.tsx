import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Member, Place, Room } from '../../types';
import { useLanguage } from '../../i18n/useLanguage';
import { formatDistance, formatMoney, formatTime } from '../../i18n/format';
import { cuisineLabel } from '../../i18n/osm';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { MapPin } from '../ui/Icon';
import { Button } from '../ui/Button';
import { useMapStore } from '../../store/useMapStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { useNearbyPois, type NearbyPois } from '../map/NearbySuggestions';
import type { PeerMap } from '../../stage/presence/rules';
import type { Poi } from '../../types';
import { COLLECTION_CODES, type CollectionCode } from '../../room/curated';
import { useCuratedData } from '../../room/useCuratedData';
import {
  collectionItems,
  fitsRoomAndBudget,
  findAddedPlace,
  groupWatching,
  itemFromCurated,
  itemFromPoi,
  nonEmptyCollections,
  remainingBudget,
  type DiscoveryItem,
} from '../../room/discovery';
import { placeThumb } from '../../room/placeView';
import { DiscoveryCard, DiscoveryCardSkeleton } from './DiscoveryCard';

/* ---------- Một dải ---------- */

const Rail: React.FC<{
  testId: string;
  title: string;
  subtitle?: string;
  /** Dòng nhắc / điều khiển nằm giữa tiêu đề và thẻ (chip chủ đề, nhắc điểm hẹn). */
  header?: React.ReactNode;
  children: React.ReactNode;
}> = ({ testId, title, subtitle, header, children }) => {
  const { t } = useTranslation();
  return (
    <section aria-label={title} data-testid={testId} className="min-w-0">
      <h3 className="text-[15px] font-semibold text-ink-2">{title}</h3>
      {subtitle && <p className="mt-0.5 text-caption text-ink-3">{subtitle}</p>}
      {header}
      <ul
        role="list"
        aria-label={t('discovery.railAria', { title })}
        className="-mx-4 mt-2.5 flex snap-x scroll-pl-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1"
      >
        {React.Children.map(children, (child, i) => (
          <li key={i} className="shrink-0">
            {child}
          </li>
        ))}
      </ul>
    </section>
  );
};

const SkeletonRail: React.FC<{ testId: string; title: string }> = ({ testId, title }) => {
  const { t } = useTranslation();
  return (
    <section aria-label={title} aria-busy="true" data-testid={testId} className="min-w-0">
      <h3 className="text-[15px] font-semibold text-ink-2">{title}</h3>
      <p className="sr-only" role="status">
        {t('discovery.loading')}
      </p>
      <div className="-mx-4 mt-2.5 flex gap-3 overflow-hidden px-4 pb-1">
        <DiscoveryCardSkeleton />
        <DiscoveryCardSkeleton />
        <DiscoveryCardSkeleton />
      </div>
    </section>
  );
};

/* ---------- Bốn dải ---------- */

export interface DiscoveryRailsProps {
  room: Room;
  places: Place[];
  members: Member[];
  currentMemberId?: string;
  isHost: boolean;
  /** Mở trang chi tiết (xem trước) của quán chưa trong danh sách. */
  onOpenItem: (item: DiscoveryItem) => void;
  /** Mở quán đã trong danh sách (dải "Nhóm đang để ý"). */
  onOpenPlace: (place: Place) => void;
  onAddItem: (item: DiscoveryItem) => void;
  /** Khoá các thẻ đang gọi API thêm. */
  addingKeys: ReadonlySet<string>;
  /** Host: đặt điểm hẹn ở giữa bản đồ. */
  onSetOrigin?: () => void;
  /** Ghi đè nguồn dữ liệu (test, vì SSR đọc store ở trạng thái đầu); thiếu thì đọc từ store như thường. */
  source?: { nearby?: NearbyPois; poisById?: Record<string, Poi>; peers?: PeerMap };
}

export const DiscoveryRails: React.FC<DiscoveryRailsProps> = ({
  room,
  places,
  members,
  currentMemberId,
  isHost,
  onOpenItem,
  onOpenPlace,
  onAddItem,
  addingKeys,
  onSetOrigin,
  source,
}) => {
  const { t } = useTranslation();
  const lang = useLanguage().lang;
  const data = useCuratedData();
  const storePois = useMapStore((s) => s.poisById);
  const storePeers = usePresenceStore((s) => s.peers);
  const storeNearby = useNearbyPois(room);
  const poisById = source?.poisById ?? storePois;
  const peers = source?.peers ?? storePeers;
  const nearby = source?.nearby ?? storeNearby;
  const [collection, setCollection] = useState<CollectionCode | null>(null);

  const metaFor = (it: DiscoveryItem): string => {
    const parts: string[] = [];
    if (it.distanceKm != null && nearby.hasOrigin) parts.push(formatDistance(it.distanceKm, lang));
    if (it.priceVnd) parts.push(formatMoney(it.priceVnd, lang));
    const cuisine = cuisineLabel(it.poi.cuisine, lang);
    if (cuisine) parts.push(cuisine);
    return parts.join(' · ') || t((CATEGORY_METADATA[it.category] ?? CATEGORY_METADATA.OTHER).labelKey);
  };

  const renderItem = (it: DiscoveryItem) => (
    <DiscoveryCard
      key={it.key}
      name={it.name}
      category={it.category}
      thumb={it.thumb}
      meta={metaFor(it)}
      added={findAddedPlace(it.poi, places) !== null}
      adding={addingKeys.has(it.key)}
      onOpen={() => onOpenItem(it)}
      onAdd={() => onAddItem(it)}
    />
  );

  // Dải 1 — gần điểm hẹn
  const nearbyItems = useMemo(
    () => nearby.pois.map((p) => itemFromPoi(p, nearby.origin, data)),
    [nearby.pois, nearby.origin, data],
  );

  // Dải 2 — bộ sưu tập (chip chủ đề)
  const collections = useMemo(() => nonEmptyCollections(COLLECTION_CODES, data), [data]);
  const activeCollection = collection && collections.includes(collection) ? collection : (collections[0] ?? null);
  const collectionList = useMemo(
    () => (activeCollection ? collectionItems(activeCollection, nearby.origin, data, poisById) : []),
    [activeCollection, nearby.origin, data, poisById],
  );

  // Dải 3 — hợp giờ và ngân sách (quán tuyển chọn + quán đã tải từ bản đồ)
  const fitsList = useMemo(() => {
    if (!data) return [];
    const byKey = new Map<string, DiscoveryItem>();
    for (const e of data.places) {
      const it = itemFromCurated(e, nearby.origin, data, poisById);
      byKey.set(it.key, it);
    }
    for (const it of nearbyItems) if (!byKey.has(it.key)) byKey.set(it.key, it);
    return fitsRoomAndBudget([...byKey.values()], room);
  }, [data, nearby.origin, poisById, nearbyItems, room]);

  // Dải 4 — nhóm đang để ý
  const watching = useMemo(
    () => groupWatching(peers, currentMemberId, places, members),
    [peers, currentMemberId, places, members],
  );

  const budget = remainingBudget(room);
  const range = `${formatTime(room.start_minute ?? 1020, lang)}–${formatTime(room.end_minute ?? 1380, lang)}`;

  return (
    <div className="space-y-6" data-testid="discovery-rails">
      {/* 1. Gần điểm hẹn */}
      {nearby.status === 'pending' ? (
        <SkeletonRail testId="rail-nearby" title={t('discovery.rail.nearby')} />
      ) : nearbyItems.length > 0 ? (
        <Rail
          testId="rail-nearby"
          title={nearby.hasOrigin ? t('discovery.rail.nearby') : t('discovery.rail.nearbyCity')}
          header={
            !nearby.hasOrigin && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="origin-hint">
                <p className="text-[14px] text-ink-2">
                  {isHost ? t('discovery.originHint') : t('discovery.originHintGuest')}
                </p>
                {isHost && onSetOrigin && (
                  <Button variant="secondary" onClick={onSetOrigin} leftIcon={<MapPin size={16} />}>
                    {t('discovery.setOrigin')}
                  </Button>
                )}
              </div>
            )
          }
        >
          {nearbyItems.map(renderItem)}
        </Rail>
      ) : null}

      {/* 2. Bộ sưu tập (chờ chunk tuyển chọn → skeleton) */}
      {!data && <SkeletonRail testId="rail-collections" title={t('discovery.rail.collections')} />}
      {data && collectionList.length > 0 && (
        <Rail
          testId="rail-collections"
          title={t('discovery.rail.collections')}
          header={
            <div
              role="group"
              aria-label={t('discovery.collectionsAria')}
              className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5"
            >
              {collections.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={code === activeCollection}
                  onClick={() => setCollection(code)}
                  className={`inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-label font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${
                    code === activeCollection
                      ? 'border-accent/40 bg-accent-soft text-accent-text'
                      : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
                  }`}
                >
                  {t(`curated.collection.${code}`)}
                </button>
              ))}
            </div>
          }
        >
          {collectionList.map(renderItem)}
        </Rail>
      )}

      {/* 3. Hợp giờ và ngân sách */}
      {fitsList.length > 0 && (
        <Rail
          testId="rail-fits"
          title={t('discovery.rail.fits')}
          subtitle={
            budget !== null
              ? t('discovery.fitsDescBudget', { range, budget: formatMoney(budget, lang) })
              : t('discovery.fitsDesc', { range })
          }
        >
          {fitsList.map(renderItem)}
        </Rail>
      )}

      {/* 4. Nhóm đang để ý — chỉ khi có ≥2 người online và có quán đang được xem */}
      {watching.items.length > 0 && (
        <Rail testId="rail-watching" title={t('discovery.rail.watching')}>
          {watching.items.map((w) => (
            <DiscoveryCard
              key={w.place.id}
              name={w.place.name}
              category={w.place.category}
              thumb={placeThumb(w.place, data).src}
              meta={w.place.address || t((CATEGORY_METADATA[w.place.category] ?? CATEGORY_METADATA.OTHER).labelKey)}
              added
              onOpen={() => onOpenPlace(w.place)}
              viewers={w.shown}
              extraViewers={w.extra}
            />
          ))}
        </Rail>
      )}
    </div>
  );
};
