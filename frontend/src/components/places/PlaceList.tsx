import React, { useState, useMemo } from 'react';
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
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)),
    );
  }, [categoryFiltered, search]);

  // Sắp xếp
  const sorted = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
      if (sortBy === 'SCORE') {
        if (b.score !== a.score) return b.score - a.score;
        return b.upvotes - a.upvotes;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [searchFiltered, sortBy]);

  // Tìm điểm cao nhất để gắn highlight quán dẫn đầu
  const maxScore = useMemo(() => {
    if (places.length === 0) return 0;
    return Math.max(...places.map((p) => p.score));
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
          {sorted.map((place) => {
            const isTopPick = maxScore > 0 && place.score === maxScore;
            return (
              <PlaceCard
                key={place.id}
                place={place}
                roomId={roomId}
                currentMemberId={currentMemberId}
                isHost={isHost}
                isVotingDisabled={isVotingDisabled}
                isTopPick={isTopPick}
                onDeletePlace={onDeletePlace}
                onViewOnMap={onViewOnMap}
              />
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
