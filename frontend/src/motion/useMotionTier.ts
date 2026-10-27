// Mức chuyển động của vùng Stage (docs/phase4/DESIGN.md §4):
//   full   bản đồ 3D, camera scrub theo cuộn, đầy đủ khoảnh khắc
//   lite   bỏ tòa nhà 3D/đổ bóng, camera flyTo ngắn, khoảnh khắc rút gọn
//   static poster + chữ, mọi khoảnh khắc chỉ đổi màu/opacity
import { useSyncExternalStore } from 'react';
import { getMotionOverride, stageLog, type MotionOverride } from './debug';

export type MotionTier = 'full' | 'lite' | 'static';

export interface TierEnv {
  override: MotionOverride;
  reducedMotion: boolean;
  webgl: boolean;
  cores: number | undefined;
  memoryGb: number | undefined;
}

const TIER_RANK: Record<MotionTier, number> = { static: 0, lite: 1, full: 2 };

/** Hàm thuần: chọn mức từ môi trường. Thứ tự ưu tiên: URL > reduced-motion > WebGL > phần cứng. */
export function resolveMotionTier(env: TierEnv): MotionTier {
  if (env.override === 'off') return 'static';
  if (env.override === 'lite') return 'lite';
  if (env.reducedMotion) return 'static';
  if (!env.webgl) return 'static';
  if ((env.cores !== undefined && env.cores <= 4) || (env.memoryGb !== undefined && env.memoryGb <= 4)) {
    return 'lite';
  }
  return 'full';
}

/** Lấy mức thấp hơn trong hai mức (hạ cấp chỉ đi xuống, không tự nâng lại). */
export function lowerTier(a: MotionTier, b: MotionTier): MotionTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function detectWebgl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function readTierEnv(): TierEnv {
  const hasWindow = typeof window !== 'undefined';
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  return {
    override: getMotionOverride(),
    reducedMotion:
      hasWindow && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false,
    webgl: detectWebgl(),
    cores: nav?.hardwareConcurrency,
    memoryGb: nav?.deviceMemory,
  };
}

// Kho mức toàn cục: tính lười một lần, sau đó chỉ hạ cấp (FPS thấp, lỗi WebGL…)
const listeners = new Set<() => void>();
let currentTier: MotionTier | null = null;

export function getMotionTier(): MotionTier {
  if (currentTier === null) currentTier = resolveMotionTier(readTierEnv());
  return currentTier;
}

/** Hạ mức toàn cục (vd. bản đồ hero đo FPS < 40 trong 2 giây → 'lite'). Không bao giờ nâng mức. */
export function downgradeMotionTier(to: MotionTier, reason: string): void {
  const next = lowerTier(getMotionTier(), to);
  if (next === currentTier) return;
  stageLog('tier', currentTier, '→', next, reason);
  currentTier = next;
  listeners.forEach((l) => l());
}

/** Chỉ dùng trong test: xoá mức đã tính để đọc lại môi trường. */
export function resetMotionTierForTest(): void {
  currentTier = null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useMotionTier(): MotionTier {
  return useSyncExternalStore(subscribe, getMotionTier, () => 'static');
}

/** Bộ canh FPS: gọi `frame(now)` mỗi khung; trả true khi đã dưới ngưỡng liên tục đủ lâu (PLAN §8). */
export function createFpsGuard(minFps = 40, windowMs = 2000) {
  let last: number | null = null;
  let lowSince: number | null = null;
  return {
    frame(now: number): boolean {
      if (last !== null) {
        const delta = now - last;
        const fps = 1000 / Math.max(1, delta);
        if (delta > 500) {
          // Khoảng trống dài = tab ẩn/tạm dừng render, không phải máy yếu
          lowSince = null;
        } else if (fps < minFps) {
          lowSince ??= last;
          if (now - lowSince >= windowMs) return true;
        } else {
          lowSince = null;
        }
      }
      last = now;
      return false;
    },
    reset(): void {
      last = null;
      lowSince = null;
    },
  };
}
