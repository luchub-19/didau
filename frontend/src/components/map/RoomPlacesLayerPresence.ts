// Lớp hiện diện trên bản đồ phòng (CR-08, T-63): avatar người đang xem trên ghim quán + con trỏ bạn bè.
// Gửi: con trỏ chuột trên bản đồ, rê lên ghim quán. Nhận: đọc usePresenceStore, vẽ bằng Marker DOM.
// Con trỏ chỉ ở mức `full` và ≥1024px; nội suy bằng rAF, dừng vòng lặp khi mọi con trỏ đã tới đích.
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import i18n from '../../i18n';
import { getMotionTier } from '../../motion';
import { usePlaceStore } from '../../store/usePlaceStore';
import { usePresenceStore } from '../../store/usePresenceStore';
import { useRoomStore } from '../../store/useRoomStore';
import { clearHoverPlace, setHoverPlace, setMapCursor } from '../../stage/presence/channel';
import {
  PRESENCE_CURSOR_MIN_WIDTH,
  approach,
  avatarStack,
  mapCursors,
  viewersByPlace,
} from '../../stage/presence/rules';

// Viền coral để chip người không lẫn với ghim POI/cụm số tối màu
const CHIP_CLASS =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-accent bg-surface px-1 text-[11px] font-bold text-ink shadow-sm';

function nicknameOf(memberId: string): string {
  return (
    useRoomStore.getState().members.find((m) => m.id === memberId)?.nickname ??
    i18n.t('place.defaultMember')
  );
}

function initial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? '?';
}

function avatarStackElement(ids: string[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pointer-events-none flex -space-x-1.5';
  el.dataset.testid = 'map-presence-avatars';
  const names = ids.map(nicknameOf);
  const label = i18n.t('presence.viewing', { count: ids.length, names: names.join(', ') });
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  const { shown, extra } = avatarStack(names);
  for (const name of shown) {
    const chip = document.createElement('span');
    chip.className = CHIP_CLASS;
    chip.textContent = initial(name);
    el.appendChild(chip);
  }
  if (extra > 0) {
    const more = document.createElement('span');
    more.className = CHIP_CLASS;
    more.textContent = i18n.t('presence.more', { count: extra });
    el.appendChild(more);
  }
  return el;
}

function cursorElement(name: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pointer-events-none flex items-start gap-0.5';
  el.dataset.testid = 'map-presence-cursor';
  // Con trỏ chạy liên tục: chỉ để nhìn, trình đọc màn hình bỏ qua (avatar trên ghim/thẻ đã đọc tên)
  el.setAttribute('aria-hidden', 'true');
  el.title = i18n.t('presence.cursor', { name });
  el.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M1 1 L14 6.5 L8 8 L6.5 14 Z" fill="rgb(var(--color-accent))" stroke="rgb(var(--color-surface))" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const tag = document.createElement('span');
  tag.className =
    'mt-3 max-w-[10rem] truncate rounded-full bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-surface shadow-sm';
  tag.textContent = name;
  el.appendChild(tag);
  return el;
}

interface CursorState {
  marker: Marker;
  lng: number;
  lat: number;
  target: { lng: number; lat: number };
}

const cursorsAllowed = () =>
  getMotionTier() === 'full' && typeof window !== 'undefined' && window.innerWidth >= PRESENCE_CURSOR_MIN_WIDTH;

export function installPresenceLayer(map: MapLibreMap, placesLayerId: string): void {
  const pinMarkers = new Map<string, { key: string; marker: Marker }>();
  const cursors = new Map<string, CursorState>();
  let raf: number | null = null;
  let last = 0;
  let hoveredPin: string | null = null;

  // --- Gửi ---
  const finePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
  if (finePointer) {
    map.on('mousemove', (e) => setMapCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.getCanvasContainer().addEventListener('mouseleave', () => setMapCursor(null));
  }
  map.on('mousemove', placesLayerId, (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    if (!id || id === hoveredPin) return;
    if (hoveredPin) clearHoverPlace(hoveredPin);
    hoveredPin = id;
    setHoverPlace(id);
  });
  map.on('mouseleave', placesLayerId, () => {
    if (hoveredPin) clearHoverPlace(hoveredPin);
    hoveredPin = null;
  });

  // --- Nhận: avatar trên ghim ---
  const renderPins = () => {
    const meId = useRoomStore.getState().currentMember?.id;
    const viewers = viewersByPlace(usePresenceStore.getState().peers, meId);
    const places = usePlaceStore.getState().places;
    const seen = new Set<string>();
    for (const place of places) {
      const ids = viewers[place.id];
      if (!ids?.length || place.latitude == null || place.longitude == null) continue;
      seen.add(place.id);
      const key = `${ids.join(',')}|${ids.map(nicknameOf).join(',')}|${place.longitude},${place.latitude}`;
      const existing = pinMarkers.get(place.id);
      if (existing?.key === key) continue;
      existing?.marker.remove();
      const element = avatarStackElement(ids);
      const label = element.getAttribute('aria-label') ?? '';
      const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -18] })
        .setLngLat([place.longitude, place.latitude])
        .addTo(map);
      // Marker ghi đè aria-label thành "Map marker": đặt lại nhãn đọc tên người xem
      element.setAttribute('aria-label', label);
      pinMarkers.set(place.id, { key, marker });
    }
    for (const [id, entry] of pinMarkers) {
      if (!seen.has(id)) {
        entry.marker.remove();
        pinMarkers.delete(id);
      }
    }
  };

  // --- Nhận: con trỏ ---
  const step = (now: number) => {
    const dt = last ? now - last : 16;
    last = now;
    let moving = false;
    for (const c of cursors.values()) {
      c.lng = approach(c.lng, c.target.lng, dt);
      c.lat = approach(c.lat, c.target.lat, dt);
      if (Math.abs(c.lng - c.target.lng) > 1e-7 || Math.abs(c.lat - c.target.lat) > 1e-7) moving = true;
      else {
        c.lng = c.target.lng;
        c.lat = c.target.lat;
      }
      c.marker.setLngLat([c.lng, c.lat]);
    }
    raf = moving ? requestAnimationFrame(step) : null;
    if (!moving) last = 0;
  };

  const renderCursors = () => {
    const meId = useRoomStore.getState().currentMember?.id;
    const targets = cursorsAllowed() ? mapCursors(usePresenceStore.getState().peers, meId) : {};
    for (const [id, target] of Object.entries(targets)) {
      const c = cursors.get(id);
      if (c) {
        c.target = target;
        continue;
      }
      const marker = new maplibregl.Marker({ element: cursorElement(nicknameOf(id)), anchor: 'top-left' })
        .setLngLat([target.lng, target.lat])
        .addTo(map);
      // Con trỏ nằm trên avatar ghim (marker thêm sau chưa chắc ở trên)
      marker.getElement().style.zIndex = '2';
      marker.getElement().removeAttribute('aria-label');
      cursors.set(id, { marker, lng: target.lng, lat: target.lat, target });
    }
    for (const [id, c] of cursors) {
      if (!(id in targets)) {
        c.marker.remove();
        cursors.delete(id);
      }
    }
    if (cursors.size > 0 && raf === null) raf = requestAnimationFrame(step);
  };

  const render = () => {
    renderPins();
    renderCursors();
  };

  const unsubPresence = usePresenceStore.subscribe((s, prev) => {
    if (s.peers !== prev.peers) render();
  });
  const unsubPlaces = usePlaceStore.subscribe((s, prev) => {
    if (s.places !== prev.places) renderPins();
  });
  const unsubMembers = useRoomStore.subscribe((s, prev) => {
    if (s.members !== prev.members) render();
  });
  render();

  map.once('remove', () => {
    unsubPresence();
    unsubPlaces();
    unsubMembers();
    if (raf !== null) cancelAnimationFrame(raf);
    pinMarkers.forEach((e) => e.marker.remove());
    cursors.forEach((c) => c.marker.remove());
    if (hoveredPin) clearHoverPlace(hoveredPin);
    setMapCursor(null);
  });
}
