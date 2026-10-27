// Sân khấu quẹt thẻ (T-60): chồng thẻ có chiều sâu, kéo theo tay, thả thì bay ra theo đà.
// Chunk riêng (lazy) vì kéo thư viện `motion`; SwipeDeck giữ logic gửi phiếu, ở đây chỉ trình bày.
import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnimatePresence,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'motion/react';
import { motionAttrs, parseCubicBezier, resolvePreset, type MotionTier } from '../../motion';
import { ThumbsUp, X } from '../../components/ui';
import type { Place } from '../../types';
import { DeckCardFace } from './DeckCardFace';
import {
  createPointerGuard,
  exitTarget,
  rotationFor,
  stampProgress,
  throwDecision,
  tiltFor,
} from './rules';

/** Quãng bay ra khỏi sân khấu (px): đủ xa để rời khung ở cả 390px lẫn sân khấu rộng. */
const EXIT_TRAVEL_PX = 640;
/** Mỗi lớp thẻ phía sau thấp hơn và nhỏ hơn chừng này. */
const DEPTH_OFFSET_PX = 18;
const DEPTH_SCALE = 0.05;

export interface StageDeckProps {
  /** Thẻ trên cùng trước, rồi tối đa 2 thẻ phía sau. */
  cards: Place[];
  /** Phiếu vừa bỏ (true Thích / false Thôi): hướng bay của thẻ đang rời. */
  lastVote: boolean | null;
  tier: MotionTier;
  onVote: (liked: boolean) => void;
}

function poseAt(depth: number, tier: MotionTier) {
  if (tier === 'static') return { opacity: 1 };
  return { scale: 1 - depth * DEPTH_SCALE, y: depth * DEPTH_OFFSET_PX, opacity: 1 };
}

interface DeckCardProps {
  place: Place;
  /** 0 = thẻ trên cùng (kéo được); 1–2 = lộ mép phía sau. */
  depth: number;
  tier: MotionTier;
  onVote: (liked: boolean) => void;
}

// Một component cho mọi lớp: thẻ phía sau tiến lên trên cùng bằng chính phần tử đó (không nhảy).
const DeckCard: React.FC<DeckCardProps> = ({ place, depth, tier, onVote }) => {
  const { t } = useTranslation();
  const controls = useDragControls();
  const guard = useMemo(() => createPointerGuard(), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const isTop = depth === 0;

  const x = useMotionValue(0);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotate = useTransform(x, (v) => rotationFor(v, tier));
  const likeOpacity = useTransform(x, (v) => (v > 0 ? stampProgress(v) : 0));
  const skipOpacity = useTransform(x, (v) => (v < 0 ? stampProgress(v) : 0));

  const swipe = resolvePreset('vote.swipe', tier);
  const settle = { duration: swipe.durationMs / 1000, ease: parseCubicBezier(swipe.easing) ?? undefined };

  // Đưa thẻ về giữa, phẳng (thả dở, pointercancel, blur)
  const settleHome = () => {
    draggingRef.current = false;
    animate(x, 0, settle);
    tiltX.set(0);
    tiltY.set(0);
  };

  // Chống kẹt kéo (T-49): mất focus cửa sổ giữa lúc kéo → huỷ cử chỉ, thẻ về chỗ
  useEffect(() => {
    const onBlur = () => {
      if (!guard.isActive()) return;
      guard.reset();
      controls.cancel();
      settleHome();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
    // settleHome chỉ đọc motion value ổn định
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guard, controls]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Ngón tay thứ hai: bỏ qua, không cướp cử chỉ đang chạy
    if (!isTop || !guard.down(e.pointerId)) return;
    draggingRef.current = true;
    tiltX.set(0);
    tiltY.set(0);
    controls.start(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!guard.release(e.pointerId)) return;
    controls.cancel();
    settleHome();
  };

  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    guard.reset();
    if (!draggingRef.current) return; // đã huỷ bởi pointercancel/blur
    draggingRef.current = false;
    const result = throwDecision(info.offset.x, info.velocity.x);
    if (result === null) {
      animate(x, 0, settle);
      return;
    }
    onVote(result);
  };

  // Nghiêng nhẹ theo chuột khi hover (chỉ 'full', chỉ chuột, không lúc đang kéo)
  const handleHover = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isTop || tier !== 'full' || e.pointerType !== 'mouse' || draggingRef.current || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const tilt = tiltFor(e.clientX - r.left, e.clientY - r.top, r.width, r.height, tier);
    tiltX.set(tilt.rotateX);
    tiltY.set(tilt.rotateY);
  };

  const resetTilt = () => {
    if (draggingRef.current) return;
    tiltX.set(0);
    tiltY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      data-testid={isTop ? 'swipe-card-current' : undefined}
      aria-hidden={isTop ? undefined : true}
      {...motionAttrs('vote.swipe')}
      drag={isTop ? 'x' : false}
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      dragElastic={0.9}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => guard.release(e.pointerId)}
      onPointerCancel={handlePointerCancel}
      onPointerMove={handleHover}
      onPointerLeave={resetTilt}
      style={{
        x,
        rotate,
        rotateX: tiltX,
        rotateY: tiltY,
        zIndex: 10 - depth,
        transformOrigin: '50% 100%',
        touchAction: 'pan-y',
      }}
      initial={tier === 'static' ? { opacity: 0 } : { ...poseAt(depth + 1, tier), opacity: 0 }}
      animate={poseAt(depth, tier)}
      // Hướng bay đọc từ `custom` của AnimatePresence (phiếu mới nhất) lúc thẻ rời
      variants={{ exit: (vote: boolean | null) => exitTarget(vote, tier, EXIT_TRAVEL_PX) }}
      exit="exit"
      transition={settle}
      className={`[grid-area:1/1] relative flex flex-col w-full bg-surface rounded-card border border-line shadow-float p-6 overflow-hidden select-none ${
        isTop ? 'cursor-grab active:cursor-grabbing' : 'hidden lg:flex pointer-events-none'
      }`}
    >
      {isTop && (
        <>
          {/* Nhãn hiện dần theo độ kéo: có chữ + icon, không chỉ màu */}
          <motion.div
            data-testid="swipe-stamp-like"
            aria-hidden="true"
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 border-2 border-success text-success bg-success-soft font-bold text-label px-3 py-1.5 rounded-card shadow-xs -rotate-6"
          >
            <ThumbsUp size={16} weight="fill" />
            {t('decide.swipe.stampLike')}
          </motion.div>
          <motion.div
            data-testid="swipe-stamp-dislike"
            aria-hidden="true"
            style={{ opacity: skipOpacity }}
            className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1.5 border-2 border-danger text-danger bg-danger-soft font-bold text-label px-3 py-1.5 rounded-card shadow-xs rotate-6"
          >
            <X size={16} weight="bold" />
            {t('decide.swipe.stampDislike')}
          </motion.div>
        </>
      )}
      <DeckCardFace place={place} behind={!isTop} />
    </motion.div>
  );
};

const StageDeck: React.FC<StageDeckProps> = ({ cards, lastVote, tier, onVote }) => {
  const visible = cards.slice(0, 3);
  return (
    <div
      className="grid w-full max-w-sm lg:max-w-md mx-auto lg:pb-10"
      style={tier === 'full' ? { perspective: 900 } : undefined}
    >
      <AnimatePresence initial={false} custom={lastVote}>
        {/* Thẻ sâu nhất vẽ trước; thẻ đang rời giữ vị trí cuối nên vẫn nằm trên */}
        {visible
          .map((p, depth) => <DeckCard key={p.id} place={p} depth={depth} tier={tier} onVote={onVote} />)
          .reverse()}
      </AnimatePresence>
    </div>
  );
};

export default StageDeck;
