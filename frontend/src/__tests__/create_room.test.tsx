import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi as vitest } from 'vitest';
import { cityFromCoords } from '../room/city';
import {
  buildCreatePayload,
  budgetLimitFor,
  localIsoDate,
  locateOnce,
  type CreateFormValues,
} from '../room/createRoom';
import { avatarUrlFor } from '../components/ui/characterAvatar';
import { CreateRoomModal, BudgetChips, OriginPicker } from '../components/room';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const base: CreateFormValues = {
  title: ' Kèo tối ',
  nickname: ' Nam ',
  avatarSeed: 'abc',
  eventDate: '2026-11-02',
  startMinute: 1020,
  endMinute: 1380,
  origin: null,
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

  it('có vị trí: gửi toạ độ và suy city (đè giá trị chọn tay)', () => {
    const p = buildCreatePayload({ ...base, origin: { lat: 10.78, lng: 106.7, label: 'x' } });
    expect(p.origin_lat).toBe(10.78);
    expect(p.origin_lng).toBe(106.7);
    expect(p.city).toBe('HCM');
  });

  it('vị trí ngoài HCM/HN: giữ city chọn tay', () => {
    const p = buildCreatePayload({ ...base, city: 'HCM', origin: { lat: 16.05, lng: 108.2, label: 'Đà Nẵng' } });
    expect(p.origin_lat).toBe(16.05);
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
    const p = buildCreatePayload({ ...base, budget: choice, customBudget: custom });
    if (expected === undefined) expect(p).not.toHaveProperty('budget_limit');
    else expect(p.budget_limit).toBe(expected);
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

describe('T-74: locateOnce', () => {
  it('thành công trả toạ độ', async () => {
    const geo = {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 10.8, longitude: 106.7 } } as GeolocationPosition),
    };
    expect(await locateOnce(geo)).toEqual({ ok: true, lat: 10.8, lng: 106.7 });
  });

  it('từ chối quyền → denied (để UI chuyển sang tìm địa điểm)', async () => {
    const geo = {
      getCurrentPosition: (_: PositionCallback, err: PositionErrorCallback) =>
        err({ code: 1 } as GeolocationPositionError),
    };
    expect(await locateOnce(geo)).toEqual({ ok: false, reason: 'denied' });
  });

  it('không hỗ trợ → unsupported', async () => {
    expect(await locateOnce(undefined)).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('trình duyệt im lặng quá hạn → timeout', async () => {
    vitest.useFakeTimers();
    const p = locateOnce({ getCurrentPosition: () => {} }, 8000);
    vitest.advanceTimersByTime(8600);
    expect(await p).toEqual({ ok: false, reason: 'timeout' });
    vitest.useRealTimers();
  });
});

describe('T-74: markup form', () => {
  it('mặc định có avatar, đổi nhân vật, chip ngày/ngân sách, 3 lựa chọn điểm hẹn, nút tạo không disabled', () => {
    const html = renderToStaticMarkup(<CreateRoomModal isOpen onClose={() => {}} onSuccess={() => {}} />);
    for (const s of [
      vi.avatar.reroll,
      vi.room.create.today,
      vi.room.create.tomorrow,
      vi.room.create.originHere,
      vi.room.create.originSearch,
      vi.room.create.originLater,
      vi.room.create.budgetChip.under200,
      vi.room.create.budgetChip.none,
      vi.room.create.budgetChip.custom,
      vi.room.create.city,
    ]) {
      expect(html).toContain(s);
    }
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it('BudgetChips đánh dấu chip đang chọn; OriginPicker hiện điểm đã chọn', () => {
    const chips = renderToStaticMarkup(<BudgetChips value="to500" onChange={() => {}} />);
    expect(chips).toMatch(/aria-pressed="true"[^>]*>(?:<span>)?200–500k/);
    const picker = renderToStaticMarkup(
      <OriginPicker value={{ lat: 1, lng: 2, label: 'Chợ Bến Thành' }} onChange={() => {}} />,
    );
    expect(picker).toContain(vi.room.create.originLaterHint);
  });

  it('i18n: khoá mới có đủ ở cả vi và en', () => {
    expect(Object.keys(en.room.create.budgetChip).sort()).toEqual(Object.keys(vi.room.create.budgetChip).sort());
    expect(en.room.create.originDenied).toBeTruthy();
  });
});
