import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITY_CENTER, FALLBACK_MAP_STYLE, MAP_STYLE_URL } from '../../config';
import { useMapStore } from '../../store/useMapStore';
import { usePlaceStore } from '../../store/usePlaceStore';
import { useScheduleStore } from '../../store/useScheduleStore';
import type { Place, Poi, Room } from '../../types';
import { highlightPoi, installPoiLayer, updatePoiLayerTheme, updatePoiSource } from './PoiLayer';
import { installRoomPlacesLayer, updateRoomPlacesLayerTheme, updateRoomPlacesSource } from './RoomPlacesLayer';
import { installRouteLayer, updateRouteLayerTheme, updateRouteSource } from './RouteLayer';
import { useTheme } from '../../theme/useTheme';
import { OriginPin } from './OriginPin';
import { MapSearchBox } from './MapSearchBox';
import { PlaceSheet } from './PlaceSheet';
import { NearbySuggestions } from './NearbySuggestions';
import { Button, EmptyState, IconButton, Skeleton, toast } from '../ui';
import { MapPin, WarningCircle } from '../ui/Icon';

export interface MapViewProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  isVotingDisabled?: boolean;
  /** Host keo ghim diem hen xong: goi `PATCH /rooms/{id}`. */
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

/** Duoi muc zoom nay khong tai POI (khung nhin qua rong). */
const MIN_FETCH_ZOOM = 12;

export function MapView({
  room,
  places,
  isHost,
  isVotingDisabled = false,
  onOriginChange,
}: MapViewProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
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

  // Khoi tao map dung mot lan. Style vector loi/qua cham -> dung lai bang style raster OSM.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!hasWebGL()) {
      setMapError(t('map.error.webgl'));
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
          console.error('[MapView] loi dung lop du lieu', err);
        }
        setMapError(null);
        setMap(m);
        setMapReady(true);
        refresh();
      });
      m.on('moveend', refresh);
      m.on('error', (e) => {
        const err = e.error as (Error & { status?: number }) | undefined;
        console.warn('[MapView] map error', err);
        if (!m.isStyleLoaded() && !m.loaded()) switchToFallback();
      });
      if (!isFallback) styleTimeout = setTimeout(() => !m.loaded() && switchToFallback(), 8000);
      else styleTimeout = setTimeout(() => {
        if (!m.loaded()) setMapError(t('map.error.loadStyle'));
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
  }, [t]);

  // Lang nghe resize window hoac doi tab de map khong bi mat kich thuoc
  useEffect(() => {
    if (!map || !mapReady) return;
    const handleResize = () => {
      map.resize();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [map, mapReady]);

  // Cap nhat mau layer pin/route tren ban do khi doi theme sang/toi
  useEffect(() => {
    if (!map || !mapReady) return;
    try {
      updatePoiLayerTheme(map);
      updateRoomPlacesLayerTheme(map);
      updateRouteLayerTheme(map);
    } catch (err) {
      console.warn('[MapView] loi cap nhat mau theme cho lop', err);
    }
  }, [map, mapReady, resolvedTheme]);

  const scheduleItems = useScheduleStore((s) => s.items);
  const autoPlanPreview = useScheduleStore((s) => s.autoPlanPreview);

  // Tuyen duong theo lich trinh hoac ban xem truoc tu len lich
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

  // Cap nhat duong tuyen (RouteLayer)
  useEffect(() => {
    if (map && mapReady) updateRouteSource(map, routeCoordinates);
  }, [map, mapReady, routeCoordinates]);

  // POI (tru quan da trong phong) -> lop POI
  const roomExternalIds = useMemo(
    () => new Set(places.map((p) => p.external_id).filter((id): id is string => !!id)),
    [places],
  );
  useEffect(() => {
    if (map && mapReady) updatePoiSource(map, Object.values(poisById), roomExternalIds);
  }, [map, mapReady, poisById, roomExternalIds]);

  // Quan cua phong, cap nhat realtime tu store
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
    if (!isHost) {
      toast.error(t('map.onlyHostCanChangeOrigin'));
      return;
    }
    const c = getCenter();
    onOriginChange(c.lat, c.lng);
  };

  const selectedPoi = selection?.kind === 'poi' ? poisById[selection.id] : undefined;
  const selectedPlace =
    selection?.kind === 'place' ? places.find((p) => p.id === selection.id) : undefined;

  return (
    <div className="flex flex-col lg:flex-row h-[75vh] min-h-[480px] w-full gap-4">
      {/* Cot trai desktop (360px): danh sach goi y gan day hoac chi tiet quan */}
      <div className="hidden lg:flex flex-col w-[360px] shrink-0 h-full rounded-card border border-line bg-surface p-4 shadow-sm overflow-hidden">
        {selectedPoi || selectedPlace ? (
          <PlaceSheet
            room={room}
            poi={selectedPoi}
            place={selectedPlace}
            onClose={() => {
              selectPoi(null);
              selectPlace(null);
            }}
            isVotingDisabled={isVotingDisabled}
            isDesktopColumn
          />
        ) : (
          <NearbySuggestions
            room={room}
            places={places}
            pois={Object.values(poisById)}
            onSelectPoi={flyToPoi}
            onAddPoi={(poi) => {
              void usePlaceStore.getState().addPlaceFromPoi(room.id, poi);
            }}
            isDesktopColumn
          />
        )}
      </div>

      {/* Khung ban do: full panel tren mobile, cot phai tren desktop */}
      <div className="relative flex-1 h-full min-h-[420px] overflow-hidden rounded-card border border-line bg-surface-2 shadow-sm">
        {/* MapLibre container */}
        <div className="absolute inset-0">
          <div ref={containerRef} className="h-full w-full" data-testid="map-container" />
        </div>

        {/* Trang thai dang tai ban do */}
        {!mapReady && !mapError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/50 pointer-events-none">
            <Skeleton.Block className="w-full h-full opacity-40" />
            <span className="absolute text-caption font-medium text-ink-3 bg-surface/90 px-3 py-1.5 rounded-full shadow-sm">
              {t('map.loadingPlaces')}
            </span>
          </div>
        )}

        {/* Trang thai loi tai ban do */}
        {mapError && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface p-6">
            <EmptyState
              icon={<WarningCircle size={32} className="text-danger" />}
              title={t('map.error.title')}
              description={mapError}
              action={
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  {t('common.retry')}
                </Button>
              }
            />
          </div>
        )}

        {/* O tim kiem noi phia tren */}
        <div className="absolute left-3 right-3 top-3 z-10 max-w-md">
          <MapSearchBox getCenter={getCenter} onPick={flyToPoi} />
        </div>

        {/* Ghim diem tap trung */}
        <OriginPin
          map={map}
          lat={room.origin_lat}
          lng={room.origin_lng}
          draggable={isHost}
          onChange={onOriginChange}
          onPermissionError={() => toast.error(t('map.onlyHostCanChangeOrigin'))}
        />

        {/* Nut dat diem hen tai giua ban do */}
        {isHost && (
          <div className="absolute bottom-3 left-3 z-10">
            <IconButton
              icon={<MapPin size={20} weight="fill" />}
              aria-label={t('map.setOriginAtCenter')}
              title={t('map.setOriginAtCenter')}
              variant="secondary"
              className="shadow-float bg-surface border border-line text-accent"
              onClick={setPinAtCenter}
            />
          </div>
        )}

        {isLoading && (
          <span className="absolute right-3 top-16 z-10 rounded-full bg-surface/90 border border-line px-2.5 py-1 text-caption text-ink-3 shadow-float">
            {t('map.loadingPlaces')}
          </span>
        )}

        {/* Tren mobile: NearbySuggestions khi chua chon quan nao */}
        <div className="lg:hidden">
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
        </div>

        {/* Tren mobile: PlaceSheet bottom sheet khong chan */}
        <div className="lg:hidden">
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
        </div>

        <span className="sr-only">
          {t('map.attribution')}
        </span>
      </div>
    </div>
  );
}

export default MapView;
