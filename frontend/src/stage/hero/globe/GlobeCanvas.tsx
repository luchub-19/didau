import React, { useEffect, useRef } from 'react';
import { paintBack, paintFront, GLOBE_HALO } from './lighting';
import {
  GLOBE_LEVELS,
  isCityLight,
  isDarkStage,
  lambert,
  levelColors,
  readGlobePalette,
  rgbCss,
  shadeLevel,
  type GlobePalette,
} from './palette';
import { GLOBE_SPEED_FULL, GLOBE_SPEED_SLOW, GLOBE_TILT_DEG, globeLonAt, setGlobeSpeed } from './clock';
import { buildDots, D2R, GLOBE_HCM, projectInto, viewOf, type GlobeDots, type Projected } from './projection';

export interface GlobeCanvasProps {
  /** `lite` / reduced-motion: 20 s một vòng, 15 fps. */
  slow: boolean;
  className?: string;
}

// Chấm đất gom theo (dải độ sâu z) × (mức sáng lambert) ⇒ tối đa BANDS·LEVELS path đất + 2 path đèn thành phố mỗi khung.
const BANDS = 3;
const bandAlpha = (b: number) => 0.35 + 0.65 * ((b + 0.5) / BANDS);
const LAND_KEYS = BANDS * GLOBE_LEVELS;
const KEYS = LAND_KEYS + 2; // + đèn thành phố mờ / sáng
const CITY_ALPHA = [0.55, 0.95];

/**
 * Canvas 2D vẽ quả cầu chấm bi chiếu trực giao (T-110) có ánh sáng + khí quyển (T-111). Góc xoay lấy từ đồng hồ chung
 * (`clock.ts`) nên instance mới nối tiếp instance cũ. rAF khoá 30 fps (`slow`: 15 fps), dừng khi tab ẩn hoặc cầu ra khỏi
 * khung; DPR ≤ 2. Đường kính cầu = bề rộng phần tử cha (CSS quyết định); canvas rộng hơn 28 % và đồng tâm (absolute
 * 50 %/50 % + translate) để chứa quầng khí quyển, nên tổ tiên gần nhất phải là `position: relative` quanh đúng cầu. Đổi cỡ thì rải lại chấm + vẽ lại hai lớp tĩnh; đổi theme
 * (`data-theme` / `prefers-color-scheme`) thì đọc lại màu và vẽ lại.
 */
export const GlobeCanvas: React.FC<GlobeCanvasProps> = ({ slow, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    setGlobeSpeed(slow ? GLOBE_SPEED_SLOW : GLOBE_SPEED_FULL);
    const frameMs = 1000 / (slow ? 15 : 30);

    let size = 0; // đường kính cầu (px CSS)
    let dpr = 1;
    let dots: GlobeDots = buildDots(1);
    let pal: GlobePalette = readGlobePalette(() => '', false);
    let colors: string[] = [];
    let accent = rgbCss(pal.accent);
    let cityColor = '';
    // Lớp tĩnh vẽ một lần (xem lighting.ts): dưới chấm đất / trên chấm đất.
    const back = document.createElement('canvas');
    const front = document.createElement('canvas');
    const backCtx = back.getContext('2d');
    const frontCtx = front.getContext('2d');
    // Bộ đệm theo chấm (cấp lại khi đổi cỡ): vị trí, bán kính, khoá gom path, thứ tự sau khi gom.
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let pr = new Float32Array(0);
    let key = new Uint8Array(0);
    let order = new Int32Array(0);
    const counts = new Int32Array(KEYS);
    const starts = new Int32Array(KEYS + 1);
    const fill = new Int32Array(KEYS);
    const p: Projected = { x: 0, y: 0, z: 0 };
    const hcm = { s: Math.sin(GLOBE_HCM.lat * D2R), c: Math.cos(GLOBE_HCM.lat * D2R), l: GLOBE_HCM.lon * D2R };

    const refreshPalette = () => {
      const cs = getComputedStyle(canvas);
      pal = readGlobePalette((name) => cs.getPropertyValue(name), isDarkStage());
      colors = levelColors(pal);
      accent = rgbCss(pal.accent);
      cityColor = pal.night ? rgbCss(pal.night) : '';
    };

    const paintStatic = () => {
      if (!size || !backCtx || !frontCtx) return;
      const c = (size / 2) * GLOBE_HALO; // tâm cầu trong canvas (px CSS)
      for (const [cx, paint] of [
        [backCtx, paintBack],
        [frontCtx, paintFront],
      ] as const) {
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cx.clearRect(0, 0, c * 2, c * 2);
        paint(cx, c, size / 2, pal);
      }
    };

    const resize = () => {
      const w = canvas.parentElement?.clientWidth || 0;
      const d = Math.min(2, window.devicePixelRatio || 1);
      if (!w || (w === size && d === dpr)) return;
      size = w;
      dpr = d;
      const side = Math.round(w * GLOBE_HALO * d);
      canvas.style.width = `${w * GLOBE_HALO}px`;
      canvas.style.height = canvas.style.width;
      for (const cv of [canvas, back, front]) {
        cv.width = side;
        cv.height = side;
      }
      dots = buildDots(w / 2);
      px = new Float32Array(dots.count);
      py = new Float32Array(dots.count);
      pr = new Float32Array(dots.count);
      key = new Uint8Array(dots.count);
      order = new Int32Array(dots.count);
      refreshPalette();
      paintStatic();
    };

    const draw = () => {
      if (!size) return;
      const R = size / 2;
      const C = R * GLOBE_HALO;
      const view = viewOf(globeLonAt(), GLOBE_TILT_DEG);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(back, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Lượt 1: chiếu, tính mức sáng, đếm theo khoá. Lượt 2: xếp chỉ số theo khoá (counting sort) ⇒ mỗi khoá một path.
      counts.fill(0);
      const r0 = Math.max(0.9, Math.min(1.9, R / 52));
      let n = 0;
      for (let i = 0; i < dots.count; i++) {
        projectInto(p, dots.sinLat[i], dots.cosLat[i], dots.lon[i], view);
        if (p.z <= 0) continue;
        const lam = lambert(p.x, p.y, p.z);
        const k = isCityLight(pal, dots.hash[i], lam)
          ? LAND_KEYS + (lam < -0.4 ? 1 : 0)
          : Math.min(BANDS - 1, Math.floor(p.z * BANDS)) * GLOBE_LEVELS + shadeLevel(lam);
        px[n] = C + R * p.x;
        py[n] = C - R * p.y;
        pr[n] = r0 * (0.45 + 0.55 * Math.sqrt(p.z)); // mép co chấm ⇒ thấy cong
        key[n] = k;
        counts[k]++;
        n++;
      }
      let acc = 0;
      for (let k = 0; k < KEYS; k++) {
        starts[k] = acc;
        acc += counts[k];
      }
      starts[KEYS] = acc;
      fill.set(starts.subarray(0, KEYS));
      for (let i = 0; i < n; i++) order[fill[key[i]]++] = i;

      for (let k = 0; k < KEYS; k++) {
        const from = starts[k];
        const to = starts[k + 1];
        if (from === to) continue;
        if (k < LAND_KEYS) {
          ctx.globalAlpha = bandAlpha(Math.floor(k / GLOBE_LEVELS));
          ctx.fillStyle = colors[k % GLOBE_LEVELS];
        } else {
          ctx.globalAlpha = CITY_ALPHA[k - LAND_KEYS];
          ctx.fillStyle = cityColor;
        }
        ctx.beginPath();
        for (let j = from; j < to; j++) {
          const i = order[j];
          ctx.moveTo(px[i] + pr[i], py[i]);
          ctx.arc(px[i], py[i], pr[i], 0, Math.PI * 2);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(front, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      projectInto(p, hcm.s, hcm.c, hcm.l, view);
      if (p.z > 0) {
        ctx.globalAlpha = 0.4 + 0.6 * p.z;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(C + R * p.x, C - R * p.y, Math.max(2.5, r0 * 1.8), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    let raf = 0;
    let last = -Infinity;
    let inView = true;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - last < frameMs - 1) return;
      last = ts - ((ts - last) % frameMs || 0); // giữ nhịp đều; lần đầu (last = −∞) ra NaN || 0 ⇒ last = ts
      draw();
    };
    const sync = () => {
      const run = inView && !document.hidden;
      if (run && !raf) {
        last = -Infinity;
        raf = requestAnimationFrame(tick);
      } else if (!run && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Đổi theme giữa lúc đang tải: đọc lại màu, vẽ lại lớp tĩnh, vẽ ngay (rAF có thể đang dừng).
    const onTheme = () => {
      refreshPalette();
      paintStatic();
      draw();
    };

    resize();
    draw();
    sync();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); draw(); }) : null;
    if (canvas.parentElement) ro?.observe(canvas.parentElement);
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((es) => {
            inView = es[es.length - 1]?.isIntersecting ?? true;
            sync();
          })
        : null;
    io?.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(onTheme) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    mql?.addEventListener?.('change', onTheme);

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      io?.disconnect();
      mo?.disconnect();
      mql?.removeEventListener?.('change', onTheme);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [slow]);

  // Đồng tâm với phần tử cha dù cha có viền hay không; cỡ px đặt ở `resize()` (canvas rộng 128 % đường kính cầu).
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'block' }}
    />
  );
};
