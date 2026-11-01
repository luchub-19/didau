import { useState, useEffect, useCallback, useRef } from 'react';
import { withViewTransition, type TransitionDirection } from '../../motion/viewTransition';
import { useMapStore } from '../../store/useMapStore';

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

// ── ?place=<id>: trang chi tiết quán chia sẻ được (T-71, DESIGN gđ5 §2 "URL") ───────────────────────

/** Id quán trong `?place=`; thiếu/rỗng → null. */
export function placeFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  try {
    return new URLSearchParams(search).get('place') || null;
  } catch {
    return null;
  }
}

/** Query sau khi đặt (id) hoặc bỏ (null) `?place=`, giữ các tham số khác; '' khi không còn gì. */
export function searchWithPlace(search: string | null | undefined, placeId: string | null): string {
  const params = new URLSearchParams(search ?? '');
  if (placeId) params.set('place', placeId);
  else params.delete('place');
  const q = params.toString();
  return q ? `?${q}` : '';
}

export type PlaceUrlStep =
  /** Mở panel từ trạng thái đóng: thêm mục lịch sử để Back đóng panel. */
  | { kind: 'push'; search: string }
  /** Đổi sang quán khác khi panel đang mở (↑ ↓, bấm thẻ khác): thay tại chỗ. */
  | { kind: 'replace'; search: string }
  /** Đóng panel bằng nút/Esc khi mục hiện tại là mục mình đã push: lùi lịch sử (giống Back). */
  | { kind: 'back' }
  | null;

/**
 * Bước cần làm với URL khi quán đang mở đổi. `ownsEntry` = mục lịch sử hiện tại do panel push
 * (đóng thì lùi về; không thì thay tại chỗ để khỏi rời phòng).
 */
export function placeUrlStep(search: string, nextPlaceId: string | null, ownsEntry: boolean): PlaceUrlStep {
  const current = placeFromSearch(search);
  if (current === nextPlaceId) return null;
  if (nextPlaceId === null) {
    return ownsEntry ? { kind: 'back' } : { kind: 'replace', search: searchWithPlace(search, null) };
  }
  if (current === null) return { kind: 'push', search: searchWithPlace(search, nextPlaceId) };
  return { kind: 'replace', search: searchWithPlace(search, nextPlaceId) };
}

/** Quán đang mở trên bản đồ (chỉ quán trong phòng mới có `?place=`; POI thì không). */
function selectedRoomPlace(): string | null {
  const sel = useMapStore.getState().selection;
  return sel?.kind === 'place' ? sel.id : null;
}

/**
 * Đồng bộ quán đang mở ↔ `?place=` (gọi một lần, ở MapView).
 * - Tải trang có `?place=x`: mở x; URL được tách thành [phòng] → [phòng?place=x] để Back đóng panel trước.
 * - Mở quán: push; đổi quán: replace; đóng bằng nút/Esc: history.back() nếu mục đó do panel push.
 * - Back/forward: đọc `?place=` và mở/đóng theo. Tab mobile không đổi (popstate của useRoomTab thấy tab giữ nguyên).
 */
export function usePlaceUrlSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // href của mục lịch sử panel đã push; đóng panel chỉ lùi khi vẫn đứng ở đúng mục đó
    let ownedHref: string | null = null;
    const path = () => `${window.location.pathname}`;
    const hash = () => window.location.hash;

    try {
      const initial = placeFromSearch(window.location.search);
      if (initial) {
        const base = searchWithPlace(window.location.search, null);
        window.history.replaceState(window.history.state, '', `${path()}${base}${hash()}`);
        window.history.pushState(null, '', `${path()}${searchWithPlace(base, initial)}${hash()}`);
        ownedHref = window.location.href;
        useMapStore.getState().selectPlace(initial);
      }
    } catch {
      // Môi trường không có history
    }

    const unsub = useMapStore.subscribe((s, prev) => {
      if (s.selection === prev.selection) return;
      const next = selectedRoomPlace();
      const step = placeUrlStep(window.location.search, next, ownedHref === window.location.href);
      if (!step) return;
      try {
        if (step.kind === 'back') {
          ownedHref = null;
          window.history.back();
        } else if (step.kind === 'push') {
          window.history.pushState(null, '', `${path()}${step.search}${hash()}`);
          ownedHref = window.location.href;
        } else {
          const owned = ownedHref === window.location.href;
          window.history.replaceState(window.history.state, '', `${path()}${step.search}${hash()}`);
          ownedHref = owned && step.search.includes('place=') ? window.location.href : null;
        }
      } catch {
        // Bỏ qua: URL chỉ là phụ, panel vẫn đúng theo store
      }
    });

    const onPop = () => {
      const fromUrl = placeFromSearch(window.location.search);
      const open = selectedRoomPlace();
      if (fromUrl === open) return;
      // Forward vào lại mục có ?place=: mục đó vẫn là của panel
      ownedHref = fromUrl ? window.location.href : null;
      if (fromUrl) useMapStore.getState().selectPlace(fromUrl);
      else if (open) useMapStore.getState().selectPlace(null);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      unsub();
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}
