import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  withViewTransition,
  markSharedOrigin,
  isSharedTransitionActive,
  SHARED_TRANSITION_NAME,
  DIRECTION_ATTR,
  DURATION_VAR,
  type ViewTransitionDocument,
} from '../motion/viewTransition';
import { setMotionOverride } from '../motion/debug';
import { MOTION_PRESETS } from '../motion/presets';
import { ROOM_TABS, tabDirection, tabFromSearch, resolvePopTab } from '../components/shell/useRoomTab';

// Bản giả `document` tối thiểu: ghi lại thuộc tính :root, chạy callback ngay như trình duyệt sau khi chụp ảnh cũ
function fakeDoc(withApi = true) {
  const attrs = new Map<string, string>();
  const vars = new Map<string, string>();
  const log: string[] = [];
  let resolveFinished: () => void = () => {};
  const doc: ViewTransitionDocument = {
    documentElement: {
      setAttribute: (n, v) => void attrs.set(n, v),
      removeAttribute: (n) => void attrs.delete(n),
      style: { setProperty: (n, v) => void vars.set(n, v) },
    },
  };
  if (withApi) {
    doc.startViewTransition = (update) => {
      log.push(`start:${attrs.get(DIRECTION_ATTR)}`);
      update();
      return { finished: new Promise<void>((r) => (resolveFinished = r)) };
    };
  }
  return { doc, attrs, vars, log, finish: () => resolveFinished() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  setMotionOverride(null);
});

describe('T-62: thứ tự và hướng tab', () => {
  it('thứ tự tab khớp thanh tab: Quán → Bản đồ → Lịch → Nhóm', () => {
    expect(ROOM_TABS).toEqual(['places', 'map', 'schedule', 'group']);
  });

  it('sang phải là forward, sang trái là back, cùng tab là none', () => {
    expect(tabDirection('places', 'map')).toBe('forward');
    expect(tabDirection('places', 'group')).toBe('forward');
    expect(tabDirection('schedule', 'map')).toBe('back');
    expect(tabDirection('group', 'places')).toBe('back');
    expect(tabDirection('map', 'map')).toBe('none');
  });

  it('đọc tab từ query, giá trị lạ về places', () => {
    expect(tabFromSearch('?tab=schedule')).toBe('schedule');
    expect(tabFromSearch('?foo=1&tab=group')).toBe('group');
    expect(tabFromSearch('?tab=hack')).toBe('places');
    expect(tabFromSearch('')).toBe('places');
    expect(tabFromSearch(undefined)).toBe('places');
  });

  it('popstate (Back) về đúng tab trong URL với hướng ngược lại lượt đi', () => {
    // Đi places → schedule (forward), Back về URL ?tab=places
    expect(tabDirection('places', 'schedule')).toBe('forward');
    expect(resolvePopTab('schedule', '?tab=places')).toEqual({ tab: 'places', direction: 'back' });
    // Forward lại
    expect(resolvePopTab('places', '?tab=schedule')).toEqual({ tab: 'schedule', direction: 'forward' });
    // Back về URL không có tab (vào phòng lần đầu) = places
    expect(resolvePopTab('map', '')).toEqual({ tab: 'places', direction: 'back' });
    // Tab không đổi (vd. popstate rời phòng) → không chuyển
    expect(resolvePopTab('places', '?tab=places')).toBeNull();
  });
});

describe('T-62: withViewTransition', () => {
  it('không có document.startViewTransition → vẫn đổi tab ngay, không đặt thuộc tính', () => {
    const f = fakeDoc(false);
    let tab = 'places';
    const handle = withViewTransition(() => (tab = 'map'), { direction: 'forward', tier: 'full', doc: f.doc });
    expect(handle).toBeNull();
    expect(tab).toBe('map');
    expect(f.attrs.size).toBe(0);
  });

  it('không có document (SSR/test) → vẫn đổi tab', () => {
    let tab = 'places';
    expect(withViewTransition(() => (tab = 'group'), { doc: null, tier: 'full' })).toBeNull();
    expect(tab).toBe('group');
  });

  it('mức static (reduced-motion, ?motion=off) → cập nhật thẳng, không gọi API', () => {
    const f = fakeDoc();
    let tab = 'places';
    withViewTransition(() => (tab = 'schedule'), { direction: 'forward', tier: 'static', doc: f.doc });
    expect(tab).toBe('schedule');
    expect(f.log).toEqual([]);
  });

  it('có API: đặt hướng lên :root trước khi chụp, chạy update trong callback, gỡ khi xong', async () => {
    const f = fakeDoc();
    let tab = 'map';
    const handle = withViewTransition(() => (tab = 'places'), { direction: 'back', tier: 'full', doc: f.doc });
    expect(handle).not.toBeNull();
    expect(f.log).toEqual(['start:back']);
    expect(tab).toBe('places');
    expect(f.vars.get(DURATION_VAR)).toBe('260ms');
    expect(f.attrs.get(DIRECTION_ATTR)).toBe('back');
    f.finish();
    await flush();
    expect(f.attrs.has(DIRECTION_ATTR)).toBe(false);
  });

  it('thời lượng ≤ 280 ms và nhân ×4 khi ?motion=slow', () => {
    const f = fakeDoc();
    withViewTransition(() => {}, { direction: 'forward', tier: 'full', doc: f.doc });
    expect(parseInt(f.vars.get(DURATION_VAR) ?? '', 10)).toBeLessThanOrEqual(280);
    expect(MOTION_PRESETS['tab.switch'].maxSequenceMs).toBeLessThanOrEqual(300);
    setMotionOverride('slow');
    withViewTransition(() => {}, { direction: 'forward', tier: 'full', doc: f.doc });
    expect(f.vars.get(DURATION_VAR)).toBe('1040ms');
  });

  it('startViewTransition ném lỗi → vẫn đổi tab và gỡ thuộc tính', () => {
    const f = fakeDoc();
    f.doc.startViewTransition = () => {
      throw new Error('InvalidStateError');
    };
    let tab = 'places';
    withViewTransition(() => (tab = 'map'), { direction: 'forward', tier: 'full', doc: f.doc });
    expect(tab).toBe('map');
    expect(f.attrs.has(DIRECTION_ATTR)).toBe(false);
  });
});

describe('T-62: phần tử dùng chung (thẻ quán → sheet quán)', () => {
  it('tên chỉ nằm trên thẻ gốc lúc chụp ảnh cũ, rồi chuyển sang phía đích trong lúc chuyển', async () => {
    const f = fakeDoc();
    const card = { style: { viewTransitionName: '' } };
    let nameAtCapture = '';
    let sharedDuringUpdate = false;
    f.doc.startViewTransition = (update) => {
      nameAtCapture = card.style.viewTransitionName;
      update();
      return { finished: Promise.resolve() };
    };
    markSharedOrigin(card);
    withViewTransition(() => (sharedDuringUpdate = isSharedTransitionActive()), {
      direction: 'forward',
      tier: 'full',
      doc: f.doc,
    });
    expect(nameAtCapture).toBe(SHARED_TRANSITION_NAME);
    // Sau khi chụp, thẻ gốc mất tên → không bao giờ có hai phần tử cùng tên
    expect(card.style.viewTransitionName).toBe('');
    expect(sharedDuringUpdate).toBe(true);
    await flush();
    expect(isSharedTransitionActive()).toBe(false);
  });

  it('đánh dấu mà không đổi tab ngay trong cú bấm → tự quên, lần chuyển sau không bay nhầm thẻ', async () => {
    const f = fakeDoc();
    const card = { style: { viewTransitionName: '' } };
    markSharedOrigin(card);
    await flush();
    let sharedDuringUpdate = true;
    withViewTransition(() => (sharedDuringUpdate = isSharedTransitionActive()), {
      direction: 'forward',
      tier: 'full',
      doc: f.doc,
    });
    expect(sharedDuringUpdate).toBe(false);
    expect(card.style.viewTransitionName).toBe('');
  });

  it('không có API → thẻ không bị gắn tên', () => {
    const f = fakeDoc(false);
    const card = { style: { viewTransitionName: '' } };
    markSharedOrigin(card);
    withViewTransition(() => {}, { direction: 'forward', tier: 'full', doc: f.doc });
    expect(card.style.viewTransitionName).toBe('');
  });
});

describe('T-62: CSS chuyển tab', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../styles/motion.css'), 'utf8');

  it('tên transition chỉ gán khi :root mang data-vt-dir (không trùng tên ngoài lúc chuyển)', () => {
    const names = [...css.matchAll(/view-transition-name:\s*([a-z-]+)/g)].map((m) => m[1]);
    expect(names.sort()).toEqual(['room-panel', 'room-tabbar', 'room-topbar', 'tab-indicator']);
    for (const block of css.split('}').filter((b) => b.includes('view-transition-name'))) {
      expect(block).toContain(':root[data-vt-dir]');
    }
  });

  it('thoát nhanh hơn vào, dùng --ease-out, có nhánh reduced-motion', () => {
    expect(css).toMatch(/::view-transition-old\(room-panel\)\s*{\s*animation: vt-panel-out calc\(var\(--vt-tab-ms, var\(--t-tab\)\) \* 0\.6\) var\(--ease-out\)/);
    expect(css).toMatch(/::view-transition-new\(room-panel\)\s*{\s*animation: vt-panel-in var\(--vt-tab-ms, var\(--t-tab\)\) var\(--ease-out\)/);
    expect(css).toContain(':root[data-vt-dir]::view-transition-group(*)');
  });
});
