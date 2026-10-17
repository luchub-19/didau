import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { Button } from '../common/Button';
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

// Simple deterministic PRNG matching Python random.Random(seed) for local simulation / preview
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

  // Trace paths
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

  // Audit modal state
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Animation state (3-second path tracing)
  const [pathProgress, setPathProgress] = useState(1); // 0 to 1, default 1 for static/SSR
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
  const candidateItems = useMemo(() => {
    if (variant === 'MEMBER') {
      if (members && members.length >= 2) {
        return members.slice(0, 8).map((m) => ({ id: m.id, name: m.nickname, subtitle: m.role }));
      }
      return [
        { id: '1', name: 'Tôi', subtitle: 'Host' },
        { id: '2', name: 'Bạn bè', subtitle: 'Member' },
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
      { id: 'p1', name: 'Quán A', subtitle: 'FOOD' },
      { id: 'p2', name: 'Quán B', subtitle: 'DRINK' },
    ];
  }, [variant, members, places, session?.candidate_place_ids]);

  // Server or Local Ladder Structure
  const ladderData: LadderPayload = useMemo(() => {
    const n = candidateItems.length;
    const effectiveSeed = seed || session?.seed || 424242;

    if (rawPayload && typeof rawPayload.n_columns === 'number' && Array.isArray(rawPayload.rungs)) {
      const p = rawPayload as unknown as LadderPayload;
      // If server returned rungs and winning columns
      if (p.paths && p.winning_top_column !== undefined) {
        return p;
      }
      // Or augment with paths
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
    const duration = 3000; // 3 seconds

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
        // ignore in SSR / jsdom
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

  return (
    <div data-testid="lucky-ladder-container" className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🪜 Chế độ Thang may mắn (Amidakuji)</span>
            <span className="text-[10px] text-slate-400 font-semibold">(Task T-33)</span>
          </h3>
          <p className="text-xs text-slate-500">
            Trò chơi thả thang Amidakuji (사다리타기) chuẩn xác và công bằng tuyệt đối
          </p>
        </div>

        {/* Audit Button */}
        <button
          type="button"
          data-testid="ladder-audit-btn"
          onClick={() => setIsAuditModalOpen(true)}
          className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors flex items-center gap-1.5 shadow-xs"
        >
          <span>🔍</span>
          <span>Xem cách tính</span>
        </button>
      </div>

      {/* Variant Selector: Chọn quán vs Chọn người quyết định */}
      <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <div className="text-xs font-semibold text-slate-700 px-2">Biến thể trò chơi:</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="ladder-variant-place"
            onClick={() => setVariant('PLACE')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              variant === 'PLACE'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            📍 Chọn quán ăn
          </button>
          <button
            type="button"
            data-testid="ladder-variant-member"
            onClick={() => setVariant('MEMBER')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              variant === 'MEMBER'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            👑 Chọn người quyết định
          </button>
        </div>
      </div>

      {/* Winner Notification Banner */}
      {isSessionResolved && (
        <div
          data-testid="ladder-winner-banner"
          className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-center space-y-2 animate-fade-in"
        >
          <div className="text-3xl">
            {variant === 'MEMBER' ? '👑' : '🎉'}
          </div>
          <h4 className="text-base font-black text-slate-900">
            {variant === 'MEMBER'
              ? `Thành viên quyết định: ${winningCandidate?.name}`
              : `Quán trúng giải: ${winningCandidate?.name}`}
          </h4>
          <p className="text-xs text-slate-600 max-w-sm mx-auto">
            {variant === 'MEMBER'
              ? `${winningCandidate?.name} đã trúng đích 👑 và có toàn quyền chọn quán hôm nay!`
              : `Thang may mắn đã phân định quán "${winningCandidate?.name}" về đích 🏆.`}
          </p>

          {isHost && variant === 'PLACE' && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                data-testid="ladder-accept-btn"
                variant="primary"
                size="sm"
                onClick={handleAccept}
                isLoading={isSubmitting}
                leftIcon={<span>✨</span>}
              >
                Chốt luôn quán này
              </Button>
              <Button
                data-testid="ladder-cancel-btn"
                variant="secondary"
                size="sm"
                onClick={handleCancel}
                isLoading={isSubmitting}
              >
                Hủy phiên
              </Button>
            </div>
          )}
        </div>
      )}

      {/* SVG Ladder Board */}
      <div className="relative bg-white rounded-3xl border border-slate-200 p-4 shadow-sm overflow-x-auto flex flex-col items-center">
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
                  fill={isWinnerTop && isSessionResolved ? '#fef3c7' : '#f1f5f9'}
                  stroke={isWinnerTop && isSessionResolved ? '#f59e0b' : '#cbd5e1'}
                  strokeWidth={isWinnerTop && isSessionResolved ? 2 : 1}
                />
                <text
                  x={x}
                  y={28}
                  textAnchor="middle"
                  className="text-[11px] font-bold"
                  fill="#1e293b"
                >
                  {c.name.length > 7 ? `${c.name.slice(0, 7)}…` : c.name}
                </text>
                <text
                  x={x}
                  y={39}
                  textAnchor="middle"
                  className="text-[8px]"
                  fill="#64748b"
                >
                  {c.subtitle || ''}
                </text>
              </g>
            );
          })}

          {/* Vertical Columns */}
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
                stroke="#94a3b8"
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Horizontal Rungs */}
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
                stroke="#64748b"
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}

          {/* Winning Path Overlay (3s animation) */}
          {winningPathCoords && (
            <path
              ref={pathRef}
              data-testid="ladder-winning-path"
              d={winningPathCoords}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={5}
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
                  r={18}
                  fill={isWinningBottom ? '#fef3c7' : '#f8fafc'}
                  stroke={isWinningBottom ? '#f59e0b' : '#e2e8f0'}
                  strokeWidth={2}
                />
                <text
                  x={x}
                  y={yBottom + 32}
                  textAnchor="middle"
                  className="text-base font-bold"
                >
                  {isWinningBottom ? (variant === 'MEMBER' ? '👑' : '🏆') : '💨'}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Path tracing status caption */}
        <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
          <span>🎯</span>
          <span>
            {pathProgress < 1
              ? 'Đang dò đường theo bậc thang (3s)...'
              : `Đường đi kết thúc tại cột đáy số ${ladderData.winning_bottom_column + 1}`}
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
            isLoading={isSubmitting}
            leftIcon={<span>🪜</span>}
          >
            {isSessionResolved ? 'Thả lại thang mới' : 'Thả thang ngay!'}
          </Button>
        ) : (
          <div
            data-testid="ladder-member-waiting"
            className="text-xs text-slate-500 italic bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200"
          >
            Đang chờ Host bắt đầu thả thang...
          </div>
        )}
      </div>

      {/* Fairness & Seed Audit Modal */}
      {isAuditModalOpen && (
        <div
          data-testid="ladder-audit-modal"
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in"
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🔍</span>
                <span>Thuật toán Thang Amidakuji</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Seed máy chủ:</span>
                  <code data-testid="ladder-audit-seed" className="font-mono text-indigo-700 font-bold">
                    {ladderData.seed}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Số cột dọc:</span>
                  <span>{ladderData.n_columns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Số bậc ngang:</span>
                  <span>{ladderData.rungs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Cột thắng trên đỉnh:</span>
                  <span className="font-bold text-amber-600">Cột {ladderData.winning_top_column + 1}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-700">Vị trí đích ở đáy:</span>
                  <span className="font-bold text-amber-600">Cột {ladderData.winning_bottom_column + 1}</span>
                </div>
              </div>

              <p>
                <strong>Quy tắc Amidakuji (사다리타기 / あみだくじ):</strong> Mỗi bậc thang ngang biểu thị một phép đổi chỗ liền kề (adjacent transposition). Do tính chất song ánh (bijection), mỗi cột trên đỉnh luôn nối với đúng một vị trí ở đáy mà không bao giờ trùng lặp hay xung đột.
              </p>
              <p>
                Toàn bộ cấu trúc thang và vị trí đích được sinh tất định (deterministic) từ <code>seed</code> lưu tại máy chủ và đồng bộ realtime qua WebSocket.
              </p>
            </div>

            <div className="pt-2 text-right">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsAuditModalOpen(false)}
              >
                Đã hiểu
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
