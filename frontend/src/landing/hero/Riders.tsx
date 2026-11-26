// Bốn xe máy hội tụ trên lòng đường phố đêm (trang trí, aria-hidden — nằm trong NightStreet).
// Vị trí đặt bằng style.left sau khi bố cục xong (đo cửa sổ app); resize/font tải xong chỉ đặt lại vị trí,
// không chạy lại. Mở màn chạy một lần mỗi lượt tải trang (cờ cấp module), mức static đứng sẵn.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MotionTier } from '../../motion/useMotionTier';
import { CAST, avatarFor } from '../cast';
import { ARRIVAL, arrival, riderSlots, runArrival } from './riders';

/** Ký hiệu xe tay ga (mock v3 `#i-scooter`), màu theo `currentColor`. */
const Scooter: React.FC<{ color: string }> = ({ color }) => (
  <svg className="hero-scooter" viewBox="0 0 92 56" style={{ color }} aria-hidden="true" focusable="false">
    <g fill="none" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor">
      <path d="M18 42h40l10-14h10" strokeWidth={4} />
      <path d="M58 42c0-10 6-18 16-18" strokeWidth={4} />
      <path d="M74 24l-4-14h8" strokeWidth={4} />
      <path d="M26 30h28l4 12" strokeWidth={5} />
    </g>
    <circle cx={16} cy={44} r={9} fill="#120E17" stroke="currentColor" strokeWidth={3} />
    <circle cx={74} cy={44} r={9} fill="#120E17" stroke="currentColor" strokeWidth={3} />
    <circle cx={82} cy={14} r={3} fill="#FFE7A3" />
  </svg>
);

export interface RidersProps {
  /** Cửa sổ phòng mẫu: xe dừng dưới tâm của nó khi màn rộng. */
  anchorRef: React.RefObject<HTMLElement>;
  tier: MotionTier;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const Riders: React.FC<RidersProps> = ({ anchorRef, tier }) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const riderRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Đã chạy ở lần mount trước (về lại trang chủ) hoặc mức static → nhãn tên hiện ngay
  const [arrived, setArrived] = useState(
    () => tier === 'static' || (arrival.startedAt !== null && performance.now() - arrival.startedAt >= ARRIVAL.tagsAtMs),
  );

  useIsoLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const place = (): number[] => {
      const base = layer.getBoundingClientRect();
      const a = anchorRef.current?.getBoundingClientRect();
      const slots = riderSlots({
        width: layer.clientWidth,
        anchorCenterX: a && a.width > 0 ? a.left - base.left + a.width / 2 : null,
        viewportWidth: window.innerWidth,
      });
      riderRefs.current.forEach((el, i) => {
        if (el) el.style.left = `${slots[i]}px`;
      });
      return slots;
    };
    const slots = place();

    if (arrival.startedAt === null) {
      const els = riderRefs.current.filter((el): el is HTMLDivElement => el !== null && typeof el.animate === 'function');
      const n = runArrival(els, slots, layer.clientWidth, tier);
      arrival.startedAt = n > 0 ? performance.now() : -Infinity;
    }
    // Nhãn tên hiện khi xe đã dừng; StrictMode chạy effect hai lần nên tính theo mốc bắt đầu, không theo timer cũ
    const left = ARRIVAL.tagsAtMs - (performance.now() - arrival.startedAt);
    let tagTimer: ReturnType<typeof setTimeout> | undefined;
    if (left > 0) tagTimer = setTimeout(() => setArrived(true), left);
    else setArrived(true);

    const onResize = () => place();
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (ro && anchorRef.current) ro.observe(anchorRef.current);
    // Font display tải xong làm cột chữ đổi bề rộng → cửa sổ app dịch → đặt lại chỗ dừng
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) place();
    });
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      if (tagTimer) clearTimeout(tagTimer);
    };
    // Chỉ chạy lúc mount: đổi mức chuyển động giữa chừng không chạy lại mở màn
  }, []);

  return (
    <div ref={layerRef} className="hero-riders" data-arrived={arrived ? 'true' : 'false'}>
      {CAST.map((c, i) => (
        <div
          key={c.id}
          ref={(el) => {
            riderRefs.current[i] = el;
          }}
          className="hero-rider"
          data-rev={i % 2 === 1 ? 'true' : undefined}
          style={{ '--i': i } as React.CSSProperties}
        >
          <Scooter color={c.rideColor} />
          <img className="hero-rider-av" src={avatarFor(c.id)} alt="" width={38} height={38} />
          <span className="hero-rider-tag">{c.id}</span>
        </div>
      ))}
    </div>
  );
};
