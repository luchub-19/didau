import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceRow } from './PlaceRow';
import { CategoryFilter } from './CategoryFilter';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import { EmptyState } from '../ui/EmptyState';
import { Plus, MagnifyingGlass, BowlFood, MapTrifold, SlidersHorizontal } from '../ui/Icon';
import { useRoomStore } from '../../store/useRoomStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { hasListTools, leadingPlaceIds, pickProgress, type PulseMap } from '../../room/placeView';
import type { RoomPhase } from '../../room/phase';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import type { Member, Place, PlaceCategory, Room } from '../../types';

export interface PlaceListProps {
  places: Place[];
  roomId: string;
  selectedCategory: PlaceCategory | 'ALL';
  currentMemberId?: string;
  isHost?: boolean;
  isVotingDisabled?: boolean;
  onOpenAddModal: () => void;
  onDeletePlace: (placeId: string) => void;
  onViewOnMap?: (place: Place) => void;
  onSwitchToMap?: () => void;
  onResetCategory?: () => void;
  /** Đổi bộ lọc danh mục (nằm trong nút ⋯ khi >8 quán). Thiếu thì không có bộ lọc danh mục. */
  onSelectCategory?: (cat: PlaceCategory | 'ALL') => void;
  /** Điểm hẹn + ngân sách phòng, cho khoảng cách và nhãn "Vượt ngân sách". */
  room?: Pick<Room, 'origin_lat' | 'origin_lng' | 'budget_limit'> | null;
  /** Giai đoạn phòng: `vote`/`tie` hiện thanh "x/y đã chọn"; `tie` thu nút Thêm quán còn icon. */
  phase?: RoomPhase;
  /** Thành viên / phiếu thấy được cho thanh "x/y đã chọn"; thiếu thì đọc từ store. */
  members?: Member[];
  pulses?: PulseMap;
  /** Ẩn nút "Thêm quán" dính đáy (giai đoạn ①: khay của GatherPanel đã có ô "+ quán" và liên kết tự nhập). */
  hideAddButton?: boolean;
  className?: string;
}

type SortOption = 'SCORE' | 'NEWEST';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const PlaceList: React.FC<PlaceListProps> = ({
  places,
  roomId,
  selectedCategory,
  currentMemberId,
  isHost = false,
  isVotingDisabled = false,
  onOpenAddModal,
  onDeletePlace,
  onViewOnMap,
  onSwitchToMap,
  onResetCategory,
  onSelectCategory,
  room,
  phase,
  members: propMembers,
  pulses: propPulses,
  hideAddButton = false,
  className = '',
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('SCORE');
  const [toolsOpen, setToolsOpen] = useState(false);

  // Lọc/sắp xếp/tìm chỉ có khi >8 quán (G1 câu e); ít hơn thì bỏ mọi bộ lọc đang đặt để không kẹt vô hình
  const toolsAvailable = hasListTools(places.length);
  const activeCategory = toolsAvailable ? selectedCategory : 'ALL';
  const activeSearch = toolsAvailable ? search : '';
  const activeSort: SortOption = toolsAvailable ? sortBy : 'SCORE';

  const storeMembers = useRoomStore((s) => s.members);
  const storeMeId = useRoomStore((s) => s.currentMember?.id);
  const storePulses = usePresenceStore((s) => s.pulses);
  const members = propMembers ?? storeMembers;
  const meId = currentMemberId ?? storeMeId;
  const pulses = propPulses ?? storePulses;
  const progress = useMemo(() => pickProgress(places, members, pulses, meId), [places, members, pulses, meId]);
  const showProgress = (phase === 'vote' || phase === 'tie') && progress.total > 0;

  // Hiệu ứng xuất hiện lần lượt cho danh sách tải lần đầu (T-53)
  const [shouldAnimateInitial, setShouldAnimateInitial] = useState(true);

  useEffect(() => {
    // Tự động tắt stagger sau khi hoàn tất đợt xuất hiện đầu tiên
    const timer = setTimeout(() => {
      setShouldAnimateInitial(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // FLIP Animation khi đổi thứ tự sắp xếp do vote (T-53)
  const cardElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const currentRects = new Map<string, DOMRect>();
    cardElementsRef.current.forEach((el, id) => {
      if (el) {
        currentRects.set(id, el.getBoundingClientRect());
      }
    });

    if (prevRectsRef.current.size > 0 && !shouldAnimateInitial) {
      cardElementsRef.current.forEach((el, id) => {
        const prevRect = prevRectsRef.current.get(id);
        const currentRect = currentRects.get(id);
        if (prevRect && currentRect) {
          const deltaX = prevRect.left - currentRect.left;
          const deltaY = prevRect.top - currentRect.top;
          if (deltaX !== 0 || deltaY !== 0) {
            el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            el.style.transition = 'none';

            requestAnimationFrame(() => {
              el.style.transition = 'transform var(--t-ui) var(--ease-out)';
              el.style.transform = '';
            });
          }
        }
      });
    }

    prevRectsRef.current = currentRects;
  });

  // Lọc theo danh mục
  const categoryFiltered = useMemo(() => {
    if (activeCategory === 'ALL') return places;
    return places.filter((p) => p.category === activeCategory);
  }, [places, activeCategory]);

  // Lọc theo từ khoá tìm kiếm
  const searchFiltered = useMemo(() => {
    if (!activeSearch.trim()) return categoryFiltered;
    const q = activeSearch.toLowerCase().trim();
    return categoryFiltered.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)),
    );
  }, [categoryFiltered, activeSearch]);

  // Sắp xếp
  const sorted = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
      if (activeSort === 'SCORE') {
        const scoreB = b.score ?? 0;
        const scoreA = a.score ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.upvotes ?? 0) - (a.upvotes ?? 0);
      }
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }, [searchFiltered, activeSort]);

  // Quán đang dẫn (điểm cao nhất > 0, hoà thì dẫn chung)
  const leading = useMemo(() => leadingPlaceIds(places), [places]);

  const sortOptions: SegmentedOption<SortOption>[] = [
    { value: 'SCORE', label: t('place.sortScore') },
    { value: 'NEWEST', label: t('place.sortNewest') },
  ];

  return (
    <div className={`relative flex flex-col gap-4 pb-4 ${className}`}>
      {/* Thanh "x/y đã chọn" (giai đoạn bình chọn) + nút ⋯ lọc/sắp xếp/tìm khi >8 quán */}
      {(showProgress || toolsAvailable) && (
        <div className="flex items-center gap-3">
          {showProgress ? (
            <div className="min-w-0 flex-1" data-testid="pick-progress">
              <p className="text-label font-semibold text-ink-2 tabular-nums">
                {t('place.list.progress', { done: progress.done, total: progress.total })}
              </p>
              <div
                role="progressbar"
                aria-label={t('place.list.progressLabel', { done: progress.done, total: progress.total })}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-[var(--t-ui)]"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {toolsAvailable && (
            <button
              type="button"
              aria-expanded={toolsOpen}
              aria-label={t('place.list.tools')}
              title={t('place.list.tools')}
              onClick={() => setToolsOpen((v) => !v)}
              data-testid="list-tools-trigger"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-field border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text ${
                toolsOpen || activeCategory !== 'ALL' || activeSearch || activeSort !== 'SCORE'
                  ? 'border-accent/40 bg-accent-soft text-accent-text'
                  : 'border-line bg-surface text-ink-2 hover:bg-surface-2'
              }`}
            >
              <SlidersHorizontal size={20} />
            </button>
          )}
        </div>
      )}

      {toolsAvailable && toolsOpen && (
        <div className="space-y-3 rounded-card border border-line bg-surface p-3" data-testid="list-tools">
          <TextField
            label={t('place.list.filterInList')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('place.searchPlaceholder')}
          />
          {onSelectCategory && (
            <CategoryFilter places={places} selectedCategory={selectedCategory} onSelectCategory={onSelectCategory} />
          )}
          <Segmented
            size="sm"
            options={sortOptions}
            value={sortBy}
            onChange={setSortBy}
            aria-label={t('place.sortBy')}
          />
        </div>
      )}

      {/* Danh sách thẻ ngang, một cột, khoảng giữa 12px */}
      {sorted.length > 0 ? (
        <ul className="space-y-3" aria-label={t('place.list.tools')}>
          {sorted.map((place, index) => (
            <li
              key={place.id}
              ref={(el) => {
                if (el) cardElementsRef.current.set(place.id, el);
                else cardElementsRef.current.delete(place.id);
              }}
              className={shouldAnimateInitial ? 'place-card-stagger' : undefined}
              style={
                shouldAnimateInitial
                  ? { animationDelay: `${Math.min(index * 35, 260)}ms` }
                  : undefined
              }
            >
              <PlaceRow
                place={place}
                roomId={roomId}
                room={room}
                leading={leading}
                currentMemberId={currentMemberId}
                isHost={isHost}
                isVotingDisabled={isVotingDisabled}
                onDeletePlace={onDeletePlace}
                onOpen={onViewOnMap}
              />
            </li>
          ))}
        </ul>
      ) : places.length === 0 ? (
        /* Trạng thái trống hoàn toàn */
        <EmptyState
          icon={<BowlFood size={32} weight="fill" className="text-ink-2" />}
          title={t('place.emptyTitle')}
          description={t('place.emptyDesc')}
          action={
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <Button
                variant="primary"
                onClick={onOpenAddModal}
                leftIcon={<Plus size={18} weight="bold" />}
              >
                {t('place.suggestPlaceAction')}
              </Button>
              {onSwitchToMap && (
                <Button
                  variant="secondary"
                  onClick={onSwitchToMap}
                  leftIcon={<MapTrifold size={18} />}
                >
                  {t('place.orPickOnMap')}
                </Button>
              )}
            </div>
          }
        />
      ) : (
        /* Trạng thái lọc hoặc tìm kiếm không thấy kết quả */
        <EmptyState
          icon={<MagnifyingGlass size={32} weight="bold" className="text-ink-2" />}
          title={t('place.emptyFilterTitle', {
            category:
              activeCategory === 'ALL'
                ? ''
                : CATEGORY_METADATA[activeCategory]?.label || t('category.all'),
          })}
          description={t('place.emptyFilterDesc')}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                if (onResetCategory) onResetCategory();
              }}
            >
              {t('place.viewAll')}
            </Button>
          }
        />
      )}

      {/* Nút Thêm quán dính đáy cột/sheet (trong vùng cuộn, không còn `fixed`); giai đoạn hoà thu còn icon */}
      {!hideAddButton && (
        <div className="pointer-events-none sticky bottom-4 z-20 mt-auto flex justify-end">
          <Button
            variant="primary"
            size="lg"
            onClick={onOpenAddModal}
            leftIcon={<Plus size={20} weight="bold" />}
            className="pointer-events-auto shadow-float"
            aria-label={t('place.addPlace')}
            data-testid="btn-add-place"
          >
            {phase !== 'tie' && <span>{t('place.addPlace')}</span>}
          </Button>
        </div>
      )}
    </div>
  );
};
