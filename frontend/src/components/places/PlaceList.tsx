import React, { useState } from 'react';
import { PlaceCard } from './PlaceCard';
import { Button } from '../common';
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
  className?: string;
}

type SortOption = 'SCORE' | 'UPVOTES' | 'NEWEST';

export const PlaceList: React.FC<PlaceListProps> = ({
  places,
  roomId,
  selectedCategory,
  currentMemberId,
  isHost,
  isVotingDisabled,
  onOpenAddModal,
  onDeletePlace,
  className = '',
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('SCORE');

  // Filter by category
  let filtered =
    selectedCategory === 'ALL'
      ? places
      : places.filter((p) => p.category === selectedCategory);

  // Filter by search query
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q)) ||
        (p.notes && p.notes.toLowerCase().includes(q)),
    );
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'SCORE') {
      if (b.score !== a.score) return b.score - a.score;
      return b.upvotes - a.upvotes;
    }
    if (sortBy === 'UPVOTES') {
      return b.upvotes - a.upvotes;
    }
    // NEWEST
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and Sort Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Tìm theo tên quán, địa chỉ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">
            🔍
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="SCORE">Điểm cao nhất</option>
            <option value="UPVOTES">Nhiều vote nhất</option>
            <option value="NEWEST">Mới đề xuất</option>
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={onOpenAddModal}
            leftIcon={<span>+</span>}
          >
            Thêm quán
          </Button>
        </div>
      </div>

      {/* Place Cards Grid */}
      {sorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              roomId={roomId}
              currentMemberId={currentMemberId}
              isHost={isHost}
              isVotingDisabled={isVotingDisabled}
              onDeletePlace={onDeletePlace}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center space-y-3">
          <div className="text-4xl">🍽️</div>
          <h4 className="text-sm font-bold text-slate-800">
            {places.length === 0
              ? 'Chưa có địa điểm nào được đề xuất'
              : 'Không tìm thấy địa điểm phù hợp bộ lọc'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {places.length === 0
              ? 'Hãy là người đầu tiên gợi ý quán ăn, cà phê hoặc địa điểm check-in cho chuyến đi này!'
              : 'Thử tìm với từ khóa khác hoặc chọn xem "Tất cả" danh mục.'}
          </p>
          <div className="pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenAddModal}
              leftIcon={<span>+</span>}
            >
              Gợi ý địa điểm ngay
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
