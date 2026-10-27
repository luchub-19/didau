// Bản đồ 3D của hero (lazy chunk riêng, kéo theo maplibre-gl). Camera do HeroScroll điều khiển qua ref;
// bản đồ chỉ tự xử lý: ánh sáng (nắng chiều → chạng vạng), tòa nhà, 3 ghim chặng, đường nối vẽ dần, đèn đường,
// mở màn xoay một lần và bật tương tác ở cảnh cuối.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_STYLE_URL } from '../../config';
import { formatTime, formatTimeRange } from '../../i18n/format';
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
import {
  HERO_SHOTS,
  HERO_STOPS,
  INTRO_ORBIT_DEG,
  STOP_LABEL_KEY,
  stopsRoute,
  type Camera,
  type HeroStop,
} from './shots';

export interface HeroMapHandle {
  /** Đặt camera tức thì (scrub theo cuộn, mức 'full'). */
  setCamera(cam: Camera): void;
  /** Bay tới camera trong `ms` (mức 'lite', nút Bỏ qua). */
  flyTo(cam: Camera, ms: number): void;
  /** Độ chạng vạng 0..1 (duskAt): nhuộm mặt đất, ánh sáng tòa nhà, bầu trời. */
  setDusk(dusk: number): void;
  /** Tiến độ vẽ đường nối 3 chặng 0..1 (routeProgressAt). */
  setRoute(fraction: number): void;
}

export interface HeroMapProps {
  tier: Exclude<MotionTier, 'static'>;
  /** Cảnh đang hiện (0..4): ghim hiện từ cảnh 4, đường nối + tương tác ở cảnh 5. */
  shotIndex: number;
  /** Chiều cao (px) phần đáy bị khung chữ che → padding dưới của camera. */
  bottomInset: number;
  /** Số chặng đường nối đã tới (ghim hiện giờ của chặng đó). */
  reached: number;
  /** Mở màn xoay một lần (chỉ khi trang đang ở đầu phim). */
  playIntro: boolean;
  /** Bản đồ đã vẽ xong khung đầu → HeroScroll cross-fade từ poster sang. */
  onReady: () => void;
  /** Style lỗi/quá chậm → giữ poster. */
  onFail: (reason: string) => void;
}

const BUILDING_LAYER = 'building-3d';
const ROUTE_SOURCE = 'hero-route';
const DUSK_SOURCE = 'hero-dusk';
const LIGHTS_LAYERS = ['hero-lights-glow', 'hero-lights'] as const;
/** Đường nối trên nền tối: màu `stage-sky` của bảng "chạng vạng" (#86BDE8, DESIGN §2). */
const ROUTE_COLOR = '#86BDE8';
/** Hai đầu của ánh sáng: nắng chiều 17:00 → chạng vạng (DESIGN §2: cùng hệ màu, tối hơn, ánh tím). */
const DAY = { light: '#FFD3A1', lightIntensity: 0.55, sky: '#F2B98A', horizon: '#FBE3C4', fog: '#FBF3E4' };
const DUSK = { light: '#C9A2C0', lightIntensity: 0.34, sky: '#2B2147', horizon: '#E07A5F', fog: '#3A2D4A' };
/** Màn nhuộm mặt đất lúc tối hẳn: màu giấy chạng vạng `stage-paper` tối (#1A1420). */
const DUSK_FILL = '#1A1420';
const DUSK_FILL_MAX = 0.5;
const STYLE_TIMEOUT_MS = 8000;
/** Phần đỉnh bị thanh header che (px). */
const TOP_INSET = 72;
/** Tải trước tile của các cảnh sau trước khi hiện bản đồ (hết khựng giữa phim); quá hạn thì hiện luôn. */
const PREWARM_SHOT_MS = 2500;
const PREWARM_TOTAL_MS = 7000;
/** Lớp chữ/icon bỏ khỏi hero: icon POI, sân bay, biển số đường, mũi tên một chiều, nhãn khu phố (đỡ rối và đỡ tính va chạm chữ mỗi khung). */
const DECLUTTER_SOURCE_LAYERS = new Set(['poi', 'aerodrome_label']);
const DECLUTTER_ID = /shield|one_way|label_other/;
const PINS_FROM_SHOT = HERO_SHOTS.findIndex((s) => s.id === 'stops');
const LAST_SHOT = HERO_SHOTS.length - 1;
const FPS_WINDOW = 600;
const cameraEase = easingFn('camera');

function mixHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

/** Áp độ chạng vạng: màn nhuộm mặt đất (dưới tòa nhà + chữ), ánh sáng tòa nhà, trời và sương. */
function applyDusk(map: MapLibreMap, d: number): void {
  if (map.getLayer(DUSK_SOURCE)) map.setPaintProperty(DUSK_SOURCE, 'fill-opacity', d * DUSK_FILL_MAX);
  map.setLight({
    anchor: 'map',
    position: [1.5, 250, 50 - 25 * d],
    color: mixHex(DAY.light, DUSK.light, d),
    intensity: DAY.lightIntensity + (DUSK.lightIntensity - DAY.lightIntensity) * d,
  });
  map.setSky({
    'sky-color': mixHex(DAY.sky, DUSK.sky, d),
    'horizon-color': mixHex(DAY.horizon, DUSK.horizon, d),
    'fog-color': mixHex(DAY.fog, DUSK.fog, d),
    'sky-horizon-blend': 0.7,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.75,
    'atmosphere-blend': 0,
  });
}

/** Màn chạng vạng + đèn đường, chèn ngay dưới lớp tòa nhà 3D (chữ và tòa nhà nằm trên, không bị nhuộm). */
function installDuskLayers(map: MapLibreMap): void {
  const before = map.getLayer(BUILDING_LAYER) ? BUILDING_LAYER : undefined;
  map.addSource(DUSK_SOURCE, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[106.3, 10.4], [107.1, 10.4], [107.1, 11.2], [106.3, 11.2], [106.3, 10.4]]],
      },
    },
  });
  map.addLayer({ id: DUSK_SOURCE, type: 'fill', source: DUSK_SOURCE, paint: { 'fill-color': DUSK_FILL, 'fill-opacity': 0 } }, before);
  const roads: maplibregl.FilterSpecification = [
    'match',
    ['get', 'class'],
    ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'],
    true,
    false,
  ];
  // Đèn đường: một vệt sáng mờ rộng + một lõi mảnh, màu `stage-sun` của bảng chạng vạng (#FFC94D)
  map.addLayer(
    {
      id: LIGHTS_LAYERS[0],
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: roads,
      paint: {
        'line-color': '#FFC94D',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 17, 18],
        'line-blur': ['interpolate', ['linear'], ['zoom'], 14, 4, 17, 12],
        'line-opacity': 0,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: LIGHTS_LAYERS[1],
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: roads,
      paint: {
        'line-color': '#FFE3A3',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 17, 3],
        'line-opacity': 0,
      },
    },
    before,
  );
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
}

/** Bỏ bớt lớp chữ/icon của style Liberty: hero kể chuyện bằng ghim + chú thích, không cần icon từng cửa hàng. */
function declutter(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
    if ((sourceLayer && DECLUTTER_SOURCE_LAYERS.has(sourceLayer)) || DECLUTTER_ID.test(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

/** Mật độ điểm ảnh khi vẽ bản đồ: màn HiDPI vẽ 2× = gấp 4 lần pixel, nên giới hạn để giữ khung hình. */
function heroPixelRatio(tier: HeroMapProps['tier']): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, tier === 'full' ? 1.5 : 1);
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

export const HeroMap = forwardRef<HeroMapHandle, HeroMapProps>(({ tier, shotIndex, bottomInset, reached, playIntro, onReady, onFail }, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const activeRef = useRef(true);
  const pendingRef = useRef<Camera | null>(null);
  const movedAtRef = useRef(0);
  const prewarmingRef = useRef(true);
  // Mức lúc khởi tạo (đổi mức sau đó do effect riêng xử lý, không dựng lại bản đồ)
  const initialTierRef = useRef(tier);
  const callbacks = useRef({ onReady, onFail });
  callbacks.current = { onReady, onFail };
  const [loaded, setLoaded] = useState(false);
  const [pinHosts, setPinHosts] = useState<HTMLElement[]>([]);
  // Camera cuối cùng HeroScroll yêu cầu + độ lệch bearing của cú xoay mở màn (cộng vào khi jumpTo)
  const lastCamRef = useRef<Camera | null>(null);
  const orbitOffsetRef = useRef(0);
  const playIntroRef = useRef(playIntro);
  // Giá trị đã lượng tử hoá: chỉ đụng style khi đổi thật (setLight/setSky/setData không gọi mỗi khung)
  const duskRef = useRef(0);
  const routeRef = useRef(0);

  const withOrbit = (cam: Camera): Camera => ({ ...cam, bearing: cam.bearing + orbitOffsetRef.current });

  useImperativeHandle(ref, () => ({
    setCamera(cam) {
      lastCamRef.current = cam;
      const map = mapRef.current;
      if (!map || !activeRef.current || prewarmingRef.current) {
        pendingRef.current = cam;
        return;
      }
      movedAtRef.current = performance.now();
      map.jumpTo(withOrbit(cam));
    },
    flyTo(cam, ms) {
      lastCamRef.current = cam;
      orbitOffsetRef.current = 0;
      const map = mapRef.current;
      if (!map || !activeRef.current || prewarmingRef.current) {
        pendingRef.current = cam;
        return;
      }
      movedAtRef.current = performance.now() + ms;
      map.flyTo({ ...cam, duration: ms, easing: cameraEase });
    },
    setDusk(dusk) {
      const q = Math.round(dusk * 50) / 50;
      if (q === duskRef.current) return;
      duskRef.current = q;
      const map = mapRef.current;
      if (map?.getLayer(DUSK_SOURCE)) applyDusk(map, q);
    },
    setRoute(fraction) {
      const q = Math.round(fraction * 200) / 200;
      if (q === routeRef.current) return;
      routeRef.current = q;
      mapRef.current?.getSource<maplibregl.GeoJSONSource>(ROUTE_SOURCE)?.setData(stopsRoute(q));
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
        pixelRatio: heroPixelRatio(initialTierRef.current),
        maxTileCacheSize: 400,
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
      declutter(map);
      installDuskLayers(map);
      applyDusk(map, duskRef.current);
      map.addSource(ROUTE_SOURCE, { type: 'geojson', data: stopsRoute(routeRef.current) });
      map.addLayer({
        id: ROUTE_SOURCE,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-width': 6,
          'line-dasharray': [1, 0.8],
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
      void prewarm().then(() => {
        if (disposed) return;
        prewarmingRef.current = false;
        const introMs = resolvePreset('hero.intro', initialTierRef.current).durationMs;
        const orbit = playIntroRef.current && introMs > 0;
        if (orbit) orbitOffsetRef.current = -INTRO_ORBIT_DEG;
        map.jumpTo(withOrbit(pendingRef.current ?? lastCamRef.current ?? first));
        pendingRef.current = null;
        map.once('idle', () => {
          callbacks.current.onReady();
          if (orbit) startOrbit(introMs);
        });
      });
    });

    // Mở màn: xoay INTRO_ORBIT_DEG về bearing cảnh 1 đúng một lần, cộng dồn với camera theo cuộn
    let orbitRaf = 0;
    const startOrbit = (ms: number) => {
      const ease = easingFn('out');
      const start = performance.now();
      const step = (now: number) => {
        if (disposed || orbitOffsetRef.current === 0) return;
        const t = Math.min(1, (now - start) / ms);
        orbitOffsetRef.current = t >= 1 ? 0 : -INTRO_ORBIT_DEG * (1 - ease(t));
        movedAtRef.current = now;
        if (activeRef.current) map.jumpTo(withOrbit(lastCamRef.current ?? first));
        if (t < 1) orbitRaf = requestAnimationFrame(step);
      };
      orbitRaf = requestAnimationFrame(step);
    };

    // Lướt qua từng cảnh khi bản đồ còn ẩn dưới poster để tile nằm sẵn trong cache
    let disposed = false;
    const waitIdle = (ms: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          map.off('idle', done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        map.on('idle', done);
      });
    const prewarm = async () => {
      const started = performance.now();
      for (const shot of HERO_SHOTS.slice(1)) {
        if (disposed || performance.now() - started > PREWARM_TOTAL_MS) break;
        map.jumpTo({ center: shot.center, zoom: shot.zoom, pitch: shot.pitch, bearing: shot.bearing });
        await waitIdle(PREWARM_SHOT_MS);
      }
      stageLog('hero prewarm', Math.round(performance.now() - started), 'ms');
    };

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
      disposed = true;
      cancelAnimationFrame(orbitRaf);
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
    if (!map || !loaded) return;
    styleBuildings(map, tier === 'full');
    map.setPixelRatio(heroPixelRatio(tier));
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
    // Đèn đường bật khi tới cảnh tối (một lần chuyển opacity, không nhấp nháy)
    LIGHTS_LAYERS.forEach((id, i) => {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, 'line-opacity-transition', { duration: resolvePreset('hero.shot', tier).durationMs, delay: 0 });
      map.setPaintProperty(id, 'line-opacity', isLast ? [0.35, 0.85][i] : 0);
    });
    setInteractive(map, isLast);
  }, [shotIndex, loaded, tier]);

  // Canh FPS khi camera đang chạy (mức 'full'): < 40 fps liên tục 2 s → hạ 'lite' (PLAN §8)
  useEffect(() => {
    if (tier !== 'full' || !loaded) return;
    const guard = createFpsGuard();
    const deltas: number[] = [];
    let frames = 0;
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
      if (last) {
        deltas.push(now - last);
        frames++;
        if (deltas.length > FPS_WINDOW) deltas.shift();
      }
      last = now;
      if (guard.frame(now)) downgradeMotionTier('lite', 'hero fps < 40 for 2s');
      // Số đo cho dev: trung bình + p5 trên 600 khung gần nhất (đọc `window.__heroFps`)
      if (import.meta.env.DEV && frames % 120 === 0 && deltas.length) {
        const sorted = [...deltas].sort((a, b) => b - a);
        const avg = 1000 / (deltas.reduce((a, b) => a + b, 0) / deltas.length);
        const p5 = 1000 / sorted[Math.floor(sorted.length * 0.05)];
        (window as unknown as { __heroFps?: unknown }).__heroFps = { avg, p5, frames };
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
            reached={shotIndex === LAST_SHOT && i < reached}
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
  /** Đường nối đã vẽ tới chặng này: nhãn hiện giờ bắt đầu. */
  reached: boolean;
}

/** Ghim coral của một chặng: rơi lần lượt ở cảnh 4; ở cảnh 5 bấm được để xem địa chỉ + giờ. */
const HeroPin: React.FC<HeroPinProps> = ({ stop, order, tier, visible, interactive, reached }) => {
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
        {reached && (
          <span className="tabular-nums font-semibold text-[rgb(var(--stage-ink))]">{formatTime(stop.startMinute, lang)}</span>
        )}
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
