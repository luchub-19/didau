// Nghe các store (chỉ đọc), thấy nhóm VỪA chốt quán thì trả lần chốt cần công bố; tải lười chunk RevealStage.
import { useCallback, useEffect, useState } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { stageLog } from '../../motion';
import { detectReveal, revealMemory, type RevealObservation, type RevealTrigger } from './triggers';

export const loadRevealStage = () => import('./RevealStage');

/** Tải trước chunk màn công bố (gọi khi mở sheet chọn hộ), để cao trào không phải chờ mạng. */
let prefetched = false;
export function prefetchRevealStage(): void {
  if (prefetched) return;
  prefetched = true;
  void loadRevealStage().catch(() => {
    prefetched = false;
  });
}

function observe(): RevealObservation {
  const room = useRoomStore.getState().room;
  const session = useDecisionStore.getState().currentSession;
  return {
    roomId: room?.id ?? null,
    roomStatus: room?.status ?? null,
    session: session
      ? { id: session.id, status: session.status, resultPlaceId: session.result_place_id ?? null }
      : null,
    places: usePlaceStore.getState().places,
  };
}

/**
 * Theo dõi các store và gọi `onReveal` khi nhóm vừa chốt (mỗi lần chốt một lần, nhớ trong RAM).
 * Quan sát đồng bộ qua `subscribe` của từng store (không qua render), để từng bước cập nhật trong một lần chốt
 * (phiên → quán → phòng) đều được so với lần trước. Lần quan sát đầu chỉ lấy mốc: vào phòng muộn không phát.
 */
export function watchReveals(onReveal: (trigger: RevealTrigger) => void): () => void {
  let prev = observe();
  const check = () => {
    const next = observe();
    const found = detectReveal(prev, next);
    prev = next;
    if (found && !revealMemory.has(found)) {
      revealMemory.remember(found);
      stageLog('reveal trigger', found.key);
      onReveal(found);
    }
    // Phiên chọn hộ đang mở: tải trước chunk công bố
    if (next.session?.status === 'OPEN') prefetchRevealStage();
  };
  const unsubs = [useRoomStore.subscribe(check), useDecisionStore.subscribe(check), usePlaceStore.subscribe(check)];
  return () => unsubs.forEach((u) => u());
}

/** Lần chốt đang công bố (null = không có) và hàm đóng màn. */
export function useRevealTrigger(): [RevealTrigger | null, () => void] {
  const [active, setActive] = useState<RevealTrigger | null>(null);
  useEffect(() => watchReveals(setActive), []);
  // Chỉ ở dev: `window.__stageLab.revealPlace(id)` phát lại màn công bố từ DevTools (soi ở tab bất kỳ)
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    const w = window as unknown as { __stageLab?: Record<string, unknown> };
    w.__stageLab = {
      ...w.__stageLab,
      revealPlace: (placeId: string) => setActive({ key: `lab:${Date.now()}`, placeId, placeKey: 'lab' }),
    };
  }, []);
  const clear = useCallback(() => setActive(null), []);
  return [active, clear];
}
