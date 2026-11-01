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
import {
  ROOM_PLACES_LAYER,
  installRoomPlacesLayer,
  updateRoomPlacesLayerTheme,
  updateRoomPlacesSource,
} from './RoomPlacesLayer';
import { getCssColor } from './PoiLayer';
import { installRouteLayer, updateRouteLayerTheme, updateRouteSource } from './RouteLayer';
import { useTheme } from '../../theme/useTheme';
import { registerMapFlyer } from './flyToPlace';
import { OriginPin } from './OriginPin';
import { MapSearchBox } from './MapSearchBox';
import { PlaceDetail } from '../places/PlaceDetail';
import { useWorkspaceLayout } from '../shell/workspace';
import { usePlaceUrlSync } from '../shell/useRoomTab';
import { Button, EmptyState, IconButton, Skeleton, toast } from '../ui';
import { MapPin, WarningCircle } from '../ui/Icon';

export interface MapViewProps {
  room: Room;
  places: Place[];
  isHost: boolean;
  isVotingDisabled?: boolean;
  /** Host keo ghim diem hen xong: goi `PATCH /rooms/{id}`. */
  onOriginChange: (lat: number, lng: number) => void;
  /** Ô tìm kiếm nổi trên bản đồ; giai đoạn ① đã có ô tìm kiếm lớn ở cột trái nên ẩn (T-72). */
  showSearch?: boolean;
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
  showSearch = true,
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
  const placesLoading = usePlaceStore((s) => s.isLoading);
  const layout = useWorkspaceLayout();

  // ?place=<id> ↔ quán đang mở; Back đóng trang chi tiết trước (T-71)
  usePlaceUrlSync();

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

  // Khung ban do doi kich thuoc (cot Ke hoach mo/thu, doi giai doan, xoay man hinh, tab mobile hien lai)
  // -> map.resize(). Thay meo dispatchEvent('resize') cu (T-67).
  // ResizeObserver chay sau layout, truoc khi ve: resize() xoa canvas, nen phai redraw() dong bo ngay tai day;
  // de MapLibre tu ve o khung hinh sau thi trong luc cot doi rong ban do nhap nhay trang.
  useEffect(() => {
    if (!map || !mapReady) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      // Khung bi an (display:none) co kich thuoc 0: doi lan hien lai
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      map.resize();
      map.redraw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, mapReady]);

  // Cho man cong bo quan thang (T-61) bay toi quan: chi khi tab Ban do dang hien
  useEffect(() => {
    if (!map || !mapReady) return;
    return registerMapFlyer({
      isVisible: () => {
        const el = map.getContainer();
        return el.offsetParent !== null && el.clientWidth > 0 && el.clientHeight > 0;
      },
      center: () => {
        const c = map.getCenter();
        return { lat: c.lat, lng: c.lng };
      },
      fly: ({ lng, lat, zoom, pitch, bearingDelta, durationMs, offsetY }) => {
        map.flyTo({
          center: [lng, lat],
          zoom,
          pitch,
          bearing: map.getBearing() + bearingDelta,
          offset: [0, offsetY],
          duration: durationMs,
          essential: true,
        });
      },
    });
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

  // Sáng ghim quán đang mở trang chi tiết: to hơn + viền đậm màu chữ. Chạy lại sau khi đổi theme
  // (updateRoomPlacesLayerTheme đặt lại màu viền).
  const openPlaceId = selection?.kind === 'place' ? selection.id : null;
  useEffect(() => {
    if (!map || !mapReady || !map.getLayer(ROOM_PLACES_LAYER)) return;
    const isOpen: import('maplibre-gl').ExpressionSpecification = ['==', ['get', 'id'], openPlaceId ?? ''];
    try {
      map.setPaintProperty(ROOM_PLACES_LAYER, 'circle-radius', ['case', isOpen, 17, 13]);
      map.setPaintProperty(ROOM_PLACES_LAYER, 'circle-stroke-width', ['case', isOpen, 4, 3]);
      map.setPaintProperty(ROOM_PLACES_LAYER, 'circle-stroke-color', [
        'case',
        isOpen,
        getCssColor('--color-ink', '#1C1917'),
        getCssColor('--color-surface', '#FFFFFF'),
      ]);
    } catch (err) {
      console.warn('[MapView] loi sang ghim quan dang mo', err);
    }
  }, [map, mapReady, openPlaceId, resolvedTheme]);

  // ?place= trỏ tới quán không có (đã xoá, link sai): đóng khi danh sách đã tải xong
  useEffect(() => {
    if (!openPlaceId || placesLoading || places.length === 0) return;
    if (!places.some((p) => p.id === openPlaceId)) selectPlace(null);
  }, [openPlaceId, places, placesLoading, selectPlace]);

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
    // Ban do tran khung cot giua (T-67); khung cha quyet dinh kich thuoc
    <div className="relative h-full w-full overflow-hidden bg-surface-2">
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
      {showSearch && (
        <div className="absolute left-3 right-3 top-3 z-10 max-w-md">
          <MapSearchBox getCenter={getCenter} onPick={flyToPoi} />
        </div>
      )}

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

      {/* Trang chi tiết quán (T-71): ≥1024 panel nổi bên phải bản đồ rộng --ws-detail (500/440px);
          <1024 toàn màn (portal), vuốt xuống đóng. Chỉ một bản được mount để Esc/focus không trùng. */}
      {(selectedPoi || selectedPlace) &&
        (layout !== 'mobile' ? (
          <div
            className="absolute top-3 right-3 bottom-3 z-content flex"
            style={{ width: 'min(var(--ws-detail), calc(100% - 24px))' }}
          >
            <PlaceDetail
              variant="panel"
              room={room}
              poi={selectedPoi}
              place={selectedPlace}
              onClose={() => {
                selectPoi(null);
                selectPlace(null);
              }}
              isVotingDisabled={isVotingDisabled}
            />
          </div>
        ) : (
          <PlaceDetail
            variant="screen"
            room={room}
            poi={selectedPoi}
            place={selectedPlace}
            onClose={() => {
              selectPoi(null);
              selectPlace(null);
            }}
            isVotingDisabled={isVotingDisabled}
          />
        ))}

      <span className="sr-only">
        {t('map.attribution')}
      </span>
    </div>
  );
}

export default MapView;
