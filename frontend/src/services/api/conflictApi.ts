import apiClient from './client';
import type { ConflictAlert } from '../../types';

export const conflictApi = {
  async listConflicts(roomId: string): Promise<ConflictAlert[]> {
    const res = await apiClient.get<ConflictAlert[]>(`/rooms/${roomId}/conflicts`);
    return res.data;
  },

  async evaluateConflicts(roomId: string): Promise<ConflictAlert[]> {
    const res = await apiClient.post<ConflictAlert[]>(
      `/rooms/${roomId}/conflicts/evaluate`,
    );
    return res.data;
  },
};
