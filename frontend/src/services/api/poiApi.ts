import apiClient from './client';
import type {
  GoogleMatchRequest,
  GoogleMatchResponse,
  Poi,
  PoiQueryParams,
  PoiSearchParams,
} from '../../types';

/** Một chuỗi cửa hàng khớp truy vấn (CR-17 B, `GET /pois/brands`). */
export interface PoiBrand {
  brand_key: string;
  name: string;
  /** Số chi nhánh (có lat/lng thì chỉ trong 60 km). */
  count: number;
  nearest_km: number | null;
}

export interface PoiBrandParams {
  lat?: number;
  lng?: number;
  limit?: number;
}

export const poiApi = {
  async listPois(params?: PoiQueryParams): Promise<Poi[]> {
    const res = await apiClient.get<Poi[]>('/pois', { params });
    return res.data;
  },

  async searchPois(params: PoiSearchParams): Promise<Poi[]> {
    const res = await apiClient.get<Poi[]>('/pois/search', { params });
    return res.data;
  },

  async searchBrands(params: PoiSearchParams): Promise<PoiBrand[]> {
    const res = await apiClient.get<PoiBrand[]>('/pois/brands', { params });
    return res.data;
  },

  /** Chi nhánh của chuỗi, gần → xa. */
  async getBrandBranches(brandKey: string, params?: PoiBrandParams): Promise<Poi[]> {
    const res = await apiClient.get<Poi[]>(`/pois/brands/${encodeURIComponent(brandKey)}`, { params });
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
