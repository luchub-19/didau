// Logic thuần của form tạo phòng (DESIGN gđ5 §9): chip ngân sách, ngày, vị trí, ghép payload.
import { avatarUrlFor } from '../components/ui/characterAvatar';
import { cityFromCoords } from './city';
import type { CreateRoomRequest, TieBreakStrategyName } from '../types';

export type BudgetChoice = 'under200' | 'to500' | 'to1m' | 'none' | 'custom';

export const BUDGET_CHIPS: readonly { id: BudgetChoice; limit: number | null }[] = [
  { id: 'under200', limit: 200000 },
  { id: 'to500', limit: 500000 },
  { id: 'to1m', limit: 1000000 },
  { id: 'none', limit: null },
  { id: 'custom', limit: null },
];

/** `budget_limit` gửi lên; `undefined` = bỏ trường (không giới hạn, hoặc tự nhập chưa/không hợp lệ). */
export function budgetLimitFor(choice: BudgetChoice, custom: string): number | undefined {
  if (choice === 'custom') {
    const n = Number(custom);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }
  return BUDGET_CHIPS.find((c) => c.id === choice)?.limit ?? undefined;
}

/** Ngày theo giờ máy (YYYY-MM-DD). Không dùng toISOString: lệch UTC làm "hôm nay" sai ngày lúc 0–7h. */
export function localIsoDate(offsetDays = 0, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface OriginPoint {
  lat: number;
  lng: number;
  label: string;
}

export type LocateResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout' };

/** Hỏi vị trí MỘT lần, timeout 8 s. Chỉ gọi sau khi người dùng bấm. */
export function locateOnce(
  geo: Pick<Geolocation, 'getCurrentPosition'> | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  timeoutMs = 8000,
): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!geo) return resolve({ ok: false, reason: 'unsupported' });
    let done = false;
    const finish = (r: LocateResult) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(r);
    };
    // Một số trình duyệt không bao giờ gọi lại khi hộp thoại quyền bị bỏ qua → tự đặt hạn.
    const guard = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs + 500);
    geo.getCurrentPosition(
      (pos) => finish({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => finish({ ok: false, reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

export interface CreateFormValues {
  title: string;
  nickname: string;
  avatarSeed: string;
  eventDate: string;
  startMinute: number;
  endMinute: number;
  origin: OriginPoint | null;
  /** Thành phố đang chọn tay (dùng khi chưa có toạ độ hoặc toạ độ ngoài HCM/HN). */
  city: string;
  budget: BudgetChoice;
  customBudget: string;
  strategy: TieBreakStrategyName;
  description: string;
}

export function buildCreatePayload(v: CreateFormValues): CreateRoomRequest {
  const budget_limit = budgetLimitFor(v.budget, v.customBudget);
  const guessed = v.origin ? cityFromCoords(v.origin.lat, v.origin.lng) : null;
  return {
    title: v.title.trim(),
    event_date: v.eventDate,
    creator_nickname: v.nickname.trim(),
    creator_avatar_url: avatarUrlFor(v.avatarSeed),
    description: v.description.trim() || undefined,
    ...(budget_limit !== undefined ? { budget_limit } : {}),
    tie_break_strategy: v.strategy,
    city: guessed ?? v.city,
    ...(v.origin ? { origin_lat: v.origin.lat, origin_lng: v.origin.lng } : {}),
    start_minute: v.startMinute,
    end_minute: v.endMinute,
  };
}
