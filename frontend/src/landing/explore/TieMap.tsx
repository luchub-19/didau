// Bản đồ lớn của cảnh hoà phiếu (PLAN §4.1 phần 5, §4.6). Hai tầng:
// - nền: MapLibre thật (style app, lùi FALLBACK), tạo MỘT LẦN khi phần cách màn hình ≤ 600px; tắt cuộn-để-zoom,
//   tắt xoay/nghiêng, giữ nút +/−; màn cảm ứng tắt kéo-để-pan để cuộn trang không bị bản đồ nuốt.
//   Chưa tạo / không có WebGL → nền giấy, mọi thứ phía trên vẫn đúng chỗ (chiếu Mercator như fitBounds).
// - phủ: vùng mờ cấp quận của 4 bạn (CR-11: không có điểm nhà) + nhãn, ghim 3 quán, 3 đường nét đứt + phút, điểm "Bạn".
//   Tất cả là HTML/SVG do React đặt theo `project` (không dùng maplibregl.Marker → không bẫy ghi đè class),
//   vẽ lại mỗi khung khi bản đồ di chuyển (gộp theo requestAnimationFrame).
// Không gọi mạng nào ngoài style/tile của bản đồ; toạ độ người xem chỉ nằm trong state.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LngLatBoundsLike, Map as MlMap } from 'maplibre-gl';
import { BowlFood } from '../../components/ui/Icon';
import { avatarFor, castMember } from '../cast';
import type { DemoCaseData, LngLat, PlaceId } from '../logic/types';
import { createLandingMap, loadMap, whenMapsReleased } from '../map';
import {
  areaRadiusPx,
  baseBounds,
  boundsOf,
  insideView,
  labelSide,
  paperProjector,
  tiePadding,
  type Bounds,
  type Projector,
} from './model';
import { YouMarker } from './YouMarker';

type Phase = 'paper' | 'loading' | 'live' | 'failed';

/** Tạo bản đồ khi phần còn cách màn hình bấy nhiêu (PLAN §4.6). */
export const TIE_MAP_MARGIN = '600px 0px';

/** Thời lượng ôm lại khung khi điểm "Bạn" rơi ra ngoài (cùng nhịp 520 ms của điểm rơi). */
const REFIT_MS = 520;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface TieMapProps {
  demo: DemoCaseData;
  you: LngLat | null;
  drop: number;
  /** true = giảm chuyển động: không rơi, không bay khung. */
  still: boolean;
  pickId: PlaceId;
  /** Phút của người xem tới từng quán (nhãn giữa đường). */
  legs: Record<PlaceId, number | null>;
  /** Hộp "Bạn ở quận nào?" + chip, nằm trên bản đồ. */
  ask: React.ReactNode;
  onPlace: (ll: LngLat) => void;
  onDrag: (ll: LngLat) => void;
  onDragEnd: () => void;
  onNudge: (key: string) => void;
}

const asBounds = (b: Bounds) => b as unknown as LngLatBoundsLike;

export const TieMap: React.FC<TieMapProps> = ({
  demo,
  you,
  drop,
  still,
  pickId,
  legs,
  ask,
  onPlace,
  onDrag,
  onDragEnd,
  onNudge,
}) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [phase, setPhase] = useState<Phase>('paper');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const base = useMemo(() => baseBounds(demo), [demo]);
  const basePts = useMemo(() => [...demo.members.map((m) => m.ll), ...demo.places.map((p) => p.ll)], [demo]);
  const [view, setView] = useState<Bounds>(base);
  const viewRef = useRef<Bounds>(base);
  // Bản đồ di chuyển → vẽ lại lớp phủ (giá trị không dùng, chỉ để React render lại)
  const [, setTick] = useState(0);
  const dragging = useRef(false);
  const cb = useRef({ onPlace, still });
  cb.current = { onPlace, still };

  // Kích thước khung (lớp phủ chiếu theo đúng khung này)
  useIsoLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => setSize({ w: card.clientWidth, h: card.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(card);
    return () => ro?.disconnect();
  }, []);

  // Tạo bản đồ đúng một lần khi phần tới gần màn hình
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let cancelled = false;
    let started = false;
    let map: MlMap | null = null;
    let io: IntersectionObserver | null = null;
    let raf = 0;

    const start = () => {
      if (started || cancelled) return;
      started = true;
      io?.disconnect();
      setPhase('loading');
      // Tối đa 1 context: chờ bản đồ hero chụp + nhả xong (thường đã nhả từ lâu; chỉ khi cuộn thẳng xuống ngay sau khi tải)
      loadMap()
        .then((ml) => whenMapsReleased().then(() => ml))
        .then((ml) => {
          const container = liveRef.current;
          if (cancelled || !container) return;
          const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
          const handle = createLandingMap(ml, {
            container,
            bounds: asBounds(viewRef.current),
            fitBoundsOptions: { padding: tiePadding(container.clientWidth) },
            scrollZoom: false,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            dragPan: !coarse,
            attributionControl: { compact: true },
            fadeDuration: 0,
            onFail: () => {
              if (!cancelled) setPhase('failed');
            },
          });
          if (!handle) return;
          const m = handle.map;
          map = m;
          m.touchZoomRotate.disableRotation();
          m.keyboard.disableRotation();
          m.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
          const bump = () => {
            if (!raf)
              raf = requestAnimationFrame(() => {
                raf = 0;
                setTick((n) => n + 1);
              });
          };
          m.on('move', bump);
          m.on('resize', bump);
          m.on('click', (e) => {
            const target = e.originalEvent?.target as Element | null;
            if (target?.closest?.('.maplibregl-ctrl')) return;
            cb.current.onPlace([e.lngLat.lng, e.lngLat.lat]);
          });
          m.on('load', () => {
            if (cancelled) return;
            // Khung có thể đã đổi cỡ từ lúc dựng (font, ảnh phía trên): đo lại rồi ôm lại
            m.resize();
            m.fitBounds(asBounds(viewRef.current), { padding: tiePadding(container.clientWidth), duration: 0 });
            // Ghi công thu gọn thành nút ⓘ (MapLibre mở sẵn lúc đầu, chồng lên dòng riêng tư); footer vẫn ghi công đủ
            container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
            mapRef.current = m;
            setPhase('live');
          });
        })
        .catch(() => {
          if (!cancelled) setPhase('failed');
        });
    };

    if (typeof IntersectionObserver === 'undefined') start();
    else {
      io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && start(), {
        rootMargin: TIE_MAP_MARGIN,
      });
      io.observe(card);
    }
    return () => {
      cancelled = true;
      io?.disconnect();
      cancelAnimationFrame(raf);
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  const map = phase === 'live' ? mapRef.current : null;
  const pad = tiePadding(size.w);
  const proj: Projector | null = !size.w
    ? null
    : map
      ? {
          project: (ll) => {
            const p = map.project([ll[0], ll[1]]);
            return [p.x, p.y];
          },
          unproject: ([x, y]) => {
            const l = map.unproject([x, y]);
            return [l.lng, l.lat];
          },
        }
      : paperProjector(view, size.w, size.h, pad);

  // Điểm "Bạn" rơi ra ngoài vùng nhìn (chip ở xa, phím mũi tên) → ôm lại 4 quận + 3 quán + bạn. Lúc kéo thì không.
  useEffect(() => {
    if (!you || dragging.current || !proj) return;
    if (insideView(proj.project(you), size.w, size.h, pad)) return;
    const next = boundsOf([...basePts, you], 0.012);
    viewRef.current = next;
    if (map) map.fitBounds(asBounds(next), { padding: pad, duration: cb.current.still ? 0 : REFIT_MS });
    else setView(next);
    // proj/pad suy ra từ size + view + map: chỉ cần chạy lại khi điểm đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [you]);

  // Bấm lên nền giấy (chưa có bản đồ thật): bản đồ thật tự phát `click` (đã lọc kéo-để-pan)
  const onPaperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phase === 'live' || !proj) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPlace(proj.unproject([e.clientX - r.left, e.clientY - r.top]));
  };

  const dragTo = (pt: readonly [number, number]) => {
    if (!proj) return;
    dragging.current = true;
    // Giữ điểm trong khung: không chui xuống dưới hộp hỏi / ra ngoài mép
    const x = Math.min(size.w - 12, Math.max(12, pt[0]));
    const y = Math.min(size.h - 28, Math.max(pad.top - 24, pt[1]));
    onDrag(proj.unproject([x, y]));
  };

  const youPt = proj && you ? proj.project(you) : null;
  const legLines =
    proj && youPt
      ? demo.places.map((p) => {
          const q = proj.project(p.ll);
          return { id: p.id, a: youPt, b: q, mid: [(youPt[0] + q[0]) / 2, (youPt[1] + q[1]) / 2] as const };
        })
      : [];

  return (
    <div ref={cardRef} className="tie-map-card" role="group" aria-label={t('landing.tie.mapLabel')} data-phase={phase}>
      <div ref={liveRef} className="tie-map-live" onClick={onPaperClick} />
      {proj ? (
        <div className="tie-layer">
          <div aria-hidden="true">
            {demo.members.map((m) => {
              const pt = proj.project(m.ll);
              const r = areaRadiusPx(proj, m.ll);
              return (
                <span
                  key={m.id}
                  className="tie-area"
                  style={
                    {
                      left: pt[0],
                      top: pt[1],
                      width: r * 2,
                      height: r * 2,
                      '--area': castMember(m.id).rideColor,
                    } as React.CSSProperties
                  }
                />
              );
            })}
            <svg className="tie-legs" width={size.w} height={size.h}>
              {legLines.map((l) => (
                <line
                  key={l.id}
                  x1={l.a[0]}
                  y1={l.a[1]}
                  x2={l.b[0]}
                  y2={l.b[1]}
                  data-sel={l.id === pickId ? 'true' : undefined}
                />
              ))}
            </svg>
            {demo.members.map((m) => {
              const pt = proj.project(m.ll);
              return (
                <span key={m.id} className="tie-friend" style={{ left: pt[0], top: pt[1] }}>
                  <img src={avatarFor(m.id)} alt="" width={34} height={34} />
                  <span>
                    {m.id} · {t(`landing.district.${m.district}`)}
                  </span>
                </span>
              );
            })}
            {demo.places.map((p) => {
              const pt = proj.project(p.ll);
              return (
                <span
                  key={p.id}
                  className="tie-place"
                  data-side={labelSide(
                    p.ll,
                    demo.members.map((m) => m.ll),
                  )}
                  data-sel={p.id === pickId ? 'true' : undefined}
                  style={{ left: pt[0], top: pt[1] }}
                >
                  <span className="tie-place-dot">
                    <BowlFood size={12} weight="fill" />
                  </span>
                  <span>{p.short}</span>
                </span>
              );
            })}
            {legLines.map((l) =>
              legs[l.id] === null || legs[l.id] === undefined ? null : (
                <span
                  key={l.id}
                  className="tie-leg-min tabular-nums"
                  data-sel={l.id === pickId ? 'true' : undefined}
                  style={{ left: l.mid[0], top: l.mid[1] }}
                >
                  {legs[l.id]}′
                </span>
              ),
            )}
          </div>
          {youPt ? (
            <YouMarker
              pt={youPt}
              drop={drop}
              still={still}
              onDrag={dragTo}
              onDragEnd={() => {
                dragging.current = false;
                onDragEnd();
              }}
              onNudge={onNudge}
            />
          ) : null}
        </div>
      ) : null}
      {ask}
      <p className="tie-privacy">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" />
          <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span>{t('landing.tie.privacy')}</span>
      </p>
    </div>
  );
};
