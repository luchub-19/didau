import apiClient from './client';
import type { CreatePlaceRequest, Place, PlaceSort } from '../../types';

export const placeApi = {
  /** CR-12: `sort = 'priority'` → theo `priority.rank` (ALGO-04); bỏ trống = thứ tự thêm. */
  async listPlaces(roomId: string, sort?: PlaceSort): Promise<Place[]> {
    const res = await apiClient.get<Place[]>(`/rooms/${roomId}/places`, sort ? { params: { sort } } : undefined);
    return res.data;
  },

  async createPlace(roomId: string, data: CreatePlaceRequest): Promise<Place> {
    const res = await apiClient.post<Place>(`/rooms/${roomId}/places`, data);
    return res.data;
  },

  async updatePlace(
    roomId: string,
    placeId: string,
    data: Partial<Place>,
  ): Promise<Place> {
    const res = await apiClient.patch<Place>(
      `/rooms/${roomId}/places/${placeId}`,
      data,
    );
    return res.data;
  },

  async deletePlace(
    roomId: string,
    placeId: string,
  ): Promise<{ success: boolean; deleted_id: string }> {
    const res = await apiClient.delete<{ success: boolean; deleted_id: string }>(
      `/rooms/${roomId}/places/${placeId}`,
    );
    return res.data;
  },
};
