import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Button } from '../common/Button';
import type { DecisionSession, Place } from '../../types';

export interface SwipeDeckProps {
  roomId: string;
  isHost: boolean;
  places?: Place[];
  session?: DecisionSession | null;
  doneMemberIds?: string[];
  totalMembers?: number;
  localSwipes?: Record<string, boolean>;
  onSubmitSwipe?: (placeId: string, liked: boolean) => Promise<void>;
  onStartSession?: () => Promise<void>;
  onAcceptWinner?: () => Promise<void>;
  onCancelSession?: () => Promise<void>;
}

export const SwipeDeck: React.FC<SwipeDeckProps> = ({
  roomId,
  isHost,
  places: propPlaces,
  session: propSession,
  doneMemberIds: propDoneMemberIds,
  totalMembers: propTotalMembers,
  localSwipes: propLocalSwipes,
  onSubmitSwipe,
  onStartSession,
  onAcceptWinner,
  onCancelSession,
}) => {
  // Store fallback hooks
  const storeSession = useDecisionStore((s) => s.currentSession);
  const storeDoneMemberIds = useDecisionStore((s) => s.doneMemberIds);
  const storeTotalMembers = useDecisionStore((s) => s.totalMembers);
  const storeLocalSwipes = useDecisionStore((s) => s.localSwipes);
  const storePlaces = usePlaceStore((s) => s.places);

  const createDecision = useDecisionStore((s) => s.createDecision);
  const submitSwipe = useDecisionStore((s) => s.submitSwipe);
  const acceptDecision = useDecisionStore((s) => s.acceptDecision);
  const cancelDecision = useDecisionStore((s) => s.cancelDecision);
  const isSubmitting = useDecisionStore((s) => s.isSubmitting);

  const session = propSession !== undefined ? propSession : storeSession;
  const places = propPlaces !== undefined ? propPlaces : storePlaces;
  const doneMemberIds = propDoneMemberIds !== undefined ? propDoneMemberIds : storeDoneMemberIds;
  const totalMembers = propTotalMembers !== undefined ? propTotalMembers : storeTotalMembers;
  const localSwipes = propLocalSwipes !== undefined ? propLocalSwipes : storeLocalSwipes;

  // Active candidates for swiping
  const candidates = useMemo(() => {
    if (session && session.candidate_place_ids && session.candidate_place_ids.length > 0) {
      const idMap = new Map(places.map((p) => [p.id, p]));
      return session.candidate_place_ids
        .map((id) => idMap.get(id))
        .filter((p): p is Place => p !== undefined);
    }
    return places.filter(
      (p) => p.status !== 'REJECTED' && p.status !== 'VISITED',
    );
  }, [session, places]);

  // Current candidate index (first unswiped)
  const [internalCardIndex, setInternalCardIndex] = useState(0);

  // Sync index with localSwipes
  const currentCardIndex = useMemo(() => {
    if (candidates.length > 0 && candidates.every((c) => c.id in localSwipes)) {
      return candidates.length;
    }
    const unswipedIdx = candidates.findIndex((c) => !(c.id in localSwipes));
    if (unswipedIdx !== -1) return unswipedIdx;
    return Math.min(internalCardIndex, candidates.length);
  }, [candidates, localSwipes, internalCardIndex]);

  // Pointer drag state
  const [dragState, setDragState] = useState({
    isDragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  // Countdown timer state
  const calculateRemainingSeconds = useCallback(() => {
    if (!session?.closes_at) return 90;
    const diff = Math.floor((new Date(session.closes_at).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  }, [session?.closes_at]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(calculateRemainingSeconds());

  useEffect(() => {
    if (session?.status !== 'OPEN' || session.mode !== 'SWIPE') {
      return;
    }
    setRemainingSeconds(calculateRemainingSeconds());
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status, session?.mode, calculateRemainingSeconds]);

  const isExpired = remainingSeconds <= 0 && session?.status === 'OPEN';
  const isSessionOpen = session?.status === 'OPEN' && session.mode === 'SWIPE' && !isExpired;
  const isSessionResolved = session?.status === 'RESOLVED' || (session?.mode === 'SWIPE' && !!session?.result_place_id);

  // Swipe Action
  const handleSwipe = useCallback(
    async (liked: boolean) => {
      if (!isSessionOpen || currentCardIndex >= candidates.length) return;
      const currentPlace = candidates[currentCardIndex];
      if (!currentPlace) return;

      setInternalCardIndex((prev) => prev + 1);

      if (onSubmitSwipe) {
        await onSubmitSwipe(currentPlace.id, liked);
      } else if (session?.id) {
        try {
          await submitSwipe(roomId, session.id, currentPlace.id, liked);
        } catch {
          // handled in store
        }
      }
    },
    [isSessionOpen, currentCardIndex, candidates, onSubmitSwipe, session?.id, submitSwipe, roomId],
  );

  // Keyboard navigation: ArrowLeft (dislike) & ArrowRight (like)
  useEffect(() => {
    if (!isSessionOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSwipe(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSwipe(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionOpen, handleSwipe]);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isSessionOpen || currentCardIndex >= candidates.length) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragState({
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: 0,
      offsetY: 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.isDragging) return;
    const offsetX = e.clientX - dragState.startX;
    const offsetY = e.clientY - dragState.startY;
    setDragState((prev) => ({
      ...prev,
      offsetX,
      offsetY,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.isDragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const currentOffset = dragState.offsetX;
    setDragState({
      isDragging: false,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    });

    if (currentOffset > 75) {
      handleSwipe(true);
    } else if (currentOffset < -75) {
      handleSwipe(false);
    }
  };

  const handlePointerCancel = () => {
    setDragState({
      isDragging: false,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    });
  };

  // Host Start Session
  const handleStartSession = async () => {
    if (onStartSession) {
      await onStartSession();
      return;
    }
    await createDecision(roomId, {
      mode: 'SWIPE',
      candidate_place_ids: candidates.map((p) => p.id),
    });
  };

  // Host Accept Winner
  const handleAccept = async () => {
    if (!session?.id) return;
    if (onAcceptWinner) {
      await onAcceptWinner();
      return;
    }
    await acceptDecision(roomId, session.id);
  };

  // Host Cancel Session
  const handleCancel = async () => {
    if (!session?.id) return;
    if (onCancelSession) {
      await onCancelSession();
      return;
    }
    await cancelDecision(roomId, session.id);
  };

  // Winner place resolution
  const winnerPlace = useMemo(() => {
    if (!session?.result_place_id) return null;
    return places.find((p) => p.id === session.result_place_id) || null;
  }, [session?.result_place_id, places]);

  // Format countdown mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentPlace = candidates[currentCardIndex];
  const allCardsSwiped = isSessionOpen && currentCardIndex >= candidates.length;
  const progressRatio = totalMembers > 0 ? doneMemberIds.length / totalMembers : 0;

  return (
    <div data-testid="swipe-deck-container" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>👆 Chế độ Quẹt thẻ nhóm</span>
            <span className="text-[10px] text-slate-400 font-semibold">(Task T-33)</span>
          </h3>
          <p className="text-xs text-slate-500">
            Quẹt phải thích (💚) hoặc trái thôi (❌) để nhóm cùng tìm ra quán ăn chân ái
          </p>
        </div>

        {/* Live Countdown Badge */}
        {session?.status === 'OPEN' && session.mode === 'SWIPE' && (
          <div
            data-testid="swipe-countdown"
            className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 shadow-xs ${
              remainingSeconds <= 15
                ? 'bg-rose-100 text-rose-700 animate-pulse'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }`}
          >
            <span>⏱️</span>
            <span>{formatTime(remainingSeconds)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar (x/y người xong) */}
      {session?.status === 'OPEN' && session.mode === 'SWIPE' && (
        <div className="space-y-1.5 bg-slate-100/70 p-3 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span data-testid="swipe-progress-text">
              👥 <strong>{doneMemberIds.length}</strong>/{totalMembers || 1} người đã xong
            </span>
            <span data-testid="swipe-card-counter" className="font-semibold text-slate-700">
              {Math.min(currentCardIndex + 1, candidates.length)} / {candidates.length} quán
            </span>
          </div>
          <div
            data-testid="swipe-progress-bar"
            className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.round(progressRatio * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* 1. STATE: Expired Banner */}
      {isExpired && !isSessionResolved && (
        <div
          data-testid="swipe-expired-alert"
          className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center space-y-2"
        >
          <div className="text-2xl">⏰</div>
          <h4 className="text-sm font-bold text-rose-800">
            Hết giờ quẹt thẻ! Phiên đã đóng (90s)
          </h4>
          <p className="text-xs text-rose-600 max-w-sm mx-auto">
            Thời gian bình chọn bằng swipe đã kết thúc. Vui lòng chờ Host tổng kết hoặc tạo phiên mới.
          </p>
          {isHost && (
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCancel}
                isLoading={isSubmitting}
              >
                Đóng phiên này
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2. STATE: Resolved Winner */}
      {isSessionResolved && (
        <div
          data-testid="swipe-resolved-winner"
          className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 text-center space-y-4 animate-fade-in"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 text-3xl shadow-xs">
            🏆
          </div>
          <div>
            <span className="text-[11px] font-black tracking-wider uppercase text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
              Kết quả Quẹt thẻ nhóm
            </span>
            <h4 className="text-xl font-black text-slate-900 mt-1.5">
              {winnerPlace ? winnerPlace.name : 'Địa điểm đã chọn'}
            </h4>
            {winnerPlace && (
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                {winnerPlace.category} • {winnerPlace.address || 'Khu vực trung tâm'}
                {winnerPlace.estimated_cost
                  ? ` • ~${winnerPlace.estimated_cost.toLocaleString('vi-VN')} đ`
                  : ''}
              </p>
            )}
          </div>

          {/* Tally details if available */}
          {session?.result_payload && (
            <div className="text-xs text-emerald-800 bg-white/80 rounded-xl p-3 max-w-xs mx-auto border border-emerald-200/60 shadow-xs">
              <p className="font-semibold">✨ Quán nhận được nhiều lượt Thích nhất!</p>
              {Boolean((session.result_payload as Record<string, unknown>)?.tally) && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tổng lượt thích: {JSON.stringify((session.result_payload as Record<string, unknown>).tally)}
                </p>
              )}
            </div>
          )}

          {/* Host Controls */}
          {isHost ? (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                data-testid="swipe-accept-btn"
                variant="primary"
                size="md"
                onClick={handleAccept}
                isLoading={isSubmitting}
                leftIcon={<span>✨</span>}
              >
                Chốt luôn quán này
              </Button>
              <Button
                data-testid="swipe-cancel-btn"
                variant="secondary"
                size="md"
                onClick={handleCancel}
                isLoading={isSubmitting}
              >
                Hủy phiên
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              Đang chờ Host xác nhận và chốt kết quả vào lịch trình...
            </p>
          )}
        </div>
      )}

      {/* 3. STATE: Active Swiping Deck */}
      {isSessionOpen && !allCardsSwiped && currentPlace && (
        <div className="flex flex-col items-center select-none py-2">
          {/* Card container */}
          <div
            data-testid="swipe-card-current"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            style={{
              transform: dragState.isDragging
                ? `translate3d(${dragState.offsetX}px, ${dragState.offsetY * 0.2}px, 0) rotate(${
                    dragState.offsetX * 0.07
                  }deg)`
                : 'translate3d(0, 0, 0) rotate(0deg)',
              transition: dragState.isDragging ? 'none' : 'transform 0.25s ease-out',
              touchAction: 'none',
              cursor: dragState.isDragging ? 'grabbing' : 'grab',
            }}
            className="relative w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-xl p-6 overflow-hidden select-none"
          >
            {/* Visual drag stamp badges */}
            {dragState.offsetX > 25 && (
              <div
                data-testid="swipe-stamp-like"
                className="absolute top-4 left-4 z-20 border-2 border-emerald-500 text-emerald-600 bg-emerald-50/90 font-black text-sm px-3 py-1 rounded-xl uppercase tracking-wider rotate-[-12deg] shadow-sm animate-fade-in"
              >
                THÍCH 💚
              </div>
            )}
            {dragState.offsetX < -25 && (
              <div
                data-testid="swipe-stamp-dislike"
                className="absolute top-4 right-4 z-20 border-2 border-rose-500 text-rose-600 bg-rose-50/90 font-black text-sm px-3 py-1 rounded-xl uppercase tracking-wider rotate-[12deg] shadow-sm animate-fade-in"
              >
                THÔI ❌
              </div>
            )}

            {/* Card Content */}
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    {currentPlace.category}
                  </span>
                  <h4 className="text-lg font-bold text-slate-900 mt-1.5 leading-snug">
                    {currentPlace.name}
                  </h4>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-amber-100/80 text-amber-800 flex items-center justify-center text-lg font-bold">
                  🍽️
                </div>
              </div>

              <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span>📍</span>
                  <span className="line-clamp-1">{currentPlace.address || 'Khu vực trung tâm'}</span>
                </div>
                {currentPlace.estimated_cost && (
                  <div className="flex items-center gap-1.5">
                    <span>💵</span>
                    <span>~{currentPlace.estimated_cost.toLocaleString('vi-VN')} đ/người</span>
                  </div>
                )}
                {currentPlace.cuisine && (
                  <div className="flex items-center gap-1.5">
                    <span>🍲</span>
                    <span>Ẩm thực: {currentPlace.cuisine}</span>
                  </div>
                )}
              </div>

              {/* Drag instruction helper */}
              <div className="text-[11px] text-center text-slate-400 italic pt-1">
                Kéo sang phải để Thích • Kéo sang trái để Thôi (hoặc dùng nút bên dưới)
              </div>
            </div>
          </div>

          {/* Desktop action buttons */}
          <div className="flex items-center gap-6 mt-5">
            <button
              type="button"
              data-testid="swipe-dislike-btn"
              onClick={() => handleSwipe(false)}
              aria-label="Thôi / Không thích"
              className="w-14 h-14 rounded-full bg-white hover:bg-rose-50 border-2 border-rose-300 text-rose-600 shadow-md flex items-center justify-center text-2xl font-bold transition-transform active:scale-95"
            >
              ❌
            </button>
            <button
              type="button"
              data-testid="swipe-like-btn"
              onClick={() => handleSwipe(true)}
              aria-label="Thích quán này"
              className="w-14 h-14 rounded-full bg-white hover:bg-emerald-50 border-2 border-emerald-400 text-emerald-600 shadow-md flex items-center justify-center text-2xl font-bold transition-transform active:scale-95"
            >
              💚
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Phím tắt: Bấm <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border text-slate-600 font-mono">←</kbd> Thôi, <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border text-slate-600 font-mono">→</kbd> Thích
          </div>
        </div>
      )}

      {/* 4. STATE: All Cards Swiped by Current Member */}
      {isSessionOpen && allCardsSwiped && (
        <div
          data-testid="swipe-all-done"
          className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-sm animate-fade-in"
        >
          <div className="text-4xl animate-bounce">🎉</div>
          <h4 className="text-base font-bold text-slate-800">
            Bạn đã quẹt xong toàn bộ địa điểm!
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Đang chờ các thành viên khác hoàn thành lượt quẹt của mình (
            <strong>{doneMemberIds.length}</strong>/{totalMembers || 1} người đã xong). Kết quả sẽ tự động hiển thị ngay khi đủ người hoặc hết 90s!
          </p>
          <div className="flex justify-center pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              <span>Đang đồng bộ realtime...</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. STATE: Not Started Session */}
      {!session || (session.status !== 'OPEN' && !isSessionResolved) ? (
        <div
          data-testid="swipe-not-started"
          className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4"
        >
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl mx-auto shadow-xs">
            👆
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">
              Bình chọn nhanh theo phong cách Swipe
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
              Mỗi thành viên trong phòng sẽ có <strong>90 giây</strong> để quẹt Thích (phải) hoặc Thôi (trái) qua danh sách {candidates.length} quán ứng viên. Quán nhiều lượt thích nhất sẽ chiến thắng!
            </p>
          </div>

          {isHost ? (
            <div className="pt-2">
              <Button
                data-testid="start-swipe-btn"
                variant="primary"
                size="md"
                onClick={handleStartSession}
                isLoading={isSubmitting}
                leftIcon={<span>🚀</span>}
              >
                Bắt đầu phiên quẹt thẻ (90s)
              </Button>
            </div>
          ) : (
            <div
              data-testid="swipe-member-waiting"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium"
            >
              <span>⏳</span>
              <span>Đang chờ Host bắt đầu phiên quẹt thẻ...</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
