// Công tắc gỡ lỗi chuyển động qua URL (docs/phase4/DESIGN.md §4):
//   ?motion=slow  mọi thời lượng ×4 để soi từng khung
//   ?motion=off   ép mức 'static'
//   ?motion=lite  ép mức 'lite'
// Chỉ đọc một lần lúc tải trang; đổi tham số thì tải lại trang.

export type MotionOverride = 'slow' | 'off' | 'lite' | null;

export const SLOW_TIME_SCALE = 4;

/** Đọc tham số `motion` từ chuỗi query (vd. `location.search`). Giá trị lạ bị bỏ qua. */
export function parseMotionOverride(search: string | null | undefined): MotionOverride {
  if (!search) return null;
  const value = new URLSearchParams(search).get('motion');
  if (value === 'slow' || value === 'off' || value === 'lite') return value;
  return null;
}

function readLocationSearch(): string {
  return typeof window !== 'undefined' && window.location ? window.location.search : '';
}

let override: MotionOverride = parseMotionOverride(readLocationSearch());

export function getMotionOverride(): MotionOverride {
  return override;
}

/** Chỉ dùng trong test hoặc trang StyleGuide. */
export function setMotionOverride(next: MotionOverride): void {
  override = next;
}

/** Hệ số nhân thời lượng toàn cục: 4 khi `?motion=slow`, còn lại 1. */
export function getTimeScale(): number {
  return override === 'slow' ? SLOW_TIME_SCALE : 1;
}

/** Log có tiền tố '[stage]', chỉ in ở chế độ dev (lọc console bằng chữ này). */
export function stageLog(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.debug('[stage]', ...args);
  }
}
