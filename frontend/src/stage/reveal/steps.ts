// Kịch bản màn công bố quán thắng (T-61) là DỮ LIỆU: dim → fly → card → sweep → actions.
// Mỗi bước ghi mốc bắt đầu và độ dài theo tỉ lệ của thời lượng preset 'decide.reveal' (--t-reveal),
// nên `?motion=slow` và mức 'lite' tự co giãn theo, không có số ms rời trong component.
import { resolvePreset, type MotionTier } from '../../motion';

export type RevealStepId = 'dim' | 'fly' | 'card' | 'sweep' | 'actions';

export interface RevealStep {
  id: RevealStepId;
  /** Mốc bắt đầu (ms kể từ lúc mở màn). */
  at: number;
  /** Độ dài (ms). */
  duration: number;
}

interface ScriptRow {
  id: RevealStepId;
  at: number;
  span: number;
}

/** Có bản đồ thật để bay: thẻ chờ camera đi được một đoạn rồi mới phóng lên. */
export const SCRIPT_WITH_MAP: readonly ScriptRow[] = [
  { id: 'dim', at: 0, span: 0.12 },
  { id: 'fly', at: 0, span: 1 },
  { id: 'card', at: 0.3, span: 0.3 },
  { id: 'sweep', at: 0.62, span: 0.38 },
  { id: 'actions', at: 0.95, span: 0.15 },
];

/** Không bay (tab Bản đồ chưa mở/đang ẩn, hoặc mức 'lite'): thẻ lên ngay sau khi lùi tối. */
export const SCRIPT_CARD_ONLY: readonly ScriptRow[] = [
  { id: 'dim', at: 0, span: 0.12 },
  { id: 'card', at: 0.08, span: 0.3 },
  { id: 'sweep', at: 0.36, span: 0.38 },
  { id: 'actions', at: 0.7, span: 0.15 },
];

/**
 * Các bước thật ở một mức. 'full' bay bản đồ nếu có, 'lite' không bay (thẻ + nắng quét, rút ngắn),
 * 'static' chỉ lùi tối + hiện thẻ + nút cùng lúc bằng đổi opacity (không quét, không dịch chuyển).
 */
export function revealSteps(tier: MotionTier, opts: { canFly: boolean }): RevealStep[] {
  const preset = resolvePreset('decide.reveal', tier);
  if (tier === 'static') {
    return (['dim', 'card', 'actions'] as const).map((id) => ({ id, at: 0, duration: preset.durationMs }));
  }
  const script = tier === 'full' && opts.canFly ? SCRIPT_WITH_MAP : SCRIPT_CARD_ONLY;
  return script.map((row) => ({
    id: row.id,
    at: Math.round(row.at * preset.durationMs),
    duration: Math.round(row.span * preset.durationMs),
  }));
}

/** Tổng thời gian của chuỗi (ms) = bước kết thúc muộn nhất. */
export function revealTotalMs(steps: readonly RevealStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.at + s.duration), 0);
}

export function stepOf(steps: readonly RevealStep[], id: RevealStepId): RevealStep | undefined {
  return steps.find((s) => s.id === id);
}

export type RevealIntent = 'skip' | 'close' | null;

/**
 * Phím/bấm làm gì: đang chạy thì mọi cách (Esc, bấm nền, bấm thẻ, nút "Bỏ qua") đều nhảy tới trạng thái cuối;
 * đã xong thì Esc hoặc bấm nền đóng màn, bấm trong thẻ để nút tự xử lý.
 */
export function revealIntent(
  input: { kind: 'escape' } | { kind: 'click'; insideCard: boolean },
  finished: boolean,
): RevealIntent {
  if (!finished) return 'skip';
  if (input.kind === 'escape') return 'close';
  return input.insideCard ? null : 'close';
}
