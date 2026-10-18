import { useEffect, useRef, useState, useCallback } from 'react';
import { tokenStorage } from '../services/storage/tokenStorage';
import { WebSocketClient } from '../services/websocket/wsClient';
import type { WsConnectionStatus } from '../services/websocket/wsTypes';
import { useConflictStore } from '../store/useConflictStore';
import { usePlaceStore } from '../store/usePlaceStore';
import { useRoomStore } from '../store/useRoomStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useDecisionStore } from '../store/useDecisionStore';
import type {
  ConflictsUpdatedPayload,
  DecisionProgressPayload,
  DecisionResolvedPayload,
  DecisionStartedPayload,
  MemberJoinedPayload,
  MemberLeftPayload,
  PlaceAddedPayload,
  PlaceDeletedPayload,
  PlaceUpdatedPayload,
  RoomStateSyncPayload,
  RoomUpdatedPayload,
  ScheduleUpdatedPayload,
  VoteUpdatedPayload,
  VotingResolvedPayload,
} from '../types';
import { WS_BASE } from '../config';

export function getWsUrl(roomId: string, token: string): string {
  return `${WS_BASE}/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
}

export function useWebSocket(roomId?: string) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WsConnectionStatus>('CLOSED');
  const [isTypingMember, setIsTypingMember] = useState<{ nickname: string; isTyping: boolean } | null>(null);

  // Store actions
  const addMember = useRoomStore((s) => s.addMember);
  const removeMember = useRoomStore((s) => s.removeMember);
  const setRoom = useRoomStore((s) => s.setRoom);
  const setMembers = useRoomStore((s) => s.setMembers);

  const upsertPlace = usePlaceStore((s) => s.upsertPlace);
  const removePlace = usePlaceStore((s) => s.removePlace);
  const updatePlaceVote = usePlaceStore((s) => s.updatePlaceVote);
  const setPlaces = usePlaceStore((s) => s.setPlaces);

  const setScheduleItems = useScheduleStore((s) => s.setItems);
  const setConflicts = useConflictStore((s) => s.setConflicts);

  useEffect(() => {
    if (!roomId) return;

    const token = tokenStorage.getToken();
    if (!token) return;

    const wsUrl = getWsUrl(roomId, token);
    const client = new WebSocketClient(wsUrl);
    clientRef.current = client;

    // Listen to status changes
    const unsubStatus = client.onStatusChange((status) => {
      setConnectionStatus(status);
      // Server chỉ gửi ROOM_STATE_SYNC khi nhận SUBSCRIBE_ROOM: xin đồng bộ mỗi lần (re)connect
      if (status === 'OPEN') client.send('SUBSCRIBE_ROOM', { room_id: roomId });
    });

    // Subscriptions to domain events
    const unsubRoomSync = client.on<RoomStateSyncPayload>('ROOM_STATE_SYNC', (payload) => {
      if (payload.room) setRoom(payload.room);
      if (payload.members) setMembers(payload.members);
      if (payload.places) setPlaces(payload.places);
      if (payload.schedule) setScheduleItems(payload.schedule);
      if (payload.conflicts) setConflicts(payload.conflicts);
    });

    const unsubRoomUpdated = client.on<RoomUpdatedPayload>('ROOM_UPDATED', (payload) => {
      if (payload.room) setRoom(payload.room);
    });

    const unsubMemberJoined = client.on<MemberJoinedPayload>('MEMBER_JOINED', (payload) => {
      if (payload.member) addMember(payload.member);
    });

    const unsubMemberLeft = client.on<MemberLeftPayload>('MEMBER_LEFT', (payload) => {
      if (payload.member_id) removeMember(payload.member_id);
    });

    const unsubPlaceAdded = client.on<PlaceAddedPayload>('PLACE_ADDED', (payload) => {
      if (payload.place) {
        upsertPlace(payload.place);
        useDecisionStore.getState().fetchHints(roomId);
      }
    });

    const unsubPlaceUpdated = client.on<PlaceUpdatedPayload>('PLACE_UPDATED', (payload) => {
      if (payload.place) {
        upsertPlace(payload.place);
        useDecisionStore.getState().fetchHints(roomId);
      }
    });

    const unsubPlaceDeleted = client.on<PlaceDeletedPayload>('PLACE_DELETED', (payload) => {
      if (payload.place_id) {
        removePlace(payload.place_id);
        useDecisionStore.getState().fetchHints(roomId);
      }
    });

    const unsubVoteUpdated = client.on<VoteUpdatedPayload>('VOTE_UPDATED', (payload) => {
      if (payload.place_id) {
        updatePlaceVote(
          payload.place_id,
          payload.upvotes,
          payload.downvotes,
          payload.score,
          payload.current_user_vote,
        );
        useDecisionStore.getState().fetchHints(roomId);
      }
    });

    const unsubVotingResolved = client.on<VotingResolvedPayload>('VOTING_RESOLVED', (payload) => {
      if (payload.accepted_place_ids) {
        const acceptedSet = new Set(payload.accepted_place_ids);
        const currentPlaces = usePlaceStore.getState().places;
        currentPlaces.forEach((p) => {
          if (acceptedSet.has(p.id)) {
            upsertPlace({ ...p, status: 'ACCEPTED' });
          }
        });
      }
      const currentRoom = useRoomStore.getState().room;
      if (currentRoom) {
        setRoom({
          ...currentRoom,
          status: 'FINALIZED',
          tie_break_strategy: payload.strategy ?? 'GROUP_DECISION',
        });
      }
    });

    const unsubScheduleUpdated = client.on<ScheduleUpdatedPayload>('SCHEDULE_UPDATED', (payload) => {
      if (payload.items) setScheduleItems(payload.items);
    });

    const unsubConflictsUpdated = client.on<ConflictsUpdatedPayload>('CONFLICTS_UPDATED', (payload) => {
      if (payload.conflicts) setConflicts(payload.conflicts);
    });

    const unsubTyping = client.on<{ is_typing: boolean; nickname: string }>('TYPING_PLACE', (payload) => {
      setIsTypingMember({ nickname: payload.nickname, isTyping: payload.is_typing });
      if (payload.is_typing) {
        setTimeout(() => setIsTypingMember(null), 3000);
      }
    });

    const unsubDecisionStarted = client.on<DecisionStartedPayload>('DECISION_STARTED', (payload) => {
      useDecisionStore.getState().handleDecisionStarted(payload);
    });

    const unsubDecisionProgress = client.on<DecisionProgressPayload>('DECISION_PROGRESS', (payload) => {
      useDecisionStore.getState().handleDecisionProgress(payload);
    });

    const unsubDecisionResolved = client.on<DecisionResolvedPayload>('DECISION_RESOLVED', (payload) => {
      useDecisionStore.getState().handleDecisionResolved(payload);
      if (payload.result_place_id && payload.status === 'RESOLVED') {
        const currentPlaces = usePlaceStore.getState().places;
        const target = currentPlaces.find((p) => p.id === payload.result_place_id);
        if (target) {
          upsertPlace({ ...target, status: 'ACCEPTED' });
        }
      }
    });

    client.connect();

    return () => {
      unsubStatus();
      unsubRoomSync();
      unsubRoomUpdated();
      unsubMemberJoined();
      unsubMemberLeft();
      unsubPlaceAdded();
      unsubPlaceUpdated();
      unsubPlaceDeleted();
      unsubVoteUpdated();
      unsubVotingResolved();
      unsubScheduleUpdated();
      unsubConflictsUpdated();
      unsubTyping();
      unsubDecisionStarted();
      unsubDecisionProgress();
      unsubDecisionResolved();
      client.disconnect();
      clientRef.current = null;
    };
  }, [
    roomId,
    setRoom,
    setMembers,
    addMember,
    removeMember,
    upsertPlace,
    removePlace,
    updatePlaceVote,
    setPlaces,
    setScheduleItems,
    setConflicts,
  ]);

  const sendTyping = useCallback((isTyping: boolean, nickname: string) => {
    clientRef.current?.send('TYPING_PLACE', { is_typing: isTyping, nickname });
  }, []);

  const subscribeRoom = useCallback((targetRoomId: string) => {
    clientRef.current?.send('SUBSCRIBE_ROOM', { room_id: targetRoomId });
  }, []);

  const ping = useCallback(() => {
    clientRef.current?.send('PING', {});
  }, []);

  return {
    connectionStatus,
    isConnected: connectionStatus === 'OPEN',
    isTypingMember,
    sendTyping,
    subscribeRoom,
    ping,
  };
}
