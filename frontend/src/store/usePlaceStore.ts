import { create } from 'zustand';
import { placeApi } from '../services/api/placeApi';
import { voteApi } from '../services/api/voteApi';
import type {
  CreatePlaceRequest,
  Place,
  PlaceCategory,
  Poi,
  ResolveVotingRequest,
  ResolveVotingResponse,
  VoteValue,
} from '../types';
import { errorKey } from '../i18n/serverText';

interface PlaceState {
  places: Place[];
  isLoading: boolean;
  error: string | null;
  selectedCategory: PlaceCategory | 'ALL';

  // Actions
  fetchPlaces: (roomId: string) => Promise<void>;
  addPlace: (roomId: string, data: CreatePlaceRequest) => Promise<Place>;
  addPlaceFromPoi: (roomId: string, poi: Poi) => Promise<Place>;
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
  upsertPlace: (place: Partial<Place> & { id: string }) => void;
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
        errorKey(err, 'LOAD_PLACES_FAILED');
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
        errorKey(err, 'ADD_PLACE_FAILED');
      set({ error: errorMsg, isLoading: false });
      throw err;
    }
  },

  addPlaceFromPoi: async (roomId: string, poi: Poi) => {
    // Nếu quán đã có trong store theo external_id
    const existing = get().places.find((p) => p.external_id === poi.external_id);
    if (existing) {
      return existing;
    }

    const payload: CreatePlaceRequest = {
      name: poi.name,
      address: poi.address ?? undefined,
      latitude: poi.lat,
      longitude: poi.lng,
      category: poi.category,
      source: 'OSM',
      external_id: poi.external_id,
      cuisine: poi.cuisine ?? undefined,
      opening_hours_raw: poi.opening_hours_raw ?? undefined,
      open_minute: poi.open_minute ?? undefined,
      close_minute: poi.close_minute ?? undefined,
      coords_source: 'osm',
    };

    try {
      return await get().addPlace(roomId, payload);
    } catch (err: unknown) {
      const errorObj = err as {
        code?: string;
        message?: string;
        details?: { place_id?: string };
      };
      if (errorObj?.code === 'PLACE_ALREADY_ADDED' && errorObj.details?.place_id) {
        let found = get().places.find((p) => p.id === errorObj.details?.place_id);
        if (!found) {
          try {
            await get().fetchPlaces(roomId);
            found = get().places.find((p) => p.id === errorObj.details?.place_id);
          } catch {
            // ignore
          }
        }
        if (found) return found;
      }
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
        errorKey(err, 'UPDATE_PLACE_FAILED');
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
        errorKey(err, 'DELETE_PLACE_FAILED');
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
        errorKey(err, 'VOTE_FAILED');
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
        errorKey(err, 'UNVOTE_FAILED');
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
        errorKey(err, 'RESOLVE_VOTING_FAILED');
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
          places: state.places.map((p) => {
            if (p.id !== place.id) return p;
            return {
              ...p,
              ...place,
              upvotes: place.upvotes !== undefined ? place.upvotes : (p.upvotes ?? 0),
              downvotes: place.downvotes !== undefined ? place.downvotes : (p.downvotes ?? 0),
              score: place.score !== undefined ? place.score : (p.score ?? 0),
              current_user_vote:
                place.current_user_vote !== undefined
                  ? place.current_user_vote
                  : (p.current_user_vote ?? 0),
            };
          }),
        };
      }
      const newPlace: Place = {
        name: '',
        category: 'OTHER',
        status: 'PROPOSED',
        estimated_cost: 0,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        current_user_vote: 0,
        created_at: new Date().toISOString(),
        ...place,
      } as Place;
      return { places: [newPlace, ...state.places] };
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
