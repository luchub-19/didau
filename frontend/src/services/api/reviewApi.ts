import apiClient from './client';
import type { CreateReviewRequest, PlaceReview, ReviewSummary } from '../../types';

export const reviewApi = {
  async getReviews(externalKey: string): Promise<ReviewSummary> {
    const res = await apiClient.get<ReviewSummary>('/reviews', {
      params: { external_key: externalKey },
    });
    return res.data;
  },

  async submitReview(data: CreateReviewRequest): Promise<PlaceReview> {
    const res = await apiClient.put<PlaceReview>('/reviews', data);
    return res.data;
  },
};
