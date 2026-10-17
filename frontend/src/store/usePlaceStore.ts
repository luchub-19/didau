import { create } from 'zustand';
import { placeApi } from '../services/api/placeApi';
import { voteApi } from '../services/api/voteApi';
import type {
  CreatePlaceRequest,
  Place,
  PlaceCategory,
  ResolveVotingRequest,
  ResolveVotingResponse,
  VoteValue,
} from '../types';

interface PlaceState {
  places: Place[];
  isLoading: boolean;
  error: string | null;
  selectedCategory: PlaceCategory | 'ALL';

  // Actions
  fetchPlaces: (roomId: string) => Promise<void>;
  addPlace: (roomId: string, data: CreatePlaceRequest) => Promise<Place>;
  updatePlace: (
    roomId: string,
    placeId: string,
    data: Partial<Place>,
  ) => Promise<Place>;
  deletePlace: (roomId: string, placeId: string) => Promise<void>;
  castVote: (
    roomId: string,
    placeId: string,
    voteValue: VoteValue,
  ) => Promise<void>;
  retractVote: (roomId: string, placeId: string) => Promise<void>;
  resolveVoting: (
    roomId: string,
    data: ResolveVotingRequest,
  ) => Promise<ResolveVotingResponse>;

  // Realtime updates & local state
  setPlaces: (places: Place[]) => void;
  upsertPlace: (place: Place) => void;
  removePlace: (placeId: string) => void;
  updatePlaceVote: (
    placeId: string,
    upvotes: number,
    downvotes: number,
    score: number,
    currentUserVote?: VoteValue,
  ) => void;
  setSelectedCategory: (category: PlaceCategory | 'ALL') => void;
  reset: () => void;
}

export const usePlaceStore = create<PlaceState>((set, get) => ({
  places: [],
  isLoading: false,
  error: null,
  selectedCategory: 'ALL',

  fetchPlaces: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const places = await placeApi.listPlaces(roomId);
      set({ places, isLoading: false });
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể lấy danh sách địa điểm.';
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  addPlace: async (roomId: string, data: CreatePlaceRequest) => {
    set({ isLoading: true, error: null });
    try {
      const newPlace = await placeApi.createPlace(roomId, data);
      set((state) => ({
        places: [newPlace, ...state.places.filter((p) => p.id !== newPlace.id)],
        isLoading: false,
      }));
      return newPlace;
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || 'Không thể thêm địa điểm.';
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  updatePlace: async (
    roomId: string,
    placeId: string,
    data: Partial<Place>,
  ) => {
    try {
      const updated = await placeApi.updatePlace(roomId, placeId, data);
      set((state) => ({
        places: state.places.map((p) => (p.id === placeId ? updated : p)),
      }));
      return updated;
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể cập nhật địa điểm.';
      set({ error: errorMsg });
      throw err;
    }
  },

  deletePlace: async (roomId: string, placeId: string) => {
    try {
      await placeApi.deletePlace(roomId, placeId);
      set((state) => ({
        places: state.places.filter((p) => p.id !== placeId),
      }));
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message || 'Không thể xóa địa điểm.';
      set({ error: errorMsg });
      throw err;
    }
  },

  castVote: async (roomId: string, placeId: string, voteValue: VoteValue) => {
    // Optimistic update
    const previousPlaces = get().places;
    set((state) => ({
      places: state.places.map((p) => {
        if (p.id !== placeId) return p;
        const prevVote = p.current_user_vote;
        let up = p.upvotes;
        let down = p.downvotes;
        if (prevVote === 1) up--;
        if (prevVote === -1) down--;
        if (voteValue === 1) up++;
        if (voteValue === -1) down++;
        return {
          ...p,
          upvotes: up,
          downvotes: down,
          score: up - down,
          current_user_vote: voteValue,
        };
      }),
    }));

    try {
      const res = await voteApi.castVote(roomId, placeId, voteValue);
      set((state) => ({
        places: state.places.map((p) =>
          p.id === placeId
            ? {
                ...p,
                upvotes: res.upvotes,
                downvotes: res.downvotes,
                score: res.score,
                current_user_vote: res.current_user_vote,
              }
            : p,
        ),
      }));
    } catch (err: unknown) {
      // Revert optimistic update on failure
      set({ places: previousPlaces });
      const errorMsg =
        (err as { message?: string })?.message || 'Không thể bỏ phiếu.';
      set({ error: errorMsg });
      throw err;
    }
  },

  retractVote: async (roomId: string, placeId: string) => {
    const previousPlaces = get().places;
    set((state) => ({
      places: state.places.map((p) => {
        if (p.id !== placeId) return p;
        let up = p.upvotes;
        let down = p.downvotes;
        if (p.current_user_vote === 1) up--;
        if (p.current_user_vote === -1) down--;
        return {
          ...p,
          upvotes: up,
          downvotes: down,
          score: up - down,
          current_user_vote: 0,
        };
      }),
    }));

    try {
      const res = await voteApi.retractVote(roomId, placeId);
      set((state) => ({
        places: state.places.map((p) =>
          p.id === placeId
            ? {
                ...p,
                upvotes: res.upvotes,
                downvotes: res.downvotes,
                score: res.score,
                current_user_vote: 0,
              }
            : p,
        ),
      }));
    } catch (err: unknown) {
      set({ places: previousPlaces });
      const errorMsg =
        (err as { message?: string })?.message || 'Không thể hủy phiếu bầu.';
      set({ error: errorMsg });
      throw err;
    }
  },

  resolveVoting: async (roomId: string, data: ResolveVotingRequest) => {
    set({ isLoading: true, error: null });
    try {
      const res = await voteApi.resolveVoting(roomId, data);
      const acceptedIds = new Set(res.resolved_places.map((r) => r.id));
      set((state) => ({
        places: state.places.map((p) =>
          acceptedIds.has(p.id) ? { ...p, status: 'ACCEPTED' } : p,
        ),
        isLoading: false,
      }));
      return res;
    } catch (err: unknown) {
      const errorMsg =
        (err as { message?: string })?.message ||
        'Không thể chốt kết quả bình chọn.';
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  setPlaces: (places) => set({ places }),
  upsertPlace: (place) =>
    set((state) => {
      const exists = state.places.some((p) => p.id === place.id);
      if (exists) {
        return {
          places: state.places.map((p) => (p.id === place.id ? place : p)),
        };
      }
      return { places: [place, ...state.places] };
    }),
  removePlace: (placeId) =>
    set((state) => ({
      places: state.places.filter((p) => p.id !== placeId),
    })),
  updatePlaceVote: (placeId, upvotes, downvotes, score, currentUserVote) =>
    set((state) => ({
      places: state.places.map((p) =>
        p.id === placeId
          ? {
              ...p,
              upvotes,
              downvotes,
              score,
              ...(currentUserVote !== undefined
                ? { current_user_vote: currentUserVote }
                : {}),
            }
          : p,
      ),
    })),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  reset: () =>
    set({
      places: [],
      isLoading: false,
      error: null,
      selectedCategory: 'ALL',
    }),
}));
