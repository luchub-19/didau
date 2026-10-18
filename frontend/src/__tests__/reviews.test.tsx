import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { reviewApi } from '../services/api';
import { MOCK_HOST_TOKEN, mockPois, mockRoom } from '../mocks/mockData';
import { usePlaceStore } from '../store/usePlaceStore';
import { PlaceSheet } from '../components/map/PlaceSheet';
import {
  InternalReviews,
  REVIEW_TAGS,
  reviewKeyFor,
  validateReview,
} from '../components/reviews';
import type { Place, ReviewSummary } from '../types';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  tokenStorage.setToken(MOCK_HOST_TOKEN);
  usePlaceStore.getState().reset();
});
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
});
afterAll(() => server.close());

const summary: ReviewSummary = {
  avg: 4.5,
  count: 2,
  tags_top3: ['ngon', 'đông'],
  items: [
    {
      id: 'r1',
      external_key: 'osm:node/1001',
      nickname: 'Lan',
      rating: 5,
      comment: 'Nước dùng đậm đà',
      tags: ['ngon'],
      created_at: '2026-10-17T07:30:00Z',
    },
  ],
};

describe('reviewUtils', () => {
  it('tag cố định khớp backend', () => {
    expect([...REVIEW_TAGS]).toEqual([
      'ngon',
      'đáng tiền',
      'chỗ ngồi thoải mái',
      'đông',
      'phục vụ chậm',
    ]);
  });

  it('validateReview kiểm tra sao và độ dài nhận xét', () => {
    expect(validateReview(0, '')).toBe('review.error.rating');
    expect(validateReview(6, '')).toBe('review.error.rating');
    expect(validateReview(3, 'a'.repeat(281))).toBe('review.error.commentTooLong');
    expect(validateReview(3, 'a'.repeat(280))).toBeNull();
  });

  it('reviewKeyFor dùng external_id, quán thêm tay dùng room_place', () => {
    const poi = mockPois[0];
    expect(reviewKeyFor(null, poi)).toBe(poi.external_id);
    const manual = { id: 'abc', external_id: null } as unknown as Place;
    expect(reviewKeyFor(manual, null)).toBe('room_place:abc');
    expect(reviewKeyFor(null, null)).toBeNull();
  });
});

describe('InternalReviews', () => {
  it('hiện điểm trung bình, tag và review', () => {
    const html = renderToStaticMarkup(
      <InternalReviews externalKey="osm:node/1001" initialSummary={summary} />,
    );
    expect(html).toContain('★ 4.5 · 2 đánh giá');
    expect(html).toContain('ngon');
    expect(html).toContain('Nước dùng đậm đà');
    expect(html).toContain('Viết đánh giá');
  });

  it('chưa có review thì báo trống', () => {
    const html = renderToStaticMarkup(
      <InternalReviews
        externalKey="x"
        initialSummary={{ avg: 0, count: 0, tags_top3: [], items: [] }}
      />,
    );
    expect(html).toContain('Chưa có đánh giá');
  });

  it('nhắc đánh giá khi phòng COMPLETED', () => {
    const on = renderToStaticMarkup(
      <InternalReviews externalKey="x" initialSummary={summary} remindToReview />,
    );
    const off = renderToStaticMarkup(<InternalReviews externalKey="x" initialSummary={summary} />);
    expect(on).toContain('Đánh giá các quán hôm nay?');
    expect(off).not.toContain('Đánh giá các quán hôm nay?');
  });

  it('không có token thì ẩn nút viết đánh giá', () => {
    tokenStorage.clearAll();
    const html = renderToStaticMarkup(
      <InternalReviews externalKey="x" initialSummary={summary} />,
    );
    expect(html).not.toContain('Viết đánh giá');
  });
});

describe('reviewApi (MSW)', () => {
  it('PUT upsert không tạo trùng và GET tổng hợp đúng', async () => {
    const key = 'osm:node/9999';
    await reviewApi.submitReview({ external_key: key, rating: 2, tags: ['đông'] });
    await reviewApi.submitReview({ external_key: key, rating: 4, tags: ['ngon'] });
    const res = await reviewApi.getReviews(key);
    expect(res.count).toBe(1);
    expect(res.avg).toBe(4);
    expect(res.items[0].tags).toEqual(['ngon']);
  });
});

describe('PlaceSheet + review', () => {
  it('thay placeholder bằng InternalReviews', () => {
    const html = renderToStaticMarkup(
      <PlaceSheet room={mockRoom} poi={mockPois[0]} onClose={() => {}} />,
    );
    expect(html).toContain('data-testid="internal-reviews"');
    expect(html).not.toContain('internal-reviews-placeholder');
  });
});
