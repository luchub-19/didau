// Bản đồ 3D của hero (lazy chunk riêng, kéo theo maplibre-gl). Camera do HeroScroll điều khiển qua ref;
// bản đồ chỉ tự xử lý: ánh sáng ấm, tòa nhà, 3 ghim chặng, đường nối và bật tương tác ở cảnh cuối.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE_URL } from '../../config';
import { formatTimeRange } from '../../i18n/format';
import type { Language } from '../../i18n/useLanguage';
import {
  createFpsGuard,
  downgradeMotionTier,
  duration,
  easingFn,
  motionAttrs,
  resolvePreset,
  stageLog,
  type MotionTier,
} from '../../motion';
import { MapPin } from '../../components/ui/Icon';
import { HERO_SHOTS, HERO_STOPS, STOP_LABEL_KEY, stopsRoute, type Camera, type HeroStop } from './shots';

export interface HeroMapHandle {
  /** Đặt camera tức thì (scrub theo cuộn, mức 'full'). */
  setCamera(cam: Camera): void;
  /** Bay tới camera trong `ms` (mức 'lite', nút Bỏ qua). */
  flyTo(cam: Camera, ms: number): void;
}

export interface HeroMapProps {
  tier: Exclude<MotionTier, 'static'>;
  /** Cảnh đang hiện (0..4): ghim hiện từ cảnh 4, đường nối + tương tác ở cảnh 5. */
  shotIndex: number;
  /** Chiều cao (px) phần đáy bị khung chữ che → padding dưới của camera. */
  bottomInset: number;
  /** Bản đồ đã vẽ xong khung đầu → HeroScroll cross-fade từ poster sang. */
  onReady: () => void;
  /** Style lỗi/quá chậm → giữ poster. */
  onFail: (reason: string) => void;
}

const BUILDING_LAYER = 'building-3d';
const ROUTE_SOURCE = 'hero-route';
const STYLE_TIMEOUT_MS = 8000;
/** Phần đỉnh bị thanh header che (px). */
const TOP_INSET = 72;
const PINS_FROM_SHOT = HERO_SHOTS.findIndex((s) => s.id === 'stops');
const LAST_SHOT = HERO_SHOTS.length - 1;
const cameraEase = easingFn('camera');

/** Đọc token màu Stage ('31 111 168') thành chuỗi màu MapLibre hiểu. */
function stageColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? `rgb(${parts.join(',')})` : fallback;
}

/** Tòa nhà OSM ở TP.HCM là khối hộp đơn giản: tô ấm theo chiều cao, gần đục, ánh nắng chiều nghiêng thấp (DESIGN §2, §6). */
function styleBuildings(map: MapLibreMap, show: boolean): void {
  if (!map.getLayer(BUILDING_LAYER)) return;
  map.setLayoutProperty(BUILDING_LAYER, 'visibility', show ? 'visible' : 'none');
  if (!show) return;
  map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-color', [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'render_height'], 0],
    0, '#EADBC4',
    30, '#DDB48E',
    90, '#C98763',
    200, '#A8482A',
  ]);
  map.setPaintProperty(BUILDING_LAYER, 'fill-extrusion-opacity', 0.9);
  map.setLight({ anchor: 'map', position: [1.5, 250, 50], color: '#FFD3A1', intensity: 0.55 });
}

function setInteractive(map: MapLibreMap, on: boolean): void {
  const handlers = [map.dragPan, map.dragRotate, map.touchZoomRotate, map.touchPitch, map.keyboard, map.doubleClickZoom];
  for (const h of handlers) {
    if (on) h.enable();
    else h.disable();
  }
  // Lăn chuột luôn để cuộn trang; trên màn cảm ứng cần 2 ngón để kéo bản đồ (1 ngón vẫn cuộn trang)
  map.scrollZoom.disable();
  // Canvas chỉ nhận Tab khi bản đồ cho tương tác (cảnh cuối)
  map.getCanvas().tabIndex = on ? 0 : -1;
  if (on && window.matchMedia?.('(pointer: coarse)').matches) map.cooperativeGestures.enable();
  else map.cooperativeGestures.disable();
}

export const HeroMap = forwardRef<HeroMapHandle, HeroMapProps>(({ tier, shotIndex, bottomInset, onReady, onFail }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeRef = useRef(true);
  const pendingRef = useRef<Camera | null>(null);
  const movedAtRef = useRef(0);
  const callbacks = useRef({ onReady, onFail });
  callbacks.current = { onReady, onFail };
  const [loaded, setLoaded] = useState(false);
  const [pinHosts, setPinHosts] = useState<HTMLElement[]>([]);

  useImperativeHandle(ref, () => ({
    setCamera(cam) {
      const map = mapRef.current;
      if (!map || !activeRef.current) {
        pendingRef.current = cam;
        return;
      }
      movedAtRef.current = performance.now();
      map.jumpTo(cam);
    },
    flyTo(cam, ms) {
      const map = mapRef.current;
      if (!map || !activeRef.current) {
        pendingRef.current = cam;
        return;
      }
      movedAtRef.current = performance.now() + ms;
      map.flyTo({ ...cam, duration: ms, easing: cameraEase });
    },
  }));

  // Khởi tạo một lần, camera ở cảnh 1 (khớp poster)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const first = HERO_SHOTS[0];
    let failed = false;
    const fail = (reason: string) => {
      if (failed) return;
      failed = true;
      stageLog('hero map fail', reason);
      callbacks.current.onFail(reason);
    };

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE_URL,
        center: first.center,
        zoom: first.zoom,
        pitch: first.pitch,
        bearing: first.bearing,
        maxPitch: 70,
        attributionControl: { compact: true },
      });
    } catch (err) {
      fail(String(err));
      return;
    }
    mapRef.current = map;
    setInteractive(map, false);
    map.boxZoom.disable();
    if (import.meta.env.DEV) (window as unknown as { __stageHero?: unknown }).__stageHero = { map };

    const timeout = setTimeout(() => {
      if (!map.loaded()) fail('style timeout');
    }, STYLE_TIMEOUT_MS);

    map.on('error', (e) => {
      if (!map.isStyleLoaded()) fail(e.error?.message ?? 'style error');
    });
    map.on('load', () => {
      clearTimeout(timeout);
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: stopsRoute() });
      map.addLayer({
        id: ROUTE_SOURCE,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': stageColor('--stage-sky', '#1F6FA8'),
          'line-width': 5,
          'line-dasharray': [0.2, 1.8],
          'line-opacity': 0,
        },
      });
      setPinHosts(
        HERO_STOPS.map((stop) => {
          const el = document.createElement('div');
          new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([stop.lng, stop.lat]).addTo(map);
          return el;
        }),
      );
      setLoaded(true);
      map.once('idle', () => callbacks.current.onReady());
    });

    // Ngừng cập nhật camera (→ MapLibre không vẽ lại) khi bản đồ ra khỏi khung nhìn hoặc tab ẩn
    const setActive = (on: boolean) => {
      if (activeRef.current === on) return;
      activeRef.current = on;
      stageLog('hero map', on ? 'resume' : 'pause');
      if (!on) map.stop();
      else if (pendingRef.current) {
        map.jumpTo(pendingRef.current);
        pendingRef.current = null;
      }
    };
    let inView = true;
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      setActive(inView && !document.hidden);
    });
    io.observe(container);
    const onVisibility = () => setActive(inView && !document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timeout);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      map.remove();
      mapRef.current = null;
      setPinHosts([]);
      setLoaded(false);
    };
  }, []);

  // Tâm camera nằm giữa phần bản đồ không bị header/khung chữ che (đổi padding không làm camera nhảy cảnh)
  useEffect(() => {
    mapRef.current?.setPadding({ top: TOP_INSET, bottom: bottomInset, left: 0, right: 0 });
  }, [bottomInset, loaded]);

  // Mức: 'full' có tòa nhà 3D + ánh sáng, 'lite' bỏ (hạ mức giữa chừng thì tắt ngay)
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded) styleBuildings(map, tier === 'full');
  }, [tier, loaded]);

  // Cảnh cuối: hiện đường nối 3 chặng, cho kéo/nghiêng bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const isLast = shotIndex === LAST_SHOT;
    map.setPaintProperty(ROUTE_SOURCE, 'line-opacity-transition', {
      duration: resolvePreset('hero.shot', tier).durationMs,
      delay: 0,
    });
    map.setPaintProperty(ROUTE_SOURCE, 'line-opacity', isLast ? 0.95 : 0);
    setInteractive(map, isLast);
  }, [shotIndex, loaded, tier]);

  // Canh FPS khi camera đang chạy (mức 'full'): < 40 fps liên tục 2 s → hạ 'lite' (PLAN §8)
  useEffect(() => {
    if (tier !== 'full' || !loaded) return;
    const guard = createFpsGuard();
    const deltas: number[] = [];
    let last = 0;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const moving = activeRef.current && now - movedAtRef.current < 250;
      if (!moving) {
        guard.reset();
        last = 0;
        return;
      }
      if (last) deltas.push(now - last);
      last = now;
      if (guard.frame(now)) downgradeMotionTier('lite', 'hero fps < 40 for 2s');
      if (import.meta.env.DEV && deltas.length % 60 === 0 && deltas.length) {
        const sorted = [...deltas].sort((a, b) => b - a);
        const avg = 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length);
        const p5 = 1000 / sorted[Math.floor(sorted.length * 0.05)];
        (window as unknown as { __heroFps?: unknown }).__heroFps = { avg, p5, frames: deltas.length };
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tier, loaded]);

  return (
    <>
      <div ref={containerRef} role="img" aria-label={t('stage.mapLabel')} className="w-full h-full" />
      {pinHosts.map((host, i) =>
        createPortal(
          <HeroPin
            stop={HERO_STOPS[i]}
            order={i}
            tier={tier}
            visible={shotIndex >= PINS_FROM_SHOT}
            interactive={shotIndex === LAST_SHOT}
          />,
          host,
          HERO_STOPS[i].id,
        ),
      )}
    </>
  );
});
HeroMap.displayName = 'HeroMap';

interface HeroPinProps {
  stop: HeroStop;
  order: number;
  tier: HeroMapProps['tier'];
  visible: boolean;
  interactive: boolean;
}

/** Ghim coral của một chặng: rơi lần lượt ở cảnh 4; ở cảnh 5 bấm được để xem địa chỉ + giờ. */
const HeroPin: React.FC<HeroPinProps> = ({ stop, order, tier, visible, interactive }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Language) || 'vi';
  const [open, setOpen] = useState(false);
  const drop = resolvePreset('hero.shot', tier);
  const showDetail = interactive && open;
  const label = t(STOP_LABEL_KEY[stop.id]);

  useEffect(() => {
    if (!interactive) setOpen(false);
  }, [interactive]);

  const chipPos = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1',
  }[stop.labelSide];
  // Thẻ chi tiết tránh phía có nhãn
  const tipPos = stop.labelSide === 'top' ? 'top-full mt-2' : 'bottom-full mb-2';

  const pinBody = (
    <>
      <span
        className={`absolute ${chipPos} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[rgb(var(--stage-paper))] border border-[rgb(var(--stage-ink)/0.15)] pl-2 pr-3 py-1 text-caption shadow-[var(--stage-shadow-long)]`}
      >
        <span className="font-semibold text-[rgb(var(--stage-accent-text))]">{label}</span>
        <span className="hidden sm:inline max-w-[11rem] truncate text-[rgb(var(--stage-ink))]">{stop.name}</span>
      </span>
      <span
        className="w-9 h-9 rounded-full bg-accent border-2 border-[rgb(var(--stage-ink))] flex items-center justify-center text-[rgb(var(--stage-on-accent))]"
        aria-hidden="true"
      >
        <MapPin size={20} weight="fill" />
      </span>
    </>
  );
  const pinBox = 'relative w-11 h-11 flex items-center justify-center';

  return (
    <div
      {...motionAttrs('hero.shot')}
      className="relative"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible || !drop.move ? 'none' : 'translateY(-28px)',
        transitionProperty: 'opacity, transform',
        transitionDuration: `${duration('moment')}ms`,
        transitionTimingFunction: drop.easing,
        transitionDelay: visible ? `${order * duration('hover')}ms` : '0ms',
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      aria-hidden={!visible}
    >
      {showDetail && (
        <div
          role="tooltip"
          id={`hero-pin-${stop.id}`}
          className={`absolute ${tipPos} left-1/2 -translate-x-1/2 z-10 w-56 rounded-card bg-[rgb(var(--stage-paper))] border border-[rgb(var(--stage-ink)/0.15)] p-3 shadow-[var(--stage-shadow-long)] text-left`}
        >
          <p className="text-label font-semibold text-[rgb(var(--stage-ink))]">{stop.name}</p>
          <p className="text-caption text-[rgb(var(--stage-ink-2))]">{stop.address}</p>
          <p className="mt-1 text-caption tabular-nums text-[rgb(var(--stage-ink))]">
            {label} · {formatTimeRange(stop.startMinute, stop.endMinute, lang)}
          </p>
        </div>
      )}
      {interactive ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-expanded={open}
          aria-describedby={showDetail ? `hero-pin-${stop.id}` : undefined}
          aria-label={t('hero.pinLabel', { stop: label, name: stop.name })}
          className={`${pinBox} rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--stage-ink))]`}
        >
          {pinBody}
        </button>
      ) : (
        <div className={pinBox}>{pinBody}</div>
      )}
    </div>
  );
};
