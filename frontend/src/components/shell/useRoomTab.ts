import { useState, useEffect, useCallback } from 'react';

export type RoomTab = 'places' | 'map' | 'schedule' | 'group';

const VALID_TABS: readonly RoomTab[] = ['places', 'map', 'schedule', 'group'];

function isValidTab(val: string | null): val is RoomTab {
  return val !== null && (VALID_TABS as readonly string[]).includes(val);
}

function getTabFromUrl(): RoomTab {
  if (typeof window === 'undefined') return 'places';
  try {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (isValidTab(tabParam)) {
      return tabParam;
    }
  } catch {
    // Fallback nếu window.location không khả dụng
  }
  return 'places';
}

export function useRoomTab() {
  const [activeTab, setActiveTabState] = useState<RoomTab>(() => getTabFromUrl());

  useEffect(() => {
    const handlePopState = () => {
      setActiveTabState(getTabFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const setTab = useCallback((newTab: RoomTab) => {
    setActiveTabState(newTab);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', newTab);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // Fallback môi trường test
      }
    }
  }, []);

  return { activeTab, setTab };
}
