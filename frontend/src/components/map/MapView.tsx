import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_CENTER, MAP_STYLE_URL } from '../../config';
import { distanceKm, useMapStore } from '../../store/useMapStore';
import type { Place, Poi, Room } from '../../types';
import { CATEGORY_METADATA } from '../common/categoryMetadata';
import { highlightPoi, installPoiLayer, updatePoiSource } from './PoiLayer';
import { installRoomPlacesLayer, updateRoomPlacesSource } from './RoomPlacesLayer';
import { OriginPin } from './OriginPin';
import { MapSearchBox } from './MapSearchBox';

export interface MapViewProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  /** Host kéo ghim điểm hẹn xong: gọi `PATCH /rooms/{id}`. */
  onOriginChange: (lat: number, lng: number) => void;
}

/** Dưới mức zoom này không tải POI (khung nhìn quá rộng). */
const MIN_FETCH_ZOOM = 12;

export function MapView({ room, places, isHost, onOriginChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const poisById = useMapStore((s) => s.poisById);
  const selection = useMapStore((s) => s.selection);
  const isLoading = useMapStore((s) => s.isLoading);
  const selectPoi = useMapStore((s) => s.selectPoi);
  const selectPlace = useMapStore((s) => s.selectPlace);

  const hasOrigin = room.origin_lat != null && room.origin_lng != null;
  const initialCenter = useRef(
    hasOrigin
      ? { lat: room.origin_lat as number, lng: room.origin_lng as number }
      : (CITY_CENTER[room.city ?? 'HCM'] ?? CITY_CENTER.HCM),
  );

  // Khởi tạo map đúng một lần
  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [initialCenter.current.lng, initialCenter.current.lat],
      zoom: 14,
      attributionControl: { compact: true },
    });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    let debounce: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (instance.getZoom() < MIN_FETCH_ZOOM) return;
        const b = instance.getBounds();
        void useMapStore.getState().loadBounds({
          minLat: b.getSouth(),
          minLng: b.getWest(),
          maxLat: b.getNorth(),
          maxLng: b.getEast(),
        });
      }, 300);
    };

    instance.on('load', () => {
      installPoiLayer(instance, (id) => useMapStore.getState().selectPoi(id));
      installRoomPlacesLayer(instance, (id) => useMapStore.getState().selectPlace(id));
      setMap(instance);
      setMapReady(true);
      refresh();
    });
    instance.on('moveend', refresh);

    return () => {
      clearTimeout(debounce);
      instance.remove();
      setMap(null);
      setMapReady(false);
    };
  }, []);

  // POI (trừ quán đã trong phòng) → lớp POI
  const roomExternalIds = useMemo(
    () => new Set(places.map((p) => p.external_id).filter((id): id is string => !!id)),
    [places],
  );
  useEffect(() => {
    if (map && mapReady) updatePoiSource(map, Object.values(poisById), roomExternalIds);
  }, [map, mapReady, poisById, roomExternalIds]);

  // Quán của phòng, cập nhật realtime từ store
  useEffect(() => {
    if (map && mapReady) updateRoomPlacesSource(map, places);
  }, [map, mapReady, places]);

  useEffect(() => {
    if (map && mapReady) highlightPoi(map, selection?.kind === 'poi' ? selection.id : null);
  }, [map, mapReady, selection]);

  const getCenter = useCallback(() => {
    const c = map?.getCenter();
    return c ? { lat: c.lat, lng: c.lng } : initialCenter.current;
  }, [map]);

  const flyToPoi = useCallback(
    (poi: Poi) => {
      selectPoi(poi.external_id);
      map?.flyTo({ center: [poi.lng, poi.lat], zoom: Math.max(map.getZoom(), 16) });
    },
    [map, selectPoi],
  );

  const setPinAtCenter = () => {
    const c = getCenter();
    onOriginChange(c.lat, c.lng);
  };

  const selectedPoi = selection?.kind === 'poi' ? poisById[selection.id] : undefined;
  const selectedPlace =
    selection?.kind === 'place' ? places.find((p) => p.id === selection.id) : undefined;

  const origin = hasOrigin
    ? { lat: room.origin_lat as number, lng: room.origin_lng as number }
    : null;
  const distanceFromOrigin = (lat: number, lng: number) =>
    origin ? `${distanceKm(origin.lat, origin.lng, lat, lng).toFixed(1)} km từ điểm hẹn` : null;

  return (
    <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="absolute inset-0" data-testid="map-container" />

      <div className="absolute left-3 right-3 top-3 z-10 max-w-md">
        <MapSearchBox getCenter={getCenter} onPick={flyToPoi} />
      </div>

      <OriginPin
        map={map}
        lat={room.origin_lat}
        lng={room.origin_lng}
        draggable={isHost}
        onChange={onOriginChange}
      />

      {isHost && !hasOrigin && (
        <button
          type="button"
          onClick={setPinAtCenter}
          className="absolute bottom-3 left-3 z-10 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-lg"
        >
          📍 Đặt điểm hẹn tại giữa bản đồ
        </button>
      )}

      {isLoading && (
        <span className="absolute right-3 top-16 z-10 rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-600 shadow">
          Đang tải quán…
        </span>
      )}

      {(selectedPoi || selectedPlace) && (
        <div className="absolute inset-x-3 bottom-3 z-10 max-w-md rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:left-auto sm:right-14">
          {selectedPoi && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPoi.name}</p>
                  <p className="text-xs text-slate-500">
                    {CATEGORY_METADATA[selectedPoi.category]?.icon}{' '}
                    {CATEGORY_METADATA[selectedPoi.category]?.label}
                    {selectedPoi.cuisine ? ` · ${selectedPoi.cuisine}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => selectPoi(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
              {selectedPoi.address && (
                <p className="mt-1 text-xs text-slate-600">{selectedPoi.address}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {[
                  distanceFromOrigin(selectedPoi.lat, selectedPoi.lng),
                  selectedPoi.opening_hours_raw,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </>
          )}
          {selectedPlace && (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{selectedPlace.name}</p>
                  <p className="text-xs text-slate-500">
                    Đã trong lựa chọn · điểm vote {selectedPlace.score}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => selectPlace(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
              {selectedPlace.address && (
                <p className="mt-1 text-xs text-slate-600">{selectedPlace.address}</p>
              )}
            </>
          )}
        </div>
      )}

      <span className="sr-only">
        Dữ liệu bản đồ © OpenStreetMap contributors, OpenFreeMap
      </span>
    </div>
  );
}

export default MapView;
