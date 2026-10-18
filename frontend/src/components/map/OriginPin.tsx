import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { getCssColor } from './PoiLayer';
import { useTheme } from '../../theme/useTheme';

export interface OriginPinProps {
  map: MapLibreMap | null;
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Chi Host duoc keo ghim. */
  draggable: boolean;
  onChange: (lat: number, lng: number) => void;
  onPermissionError?: () => void;
}

/** Ghim "diem tap trung" cua phong; Host keo tha de cap nhat `origin_lat/lng`. */
export function OriginPin({
  map,
  lat,
  lng,
  draggable,
  onChange,
  onPermissionError,
}: OriginPinProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPermissionErrorRef = useRef(onPermissionError);
  onPermissionErrorRef.current = onPermissionError;

  useEffect(() => {
    if (!map || lat == null || lng == null) return;

    const el = document.createElement('div');
    el.title = draggable ? t('map.originPinDrag') : t('map.originPin');
    el.setAttribute('aria-label', el.title);
    el.className = 'origin-pin-marker';
    el.style.cssText =
      'cursor:' +
      (draggable ? 'grab' : 'pointer') +
      ';width:36px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.25));';

    // SVG Pin bieu tuong diem hen voi mau accent
    const accent = getCssColor('--color-accent', '#FF6B4A');
    const ink = getCssColor('--color-ink', '#1C1917');
    const surface = getCssColor('--color-surface', '#FFFFFF');
    el.innerHTML = `
      <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 0C8.05887 0 0 8.05887 0 18C0 28.5 15.5 42.5 17.1 43.85C17.6 44.25 18.4 44.25 18.9 43.85C20.5 42.5 36 28.5 36 18C36 8.05887 27.9411 0 18 0Z" fill="${accent}" stroke="${ink}" stroke-width="2"/>
        <circle cx="18" cy="17" r="7" fill="${surface}"/>
        <circle cx="18" cy="17" r="3.5" fill="${ink}"/>
      </svg>
    `;

    if (!draggable) {
      el.addEventListener('click', () => {
        onPermissionErrorRef.current?.();
      });
    }

    const marker = new maplibregl.Marker({ element: el, draggable, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map);

    marker.on('dragend', () => {
      const p = marker.getLngLat();
      onChangeRef.current(p.lat, p.lng);
    });

    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [map, lat, lng, draggable, t, resolvedTheme]);

  return null;
}
