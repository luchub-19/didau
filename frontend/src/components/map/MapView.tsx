import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_CENTER, FALLBACK_MAP_STYLE, MAP_STYLE_URL } from '../../config';
import { useMapStore } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import type { Place, Poi, Room } from '../../types';
import { highlightPoi, installPoiLayer, updatePoiSource } from './PoiLayer';
import { installRoomPlacesLayer, updateRoomPlacesSource } from './RoomPlacesLayer';
import { installRouteLayer, updateRouteSource } from './RouteLayer';
import { OriginPin } from './OriginPin';
import { MapSearchBox } from './MapSearchBox';
import { PlaceSheet } from './PlaceSheet';
import { NearbySuggestions } from './NearbySuggestions';
import { useScheduleStore } from '../../store/useScheduleStore';

export interface MapViewProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  isVotingDisabled?: boolean;
  /** Host kéo ghim điểm hẹn xong: gọi `PATCH /rooms/{id}`. */
  onOriginChange: (lat: number, lng: number) => void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Dưới mức zoom này không tải POI (khung nhìn quá rộng). */
const MIN_FETCH_ZOOM = 12;

export function MapView({
  room,
  places,
  isHost,
  isVotingDisabled = false,
  onOriginChange,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

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

  // Khởi tạo map đúng một lần. Style vector lỗi/quá chậm → dựng lại bằng style raster OSM.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!hasWebGL()) {
      setMapError('Trình duyệt không hỗ trợ WebGL nên không hiển thị được bản đồ.');
      return;
    }

    let disposed = false;
    let instance: MapLibreMap | null = null;
    let debounce: ReturnType<typeof setTimeout>;
    let styleTimeout: ReturnType<typeof setTimeout>;

    const build = (style: string | typeof FALLBACK_MAP_STYLE, isFallback: boolean) => {
      const m = new maplibregl.Map({
        container,
        style: style as string,
        center: [initialCenter.current.lng, initialCenter.current.lat],
        zoom: 14,
        attributionControl: { compact: true },
      });
      instance = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

      const refresh = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (m.getZoom() < MIN_FETCH_ZOOM) return;
          const b = m.getBounds();
          void useMapStore.getState().loadBounds({
            minLat: b.getSouth(),
            minLng: b.getWest(),
            maxLat: b.getNorth(),
            maxLng: b.getEast(),
          });
        }, 300);
      };

      const switchToFallback = () => {
        if (disposed || isFallback) return;
        clearTimeout(styleTimeout);
        m.remove();
        build(FALLBACK_MAP_STYLE, true);
      };

      m.on('load', () => {
        clearTimeout(styleTimeout);
        try {
          installPoiLayer(m, (id) => useMapStore.getState().selectPoi(id));
          installRoomPlacesLayer(m, (id) => useMapStore.getState().selectPlace(id));
          installRouteLayer(m);
        } catch (err) {
          console.error('[MapView] lỗi dựng lớp dữ liệu', err);
        }
        setMapError(null);
        setMap(m);
        setMapReady(true);
        refresh();
      });
      m.on('moveend', refresh);
      // Lỗi tải style (không phải lỗi gạch lẻ tẻ) → chuyển sang style dự phòng
      m.on('error', (e) => {
        const err = e.error as (Error & { status?: number }) | undefined;
        console.warn('[MapView] map error', err);
        if (!m.isStyleLoaded() && !m.loaded()) switchToFallback();
      });
      // Style quá chậm (mạng nghẽn / bị chặn) cũng lùi về dự phòng
      if (!isFallback) styleTimeout = setTimeout(() => !m.loaded() && switchToFallback(), 8000);
      else styleTimeout = setTimeout(() => {
        if (!m.loaded()) setMapError('Không tải được bản đồ. Kiểm tra kết nối mạng rồi tải lại trang.');
      }, 15000);
    };

    build(MAP_STYLE_URL, false);

    return () => {
      disposed = true;
      clearTimeout(debounce);
      clearTimeout(styleTimeout);
      instance?.remove();
      setMap(null);
      setMapReady(false);
    };
  }, []);

  const scheduleItems = useScheduleStore((s) => s.items);
  const autoPlanPreview = useScheduleStore((s) => s.autoPlanPreview);

  // Tuyến đường theo lịch trình hoặc bản xem trước tự lên lịch
  const routeCoordinates = useMemo<[number, number][]>(() => {
    const placeMap = new Map<string, Place>(places.map((p) => [p.id, p]));
    let orderedIds: string[] = [];

    if (autoPlanPreview?.slots && autoPlanPreview.slots.length > 0) {
      orderedIds = autoPlanPreview.slots.map((s) => s.place_id);
    } else if (scheduleItems.length > 0) {
      const sorted = [...scheduleItems].sort((a, b) => {
        if (a.day_offset !== b.day_offset) return a.day_offset - b.day_offset;
        return a.order_index - b.order_index;
      });
      orderedIds = sorted.map((s) => s.place_id);
    }

    const coords: [number, number][] = [];
    for (const id of orderedIds) {
      const p = placeMap.get(id);
      if (p && p.latitude != null && p.longitude != null) {
        coords.push([p.longitude, p.latitude]);
      }
    }
    return coords;
  }, [places, scheduleItems, autoPlanPreview]);

  // Cập nhật đường tuyến (RouteLayer)
  useEffect(() => {
    if (map && mapReady) updateRouteSource(map, routeCoordinates);
  }, [map, mapReady, routeCoordinates]);

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

  return (
    <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="absolute inset-0" data-testid="map-container" />

      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/90 p-6 text-center text-sm text-slate-600">
          {mapError}
        </div>
      )}

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

      {places.length === 0 && !selection && (
        <NearbySuggestions
          room={room}
          places={places}
          pois={Object.values(poisById)}
          onSelectPoi={flyToPoi}
          onAddPoi={(poi) => {
            void usePlaceStore.getState().addPlaceFromPoi(room.id, poi);
          }}
        />
      )}

      {(selectedPoi || selectedPlace) && (
        <PlaceSheet
          room={room}
          poi={selectedPoi}
          place={selectedPlace}
          onClose={() => {
            selectPoi(null);
            selectPlace(null);
          }}
          isVotingDisabled={isVotingDisabled}
        />
      )}

      <span className="sr-only">
        Dữ liệu bản đồ © OpenStreetMap contributors, OpenFreeMap
      </span>
    </div>
  );
}

export default MapView;
