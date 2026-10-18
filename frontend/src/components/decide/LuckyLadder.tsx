import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import {
  Button,
  Sheet,
  SlidersHorizontal,
  Info,
  MapPin,
  Sparkle,
  Check,
} from '../ui';
import type { DecisionSession, Member, Place } from '../../types';

export interface LuckyLadderProps {
  roomId: string;
  isHost: boolean;
  places?: Place[];
  members?: Member[];
  session?: DecisionSession | null;
  seed?: number | null;
  resultPayload?: Record<string, unknown> | null;
  onStartLadder?: (variant: 'PLACE' | 'MEMBER') => Promise<void>;
  onAcceptWinner?: () => Promise<void>;
  onCancelSession?: () => Promise<void>;
}

export interface LadderRung {
  column: number;
  height: number;
}

export interface LadderPayload {
  n_columns: number;
  height: number;
  rungs: LadderRung[];
  winning_top_column: number;
  winning_bottom_column: number;
  connections?: Record<number, number>;
  paths?: Record<number, Array<[number, number]>>;
  seed: number;
}

// PRNG tất định khớp với Python random.Random(seed)
function pseudoRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateLocalLadder(nColumns: number, seed: number, heightLevels?: number): LadderPayload {
  const n = Math.max(2, nColumns);
  const h = heightLevels || Math.max(8, n * 3);
  const rng = pseudoRandom(seed || 12345);

  const rungs: LadderRung[] = [];
  for (let level = 1; level <= h; level++) {
    let col = 0;
    while (col < n - 1) {
      if (rng() < 0.5) {
        rungs.push({ column: col, height: level });
        col += 2;
      } else {
        col += 1;
      }
    }
  }

  if (rungs.length === 0) {
    rungs.push({ column: 0, height: 1 });
  }

  // Dò đường đi
  const rungForward: Record<number, Record<number, number>> = {};
  const rungBackward: Record<number, Record<number, number>> = {};
  for (const r of rungs) {
    if (!rungForward[r.height]) rungForward[r.height] = {};
    if (!rungBackward[r.height]) rungBackward[r.height] = {};
    rungForward[r.height][r.column] = r.column + 1;
    rungBackward[r.height][r.column + 1] = r.column;
  }

  const paths: Record<number, Array<[number, number]>> = {};
  const connections: Record<number, number> = {};
  const inverseConnections: Record<number, number> = {};

  for (let startCol = 0; startCol < n; startCol++) {
    let currCol = startCol;
    const path: Array<[number, number]> = [[currCol, 0]];

    for (let level = 1; level <= h; level++) {
      const fwd = rungForward[level] || {};
      const bwd = rungBackward[level] || {};

      if (currCol in fwd) {
        path.push([currCol, level]);
        currCol = fwd[currCol];
        path.push([currCol, level]);
      } else if (currCol in bwd) {
        path.push([currCol, level]);
        currCol = bwd[currCol];
        path.push([currCol, level]);
      } else {
        path.push([currCol, level]);
      }
    }

    path.push([currCol, h + 1]);
    connections[startCol] = currCol;
    inverseConnections[currCol] = startCol;
    paths[startCol] = path;
  }

  const winningBottom = Math.floor(rng() * n);
  const winningTop = inverseConnections[winningBottom] ?? 0;

  return {
    n_columns: n,
    height: h,
    rungs,
    winning_top_column: winningTop,
    winning_bottom_column: winningBottom,
    connections,
    paths,
    seed,
  };
}

interface CandidateItem {
  id: string;
  name: string;
  subtitle?: string;
}

export const LuckyLadder: React.FC<LuckyLadderProps> = ({
  roomId,
  isHost,
  places: propPlaces,
  members: propMembers,
  session: propSession,
  seed: propSeed,
  resultPayload: propResultPayload,
  onStartLadder,
  onAcceptWinner,
  onCancelSession,
}) => {
  const { t } = useTranslation();

  // Store subscriptions
  const storeSession = useDecisionStore((s) => s.currentSession);
  const storeSeed = useDecisionStore((s) => s.seed);
  const storeResultPayload = useDecisionStore((s) => s.resultPayload);
  const storePlaces = usePlaceStore((s) => s.places);
  const storeMembers = useRoomStore((s) => s.members);

  const createDecision = useDecisionStore((s) => s.createDecision);
  const acceptDecision = useDecisionStore((s) => s.acceptDecision);
  const cancelDecision = useDecisionStore((s) => s.cancelDecision);
  const isSubmitting = useDecisionStore((s) => s.isSubmitting);

  const session = propSession !== undefined ? propSession : storeSession;
  const places = propPlaces !== undefined ? propPlaces : storePlaces;
  const members = propMembers !== undefined ? propMembers : storeMembers;
  const seed = propSeed !== undefined ? propSeed : storeSeed;
  const rawPayload = propResultPayload !== undefined ? propResultPayload : (storeResultPayload || session?.result_payload);

  // Variant: 'PLACE' (Chọn quán) vs 'MEMBER' (Chọn người quyết định)
  const [variant, setVariant] = useState<'PLACE' | 'MEMBER'>('PLACE');

  // Audit modal/sheet state
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Animation state (3-second path tracing)
  const [pathProgress, setPathProgress] = useState(1);
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLength, setPathLength] = useState(1000);

  // Reduced motion detection
  const prefersReducedMotion = useMemo(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }, []);

  // Candidate items for columns
  const candidateItems = useMemo<CandidateItem[]>(() => {
    if (variant === 'MEMBER') {
      if (members && members.length >= 2) {
        return members.slice(0, 8).map((m) => ({ id: m.id, name: m.nickname, subtitle: m.role }));
      }
      return [
        { id: '1', name: t('decide.ladder.defaultMember1'), subtitle: 'Host' },
        { id: '2', name: t('decide.ladder.defaultMember2'), subtitle: 'Member' },
      ];
    }

    const availablePlaces = session?.candidate_place_ids && session.candidate_place_ids.length > 0
      ? places.filter((p) => session.candidate_place_ids.includes(p.id))
      : places.filter((p) => p.status !== 'REJECTED' && p.status !== 'VISITED');

    const slice = availablePlaces.slice(0, 8);
    if (slice.length >= 2) {
      return slice.map((p) => ({ id: p.id, name: p.name, subtitle: p.category }));
    }
    return [
      { id: 'p1', name: 'Place A', subtitle: 'FOOD' },
      { id: 'p2', name: 'Place B', subtitle: 'DRINK' },
    ];
  }, [variant, members, places, session?.candidate_place_ids, t]);

  // Server or Local Ladder Structure
  const ladderData: LadderPayload = useMemo(() => {
    const n = candidateItems.length;
    const effectiveSeed = seed || session?.seed || 424242;

    if (rawPayload && typeof rawPayload.n_columns === 'number' && Array.isArray(rawPayload.rungs)) {
      const p = rawPayload as unknown as LadderPayload;
      if (p.paths && p.winning_top_column !== undefined) {
        return p;
      }
      return generateLocalLadder(p.n_columns, p.seed || effectiveSeed, p.height);
    }

    return generateLocalLadder(n, effectiveSeed);
  }, [rawPayload, candidateItems.length, seed, session?.seed]);

  // Check if session is resolved or open
  const isSessionActive = session?.status === 'OPEN' && session.mode === 'LADDER';
  const isSessionResolved = session?.status === 'RESOLVED' || (session?.mode === 'LADDER' && !!session?.result_place_id);

  // Trigger 3s animation when session becomes active or when ladder opens
  useEffect(() => {
    if (prefersReducedMotion) {
      setPathProgress(1);
      return;
    }

    setPathProgress(0);

    const startTime = Date.now();
    const duration = 3000;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      setPathProgress(progress);

      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [isSessionActive, isSessionResolved, ladderData.seed, prefersReducedMotion]);

  // Compute SVG Layout dimensions
  const svgWidth = Math.max(340, ladderData.n_columns * 72);
  const paddingX = 40;
  const colSpacing = (svgWidth - 2 * paddingX) / Math.max(1, ladderData.n_columns - 1);
  const yTop = 60;
  const rungSpacing = 24;
  const yBottom = yTop + (ladderData.height + 1) * rungSpacing;
  const svgHeight = yBottom + 70;

  const getColX = useCallback(
    (col: number) => paddingX + col * colSpacing,
    [paddingX, colSpacing],
  );
  const getRungY = useCallback(
    (heightLevel: number) => yTop + heightLevel * rungSpacing,
    [yTop, rungSpacing],
  );

  // Winning path points
  const winningPathCoords = useMemo(() => {
    const topCol = ladderData.winning_top_column;
    const pathPoints = ladderData.paths ? ladderData.paths[topCol] : [];
    if (!pathPoints || pathPoints.length === 0) return '';

    return pathPoints
      .map((pt, idx) => {
        const x = getColX(pt[0]);
        const y = getRungY(pt[1]);
        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [ladderData, getColX, getRungY]);

  // Update SVG Path total length
  useEffect(() => {
    if (pathRef.current) {
      try {
        const len = pathRef.current.getTotalLength();
        if (len > 0) setPathLength(len);
      } catch {
        // ignore in SSR
      }
    }
  }, [winningPathCoords]);

  // Handlers
  const handleStartLadder = async () => {
    if (onStartLadder) {
      await onStartLadder(variant);
      return;
    }
    const candidateIds = candidateItems.map((c) => c.id);
    await createDecision(roomId, {
      mode: 'LADDER',
      candidate_place_ids: variant === 'PLACE' ? candidateIds : undefined,
    });
  };

  const handleAccept = async () => {
    if (!session?.id) return;
    if (onAcceptWinner) {
      await onAcceptWinner();
      return;
    }
    await acceptDecision(roomId, session.id);
  };

  const handleCancel = async () => {
    if (!session?.id) return;
    if (onCancelSession) {
      await onCancelSession();
      return;
    }
    await cancelDecision(roomId, session.id);
  };

  // Winning candidate
  const winningCandidate = candidateItems[ladderData.winning_top_column] || candidateItems[0];
  const winningName = String(winningCandidate?.name || '');

  return (
    <div data-testid="lucky-ladder-container" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div>
          <h3 className="text-body font-bold text-ink flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-accent-text" />
            <span>{t('decide.ladder.title')}</span>
          </h3>
          <p className="text-caption text-ink-2">
            {t('decide.ladder.subtitle')}
          </p>
        </div>

        {/* Audit Button */}
        <button
          type="button"
          data-testid="ladder-audit-btn"
          onClick={() => setIsAuditModalOpen(true)}
          className="text-caption font-semibold text-accent-text hover:underline flex items-center gap-1.5"
        >
          <Info size={14} />
          <span>{t('decide.ladder.explainLink')}</span>
        </button>
      </div>

      {/* Variant Selector: Chọn quán vs Chọn người quyết định */}
      <div className="flex items-center justify-between bg-surface-2 p-1.5 rounded-card border border-line">
        <div className="text-caption font-semibold text-ink px-2">
          {t('decide.ladder.variantTitle')}
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-surface border border-line">
          <button
            type="button"
            data-testid="ladder-variant-place"
            onClick={() => setVariant('PLACE')}
            className={`px-3.5 py-2 min-h-[44px] rounded-full text-caption font-semibold transition-colors flex items-center gap-1.5 ${
              variant === 'PLACE'
                ? 'bg-accent text-ink shadow-xs'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            <MapPin size={14} />
            <span>{t('decide.ladder.variantPlace')}</span>
          </button>
          <button
            type="button"
            data-testid="ladder-variant-member"
            onClick={() => setVariant('MEMBER')}
            className={`px-3.5 py-2 min-h-[44px] rounded-full text-caption font-semibold transition-colors flex items-center gap-1.5 ${
              variant === 'MEMBER'
                ? 'bg-accent text-ink shadow-xs'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            <Sparkle size={14} />
            <span>{t('decide.ladder.variantMember')}</span>
          </button>
        </div>
      </div>

      {/* Winner Notification Banner */}
      {isSessionResolved && (
        <div
          data-testid="ladder-winner-banner"
          aria-live="polite"
          className="bg-accent-soft/40 border border-accent/40 rounded-card p-4 text-center space-y-2 animate-fade-in"
        >
          <div className="flex justify-center text-accent-text">
            <Sparkle size={32} weight="fill" />
          </div>
          <h4 className="text-title font-bold text-ink">
            {variant === 'MEMBER'
              ? t('decide.ladder.winnerMemberTitle', { name: winningName })
              : t('decide.ladder.winnerPlaceTitle', { name: winningName })}
          </h4>
          <p className="text-caption text-ink-2 max-w-sm mx-auto">
            {variant === 'MEMBER'
              ? t('decide.ladder.winnerMemberDesc', { name: winningName })
              : t('decide.ladder.winnerPlaceDesc', { name: winningName })}
          </p>

          {isHost && variant === 'PLACE' && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                data-testid="ladder-accept-btn"
                variant="primary"
                size="md"
                onClick={handleAccept}
                loading={isSubmitting}
                leftIcon={<Check size={16} />}
              >
                {t('decide.ladder.acceptWinner')}
              </Button>
              <Button
                data-testid="ladder-cancel-btn"
                variant="secondary"
                size="md"
                onClick={handleCancel}
                loading={isSubmitting}
              >
                {t('decide.ladder.cancelSession')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* SVG Ladder Board */}
      <div className="relative bg-surface rounded-card border border-line p-4 shadow-xs overflow-x-auto flex flex-col items-center">
        <svg
          data-testid="ladder-svg"
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="overflow-visible select-none"
        >
          {/* Top Headers: Candidate Names */}
          {candidateItems.map((c, i) => {
            const x = getColX(i);
            const isWinnerTop = i === ladderData.winning_top_column;
            return (
              <g key={`top-label-${c.id}-${i}`}>
                <rect
                  x={x - 32}
                  y={12}
                  width={64}
                  height={32}
                  rx={8}
                  fill={isWinnerTop && isSessionResolved ? '#FFF1EC' : '#F5F5F4'}
                  stroke={isWinnerTop && isSessionResolved ? '#FF6B4A' : '#E7E5E4'}
                  strokeWidth={isWinnerTop && isSessionResolved ? 2 : 1}
                />
                <text
                  x={x}
                  y={28}
                  textAnchor="middle"
                  className="text-[11px] font-semibold"
                  fill="#1C1917"
                >
                  {c.name.length > 7 ? `${c.name.slice(0, 7)}…` : c.name}
                </text>
                <text
                  x={x}
                  y={39}
                  textAnchor="middle"
                  className="text-[8px] font-medium"
                  fill="#57534E"
                >
                  {c.subtitle || ''}
                </text>
              </g>
            );
          })}

          {/* Vertical Columns (line token) */}
          {Array.from({ length: ladderData.n_columns }).map((_, col) => {
            const x = getColX(col);
            return (
              <line
                key={`col-${col}`}
                data-testid={`ladder-col-${col}`}
                x1={x}
                y1={yTop}
                x2={x}
                y2={yBottom}
                stroke="#E7E5E4"
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Horizontal Rungs (line token) */}
          {ladderData.rungs.map((r, idx) => {
            const x1 = getColX(r.column);
            const x2 = getColX(r.column + 1);
            const y = getRungY(r.height);
            return (
              <line
                key={`rung-${idx}`}
                data-testid={`ladder-rung-${idx}`}
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke="#D6D3D1"
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Winning Path Overlay (accent token #FF6B4A) */}
          {winningPathCoords && (
            <path
              ref={pathRef}
              data-testid="ladder-winning-path"
              d={winningPathCoords}
              fill="none"
              stroke="#FF6B4A"
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={pathLength}
              strokeDashoffset={pathLength * (1 - pathProgress)}
              style={{
                transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.05s linear',
              }}
            />
          )}

          {/* Bottom Markers: Target Prize & Others */}
          {Array.from({ length: ladderData.n_columns }).map((_, col) => {
            const x = getColX(col);
            const isWinningBottom = col === ladderData.winning_bottom_column;
            return (
              <g key={`bottom-${col}`}>
                <circle
                  cx={x}
                  cy={yBottom + 26}
                  r={16}
                  fill={isWinningBottom ? '#FFF1EC' : '#F5F5F4'}
                  stroke={isWinningBottom ? '#FF6B4A' : '#E7E5E4'}
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={yBottom + 31}
                  textAnchor="middle"
                  className="text-xs font-bold"
                  fill={isWinningBottom ? '#FF6B4A' : '#78716C'}
                >
                  {isWinningBottom ? '★' : '•'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Path tracing status caption */}
        <div className="text-[11px] text-ink-3 mt-2 flex items-center gap-1.5" aria-live="polite">
          <Info size={14} />
          <span>
            {pathProgress < 1
              ? t('decide.ladder.tracing')
              : t('decide.ladder.traceEnded', { column: ladderData.winning_bottom_column + 1 })}
          </span>
        </div>
      </div>

      {/* Host / Member Action Controls */}
      <div className="flex items-center justify-center gap-3 pt-1">
        {isHost ? (
          <Button
            data-testid="start-ladder-btn"
            variant="primary"
            size="md"
            onClick={handleStartLadder}
            loading={isSubmitting}
            leftIcon={<SlidersHorizontal size={18} />}
          >
            {isSessionResolved ? t('decide.ladder.startAgain') : t('decide.ladder.start')}
          </Button>
        ) : (
          <div
            data-testid="ladder-member-waiting"
            aria-live="polite"
            className="text-caption text-ink-3 italic bg-surface-2 px-4 py-2 rounded-full border border-line"
          >
            {t('decide.ladder.waitingHost')}
          </div>
        )}
      </div>

      {/* Fairness & Seed Audit Sheet */}
      <Sheet
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title={t('decide.ladder.audit.title')}
        description={t('decide.ladder.audit.desc')}
        closeLabel={t('decide.modal.close')}
      >
        <div className="space-y-4 text-caption text-ink-2">
          <div className="bg-surface-2 p-3.5 rounded-field border border-line space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="font-semibold text-ink-2">{t('decide.ladder.audit.serverSeed')}</span>
              <code data-testid="ladder-audit-seed" className="font-mono text-accent-text font-bold">
                {ladderData.seed}
              </code>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-ink-2">{t('decide.ladder.audit.columnsCount')}</span>
              <span className="tabular-nums font-medium text-ink">{ladderData.n_columns}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-ink-2">{t('decide.ladder.audit.rungsCount')}</span>
              <span className="tabular-nums font-medium text-ink">{ladderData.rungs.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-ink-2">{t('decide.ladder.audit.winningTop')}</span>
              <span className="font-bold text-accent-text">
                {t('decide.ladder.audit.columnNumber', { number: ladderData.winning_top_column + 1 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-ink-2">{t('decide.ladder.audit.winningBottom')}</span>
              <span className="font-bold text-accent-text">
                {t('decide.ladder.audit.columnNumber', { number: ladderData.winning_bottom_column + 1 })}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsAuditModalOpen(false)}
              className="w-full"
            >
              {t('decide.ladder.audit.understand')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
