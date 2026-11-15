import apiClient from './client';
import type { GroupCenterResponse, MyRoutes, ScheduleFeasibility, ScheduleRoutes, TieSuggestion } from '../../types';

export const algoApi = {
  /** ALGO-01: tâm nhóm + quán trong 2 km. `available:false` khi <2 người chia sẻ vị trí. */
  async getGroupCenter(roomId: string): Promise<GroupCenterResponse> {
    const res = await apiClient.get<GroupCenterResponse>(`/rooms/${roomId}/group-center`);
    return res.data;
  },

  /** OMP (CR-15): đề xuất theo từng loại quán đang hoà (host xác nhận bằng `POST /voting/resolve {TRAVEL_TIME}`). */
  async getTieSuggestion(roomId: string): Promise<TieSuggestion> {
    const res = await apiClient.get<TieSuggestion>(`/rooms/${roomId}/tie-break/suggestion`);
    return res.data;
  },

  /** ALGO-03: tổng khả thi lịch của ngày phòng (chặng, biên, dư/thiếu). Nguồn thật cho dải di chuyển sau khi lưu. */
  async getScheduleFeasibility(roomId: string): Promise<ScheduleFeasibility> {
    const res = await apiClient.get<ScheduleFeasibility>(`/rooms/${roomId}/schedule/feasibility`);
    return res.data;
  },

  /** Mục 37: đường của chính mình nhà ↔ quán. 404 `NO_ORIGIN` khi mình chưa chia sẻ vị trí. */
  async getMyRoutes(roomId: string, placeId: string): Promise<MyRoutes> {
    const res = await apiClient.get<MyRoutes>(`/rooms/${roomId}/routes/me`, { params: { place_id: placeId } });
    return res.data;
  },

  /** Mục 38: đường giữa các mục liên tiếp trên lịch (ngày phòng). */
  async getScheduleRoutes(roomId: string): Promise<ScheduleRoutes> {
    const res = await apiClient.get<ScheduleRoutes>(`/rooms/${roomId}/schedule/routes`);
    return res.data;
  },
};
