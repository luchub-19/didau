import React, { useRef } from 'react';
import { useReveal } from './useReveal';

export type SectionTone = 'night' | 'night-2' | 'lamp';

export interface SectionProps {
  /** id của <section> (neo cuộn, dùng cho bấm tên bước/QR…). */
  id: string;
  /** id của <h2>; <section> trỏ `aria-labelledby` vào đây. */
  titleId: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** night = nền đêm; night-2 = dải hoà phiếu; lamp = dải vàng đèn đường của số đo. */
  tone?: SectionTone;
  className?: string;
  children?: React.ReactNode;
}

const TONE: Record<SectionTone, { bg: string; sub: string }> = {
  night: { bg: '', sub: 'text-night-moon-2' },
  'night-2': { bg: 'bg-night-2 border-y border-night-line', sub: 'text-night-moon-2' },
  lamp: { bg: 'bg-lamp text-lamp-ink landing-on-lamp', sub: 'text-lamp-ink-2' },
};

/** Một phần của landing: tiêu đề h2 + phụ đề thật (hiện một lần khi tới), nội dung do task của phần đó lấp. */
export const Section: React.FC<SectionProps> = ({
  id,
  titleId,
  title,
  sub,
  tone = 'night',
  className = '',
  children,
}) => {
  const headRef = useRef<HTMLDivElement>(null);
  const reveal = useReveal(headRef, { threshold: 0.2 });
  const t = TONE[tone];
  return (
    <section id={id} aria-labelledby={titleId} className={`relative py-24 md:py-32 ${t.bg} ${className}`}>
      <div className="landing-wrap">
        <div ref={headRef} className="max-w-[40rem]" {...reveal}>
          <h2 id={titleId} className="landing-h2">
            {title}
          </h2>
          {sub ? <p className={`mt-[18px] max-w-[34em] text-lg ${t.sub}`}>{sub}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
};
