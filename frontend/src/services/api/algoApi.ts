import apiClient from './client';
import type { GroupCenterResponse, ScheduleFeasibility, TieSuggestion } from '../../types';

export const algoApi = {
  /** ALGO-01: tâm nhóm + quán trong 2 km. `available:false` khi <2 người chia sẻ vị trí. */
  async getGroupCenter(roomId: string): Promise<GroupCenterResponse> {
    const res = await apiClient.get<GroupCenterResponse>(`/rooms/${roomId}/group-center`);
    return res.data;
  },

  /** ALGO-02: đề xuất quán đi chung khi hoà phiếu (host xác nhận bằng `POST /voting/resolve {TRAVEL_TIME}`). */
  async getTieSuggestion(roomId: string): Promise<TieSuggestion> {
    const res = await apiClient.get<TieSuggestion>(`/rooms/${roomId}/tie-break/suggestion`);
    return res.data;
  },

  /** ALGO-03: tổng khả thi lịch của ngày phòng (chặng, biên, dư/thiếu). Nguồn thật cho dải di chuyển sau khi lưu. */
  async getScheduleFeasibility(roomId: string): Promise<ScheduleFeasibility> {
    const res = await apiClient.get<ScheduleFeasibility>(`/rooms/${roomId}/schedule/feasibility`);
    return res.data;
  },
};
