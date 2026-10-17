import apiClient from './client';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Member,
  Room,
  RoomDetailResponse,
  UpdateRoomRequest,
} from '../../types';

export const roomApi = {
  async createRoom(data: CreateRoomRequest): Promise<CreateRoomResponse> {
    const res = await apiClient.post<CreateRoomResponse>('/rooms', data);
    return res.data;
  },

  async joinRoom(data: JoinRoomRequest): Promise<JoinRoomResponse> {
    const res = await apiClient.post<JoinRoomResponse>('/rooms/join', data);
    return res.data;
  },

  async getRoom(roomId: string): Promise<RoomDetailResponse> {
    const res = await apiClient.get<RoomDetailResponse>(`/rooms/${roomId}`);
    return res.data;
  },

  async updateRoom(roomId: string, data: UpdateRoomRequest): Promise<Room> {
    const res = await apiClient.patch<Room>(`/rooms/${roomId}`, data);
    return res.data;
  },

  async getCurrentMember(): Promise<Member> {
    const res = await apiClient.get<Member>('/members/me');
    return res.data;
  },
};
