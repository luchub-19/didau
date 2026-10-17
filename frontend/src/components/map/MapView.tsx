import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_CENTER, MAP_STYLE_URL } from '../../config';
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
      installRouteLayer(instance);
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
