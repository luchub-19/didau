import { useState, useEffect, useCallback, useRef } from 'react';
import { withViewTransition, type TransitionDirection } from '../../motion/viewTransition';

export type RoomTab = 'places' | 'map' | 'schedule' | 'group';

// Thứ tự tab cũng là thứ tự trượt: sang tab bên phải thì nội dung trượt từ phải vào (T-62)
export const ROOM_TABS: readonly RoomTab[] = ['places', 'map', 'schedule', 'group'];

function isValidTab(val: string | null): val is RoomTab {
  return val !== null && (ROOM_TABS as readonly string[]).includes(val);
}

/** Đọc tab từ chuỗi query (`?tab=map`); thiếu hoặc lạ thì về 'places'. */
export function tabFromSearch(search: string | null | undefined): RoomTab {
  if (!search) return 'places';
  const tabParam = new URLSearchParams(search).get('tab');
  return isValidTab(tabParam) ? tabParam : 'places';
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

function getTabFromUrl(): RoomTab {
  if (typeof window === 'undefined') return 'places';
  try {
    return tabFromSearch(window.location.search);
  } catch {
    // Fallback nếu window.location không khả dụng
    return 'places';
  }
}

export function useRoomTab() {
  const [activeTab, setActiveTabState] = useState<RoomTab>(() => getTabFromUrl());
  // Tab đang hiện, đọc được trong handler popstate mà không gắn lại listener
  const activeRef = useRef(activeTab);
  activeRef.current = activeTab;

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

  const setTab = useCallback((newTab: RoomTab) => {
    // So với URL chứ không với state: PlaceForm có instance hook riêng, state của nó có thể cũ
    const from = typeof window !== 'undefined' ? getTabFromUrl() : activeRef.current;
    if (newTab === from) return;
    activeRef.current = newTab;
    if (typeof window !== 'undefined') {
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

  return { activeTab, setTab };
}
