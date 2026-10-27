// Phim cuộn của hero (lazy chunk, kéo theo gsap): ScrollTrigger ghim sân khấu và nối tiến độ cuộn → camera.
//   full: scrub liên tục, cameraAt(progress) → map.jumpTo mỗi khung
//   lite: không scrub; vào cảnh mới thì flyTo ≈1,2 s (resolvePreset('hero.shot', 'lite'))
import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { duration, easing, getTimeScale, motionAttrs, resolvePreset, stageLog } from '../../motion';
import { HeroActions, type HeroActionsProps } from './HeroActions';
import { HeroCaption } from './HeroCaption';
import { HeroPoster } from './HeroPoster';
import type { HeroMapHandle } from './HeroMap';
import { cameraAt, duskAt, HERO_SHOTS, reachedStops, routeProgressAt, shotIndexAt, type HeroShot } from './shots';

gsap.registerPlugin(ScrollTrigger, useGSAP);
if (typeof window !== 'undefined') ScrollTrigger.config({ ignoreMobileResize: true });

const HeroMap = lazy(() => import('./HeroMap').then((m) => ({ default: m.HeroMap })));

/** Quãng cuộn của cả phim, tính bằng số màn hình. */
const SCROLL_SCREENS = 4;
/** Độ trễ bám cuộn của camera (giây), nhân `?motion=slow`: cao hơn thì từng nấc lăn chuột được làm mịn. */
const SCRUB_SECONDS = 1;
const LAST_SHOT = HERO_SHOTS.length - 1;

const shotCamera = (s: HeroShot) => ({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing });

export interface HeroScrollProps extends HeroActionsProps {
  tier: 'full' | 'lite';
  header: React.ReactNode;
}

const HeroScroll: React.FC<HeroScrollProps> = ({ tier, header, ...actions }) => {
  const { t } = useTranslation();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HeroMapHandle | null>(null);
  const triggerRef = useRef<ScrollTrigger | null>(null);
  const progressRef = useRef(0);
  const skipUntilRef = useRef(0);
  const [shotIndex, setShotIndex] = useState(0);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [panelHeight, setPanelHeight] = useState(0);
  // Số chặng đường nối đã vẽ tới (đổi 3 lần trong cả phim, không render lại mỗi khung)
  const [reached, setReached] = useState(0);
  const sunlightRef = useRef<HTMLDivElement>(null);
  // Mở màn xoay chỉ khi vào trang ở đầu phim (tải lại giữa chừng thì thôi)
  const [playIntro] = useState(() => typeof window === 'undefined' || window.scrollY < 8);
  const shot = resolvePreset('hero.shot', tier);

  // Khung chữ che đáy sân khấu: báo chiều cao cho bản đồ đặt padding, tâm mỗi cảnh nằm giữa phần còn thấy
  useEffect(() => {
    const el = panelRef.current?.parentElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setPanelHeight(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const stage = stageRef.current;
      if (!section || !stage) return;
      const onProgress = (p: number) => {
        progressRef.current = p;
        setShotIndex(shotIndexAt(p));
        if (tier === 'full' && performance.now() >= skipUntilRef.current) mapRef.current?.setCamera(cameraAt(p));
        // Buổi tối trôi theo tay cuộn: nắng chiều nhạt dần, bản đồ ngả chạng vạng, đường nối vẽ dần ở cảnh cuối
        const dusk = duskAt(p);
        if (sunlightRef.current) sunlightRef.current.style.opacity = String(1 - dusk);
        mapRef.current?.setDusk(dusk);
        const route = routeProgressAt(p);
        mapRef.current?.setRoute(route);
        setReached(reachedStops(route));
      };
      const scrollTrigger: ScrollTrigger.Vars = {
        trigger: section,
        start: 'top top',
        end: () => `+=${window.innerHeight * SCROLL_SCREENS}`,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      };
      if (tier === 'full') {
        // Tween một biến trung gian để scrub có độ trễ mượt; camera đọc theo biến đó
        const proxy = { p: 0 };
        const tween = gsap.to(proxy, {
          p: 1,
          ease: 'none',
          scrollTrigger: { ...scrollTrigger, scrub: SCRUB_SECONDS * getTimeScale() },
          onUpdate: () => onProgress(proxy.p),
        });
        triggerRef.current = tween.scrollTrigger ?? null;
      } else {
        triggerRef.current = ScrollTrigger.create({ ...scrollTrigger, onUpdate: (self) => onProgress(self.progress) });
      }
      stageLog('hero scroll', tier);
    },
    { scope: sectionRef, dependencies: [tier], revertOnUpdate: true },
  );

  // Mức 'lite': mỗi lần vào cảnh mới thì bay một nhịp ngắn
  useEffect(() => {
    if (tier !== 'lite') return;
    mapRef.current?.flyTo(shotCamera(HERO_SHOTS[shotIndex]), shot.durationMs);
  }, [tier, shotIndex, shot.durationMs]);

  // Bản đồ (chunk lazy) gắn xong → đặt ngay camera theo tiến độ hiện tại
  const attachMap = useCallback(
    (handle: HeroMapHandle | null) => {
      mapRef.current = handle;
      if (!handle) return;
      const p = progressRef.current;
      handle.setCamera(tier === 'full' ? cameraAt(p) : shotCamera(HERO_SHOTS[shotIndexAt(p)]));
      handle.setDusk(duskAt(p));
      handle.setRoute(routeProgressAt(p));
    },
    [tier],
  );

  const skipIntro = () => {
    const st = triggerRef.current;
    if (!st) return;
    // Bỏ qua scrub trong lúc bay thẳng tới cảnh cuối, khỏi lướt qua từng cảnh
    skipUntilRef.current = performance.now() + shot.durationMs;
    mapRef.current?.flyTo(shotCamera(HERO_SHOTS[LAST_SHOT]), shot.durationMs);
    window.scrollTo({ top: st.end, behavior: 'auto' });
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  };

  const textMs = duration('moment');
  const textEase = easing('out');

  return (
    <section ref={sectionRef} aria-label={t('hero.sectionLabel')} data-hero-tier={tier}>
      <div ref={stageRef} className="relative h-[100svh] w-full overflow-hidden bg-[rgb(var(--stage-paper))]">
        {/* Thứ tự DOM: header + khung chữ trước bản đồ để Tab tới CTA trước; lớp z-10 vẫn nằm trên bản đồ */}
        <div className="absolute inset-x-0 top-0 z-10">{header}</div>

        <div className="absolute inset-x-0 bottom-0 z-10 p-3 md:p-6 pointer-events-none">
          <div
            ref={panelRef}
            className="mx-auto max-w-7xl pointer-events-auto rounded-card border border-[rgb(var(--stage-ink)/0.12)] bg-[rgb(var(--stage-paper)/0.94)] shadow-[var(--stage-shadow-long)] p-4 md:p-7"
          >
            <div className="grid">
              {HERO_SHOTS.map((s, i) => {
                const active = i === shotIndex;
                return (
                  <div
                    key={s.id}
                    {...motionAttrs('hero.shot')}
                    aria-hidden={!active}
                    className="col-start-1 row-start-1 self-end"
                    style={{
                      opacity: active ? 1 : 0,
                      transform: active || !shot.move ? 'none' : 'translateY(12px)',
                      transition: `opacity ${textMs}ms ${textEase}, transform ${textMs}ms ${textEase}`,
                    }}
                  >
                    <HeroCaption shot={s} reached={reached} />
                  </div>
                );
              })}
            </div>
            <div className="mt-4 md:mt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div className="md:w-[26rem]">
                <HeroActions {...actions} />
              </div>
              {shotIndex < LAST_SHOT && (
                <button
                  type="button"
                  onClick={skipIntro}
                  className="self-start md:self-auto min-h-[44px] px-3 -mx-3 md:mx-0 rounded-field text-label font-semibold text-[rgb(var(--stage-ink-2))] underline underline-offset-4 decoration-[rgb(var(--stage-ink)/0.3)] [@media(hover:hover)]:hover:text-[rgb(var(--stage-ink))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgb(var(--stage-ink))]"
                >
                  {t('hero.skip')}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="absolute inset-0">
          <HeroPoster />
        </div>
        {mapState !== 'failed' && (
          <div
            {...motionAttrs('hero.shot')}
            className="absolute inset-0"
            style={{
              opacity: mapState === 'ready' ? 1 : 0,
              transition: `opacity ${textMs}ms ${textEase}`,
            }}
          >
            <Suspense fallback={null}>
              <HeroMap
                ref={attachMap}
                tier={tier}
                shotIndex={shotIndex}
                bottomInset={panelHeight}
                reached={reached}
                playIntro={playIntro}
                onReady={() => setMapState('ready')}
                onFail={() => setMapState('failed')}
              />
            </Suspense>
          </div>
        )}

        <div ref={sunlightRef} aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: 'var(--stage-sunlight)' }} />
      </div>
    </section>
  );
};

export default HeroScroll;
