import { useEffect, useState } from 'react';
import { curatedLoaded, loadCurated, type CuratedData } from './curated';

/** Bộ tuyển chọn nạp lười (chunk JSON riêng); `null` trong lúc chờ. */
export function useCuratedData(): CuratedData | null {
  const [data, setData] = useState<CuratedData | null>(curatedLoaded);
  useEffect(() => {
    if (data) return;
    let alive = true;
    loadCurated()
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [data]);
  return data;
}
