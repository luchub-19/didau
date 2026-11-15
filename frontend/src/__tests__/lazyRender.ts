import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Render tĩnh cho cây có `React.lazy` (T-75: các màn chọn hộ trong DecideModal tải lười).
 * Lần render đầu chỉ ra Suspense fallback và kích hoạt tải; chờ module xong rồi render lại để có nội dung thật.
 * T-96: chờ cố định 50 ms không đủ khi cả bộ test chạy song song (chunk lười tải chậm) → render lại tới khi markup
 * khác lần đầu (đã hết fallback, tối đa ~1 s), thay vì đoán một khoảng chờ.
 */
export async function renderSettled(element: ReactElement): Promise<string> {
  const first = renderToStaticMarkup(element);
  let last = first;
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    last = renderToStaticMarkup(element);
    // Chunk lười đã tải → markup khác lần đầu (hết fallback); cây không có lazy thì chờ hết hạn rồi trả bản cuối
    if (last !== first) return last;
  }
  return last;
}
