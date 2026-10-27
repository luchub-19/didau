// Sân khấu quẹt thẻ (T-60). Chunk `StageDeck` (thư viện `motion`) tải lười; luật thuần và tiến độ ở chunk chính.
import { lazy } from 'react';

const loadStageDeck = () => import('./StageDeck');

export const StageDeck = lazy(loadStageDeck);

/** Tải trước chunk sân khấu khi phiên quẹt mở, để thẻ đầu tiên kéo được ngay. */
export function prefetchStageDeck(): void {
  void loadStageDeck().catch(() => undefined);
}

export type { StageDeckProps } from './StageDeck';
export { DeckCardFace } from './DeckCardFace';
export { DeckProgress } from './DeckProgress';
export * from './rules';
