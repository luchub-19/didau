import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { describeApiError } from '../../i18n/serverText';
import {
  Button,
  Chip,
  Sheet,
  Shuffle,
  Info,
  Sparkle,
  Check,
} from '../ui';
import type { DeciderHint, Place } from '../../types';

export interface SpinWheelProps {
  roomId: string;
  isHost: boolean;
  places?: Place[];
  hints?: DeciderHint[];
  wheelStopAngle?: number | null;
  wheelWinnerId?: string | null;
}

// Bảng màu xen kẽ giữa các màu cat-*-soft và surface-2
const SLICE_SOFT_COLORS = [
  'rgb(var(--color-cat-food-soft))', // cat-food-soft
  'rgb(var(--color-surface-2))', // surface-2
  'rgb(var(--color-cat-drink-soft))', // cat-drink-soft
  'rgb(var(--color-surface-2))', // surface-2
  'rgb(var(--color-cat-entertainment-soft))', // cat-entertainment-soft
  'rgb(var(--color-surface-2))', // surface-2
  'rgb(var(--color-cat-sightseeing-soft))', // cat-sightseeing-soft
  'rgb(var(--color-surface-2))', // surface-2
  'rgb(var(--color-cat-accommodation-soft))', // cat-accommodation-soft
  'rgb(var(--color-surface-2))', // surface-2
  'rgb(var(--color-cat-shopping-soft))', // cat-shopping-soft
  'rgb(var(--color-surface-2))', // surface-2
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
  const { t } = useTranslation();
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

      const isWinnerSlice = hasRevealedWinner && place.id === wheelWinnerId;
      const sliceColor = isWinnerSlice
        ? 'rgb(var(--color-accent))' // accent khi thắng
        : SLICE_SOFT_COLORS[idx % SLICE_SOFT_COLORS.length];

      return {
        place,
        startAngle,
        endAngle,
        midAngle: startAngle + sliceWidth / 2,
        color: sliceColor,
        isWinner: isWinnerSlice,
        percentage: ((weights[idx] / totalWeight) * 100).toFixed(1),
      };
    });
  }, [candidatePlaces, isWeighted, hasRevealedWinner, wheelWinnerId]);

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
      setErrorMsg(describeApiError(err, t) || t('decide.wheel.errorSpin'));
    }
  };

  const handleAcceptWinner = async () => {
    if (!isHost || !currentSession?.id) return;
    setErrorMsg(null);
    try {
      await acceptDecision(roomId, currentSession.id);
    } catch (err: unknown) {
      setErrorMsg(describeApiError(err, t) || t('decide.wheel.errorAccept'));
    }
  };

  const winnerPlace = places.find((p) => p.id === wheelWinnerId);

  return (
    <div
      data-testid="spin-wheel-container"
      className="space-y-6 bg-surface rounded-card border border-line p-5 sm:p-6 shadow-xs flex flex-col items-center"
    >
      {/* Header controls & fairness toggle */}
      <div className="w-full flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Shuffle size={18} className="text-accent-text" />
          <span className="text-body font-bold text-ink">{t('decide.wheel.title')}</span>
          <Chip>
            {t('decide.wheel.candidatesCount', { count: candidatePlaces.length })}
          </Chip>
        </div>

        <button
          type="button"
          onClick={() => setShowFairnessModal(true)}
          className="text-caption font-semibold text-accent-text hover:underline flex items-center gap-1.5"
        >
          <Info size={14} />
          <span>{t('decide.wheel.explainLink')}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="w-full p-3 text-caption rounded-field bg-danger-soft text-danger border border-danger/30 font-medium">
          {errorMsg}
        </div>
      )}

      {/* Weight toggle */}
      <div className="w-full flex items-center justify-between bg-surface-2 p-2.5 rounded-field border border-line text-caption">
        <label className="flex items-center gap-2 cursor-pointer font-semibold text-ink select-none">
          <input
            type="checkbox"
            checked={isWeighted}
            disabled={isSpinning || isSubmitting}
            onChange={(e) => setIsWeighted(e.target.checked)}
            className="w-4 h-4 rounded text-accent focus:ring-accent-text border-line accent-accent"
          />
          <span>{t('decide.wheel.weightLabel')}</span>
        </label>
        <span className="text-[11px] text-ink-3">
          {isWeighted ? t('decide.wheel.weightDescActive') : t('decide.wheel.weightDescEqual')}
        </span>
      </div>

      {/* SVG Wheel Display */}
      <div className="relative w-[300px] h-[300px] flex items-center justify-center my-2 select-none">
        {/* Pointer (Kim chỉ đỉnh 12h) - màu accent */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 drop-shadow-md">
          <svg width="28" height="34" viewBox="0 0 28 34" fill="none">
            <path
              d="M14 34L2 6C0.5 3 2.5 0 6 0H22C25.5 0 27.5 3 26 6L14 34Z"
              fill="rgb(var(--color-accent))"
              stroke="rgb(var(--color-surface))"
              strokeWidth="2"
            />
            <circle cx="14" cy="8" r="3" fill="rgb(var(--color-surface))" />
          </svg>
        </div>

        {/* Rotating Wheel Group */}
        <div
          data-testid="wheel-disc"
          style={{
            transform: `rotate(${currentRotation}deg)`,
            transition: isSpinning ? 'transform 4s cubic-bezier(0.15, 0.9, 0.2, 1.0)' : 'none',
          }}
          className="w-[280px] h-[280px] rounded-full shadow-md border-4 border-surface bg-surface-2 relative overflow-hidden"
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
                    stroke="rgb(var(--color-line))"
                    strokeWidth="1.5"
                  />
                )}
                <g transform={`rotate(${slice.midAngle}, 150, 150)`}>
                  <text
                    x="150"
                    y="60"
                    textAnchor="middle"
                    fill="rgb(var(--color-ink))"
                    fontWeight="600"
                    fontSize="11"
                    className="select-none"
                  >
                    {slice.place.name.length > 13
                      ? `${slice.place.name.slice(0, 12)}…`
                      : slice.place.name}
                  </text>
                </g>
              </g>
            ))}
            {/* Center Pin Hub */}
            <circle cx="150" cy="150" r="22" fill="rgb(var(--color-surface))" stroke="rgb(var(--color-line))" strokeWidth="3" />
            <circle cx="150" cy="150" r="14" fill="rgb(var(--color-ink))" />
            <circle cx="150" cy="150" r="5" fill="rgb(var(--color-surface))" />
          </svg>
        </div>
      </div>

      {/* Winner Announcement Card */}
      {hasRevealedWinner && winnerPlace && (
        <div
          data-testid="winner-announcement"
          aria-live="polite"
          className="w-full p-4 rounded-card bg-accent-soft/40 border border-accent/40 text-center space-y-2 animate-fade-in"
        >
          <div className="flex justify-center text-accent-text">
            <Sparkle size={28} weight="fill" />
          </div>
          <p className="text-caption font-bold uppercase tracking-wider text-accent-text">
            {t('decide.wheel.winnerBadge')}
          </p>
          <h4 className="text-title font-bold text-ink">
            {winnerPlace.name}
          </h4>
          <p className="text-caption text-ink-2">
            {winnerPlace.category} • {t('decide.wheel.scoreText', { score: winnerPlace.score ?? 0 })}
          </p>

          {isHost ? (
            <div className="pt-2 flex items-center justify-center gap-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleAcceptWinner}
                loading={isSubmitting}
                leftIcon={<Check size={16} />}
              >
                {t('decide.wheel.acceptWinner')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleStartSpin}
                disabled={isSubmitting || isSpinning}
                leftIcon={<Shuffle size={16} />}
              >
                {t('decide.wheel.spinAgain')}
              </Button>
            </div>
          ) : (
            <p className="text-caption text-ink-3 italic pt-1">
              {t('decide.wheel.waitingHostToAccept')}
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
            loading={isSubmitting || isSpinning}
            disabled={candidatePlaces.length < 2 || isSpinning}
            className="w-full font-semibold shadow-xs"
            leftIcon={<Shuffle size={20} />}
          >
            {isSpinning ? t('decide.wheel.spinning') : t('decide.wheel.spinButton')}
          </Button>
        ) : (
          <div
            data-testid="member-waiting-banner"
            aria-live="polite"
            className="w-full py-3 px-4 rounded-field bg-surface-2 border border-line text-center text-caption font-semibold text-ink-2 italic"
          >
            {isSpinning ? t('decide.wheel.wheelSpinning') : t('decide.wheel.waitingHost')}
          </div>
        )}
      </div>

      {/* Modal / Sheet Xem cách tính / Minh bạch thuật toán */}
      <Sheet
        isOpen={showFairnessModal}
        onClose={() => setShowFairnessModal(false)}
        title={t('decide.wheel.fairness.title')}
        description={t('decide.wheel.fairness.desc')}
        closeLabel={t('decide.modal.close')}
      >
        <div className="space-y-4 text-caption text-ink-2">
          <div className="bg-surface-2 p-3 rounded-field border border-line space-y-1.5 font-mono text-[12px]">
            <div className="flex justify-between">
              <span className="text-ink-3">{t('decide.wheel.fairness.serverSeed')}</span>
              <strong className="text-ink">{seed ?? t('decide.wheel.fairness.notCreated')}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">{t('decide.wheel.fairness.stopAngle')}</span>
              <strong className="text-ink">{wheelStopAngle ?? '0'}°</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">{t('decide.wheel.fairness.weightMode')}</span>
              <strong className="text-ink">
                {isWeighted ? t('decide.wheel.fairness.weightByScore') : t('decide.wheel.fairness.weightEqual')}
              </strong>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-ink">{t('decide.wheel.fairness.chancesTitle')}</p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {slices.map((s) => (
                <div
                  key={s.place.id}
                  className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-surface border border-line"
                >
                  <span className="truncate max-w-[200px] font-medium text-ink">
                    {s.place.name}
                  </span>
                  <span className="font-bold text-ink tabular-nums">{s.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowFairnessModal(false)}
              className="w-full"
            >
              {t('decide.wheel.fairness.understand')}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
};
