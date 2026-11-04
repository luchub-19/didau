import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { cityFromCoords } from '../room/city';
import {
  buildCreatePayload,
  budgetLimitFor,
  SHOW_BUDGET_IN_CREATE,
  localIsoDate,
  type CreateFormValues,
} from '../room/createRoom';
import { avatarUrlFor } from '../components/ui/characterAvatar';
import { CreateRoomModal, BudgetChips } from '../components/room';
import '../i18n';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const base: CreateFormValues = {
  title: ' Kèo tối ',
  nickname: ' Nam ',
  avatarSeed: 'abc',
  eventDate: '2026-11-02',
  startMinute: 1020,
  endMinute: 1380,
  city: 'HN',
  budget: 'none',
  customBudget: '',
  strategy: 'EARLIEST_SUBMISSION',
  description: '',
};

describe('T-74: payload tạo phòng', () => {
  it('không vị trí + không giới hạn: bỏ origin và budget_limit, giữ city chọn tay', () => {
    const p = buildCreatePayload(base);
    expect(p).not.toHaveProperty('origin_lat');
    expect(p).not.toHaveProperty('budget_limit');
    expect(p.city).toBe('HN');
    expect(p.title).toBe('Kèo tối');
    expect(p.creator_nickname).toBe('Nam');
    expect(p.creator_avatar_url).toBe(avatarUrlFor('abc'));
    expect(p.start_minute).toBe(1020);
    expect(p.end_minute).toBe(1380);
  });

  it('không bao giờ gửi origin_*; city lấy từ chip', () => {
    const p = buildCreatePayload({ ...base, city: 'HCM' });
    expect(p).not.toHaveProperty('origin_lat');
    expect(p).not.toHaveProperty('origin_lng');
    expect(p.city).toBe('HCM');
  });

  it.each([
    ['under200', '', 200000],
    ['to500', '', 500000],
    ['to1m', '', 1000000],
    ['none', '', undefined],
    ['custom', '350000', 350000],
    ['custom', '', undefined],
    ['custom', '-5', undefined],
  ] as const)('ngân sách %s (%s) → %s', (choice, custom, expected) => {
    expect(budgetLimitFor(choice, custom)).toBe(expected);
    // Khối ngân sách đang ẩn (SHOW_BUDGET_IN_CREATE = false): payload không gửi budget_limit dù state có giá trị.
    expect(SHOW_BUDGET_IN_CREATE).toBe(false);
    const p = buildCreatePayload({ ...base, budget: choice, customBudget: custom });
    expect(p).not.toHaveProperty('budget_limit');
  });

  it('localIsoDate theo giờ máy, cộng ngày qua tháng', () => {
    const d = new Date(2026, 0, 31, 0, 30);
    expect(localIsoDate(0, d)).toBe('2026-01-31');
    expect(localIsoDate(1, d)).toBe('2026-02-01');
  });
});

describe('T-74: city từ toạ độ', () => {
  it('HCM, HN và ngoài khung', () => {
    expect(cityFromCoords(10.7769, 106.7009)).toBe('HCM');
    expect(cityFromCoords(21.0285, 105.8542)).toBe('HN');
    expect(cityFromCoords(16.05, 108.2)).toBeNull();
    expect(cityFromCoords(NaN, 106)).toBeNull();
  });
});

describe('T-74: markup form', () => {
  it('mặc định có avatar, đổi nhân vật, chip ngày + thành phố, không còn điểm hẹn/ngân sách, nút tạo không disabled', () => {
    const html = renderToStaticMarkup(<CreateRoomModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    for (const s of [
      vi.avatar.reroll,
      vi.room.create.today,
      vi.room.create.tomorrow,
      vi.room.create.city,
      vi.room.create.cityHcm,
      vi.room.create.cityHn,
    ]) {
      expect(html).toContain(s);
    }
    for (const s of [vi.room.create.budget, vi.room.create.budgetChip.under200, 'Nhóm hẹn nhau ở đâu?']) {
      expect(html).not.toContain(s);
    }
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it('BudgetChips đánh dấu chip đang chọn', () => {
    const chips = renderToStaticMarkup(<BudgetChips value="to500" onChange={() => {}} />);
    expect(chips).toMatch(/aria-pressed="true"[^>]*>(?:<span>)?200–500k/);
  });

  it('i18n: khoá mới có đủ ở cả vi và en', () => {
    expect(Object.keys(en.room.create.budgetChip).sort()).toEqual(Object.keys(vi.room.create.budgetChip).sort());
    expect(en.timeWindow.label).toBeTruthy();
    expect(vi.timeWindow.label).toContain('{{range}}');
  });
});
