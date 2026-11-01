import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Render tĩnh cho cây có `React.lazy` (T-75: các màn chọn hộ trong DecideModal tải lười).
 * Lần render đầu chỉ ra Suspense fallback và kích hoạt tải; chờ module xong rồi render lại để có nội dung thật.
 */
export async function renderSettled(element: ReactElement): Promise<string> {
  renderToStaticMarkup(element);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return renderToStaticMarkup(element);
}
