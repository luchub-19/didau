// Khung rộng (có khung app dính) hay hẹp (khung riêng từng bước). Không có matchMedia (test/SSR) -> rộng.
import { useEffect, useState } from 'react';
import { WIDE_QUERY } from './model';

const query = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(WIDE_QUERY) : null);

export function useWide(): boolean {
  const [wide, setWide] = useState(() => query()?.matches ?? true);
  useEffect(() => {
    const mq = query();
    if (!mq) return;
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
