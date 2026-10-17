import React, { useCallback, useEffect, useState } from 'react';
import type { ReviewSummary } from '../../types';
import { reviewApi } from '../../services/api';
import { tokenStorage } from '../../services/storage/tokenStorage';
import { Button } from '../common';
import { ReviewForm } from './ReviewForm';

export interface InternalReviewsProps {
  externalKey: string;
  /** Phòng đã COMPLETED: hiện nhắc "Đánh giá các quán hôm nay?" */
  remindToReview?: boolean;
  /** Dữ liệu có sẵn (SSR/test); bỏ qua lần tải đầu tiên. */
  initialSummary?: ReviewSummary | null;
}

export const InternalReviews: React.FC<InternalReviewsProps> = ({
  externalKey,
  remindToReview = false,
  initialSummary = null,
}) => {
  const [summary, setSummary] = useState<ReviewSummary | null>(initialSummary);
  const [loadError, setLoadError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSummary(await reviewApi.getReviews(externalKey));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [externalKey]);

  useEffect(() => {
    if (initialSummary) return;
    void load();
  }, [load, initialSummary]);

  const canReview = Boolean(tokenStorage.getToken());
  const count = summary?.count ?? 0;

  return (
    <div
      className="my-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
      data-testid="internal-reviews"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
          <span>👥</span> Đánh giá bạn bè
        </span>
        <span className="text-[11px] text-slate-500" data-testid="reviews-avg">
          {count > 0 ? `★ ${summary!.avg.toFixed(1)} · ${count} đánh giá` : 'Chưa có đánh giá'}
        </span>
      </div>

      {remindToReview && !isEditing && (
        <p className="text-[11px] font-medium text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-2">
          Đánh giá các quán hôm nay?
        </p>
      )}

      {loadError && (
        <p className="text-[11px] text-rose-600">Không tải được đánh giá.</p>
      )}

      {summary && summary.tags_top3.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {summary.tags_top3.map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {summary && summary.items.length > 0 && (
        <ul className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
          {summary.items.map((r) => (
            <li key={r.id} className="text-[11px] text-slate-600">
              <span className="font-semibold text-slate-800">{r.nickname}</span>{' '}
              <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
              {r.comment && <span className="block text-slate-500">{r.comment}</span>}
            </li>
          ))}
        </ul>
      )}

      {isEditing ? (
        <ReviewForm
          externalKey={externalKey}
          onCancel={() => setIsEditing(false)}
          onSubmitted={() => {
            setIsEditing(false);
            void load();
          }}
        />
      ) : (
        canReview && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            ✍️ Viết đánh giá
          </Button>
        )
      )}
    </div>
  );
};
