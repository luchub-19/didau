// Bản đồ mini trong cửa sổ phòng mẫu (PLAN §4.6): bản đồ THẬT nhưng chỉ sống tới lúc `idle`, rồi chụp sang canvas 2D
// và `remove()` → sau hero không còn WebGL context nào. Ghim quán là HTML do React vẽ (không phải Marker), đặt theo
// toạ độ đã `project`, nên vẫn đồng bộ phiếu/chốt sau khi map đã nhả.
// Trình tự: nền giấy + ghim chiếu bằng `fitProject` (hiện ngay) → (màn > 960px, sau `load` của trang, lúc rảnh) nạp
// maplibre → map hiện mờ dần dưới ghim → idle → chụp + nhả. Lỗi style → lùi FALLBACK; hỏng hẳn → giữ nền giấy.
// Màn ≤ 960px: khung bản đồ bị ẩn (CSS), không nạp gì.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BowlFood, Check } from '../../components/ui/Icon';
import type { LngLat, PlaceId } from '../logic/types';
import {
  HERO_MAP_BOUNDS,
  HERO_MAP_PADDING,
  createLandingMap,
  fitProject,
  heroMapOptions,
  loadMap,
  snapshotAndRelease,
  type PointMap,
} from '../map';
import { WIDE_MIN } from './riders';

export interface PinModel {
  id: PlaceId;
  short: string;
  ll: LngLat;
  votes: number;
  /** done = quán đã chốt (dấu tích xanh), faded = quán khác khi đã chốt. */
  state: 'normal' | 'done' | 'faded';
  hot: boolean;
  /** Đổi giá trị = ghim nảy một lần (thả tim). 0 = không nảy. */
  bumpKey: number;
}

type Phase = 'paper' | 'loading' | 'live' | 'snap' | 'failed';

interface Frame {
  width: number;
  height: number;
  points: PointMap;
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Chạy `fn` sau khi trang tải xong và trình duyệt rảnh, để bản đồ không giành băng thông với chữ hero (LCP). */
function afterLoadIdle(fn: () => void): () => void {
  let cancelled = false;
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const go = () => {
    if (cancelled) return;
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(() => !cancelled && fn(), { timeout: 1500 });
    else timer = setTimeout(() => !cancelled && fn(), 300);
  };
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', go);
    if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
    if (timer) clearTimeout(timer);
  };
}

export interface HeroMiniMapProps {
  pins: PinModel[];
  onHover: (id: PlaceId | null) => void;
}

export const HeroMiniMap: React.FC<HeroMiniMapProps> = ({ pins, onHover }) => {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>('paper');
  const [frame, setFrame] = useState<Frame | null>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const llRef = useRef<Record<string, LngLat>>({});
  llRef.current = Object.fromEntries(pins.map((p) => [p.id, p.ll]));

  // Ghim trên nền giấy: chiếu như fitBounds theo kích thước khung hiện tại (khi chưa có/không có bản đồ thật)
  useIsoLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      if (box.clientWidth === 0) return;
      setFrame((f) => {
        // Đã có toạ độ từ bản đồ thật thì giữ nguyên (khung ảnh chụp có kích thước cố định)
        if (f && phaseRef.current !== 'paper' && phaseRef.current !== 'failed' && phaseRef.current !== 'loading') return f;
        return {
          width: box.clientWidth,
          height: box.clientHeight,
          points: fitProject(llRef.current, HERO_MAP_BOUNDS, box.clientWidth, box.clientHeight, HERO_MAP_PADDING),
        };
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    return () => ro?.disconnect();
  }, []);

  // Nạp + dựng + chụp + nhả: đúng một lần cho mỗi lần mount
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(`(min-width: ${WIDE_MIN}px)`);
    let cancelled = false;
    let started = false;
    let cancelIdle: (() => void) | undefined;
    let release: (() => void) | undefined;

    const start = () => {
      if (started || cancelled) return;
      started = true;
      mq.removeEventListener?.('change', onChange);
      setPhase('loading');
      loadMap()
        .then((ml) => {
          const container = liveRef.current;
          if (cancelled || !container) return;
          const handle = createLandingMap(ml, {
            container,
            ...heroMapOptions(),
            onFail: () => {
              if (!cancelled) setPhase('failed');
            },
          });
          if (!handle) return;
          const { map } = handle;
          let removed = false;
          release = () => {
            if (!removed) {
              removed = true;
              map.remove();
            }
          };
          map.on('load', () => {
            if (cancelled) return;
            // Khung có thể đã đổi cỡ từ lúc dựng (font tải xong): đo lại rồi ôm lại 3 quán
            map.resize();
            map.fitBounds(HERO_MAP_BOUNDS as unknown as [[number, number], [number, number]], {
              padding: HERO_MAP_PADDING,
              duration: 0,
            });
            const box = boxRef.current;
            const pts: Record<string, readonly [number, number]> = {};
            for (const [id, ll] of Object.entries(llRef.current)) {
              const q = map.project([ll[0], ll[1]]);
              pts[id] = [q.x, q.y];
            }
            setFrame({ width: box?.clientWidth ?? 0, height: box?.clientHeight ?? 0, points: pts });
            setPhase('live');
            const canvas = canvasRef.current;
            if (!canvas) return;
            snapshotAndRelease(map, canvas, llRef.current).then((snap) => {
              removed = true;
              if (cancelled) return;
              setFrame({ width: snap.width, height: snap.height, points: snap.points });
              setPhase(snap.drawn ? 'snap' : 'failed');
            });
          });
        })
        .catch(() => {
          if (!cancelled) setPhase('failed');
        });
    };
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) cancelIdle = afterLoadIdle(start);
    };
    if (mq.matches) cancelIdle = afterLoadIdle(start);
    else mq.addEventListener?.('change', onChange);

    return () => {
      cancelled = true;
      mq.removeEventListener?.('change', onChange);
      cancelIdle?.();
      release?.();
    };
  }, []);

  const fixed = phase === 'snap' && frame;
  return (
    <div ref={boxRef} className="hero-map-box" data-phase={phase}>
      <div
        className="hero-map-frame"
        style={fixed ? { width: frame.width, height: frame.height } : undefined}
        data-fixed={fixed ? 'true' : undefined}
      >
        <div ref={liveRef} className="hero-map-live" />
        <canvas ref={canvasRef} className="hero-map-snap" />
        {frame
          ? pins.map((p) => {
              const pt = frame.points[p.id];
              if (!pt) return null;
              return (
                <span
                  key={p.id}
                  className="hero-pin"
                  data-state={p.state}
                  data-hot={p.hot ? 'true' : undefined}
                  style={{ left: pt[0], top: pt[1] }}
                  onPointerEnter={() => onHover(p.id)}
                  onPointerLeave={() => onHover(null)}
                >
                  <span key={p.bumpKey} className="hero-pin-in" data-bump={p.bumpKey ? 'true' : undefined}>
                    <span className="hero-pin-dot">
                      {p.state === 'done' ? <Check size={12} weight="bold" /> : <BowlFood size={12} weight="fill" />}
                    </span>
                    <span className="tabular-nums">
                      {p.short} · {p.votes}
                    </span>
                  </span>
                </span>
              );
            })
          : null}
      </div>
      <span className="hero-map-attrib">{t('landing.hero.mapAttrib')}</span>
    </div>
  );
};
