import apiClient from './client';
import type {
  ResolveVotingRequest,
  ResolveVotingResponse,
  VoteResponse,
  VoteValue,
} from '../../types';

export const voteApi = {
  async castVote(
    roomId: string,
    placeId: string,
    voteValue: VoteValue,
  ): Promise<VoteResponse> {
    const res = await apiClient.post<VoteResponse>(
      `/rooms/${roomId}/places/${placeId}/votes`,
      { vote_value: voteValue },
    );
    return res.data;
  },

  async retractVote(roomId: string, placeId: string): Promise<VoteResponse> {
    const res = await apiClient.delete<VoteResponse>(
      `/rooms/${roomId}/places/${placeId}/votes`,
    );
    return res.data;
  },

  async resolveVoting(
    roomId: string,
    data: ResolveVotingRequest,
  ): Promise<ResolveVotingResponse> {
    const res = await apiClient.post<ResolveVotingResponse>(
      `/rooms/${roomId}/voting/resolve`,
      data,
    );
    return res.data;
  },
};
