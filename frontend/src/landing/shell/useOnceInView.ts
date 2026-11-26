// "Chạy một lần khi đi vào màn hình" cho landing (PLAN §4.5): nội dung phía trên màn đầu luôn hiện ngay;
// phần chạy-khi-tới chỉ ẩn khi nó đang ở DƯỚI màn hình lúc tải. Tôn trọng useMotionTier: 'static' = hiện ngay.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useMotionTier, type MotionTier } from '../../motion/useMotionTier';

/**
 * - `shown`: hiện ngay, không diễn (đã trong màn đầu lúc tải, mức static, không có IntersectionObserver, SSR)
 * - `waiting`: lúc tải đang ở dưới màn hình → ẩn, chờ đi vào
 * - `entered`: vừa đi vào màn hình → diễn đúng một lần
 */
export type OnceInViewState = 'shown' | 'waiting' | 'entered';

export interface OnceInViewOptions {
  /** Tỉ lệ diện tích phải vào màn hình mới tính là "tới" (mặc định 0,35 như mock v3). */
  threshold?: number;
  rootMargin?: string;
  /** Đỉnh phần tử thấp hơn `belowFold × innerHeight` lúc tải thì mới ẩn chờ (mặc định 0,85). */
  belowFold?: number;
}

export interface InitialOnceEnv {
  tier: MotionTier;
  hasObserver: boolean;
  /** `getBoundingClientRect().top` lúc tải. */
  top: number;
  viewportHeight: number;
  belowFold?: number;
}

export const DEFAULT_BELOW_FOLD = 0.85;

/** Hàm thuần: trạng thái ban đầu của một phần tử "hiện một lần". */
export function initialOnceState(env: InitialOnceEnv): OnceInViewState {
  if (env.tier === 'static' || !env.hasObserver) return 'shown';
  const fold = env.viewportHeight * (env.belowFold ?? DEFAULT_BELOW_FOLD);
  return env.top > fold ? 'waiting' : 'shown';
}

// Trên server (test renderToStaticMarkup) không có layout: dùng useEffect để React không cảnh báo
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useOnceInView<T extends Element>(
  ref: RefObject<T>,
  { threshold = 0.35, rootMargin, belowFold = DEFAULT_BELOW_FOLD }: OnceInViewOptions = {},
): OnceInViewState {
  const tier = useMotionTier();
  const [state, setState] = useState<OnceInViewState>('shown');
  const decided = useRef(false);

  // Quyết định một lần trước khi vẽ khung đầu, nên phần dưới màn hình không nháy hiện rồi ẩn
  useIsoLayoutEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const el = ref.current;
    if (!el) return;
    const next = initialOnceState({
      tier,
      hasObserver: typeof IntersectionObserver !== 'undefined',
      top: el.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
      belowFold,
    });
    if (next !== 'shown') setState(next);
  }, [ref, tier, belowFold]);

  useEffect(() => {
    if (state !== 'waiting') return;
    // Bị hạ xuống static giữa chừng (FPS thấp, reduced-motion) → hiện ngay, không diễn
    if (tier === 'static') {
      setState('shown');
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setState('entered');
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [state, tier, ref, threshold, rootMargin]);

  return state;
}
