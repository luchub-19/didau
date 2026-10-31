// Logic thuần của khung "không gian phòng" (T-67): bố cục theo bề rộng, cột Kế hoạch tự mở/ghi đè,
// nấc của sheet danh sách mobile. Tách khỏi RoomWorkspace.tsx để test không cần DOM và giữ fast refresh.
import { useSyncExternalStore } from 'react';
import type { PhaseStep, RoomPhase } from '../../room/phase';

/* ---------- Bố cục theo bề rộng ---------- */

export type WorkspaceLayout = 'wide' | 'medium' | 'mobile';

const WIDE_QUERY = '(min-width: 1280px)';
const MEDIUM_QUERY = '(min-width: 1024px)';

function readLayout(): WorkspaceLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'wide';
  if (window.matchMedia(WIDE_QUERY).matches) return 'wide';
  if (window.matchMedia(MEDIUM_QUERY).matches) return 'medium';
  return 'mobile';
}

function subscribeLayout(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const lists = [window.matchMedia(WIDE_QUERY), window.matchMedia(MEDIUM_QUERY)];
  lists.forEach((l) => l.addEventListener('change', cb));
  return () => lists.forEach((l) => l.removeEventListener('change', cb));
}

/** Bố cục hiện tại; SSR/test không có matchMedia thì coi là desktop rộng. */
export function useWorkspaceLayout(): WorkspaceLayout {
  return useSyncExternalStore(subscribeLayout, readLayout, () => 'wide');
}

/* ---------- Cột Kế hoạch: tự mở theo bước, bấm tay ghi đè đến khi giai đoạn đổi ---------- */

export interface PlanOverride {
  /** Giai đoạn lúc người dùng bấm; giai đoạn đổi thì ghi đè hết hiệu lực. */
  phase: RoomPhase;
  open: boolean;
}

/** Cột Kế hoạch mở hay thu: ghi đè tay (cùng giai đoạn) thắng, còn lại mở khi bước đang xem ≥ ③. */
export function resolvePlanOpen(viewStep: PhaseStep, phase: RoomPhase, override: PlanOverride | null): boolean {
  if (override && override.phase === phase) return override.open;
  return viewStep >= 3;
}

/* ---------- Sheet danh sách trên mobile: 3 nấc ---------- */

export type SheetSnap = 'peek' | 'half' | 'full';

/** Chiều cao nấc thu (px) — đủ cho tay nắm + dòng tiêu đề (DESIGN gđ5 §2). */
export const SHEET_PEEK_PX = 96;
/** Khe hở trên đỉnh khi sheet gần đầy, để vẫn thấy bản đồ phía sau. */
export const SHEET_TOP_GAP_PX = 8;
/** Vuốt nhanh hơn ngưỡng này (px/ms) thì nhảy một nấc theo hướng vuốt thay vì nấc gần nhất. */
const FLICK_VELOCITY = 0.5;

const SNAP_ORDER: readonly SheetSnap[] = ['peek', 'half', 'full'];

/** Chiều cao nhìn thấy của từng nấc trong khung cao `containerPx`. */
export function snapHeights(containerPx: number): Record<SheetSnap, number> {
  const full = Math.max(SHEET_PEEK_PX, containerPx - SHEET_TOP_GAP_PX);
  return {
    peek: Math.min(SHEET_PEEK_PX, full),
    half: Math.min(full, Math.max(SHEET_PEEK_PX, Math.round(containerPx * 0.5))),
    full,
  };
}

/** Thả tay: nấc gần chiều cao hiện tại nhất; vuốt nhanh thì đi một nấc theo hướng vuốt (velocity > 0 = kéo xuống). */
export function settleSnap(visiblePx: number, velocityPxPerMs: number, from: SheetSnap, containerPx: number): SheetSnap {
  const heights = snapHeights(containerPx);
  if (Math.abs(velocityPxPerMs) > FLICK_VELOCITY) {
    const i = SNAP_ORDER.indexOf(from);
    const next = velocityPxPerMs > 0 ? Math.max(0, i - 1) : Math.min(SNAP_ORDER.length - 1, i + 1);
    return SNAP_ORDER[next];
  }
  let best: SheetSnap = 'peek';
  for (const s of SNAP_ORDER) {
    if (Math.abs(heights[s] - visiblePx) < Math.abs(heights[best] - visiblePx)) best = s;
  }
  return best;
}

/** Nấc mặc định theo giai đoạn: ①② danh sách là việc chính (nửa màn), ③④ nhường bản đồ + tab Kế hoạch. */
export function defaultSheetSnap(phase: RoomPhase): SheetSnap {
  return phase === 'lock' || phase === 'send' ? 'peek' : 'half';
}

/** Bấm tay nắm (bàn phím): thu ↔ nửa; đang đầy thì về nửa. */
export function toggleSnap(s: SheetSnap): SheetSnap {
  return s === 'half' ? 'peek' : 'half';
}
