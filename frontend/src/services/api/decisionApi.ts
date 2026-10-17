import apiClient from './client';
import type {
  CreateDecisionRequest,
  CreateDecisionResponse,
  DecisionActionResponse,
  DecisionHintsResponse,
  SubmitSwipeRequest,
  SubmitSwipeResponse,
} from '../../types';

export const decisionApi = {
  async getHints(roomId: string): Promise<DecisionHintsResponse> {
    const res = await apiClient.get<DecisionHintsResponse>(`/rooms/${roomId}/decisions/hints`);
    return res.data;
  },

  async createDecision(
    roomId: string,
    data: CreateDecisionRequest,
  ): Promise<CreateDecisionResponse> {
    const res = await apiClient.post<CreateDecisionResponse>(
      `/rooms/${roomId}/decisions`,
      data,
    );
    return res.data;
  },

  async submitSwipe(
    roomId: string,
    sessionId: string,
    data: SubmitSwipeRequest,
  ): Promise<SubmitSwipeResponse> {
    const res = await apiClient.post<SubmitSwipeResponse>(
      `/rooms/${roomId}/decisions/${sessionId}/swipes`,
      data,
    );
    return res.data;
  },


  async acceptDecision(
    roomId: string,
    sessionId: string,
  ): Promise<DecisionActionResponse> {
    const res = await apiClient.post<DecisionActionResponse>(
      `/rooms/${roomId}/decisions/${sessionId}/accept`,
    );
    return res.data;
  },

  async cancelDecision(
    roomId: string,
    sessionId: string,
  ): Promise<DecisionActionResponse> {
    const res = await apiClient.post<DecisionActionResponse>(
      `/rooms/${roomId}/decisions/${sessionId}/cancel`,
    );
    return res.data;
  },
};
