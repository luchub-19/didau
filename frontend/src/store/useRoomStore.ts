import { create } from 'zustand';
import { roomApi } from '../services/api/roomApi';
import { tokenStorage } from '../services/storage/tokenStorage';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Member,
  Room,
  UpdateRoomRequest,
} from '../types';
import { errorKey } from '../i18n/serverText';

interface RoomState {
  room: Room | null;
  members: Member[];
  currentMember: Member | null;
  totalPlaces: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  createRoom: (data: CreateRoomRequest) => Promise<CreateRoomResponse>;
  joinRoom: (data: JoinRoomRequest) => Promise<JoinRoomResponse>;
  fetchRoom: (roomId: string) => Promise<void>;
  updateRoom: (roomId: string, data: UpdateRoomRequest) => Promise<Room>;
  setRoom: (room: Partial<Room> | null) => void;
  setMembers: (members: Member[]) => void;
  addMember: (member: Member) => void;
  removeMember: (memberId: string) => void;
  setCurrentMember: (member: Member | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  members: [],
  currentMember: null,
  totalPlaces: 0,
  isLoading: false,
  error: null,

  createRoom: async (data: CreateRoomRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await roomApi.createRoom(data);
      tokenStorage.setToken(res.member_token);
      tokenStorage.setRoomCode(res.room.code);
      set({
        room: res.room,
        currentMember: res.creator_member,
        members: [res.creator_member],
        isLoading: false,
      });
      return res;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'CREATE_ROOM_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  joinRoom: async (data: JoinRoomRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await roomApi.joinRoom(data);
      tokenStorage.setToken(res.member_token);
      tokenStorage.setRoomCode(res.room.code);
      set({
        room: res.room,
        currentMember: res.member,
        isLoading: false,
      });
      return res;
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'JOIN_ROOM_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  fetchRoom: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const roomData = await roomApi.getRoom(roomId);
      let me: Member | null = null;
      try {
        me = await roomApi.getCurrentMember();
      } catch {
        // me can be null if unauthorized
      }

      set({
        room: roomData,
        members: roomData.members || [],
        totalPlaces: roomData.total_places || 0,
        currentMember: me,
        isLoading: false,
      });
    } catch (err: unknown) {
      const errorMsg =
        errorKey(err, 'LOAD_ROOM_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  updateRoom: async (roomId, data) => {
    const room = await roomApi.updateRoom(roomId, data);
    set({ room });
    return room;
  },
  setRoom: (room) =>
    set((state) => ({
      room: room ? (state.room ? { ...state.room, ...room } : (room as Room)) : null,
    })),
  setMembers: (members) => set({ members }),
  addMember: (member) =>
    set((state) => {
      const exists = state.members.some((m) => m.id === member.id);
      if (exists) {
        return {
          members: state.members.map((m) => (m.id === member.id ? member : m)),
        };
      }
      return { members: [...state.members, member] };
    }),
  removeMember: (memberId) =>
    set((state) => ({
      members: state.members.filter((m) => m.id !== memberId),
    })),
  setCurrentMember: (currentMember) => set({ currentMember }),
  reset: () =>
    set({
      room: null,
      members: [],
      currentMember: null,
      totalPlaces: 0,
      isLoading: false,
      error: null,
    }),
}));
