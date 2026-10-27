// Gắn trong phòng (luôn mount cùng DecideModal): thấy nhóm VỪA chốt quán thì mở RevealStage.
// Nhẹ, nằm ở chunk chính; RevealStage (gsap) tải lười, tải trước khi một phiên chọn hộ mở.
import React, { Suspense, lazy, useEffect } from 'react';
import { useDecisionStore } from '../../store/useDecisionStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { useMotionTier } from '../../motion';
import { loadRevealStage, useRevealTrigger } from './useRevealTrigger';

const RevealStage = lazy(loadRevealStage);

export const RevealHost: React.FC = () => {
  const [active, clear] = useRevealTrigger();
  const tier = useMotionTier();
  const room = useRoomStore((s) => s.room);
  const place = usePlaceStore((s) => (active ? s.places.find((p) => p.id === active.placeId) : undefined));
  const setDecideModalOpen = useDecisionStore((s) => s.setDecideModalOpen);

  // Mọi máy kết thúc ở cùng trạng thái với host: sheet chọn hộ đóng, màn công bố thay chỗ
  useEffect(() => {
    if (active) setDecideModalOpen(false);
  }, [active, setDecideModalOpen]);

  if (!active || !place || !room) return null;
  return (
    <Suspense fallback={null}>
      <RevealStage key={active.key} place={place} room={room} tier={tier} onClose={clear} />
    </Suspense>
  );
};
