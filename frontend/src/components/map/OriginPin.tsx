import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';

export interface OriginPinProps {
  map: MapLibreMap | null;
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Chỉ Host được kéo ghim. */
  draggable: boolean;
  onChange: (lat: number, lng: number) => void;
}

/** Ghim "điểm tập trung" của phòng; Host kéo thả để cập nhật `origin_lat/lng`. */
export function OriginPin({ map, lat, lng, draggable, onChange }: OriginPinProps) {
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!map || lat == null || lng == null) return;
    const el = document.createElement('div');
    el.textContent = '📍';
    el.title = draggable ? 'Điểm hẹn (kéo để đổi)' : 'Điểm hẹn';
    el.style.cssText = 'font-size:30px;line-height:1;cursor:' + (draggable ? 'grab' : 'default');

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
  }, [map, lat, lng, draggable]);

  return null;
}
