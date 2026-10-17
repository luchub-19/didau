import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { Button } from '../common';
import type { DeciderHint, Place } from '../../types';

export interface SpinWheelProps {
  roomId: string;
  isHost: boolean;
  places?: Place[];
  hints?: DeciderHint[];
  wheelStopAngle?: number | null;
  wheelWinnerId?: string | null;
}

const SLICE_COLORS = [
  '#EF4444', // Đỏ
  '#3B82F6', // Xanh dương
  '#10B981', // Xanh lá
  '#F59E0B', // Vàng cam
  '#8B5CF6', // Tím
  '#EC4899', // Hồng
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(angleInRadians),
    y: cy - r * Math.cos(angleInRadians),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const arcSweep = endAngle - startAngle;
  const largeArcFlag = arcSweep > 180 ? 1 : 0;

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

export const SpinWheel: React.FC<SpinWheelProps> = ({
  roomId,
  isHost,
  places: propPlaces,
  hints: propHints,
  wheelStopAngle: propWheelStopAngle,
  wheelWinnerId: propWheelWinnerId,
}) => {
  const storePlaces = usePlaceStore((s) => s.places);
  const places = propPlaces ?? storePlaces;

  const storeHints = useDecisionStore((s) => s.hints);
  const hints = propHints ?? storeHints;

  const isSpinning = useDecisionStore((s) => s.isSpinning);
  const setIsSpinning = useDecisionStore((s) => s.setIsSpinning);

  const storeWheelStopAngle = useDecisionStore((s) => s.wheelStopAngle);
  const wheelStopAngle = propWheelStopAngle !== undefined ? propWheelStopAngle : storeWheelStopAngle;

  const storeWheelWinnerId = useDecisionStore((s) => s.wheelWinnerId);
  const wheelWinnerId = propWheelWinnerId !== undefined ? propWheelWinnerId : storeWheelWinnerId;
  const isWeighted = useDecisionStore((s) => s.isWeighted);
  const setIsWeighted = useDecisionStore((s) => s.setIsWeighted);
  const seed = useDecisionStore((s) => s.seed);
  const currentSession = useDecisionStore((s) => s.currentSession);
  const createDecision = useDecisionStore((s) => s.createDecision);
  const acceptDecision = useDecisionStore((s) => s.acceptDecision);
  const isSubmitting = useDecisionStore((s) => s.isSubmitting);

  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [hasRevealedWinner, setHasRevealedWinner] = useState<boolean>(false);
  const [showFairnessModal, setShowFairnessModal] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Chọn danh sách ứng viên: ưu tiên các quán trong hint (nếu có hoà phiếu), nếu không thì lấy quán PROPOSED
  const candidatePlaces: Place[] = useMemo(() => {
    if (hints.length > 0 && hints[0].candidate_place_ids?.length >= 2) {
      const hintIds = new Set(hints[0].candidate_place_ids);
      const filtered = places.filter((p) => hintIds.has(p.id));
      if (filtered.length >= 2) return filtered;
    }
    const proposed = places.filter((p) => p.status === 'PROPOSED');
    return proposed.length >= 2 ? proposed : places;
  }, [hints, places]);

  // Tính lát cắt (slices) cho vòng quay
  const slices = useMemo(() => {
    const n = candidatePlaces.length;
    if (n === 0) return [];

    let weights: number[];
    if (isWeighted) {
      weights = candidatePlaces.map((p) => Math.max(1, (p.score || 0) + 5));
    } else {
      weights = Array(n).fill(1);
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let currentAngle = 0;

    return candidatePlaces.map((place, idx) => {
      const sliceWidth = (weights[idx] / totalWeight) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceWidth;
      currentAngle = endAngle;

      return {
        place,
        startAngle,
        endAngle,
        midAngle: startAngle + sliceWidth / 2,
        color: SLICE_COLORS[idx % SLICE_COLORS.length],
        percentage: ((weights[idx] / totalWeight) * 100).toFixed(1),
      };
    });
  }, [candidatePlaces, isWeighted]);

  // Khi nhận `wheelStopAngle` hoặc `isSpinning` bắt đầu quay
  useEffect(() => {
    if (wheelStopAngle !== null && isSpinning) {
      setHasRevealedWinner(false);

      // Kiểm tra prefers-reduced-motion
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        // Dừng tức thì
        setCurrentRotation(wheelStopAngle);
        setIsSpinning(false);
        setHasRevealedWinner(true);
      } else {
        // Quay 4s với CSS transition
        setCurrentRotation(wheelStopAngle);
        timerRef.current = setTimeout(() => {
          setIsSpinning(false);
          setHasRevealedWinner(true);
        }, 4000);
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [wheelStopAngle, isSpinning, setIsSpinning]);

  const handleStartSpin = async () => {
    if (!isHost || candidatePlaces.length < 2) return;
    setErrorMsg(null);
    setHasRevealedWinner(false);

    try {
      await createDecision(roomId, {
        mode: 'WHEEL',
        candidate_place_ids: candidatePlaces.map((p) => p.id),
        weighted: isWeighted,
      });
    } catch (err: unknown) {
      setErrorMsg((err as { message?: string })?.message || 'Không thể quay vòng quay.');
    }
  };

  const handleAcceptWinner = async () => {
    if (!isHost || !currentSession?.id) return;
    setErrorMsg(null);
    try {
      await acceptDecision(roomId, currentSession.id);
    } catch (err: unknown) {
      setErrorMsg((err as { message?: string })?.message || 'Không thể chốt địa điểm trúng thưởng.');
    }
  };

  const winnerPlace = places.find((p) => p.id === wheelWinnerId);

  return (
    <div
      data-testid="spin-wheel-container"
      className="space-y-6 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col items-center"
    >
      {/* Header controls & fairness toggle */}
      <div className="w-full flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">🎡 Vòng quay may mắn</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
            {candidatePlaces.length} ứng viên
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowFairnessModal(true)}
          className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-1 underline underline-offset-2"
        >
          <span>ℹ️</span>
          <span>Xem cách tính</span>
        </button>
      </div>

      {errorMsg && (
        <div className="w-full p-3 text-xs rounded-xl bg-rose-50 text-rose-700 border border-rose-200 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Weight toggle */}
      <div className="w-full flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
        <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
          <input
            type="checkbox"
            checked={isWeighted}
            disabled={isSpinning || isSubmitting}
            onChange={(e) => setIsWeighted(e.target.checked)}
            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
          />
          <span>Trọng số theo điểm bình chọn</span>
        </label>
        <span className="text-[11px] text-slate-400">
          {isWeighted ? 'Quán nhiều vote ô to hơn' : 'Mọi quán chia đều'}
        </span>
      </div>

      {/* SVG Wheel Display */}
      <div className="relative w-[300px] h-[300px] flex items-center justify-center my-2 select-none">
        {/* Pointer (Kim chỉ đỉnh 12h) */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 drop-shadow-md">
          <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
            <path
              d="M14 34L2 6C0.5 3 2.5 0 6 0H22C25.5 0 27.5 3 26 6L14 34Z"
              fill="#DC2626"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <circle cx="14" cy="8" r="3" fill="#FFFFFF" />
          </svg>
        </div>

        {/* Rotating Wheel Group */}
        <div
          data-testid="wheel-disc"
          style={{
            transform: `rotate(${currentRotation}deg)`,
            transition: isSpinning ? 'transform 4s cubic-bezier(0.15, 0.9, 0.2, 1.0)' : 'none',
          }}
          className="w-[280px] h-[280px] rounded-full shadow-lg border-4 border-white bg-slate-100 relative overflow-hidden"
        >
          <svg width="280" height="280" viewBox="0 0 300 300" className="w-full h-full">
            {slices.map((slice, idx) => (
              <g key={slice.place.id || idx}>
                {slices.length === 1 ? (
                  <circle cx="150" cy="150" r="148" fill={slice.color} />
                ) : (
                  <path
                    d={describeArc(150, 150, 148, slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                )}
                <g transform={`rotate(${slice.midAngle}, 150, 150)`}>
                  <text
                    x="150"
                    y="60"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontWeight="bold"
                    fontSize="11"
                    className="drop-shadow-sm select-none"
                  >
                    {slice.place.name.length > 13
                      ? `${slice.place.name.slice(0, 12)}…`
                      : slice.place.name}
                  </text>
                </g>
              </g>
            ))}
            {/* Center Pin Hub */}
            <circle cx="150" cy="150" r="22" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="3" />
            <circle cx="150" cy="150" r="15" fill="#1E293B" />
            <text
              x="150"
              y="155"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="12"
              fontWeight="bold"
            >
              🎲
            </text>
          </svg>
        </div>
      </div>

      {/* Winner Announcement Card */}
      {hasRevealedWinner && winnerPlace && (
        <div
          data-testid="winner-announcement"
          className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-sky-500/15 border border-emerald-300 text-center space-y-2 animate-fade-in"
        >
          <div className="text-2xl">🎉</div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Quán trúng thưởng!
          </p>
          <h4 className="text-base sm:text-lg font-black text-slate-900">
            {winnerPlace.name}
          </h4>
          <p className="text-xs text-slate-600">
            {winnerPlace.category} • ⭐ {winnerPlace.score} điểm
          </p>

          {isHost ? (
            <div className="pt-2 flex items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleAcceptWinner}
                isLoading={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                leftIcon={<span>✨</span>}
              >
                Chốt quán này
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartSpin}
                disabled={isSubmitting || isSpinning}
              >
                Quay lại
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic pt-1">
              Đang chờ Host chốt kết quả này...
            </p>
          )}
        </div>
      )}

      {/* Bottom Controls / Spin trigger button */}
      <div className="w-full pt-2">
        {isHost ? (
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartSpin}
            isLoading={isSubmitting || isSpinning}
            disabled={candidatePlaces.length < 2 || isSpinning}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-base shadow-sm"
            leftIcon={<span>🎲</span>}
          >
            {isSpinning ? 'Đang quay...' : 'Quay ngay!'}
          </Button>
        ) : (
          <div
            data-testid="member-waiting-banner"
            className="w-full py-3 px-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-600 italic"
          >
            {isSpinning ? '🎡 Vòng quay đang chạy...' : 'Đang chờ Host bắt đầu quay... 👀'}
          </div>
        )}
      </div>

      {/* Modal Xem cách tính / Minh bạch thuật toán */}
      {showFairnessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                🔍 Minh bạch thuật toán vòng quay
              </h3>
              <button
                type="button"
                onClick={() => setShowFairnessModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Kết quả vòng quay được máy chủ sinh ngẫu nhiên trước bằng thuật toán tất định (deterministic) dựa trên mã <strong className="text-slate-900 font-mono">seed</strong> ngẫu nhiên 48-bit.
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 font-mono">
                <div>
                  <span className="text-slate-400">Seed máy chủ:</span>{' '}
                  <strong className="text-slate-800">{seed ?? 'Chưa tạo'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Góc dừng (độ):</span>{' '}
                  <strong className="text-slate-800">{wheelStopAngle ?? '0'}°</strong>
                </div>
                <div>
                  <span className="text-slate-400">Trọng số:</span>{' '}
                  <strong>{isWeighted ? 'Theo điểm vote' : 'Chia đều'}</strong>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-slate-800">Tỉ lệ trúng của từng quán:</p>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {slices.map((s) => (
                    <div
                      key={s.place.id}
                      className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <span className="truncate max-w-[200px] font-medium">
                        {s.place.name}
                      </span>
                      <span className="font-bold text-slate-700">{s.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFairnessModal(false)}
              className="w-full text-xs font-bold"
            >
              Đã hiểu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
