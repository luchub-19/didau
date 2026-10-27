// Cửa vào hero trang chủ: chọn bản theo mức chuyển động (DESIGN §4).
//   static → HeroStatic (poster + 5 khối chữ), full/lite → HeroScroll (chunk lazy: gsap + bản đồ lazy riêng)
import React, { lazy, Suspense } from 'react';
import { useMotionTier, type MotionTier } from '../../motion';
import type { HeroActionsProps } from './HeroActions';
import { HeroStatic } from './HeroStatic';

const HeroScroll = lazy(() => import('./HeroScroll'));

export interface HeroProps extends HeroActionsProps {
  header: React.ReactNode;
  /** Ép mức (test); mặc định đọc `useMotionTier()`. */
  tier?: MotionTier;
}

export const Hero: React.FC<HeroProps> = ({ tier: forcedTier, ...props }) => {
  const detected = useMotionTier();
  const tier = forcedTier ?? detected;
  if (tier === 'static') return <HeroStatic {...props} />;
  return (
    <Suspense fallback={<HeroStatic {...props} introOnly />}>
      <HeroScroll tier={tier} {...props} />
    </Suspense>
  );
};
