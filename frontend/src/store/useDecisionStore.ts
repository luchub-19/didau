import { create } from 'zustand';
import { decisionApi } from '../services/api/decisionApi';
import { usePlaceStore } from './usePlaceStore';
import type {
  CreateDecisionRequest,
  CreateDecisionResponse,
  DeciderHint,
  DecisionMode,
  DecisionProgressPayload,
  DecisionResolvedPayload,
  DecisionSession,
  DecisionStartedPayload,
  ScoredPick,
} from '../types';

export interface DecisionState {
  hints: DeciderHint[];
  smartPicks: ScoredPick[];
  isLoadingHints: boolean;
  hintsError: string | null;

  // Session & Modal state
  currentSession: DecisionSession | null;
  activePickIndex: number;
  isDecideModalOpen: boolean;
  selectedMode: DecisionMode;

  // Wheel state
  isSpinning: boolean;
  wheelStopAngle: number | null;
  wheelWinnerId: string | null;
  isWeighted: boolean;
  seed: number | null;
  resultPayload: Record<string, unknown> | null;

  // Swipe / Multi-user progress
  doneMemberIds: string[];
  totalMembers: number;
  localSwipes: Record<string, boolean>;

  isSubmitting: boolean;
  actionError: string | null;

  // Actions
  fetchHints: (roomId: string) => Promise<void>;
  createDecision: (roomId: string, req: CreateDecisionRequest) => Promise<CreateDecisionResponse>;
  submitSwipe: (roomId: string, sessionId: string, placeId: string, liked: boolean) => Promise<void>;
  acceptDecision: (roomId: string, sessionId: string) => Promise<void>;
  cancelDecision: (roomId: string, sessionId: string) => Promise<void>;

  setDecideModalOpen: (open: boolean) => void;
  setSelectedMode: (mode: DecisionMode) => void;
  setActivePickIndex: (index: number) => void;
  nextPick: () => void;
  setIsWeighted: (weighted: boolean) => void;
  setIsSpinning: (spinning: boolean) => void;
  setLocalSwipes: (swipes: Record<string, boolean>) => void;

  // WS Event Handlers
  handleDecisionStarted: (payload: DecisionStartedPayload) => void;
  handleDecisionProgress: (payload: DecisionProgressPayload) => void;
  handleDecisionResolved: (payload: DecisionResolvedPayload) => void;

  reset: () => void;
}

export const useDecisionStore = create<DecisionState>((set, get) => ({
  hints: [],
  smartPicks: [],
  isLoadingHints: false,
  hintsError: null,

  currentSession: null,
  activePickIndex: 0,
  isDecideModalOpen: false,
  selectedMode: 'SMART',

  isSpinning: false,
  wheelStopAngle: null,
  wheelWinnerId: null,
  isWeighted: false,
  seed: null,
  resultPayload: null,

  doneMemberIds: [],
  totalMembers: 0,
  localSwipes: {},

  isSubmitting: false,
  actionError: null,

  fetchHints: async (roomId: string) => {
    if (!roomId) return;
    set({ isLoadingHints: true, hintsError: null });
    try {
      const res = await decisionApi.getHints(roomId);
      set({
        hints: res.hints || [],
        smartPicks: res.smart_picks || [],
        isLoadingHints: false,
        activePickIndex: 0,
      });
    } catch (err: unknown) {
      set({
        isLoadingHints: false,
        hintsError: (err as { message?: string })?.message || 'Không thể tải gợi ý chọn hộ',
      });
    }
  },

  createDecision: async (roomId: string, req: CreateDecisionRequest) => {
    set({ isSubmitting: true, actionError: null });
    try {
      const res = await decisionApi.createDecision(roomId, req);
      const stopAngle = (res.result_payload?.stop_angle_deg as number) ?? null;
      set({
        currentSession: res.session,
        seed: res.seed,
        wheelWinnerId: res.result_place_id ?? null,
        wheelStopAngle: stopAngle,
        resultPayload: res.result_payload ?? null,
        isSubmitting: false,
        isSpinning: req.mode === 'WHEEL',
        selectedMode: req.mode,
        localSwipes: {},
        doneMemberIds: [],
      });
      return res;
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Không thể tạo phiên chọn hộ';
      set({ isSubmitting: false, actionError: message });
      throw err;
    }
  },

  submitSwipe: async (roomId: string, sessionId: string, placeId: string, liked: boolean) => {
    try {
      await decisionApi.submitSwipe(roomId, sessionId, { place_id: placeId, liked });
      set((state) => ({
        localSwipes: { ...state.localSwipes, [placeId]: liked },
      }));
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Không thể quẹt thẻ';
      set({ actionError: message });
      throw err;
    }
  },

  acceptDecision: async (roomId: string, sessionId: string) => {
    set({ isSubmitting: true, actionError: null });
    try {
      const res = await decisionApi.acceptDecision(roomId, sessionId);
      set({
        currentSession: res.session,
        isSubmitting: false,
        isDecideModalOpen: false,
      });
      if (res.resolved_place) {
        usePlaceStore.getState().upsertPlace(res.resolved_place);
      }
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Không thể chốt kết quả';
      set({ isSubmitting: false, actionError: message });
      throw err;
    }
  },

  cancelDecision: async (roomId: string, sessionId: string) => {
    set({ isSubmitting: true, actionError: null });
    try {
      const res = await decisionApi.cancelDecision(roomId, sessionId);
      set({
        currentSession: res.session,
        isSubmitting: false,
        isSpinning: false,
        isDecideModalOpen: false,
      });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message || 'Không thể hủy phiên';
      set({ isSubmitting: false, actionError: message });
      throw err;
    }
  },

  setDecideModalOpen: (open: boolean) => set({ isDecideModalOpen: open }),
  setSelectedMode: (mode: DecisionMode) => set({ selectedMode: mode }),
  setActivePickIndex: (index: number) => set({ activePickIndex: index }),

  nextPick: () => {
    const { smartPicks, activePickIndex } = get();
    if (smartPicks.length <= 1) return;
    const nextIdx = (activePickIndex + 1) % smartPicks.length;
    set({ activePickIndex: nextIdx });
  },

  setIsWeighted: (weighted: boolean) => set({ isWeighted: weighted }),
  setIsSpinning: (spinning: boolean) => set({ isSpinning: spinning }),
  setLocalSwipes: (swipes: Record<string, boolean>) => set({ localSwipes: swipes }),

  handleDecisionStarted: (payload: DecisionStartedPayload) => {
    const current = get().currentSession;
    const updatedSession: DecisionSession = {
      id: payload.session_id,
      room_id: current?.room_id || '',
      mode: payload.mode,
      status: 'OPEN',
      category: current?.category ?? null,
      candidate_place_ids: payload.candidate_place_ids,
      seed: payload.seed,
      result_place_id: payload.result_place_id ?? null,
      result_payload: payload.result_payload ?? null,
      created_by_id: current?.created_by_id || '',
      created_at: current?.created_at || new Date().toISOString(),
      closes_at: payload.closes_at ?? (payload.mode === 'SWIPE' ? new Date(Date.now() + 90000).toISOString() : null),
    };

    const stopAngle = (payload.result_payload?.stop_angle_deg as number) ?? null;

    set({
      currentSession: updatedSession,
      selectedMode: payload.mode,
      isDecideModalOpen: true,
      wheelWinnerId: payload.result_place_id ?? null,
      wheelStopAngle: stopAngle,
      seed: payload.seed,
      resultPayload: payload.result_payload ?? null,
      isSpinning: payload.mode === 'WHEEL',
      localSwipes: {},
      doneMemberIds: [],
    });
  },

  handleDecisionProgress: (payload: DecisionProgressPayload) => {
    set({
      doneMemberIds: payload.done_member_ids,
      totalMembers: payload.total_members,
    });
  },

  handleDecisionResolved: (payload: DecisionResolvedPayload) => {
    const current = get().currentSession;
    if (current && current.id === payload.session_id) {
      set({
        currentSession: {
          ...current,
          status: payload.status,
          result_place_id: payload.result_place_id,
        },
        wheelWinnerId: payload.result_place_id,
        isSpinning: false,
      });
    }
  },

  reset: () =>
    set({
      hints: [],
      smartPicks: [],
      isLoadingHints: false,
      hintsError: null,
      currentSession: null,
      activePickIndex: 0,
      isDecideModalOpen: false,
      selectedMode: 'SMART',
      isSpinning: false,
      wheelStopAngle: null,
      wheelWinnerId: null,
      isWeighted: false,
      seed: null,
      resultPayload: null,
      doneMemberIds: [],
      totalMembers: 0,
      localSwipes: {},
      isSubmitting: false,
      actionError: null,
    }),
}));
