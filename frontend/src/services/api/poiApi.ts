import apiClient from './client';
import type {
  GoogleMatchRequest,
  GoogleMatchResponse,
  Poi,
  PoiQueryParams,
  PoiSearchParams,
} from '../../types';

export const poiApi = {
  async listPois(params?: PoiQueryParams): Promise<Poi[]> {
    const res = await apiClient.get<Poi[]>('/pois', { params });
    return res.data;
  },

  async searchPois(params: PoiSearchParams): Promise<Poi[]> {
    const res = await apiClient.get<Poi[]>('/pois/search', { params });
    return res.data;
  },

  async getPoi(externalId: string): Promise<Poi> {
    const res = await apiClient.get<Poi>(`/pois/${externalId}`);
    return res.data;
  },

  async matchGooglePlace(data: GoogleMatchRequest): Promise<GoogleMatchResponse> {
    const res = await apiClient.post<GoogleMatchResponse>('/pois/google-match', data);
    return res.data;
  },

  async unmatchGooglePlace(externalId: string): Promise<{ success: boolean }> {
    const res = await apiClient.delete<{ success: boolean }>(`/pois/google-match/${externalId}`);
    return res.data;
  },
};
