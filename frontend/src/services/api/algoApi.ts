import apiClient from './client';
import type { GroupCenterResponse } from '../../types';

export const algoApi = {
  /** ALGO-01: tâm nhóm + quán trong 2 km. `available:false` khi <2 người chia sẻ vị trí. */
  async getGroupCenter(roomId: string): Promise<GroupCenterResponse> {
    const res = await apiClient.get<GroupCenterResponse>(`/rooms/${roomId}/group-center`);
    return res.data;
  },
};
