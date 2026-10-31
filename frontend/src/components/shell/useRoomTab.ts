import { useState, useEffect, useCallback, useRef } from 'react';
import { withViewTransition, type TransitionDirection } from '../../motion/viewTransition';

/** Tab của phòng trên mobile (<1024px, DESIGN gđ5 §2). Desktop không có tab: 3 cột cùng hiện. */
export type RoomTab = 'explore' | 'plan';

/** Giá trị `?tab=` của giai đoạn 3–4; vẫn nhận để link cũ không gãy. */
export type LegacyRoomTab = 'places' | 'map' | 'schedule' | 'group';

// Thứ tự tab cũng là thứ tự trượt: sang tab bên phải thì nội dung trượt từ phải vào (T-62)
export const ROOM_TABS: readonly RoomTab[] = ['explore', 'plan'];

const LEGACY_TAB_MAP: Record<LegacyRoomTab, RoomTab> = {
  places: 'explore',
  map: 'explore',
  schedule: 'plan',
  group: 'explore',
};

/** Chuẩn hoá một giá trị tab (mới hoặc cũ); lạ/thiếu thì về 'explore'. */
export function normalizeTab(raw: string | null | undefined): RoomTab {
  if (raw === 'explore' || raw === 'plan') return raw;
  if (raw && Object.prototype.hasOwnProperty.call(LEGACY_TAB_MAP, raw)) {
    return LEGACY_TAB_MAP[raw as LegacyRoomTab];
  }
  return 'explore';
}

function readTabParam(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    return new URLSearchParams(search).get('tab');
  } catch {
    return null;
  }
}

/** Đọc tab từ chuỗi query (`?tab=plan`), có ánh xạ link cũ (`schedule` → `plan`, `map` → `explore`…). */
export function tabFromSearch(search: string | null | undefined): RoomTab {
  return normalizeTab(readTabParam(search));
}

/** Link cũ `?tab=group`: vào Khám phá và mở thông tin nhóm (T-68 đổi thành menu avatar). */
export function isLegacyGroupLink(search: string | null | undefined): boolean {
  return readTabParam(search) === 'group';
}

/** Query có `?tab=` cũ cần thay bằng giá trị mới (replaceState, không thêm mục lịch sử). */
export function canonicalTabSearch(search: string | null | undefined): string | null {
  const raw = readTabParam(search);
  if (raw === null || raw === 'explore' || raw === 'plan') return null;
  const params = new URLSearchParams(search ?? '');
  params.set('tab', normalizeTab(raw));
  return `?${params.toString()}`;
}

/** Hướng trượt khi đi từ tab `from` sang `to` theo thứ tự trên thanh tab. */
export function tabDirection(from: RoomTab, to: RoomTab): TransitionDirection {
  const a = ROOM_TABS.indexOf(from);
  const b = ROOM_TABS.indexOf(to);
  if (a === b) return 'none';
  return b > a ? 'forward' : 'back';
}

/** Back/forward: tab mới từ URL và hướng trượt; null khi tab không đổi (vd. popstate về trang chủ). */
export function resolvePopTab(
  current: RoomTab,
  search: string | null | undefined,
): { tab: RoomTab; direction: TransitionDirection } | null {
  const tab = tabFromSearch(search);
  if (tab === current) return null;
  return { tab, direction: tabDirection(current, tab) };
}

function currentSearch(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.location.search;
  } catch {
    // Fallback nếu window.location không khả dụng
    return '';
  }
}

export function useRoomTab() {
  const [activeTab, setActiveTabState] = useState<RoomTab>(() => tabFromSearch(currentSearch()));
  // Link cũ ?tab=group: đọc một lần lúc vào phòng
  const [openedFromGroupLink] = useState<boolean>(() => isLegacyGroupLink(currentSearch()));
  // Tab đang hiện, đọc được trong handler popstate mà không gắn lại listener
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

  // Thay ?tab= cũ bằng giá trị mới để chia sẻ link về sau đúng chuẩn
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const next = canonicalTabSearch(window.location.search);
      if (next !== null) {
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${next}${window.location.hash}`);
      }
    } catch {
      // Môi trường test không có history
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const next = resolvePopTab(activeRef.current, window.location.search);
      if (!next) return;
      activeRef.current = next.tab;
      withViewTransition(() => setActiveTabState(next.tab), { direction: next.direction });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  /** Nhận cả giá trị cũ (`'map'`, `'schedule'`…) để chỗ gọi cũ (PlaceForm) không gãy. */
  const setTab = useCallback((requested: RoomTab | LegacyRoomTab) => {
    const newTab = normalizeTab(requested);
    // So với URL chứ không với state: PlaceForm có instance hook riêng, state của nó có thể cũ
    const from = typeof window !== 'undefined' ? tabFromSearch(currentSearch()) : activeRef.current;
    if (newTab === from && newTab === activeRef.current) return;
    activeRef.current = newTab;
    if (typeof window !== 'undefined' && newTab !== from) {
      try {
        // pushState để nút Back của trình duyệt lùi về tab trước (popstate ở trên)
        const url = new URL(window.location.href);
        url.searchParams.set('tab', newTab);
        window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Fallback môi trường test
      }
    }
    withViewTransition(() => setActiveTabState(newTab), { direction: tabDirection(from, newTab) });
  }, []);

  return { activeTab, setTab, openedFromGroupLink };
}
