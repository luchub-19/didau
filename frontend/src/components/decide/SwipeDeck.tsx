import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { formatMoney } from '../../i18n/format';
import { motionAttrs, useMotionTier } from '../../motion';
import { playSound } from '../../sound';
import {
  StageDeck,
  DeckCardFace,
  DeckProgress,
  keyToVote,
  prefetchStageDeck,
} from '../../stage/deck';
import {
  Button,
  Card,
  HandSwipeLeft,
  Clock,
  Sparkle,
  ThumbsUp,
  X,
  Check,
} from '../ui';
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
  const { t } = useTranslation();

  // Store subscriptions
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

  // Lớp trình diễn (sân khấu quẹt, T-60): mức chuyển động + hướng phiếu vừa bỏ để thẻ bay đúng chiều.
  // Chống kẹt kéo (T-49: ngón thứ 2, pointercancel, blur) nằm trong stage/deck (createPointerGuard).
  const tier = useMotionTier();
  const [lastVote, setLastVote] = useState<boolean | null>(null);

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

      // Hướng phiếu cập nhật cùng lần render với chỉ số thẻ: thẻ cũ bay đúng chiều (bàn phím, nút, kéo)
      setLastVote(liked);
      setInternalCardIndex((prev) => prev + 1);
      playSound('tick');

      if (onSubmitSwipe) {
        await onSubmitSwipe(currentPlace.id, liked);
      } else if (session?.id) {
        try {
          await submitSwipe(roomId, session.id, currentPlace.id, liked);
        } catch {
          // Handled in store
        }
      }
    },
    [isSessionOpen, currentCardIndex, candidates, onSubmitSwipe, session?.id, submitSwipe, roomId],
  );

  // Keyboard navigation: ArrowLeft (dislike) & ArrowRight (like)
  useEffect(() => {
    if (!isSessionOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Đang gõ chữ hoặc chọn trong ô nhập: mũi tên là để di chuyển con trỏ, không phải vuốt thẻ
      const vote = keyToVote(e.key, e.target);
      if (vote === null) return;
      e.preventDefault();
      handleSwipe(vote);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionOpen, handleSwipe]);

  // Phiên quẹt mở: tải trước chunk sân khấu (thư viện motion) để thẻ đầu kéo được ngay
  useEffect(() => {
    if (isSessionOpen) prefetchStageDeck();
  }, [isSessionOpen]);


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
    if (!session?.id || isSubmitting) return;
    if (onAcceptWinner) {
      await onAcceptWinner();
      return;
    }
    await acceptDecision(roomId, session.id);
  };

  // Host Cancel Session
  const handleCancel = async () => {
    if (!session?.id || isSubmitting) return;
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

  // Tally breakdown parsed into structured places
  const tallyEntries = useMemo(() => {
    const rawTally = (session?.result_payload as Record<string, unknown>)?.tally;
    if (!rawTally || typeof rawTally !== 'object') return null;
    const entries = Object.entries(rawTally as Record<string, number>);
    if (entries.length === 0) return null;

    const idMap = new Map(places.map((p) => [p.id, p]));
    return entries.map(([placeId, count]) => ({
      placeId,
      name: idMap.get(placeId)?.name || placeId,
      count: Number(count),
    })).sort((a, b) => b.count - a.count);
  }, [session?.result_payload, places]);

  return (
    <div data-testid="swipe-deck-container" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div>
          <h3 className="text-body font-bold text-ink flex items-center gap-2">
            <HandSwipeLeft size={18} className="text-accent-text" />
            <span>{t('decide.swipe.title')}</span>
            <span className="text-[10px] text-ink-3 font-semibold">({t('decide.swipe.tag')})</span>
          </h3>
          <p className="text-caption text-ink-2">
            {t('decide.swipe.subtitle')}
          </p>
        </div>

        {/* Live Countdown Badge */}
        {session?.status === 'OPEN' && session.mode === 'SWIPE' && (
          <div
            data-testid="swipe-countdown"
            className={`px-3 py-1 rounded-full text-caption font-bold flex items-center gap-1.5 shadow-xs ${
              remainingSeconds <= 15
                ? 'bg-danger-soft text-danger border border-danger/30 animate-pulse'
                : 'bg-accent-soft text-accent-text border border-accent/20'
            }`}
          >
            <Clock size={14} />
            <span className="tabular-nums">{formatTime(remainingSeconds)}</span>
          </div>
        )}
      </div>

      {/* Progress Bar (x/y người xong) + "+1" bay vào khi có thêm người xong */}
      {session?.status === 'OPEN' && session.mode === 'SWIPE' && (
        <DeckProgress
          done={doneMemberIds.length}
          total={totalMembers}
          currentCard={Math.min(currentCardIndex + 1, candidates.length)}
          totalCards={candidates.length}
        />
      )}

      {/* 1. STATE: Expired Banner */}
      {isExpired && !isSessionResolved && (
        <div
          data-testid="swipe-expired-alert"
          aria-live="polite"
          className="bg-danger-soft border border-danger/30 rounded-card p-4 text-center space-y-2"
        >
          <div className="flex justify-center text-danger">
            <Clock size={32} />
          </div>
          <h4 className="text-body font-bold text-danger">
            {t('decide.swipe.expiredTitle')}
          </h4>
          <p className="text-caption text-danger/80 max-w-sm mx-auto">
            {t('decide.swipe.expiredDesc')}
          </p>
          {isHost && (
            <div className="pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handleCancel}
                loading={isSubmitting}
              >
                {t('decide.swipe.closeSession')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2. STATE: Resolved Winner */}
      {isSessionResolved && (
        <div
          data-testid="swipe-resolved-winner"
          aria-live="polite"
          className="bg-accent-soft/40 border border-accent/40 rounded-card p-6 text-center space-y-4 winner-reveal-card"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent-soft text-accent-text text-3xl shadow-xs">
            <Sparkle size={32} weight="fill" />
          </div>
          <div>
            <span className="text-caption font-bold tracking-wider uppercase text-accent-text bg-accent-soft px-3 py-1 rounded-full border border-accent/20">
              {t('decide.swipe.resultBadge')}
            </span>
            <h4 className="text-title font-bold text-ink mt-2">
              {winnerPlace?.name || t('decide.swipe.winnerPlaceDefault')}
            </h4>
            {winnerPlace && (
              <p className="text-caption text-ink-2 mt-1 max-w-md mx-auto">
                {winnerPlace.category || ''} • {winnerPlace.address || t('decide.swipe.centerArea')}
                {winnerPlace.estimated_cost
                  ? ` • ${formatMoney(winnerPlace.estimated_cost)}`
                  : ''}
              </p>
            )}
          </div>

          {/* Tally details rendered as list (thay vì JSON.stringify) */}
          {tallyEntries && (
            <div className="text-caption text-ink-2 bg-surface rounded-card p-3.5 max-w-sm mx-auto border border-line shadow-xs space-y-2">
              <p className="font-semibold text-ink flex items-center justify-center gap-1.5">
                <Sparkle size={16} className="text-accent-text" />
                <span>{t('decide.swipe.mostLiked')}</span>
              </p>
              <div className="space-y-1.5 pt-1">
                {tallyEntries.map((item) => (
                  <div
                    key={item.placeId}
                    className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-surface-2"
                  >
                    <span className="font-medium text-ink truncate max-w-[180px]">
                      {item.name}
                    </span>
                    <span className="font-bold text-accent-text tabular-nums text-caption">
                      {t('decide.swipe.likesCount', { count: item.count })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Host Controls */}
          {isHost ? (
            <div className="flex items-center justify-center gap-3 pt-2 winner-actions-in">
              <Button
                data-testid="swipe-accept-btn"
                variant="primary"
                size="md"
                onClick={handleAccept}
                loading={isSubmitting}
                leftIcon={<Check size={18} />}
              >
                {t('decide.swipe.acceptWinner')}
              </Button>
              <Button
                data-testid="swipe-cancel-btn"
                variant="secondary"
                size="md"
                onClick={handleCancel}
                loading={isSubmitting}
              >
                {t('decide.swipe.cancelSession')}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-ink-3 italic">
              {t('decide.swipe.waitingHostConfirm')}
            </p>
          )}
        </div>
      )}

      {/* 3. STATE: Active Swiping Deck — sân khấu rộng trên ≥1024px (nền Stage, 2 thẻ sau lộ mép) */}
      {isSessionOpen && !allCardsSwiped && currentPlace && (
        <div
          data-testid="swipe-stage"
          className="flex flex-col items-center select-none py-2 overflow-x-clip lg:rounded-card lg:px-10 lg:pt-10 lg:pb-6 lg:bg-[rgb(var(--stage-paper))] lg:[background-image:var(--stage-sunlight)]"
        >
          <Suspense
            fallback={
              <div
                data-testid="swipe-card-current"
                {...motionAttrs('vote.swipe')}
                className="relative w-full max-w-sm lg:max-w-md bg-surface rounded-card border border-line shadow-float p-6 overflow-hidden select-none"
              >
                <DeckCardFace place={currentPlace} />
              </div>
            }
          >
            <StageDeck
              cards={candidates.slice(currentCardIndex, currentCardIndex + 3)}
              lastVote={lastVote}
              tier={tier}
              onVote={handleSwipe}
            />
          </Suspense>

          {/* Action buttons (Luôn có nút Thôi / Thích >= 44px) */}
          <div className="flex items-center gap-6 mt-5">
            <button
              type="button"
              data-testid="swipe-dislike-btn"
              onClick={() => handleSwipe(false)}
              aria-label={t('decide.swipe.skipLabel')}
              className="w-14 h-14 min-w-[44px] min-h-[44px] rounded-full bg-surface hover:bg-danger-soft border-2 border-danger/40 text-danger shadow-xs flex items-center justify-center transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <X size={26} weight="bold" />
            </button>
            <button
              type="button"
              data-testid="swipe-like-btn"
              onClick={() => handleSwipe(true)}
              aria-label={t('decide.swipe.likeLabel')}
              className="w-14 h-14 min-w-[44px] min-h-[44px] rounded-full bg-surface hover:bg-success-soft border-2 border-success/40 text-success shadow-xs flex items-center justify-center transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text"
            >
              <ThumbsUp size={26} weight="fill" />
            </button>
          </div>
          <div className="text-[11px] text-ink-3 mt-2">
            {t('decide.swipe.keyboardShortcut')}
          </div>
        </div>
      )}

      {/* 4. STATE: All Cards Swiped by Current Member */}
      {isSessionOpen && allCardsSwiped && (
        <Card
          data-testid="swipe-all-done"
          aria-live="polite"
          className="p-8 text-center space-y-3"
        >
          <div className="flex justify-center text-accent-text">
            <Sparkle size={36} weight="fill" />
          </div>
          <h4 className="text-title font-bold text-ink">
            {t('decide.swipe.allDoneTitle')}
          </h4>
          <p className="text-caption text-ink-2 max-w-sm mx-auto">
            {t('decide.swipe.allDoneDesc', {
              done: doneMemberIds.length,
              total: totalMembers || 1,
            })}
          </p>
          <div className="flex justify-center pt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 text-ink-2 text-caption font-semibold">
              <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
              <span>{t('decide.swipe.syncing')}</span>
            </div>
          </div>
        </Card>
      )}

      {/* 5. STATE: Not Started Session */}
      {!session || (session.status !== 'OPEN' && !isSessionResolved) ? (
        <Card
          data-testid="swipe-not-started"
          className="p-8 text-center space-y-4"
        >
          <div className="w-14 h-14 rounded-full bg-surface-2 text-accent-text flex items-center justify-center mx-auto shadow-xs">
            <HandSwipeLeft size={28} />
          </div>
          <div>
            <h4 className="text-title font-bold text-ink">
              {t('decide.swipe.introTitle')}
            </h4>
            <p className="text-caption text-ink-2 max-w-sm mx-auto mt-1 leading-relaxed">
              {t('decide.swipe.introDesc', { count: candidates.length })}
            </p>
          </div>

          {isHost ? (
            <div className="pt-2">
              <Button
                data-testid="start-swipe-btn"
                variant="primary"
                size="md"
                onClick={handleStartSession}
                loading={isSubmitting}
                leftIcon={<Sparkle size={18} />}
              >
                {t('decide.swipe.startSession')}
              </Button>
            </div>
          ) : (
            <div
              data-testid="swipe-member-waiting"
              aria-live="polite"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-2 border border-line text-caption text-ink-2 font-medium"
            >
              <Clock size={16} />
              <span>{t('decide.swipe.waitingHostStart')}</span>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
};
