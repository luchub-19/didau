import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PlaceCard } from './PlaceCard';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import { EmptyState } from '../ui/EmptyState';
import { Plus, MagnifyingGlass, BowlFood, MapTrifold } from '../ui/Icon';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import type { Place, PlaceCategory } from '../../types';

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
  className = '',
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('SCORE');

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
  const cardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
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
    if (selectedCategory === 'ALL') return places;
    return places.filter((p) => p.category === selectedCategory);
  }, [places, selectedCategory]);

  // Lọc theo từ khoá tìm kiếm
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return categoryFiltered;
    const q = search.toLowerCase().trim();
    return categoryFiltered.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)),
    );
  }, [categoryFiltered, search]);

  // Sắp xếp
  const sorted = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
      if (sortBy === 'SCORE') {
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
  }, [searchFiltered, sortBy]);

  // Tìm điểm cao nhất để gắn highlight quán dẫn đầu
  const maxScore = useMemo(() => {
    if (places.length === 0) return 0;
    return Math.max(...places.map((p) => p.score ?? 0));
  }, [places]);

  const sortOptions: SegmentedOption<SortOption>[] = [
    { value: 'SCORE', label: t('place.sortScore') },
    { value: 'NEWEST', label: t('place.sortNewest') },
  ];

  return (
    <div className={`space-y-4 relative pb-20 sm:pb-16 ${className}`}>
      {/* Thanh công cụ: Sắp xếp Segmented và Ô tìm kiếm (chỉ hiện khi > 8 quán) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {places.length > 8 ? (
          <div className="flex-1 max-w-md">
            <TextField
              label={t('place.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('place.searchPlaceholder')}
            />
          </div>
        ) : (
          <div />
        )}

        {places.length > 0 && (
          <div className="flex items-center justify-end gap-2">
            <Segmented
              size="sm"
              options={sortOptions}
              value={sortBy}
              onChange={setSortBy}
              aria-label={t('place.sortBy')}
            />
          </div>
        )}
      </div>

      {/* Lưới danh sách quán */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((place, index) => {
            const isTopPick = maxScore > 0 && place.score === maxScore;
            return (
              <div
                key={place.id}
                ref={(el) => {
                  if (el) cardElementsRef.current.set(place.id, el);
                  else cardElementsRef.current.delete(place.id);
                }}
                className={shouldAnimateInitial ? 'place-card-stagger flex flex-col' : 'flex flex-col'}
                style={
                  shouldAnimateInitial
                    ? { animationDelay: `${Math.min(index * 35, 260)}ms` }
                    : undefined
                }
              >
                <PlaceCard
                  place={place}
                  roomId={roomId}
                  currentMemberId={currentMemberId}
                  isHost={isHost}
                  isVotingDisabled={isVotingDisabled}
                  isTopPick={isTopPick}
                  onDeletePlace={onDeletePlace}
                  onViewOnMap={onViewOnMap}
                  className="h-full"
                />
              </div>
            );
          })}
        </div>
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
              selectedCategory === 'ALL'
                ? ''
                : CATEGORY_METADATA[selectedCategory]?.label || t('category.all'),
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

      {/* Nút nổi Thêm quán ở góc dưới phải (trên thanh tab bar) */}
      <div className="fixed bottom-[72px] right-4 sm:bottom-6 sm:right-6 z-20">
        <Button
          variant="primary"
          size="lg"
          onClick={onOpenAddModal}
          leftIcon={<Plus size={20} weight="bold" />}
          className="shadow-float"
          aria-label={t('place.addPlace')}
        >
          <span>{t('place.addPlace')}</span>
        </Button>
      </div>
    </div>
  );
};
