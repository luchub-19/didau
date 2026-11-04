// Logic thuần của form tạo phòng (DESIGN gđ6 §1): chip ngân sách, ngày, ghép payload.

/** Khối ngân sách trong form tạo phòng đang ẩn (gđ6); bật lại = đổi một dòng. */
export const SHOW_BUDGET_IN_CREATE = false;
import { avatarUrlFor } from '../components/ui/characterAvatar';
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

export interface CreateFormValues {
  title: string;
  nickname: string;
  avatarSeed: string;
  eventDate: string;
  startMinute: number;
  endMinute: number;
  /** Thành phố: chip TP.HCM / Hà Nội. */
  city: string;
  budget: BudgetChoice;
  customBudget: string;
  strategy: TieBreakStrategyName;
  description: string;
}

export function buildCreatePayload(v: CreateFormValues): CreateRoomRequest {
  const budget_limit = SHOW_BUDGET_IN_CREATE ? budgetLimitFor(v.budget, v.customBudget) : undefined;
  return {
    title: v.title.trim(),
    event_date: v.eventDate,
    creator_nickname: v.nickname.trim(),
    creator_avatar_url: avatarUrlFor(v.avatarSeed),
    description: v.description.trim() || undefined,
    ...(budget_limit !== undefined ? { budget_limit } : {}),
    tie_break_strategy: v.strategy,
    city: v.city,
    start_minute: v.startMinute,
    end_minute: v.endMinute,
  };
}
