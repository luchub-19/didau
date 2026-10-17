import apiClient from './client';
import type {
  BulkUpdateScheduleRequest,
  CreateScheduleItemRequest,
  DeleteScheduleResponse,
  ScheduleItem,
} from '../../types';

export const scheduleApi = {
  async listSchedule(roomId: string): Promise<ScheduleItem[]> {
    const res = await apiClient.get<ScheduleItem[]>(`/rooms/${roomId}/schedule`);
    return res.data;
  },

  async createScheduleItem(
    roomId: string,
    data: CreateScheduleItemRequest,
  ): Promise<ScheduleItem> {
    const res = await apiClient.post<ScheduleItem>(
      `/rooms/${roomId}/schedule`,
      data,
    );
    return res.data;
  },

  async bulkUpdateSchedule(
    roomId: string,
    data: BulkUpdateScheduleRequest,
  ): Promise<ScheduleItem[]> {
    const res = await apiClient.put<ScheduleItem[]>(
      `/rooms/${roomId}/schedule`,
      data,
    );
    return res.data;
  },

  async deleteScheduleItem(
    roomId: string,
    itemId: string,
  ): Promise<DeleteScheduleResponse> {
    const res = await apiClient.delete<DeleteScheduleResponse>(
      `/rooms/${roomId}/schedule/${itemId}`,
    );
    return res.data;
  },
};
