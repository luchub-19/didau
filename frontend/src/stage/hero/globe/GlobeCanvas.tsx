import React, { useEffect, useRef } from 'react';
import { GLOBE_SPEED_FULL, GLOBE_SPEED_SLOW, GLOBE_TILT_DEG, globeLonAt, setGlobeSpeed } from './clock';
import { buildDots, D2R, GLOBE_HCM, projectInto, viewOf, type GlobeDots, type Projected } from './projection';

export interface GlobeCanvasProps {
  /** `lite` / reduced-motion: 20 s một vòng, 15 fps. */
  slow: boolean;
  className?: string;
}

interface Palette {
  sea: string;
  land: string;
  accent: string;
}

/** Màu tạm từ token Stage (T-111 thay bằng ánh sáng + màu riêng từng theme). */
function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const tok = (name: string, fallback: string) => `rgb(${(cs.getPropertyValue(name).trim() || fallback).split(/\s+/).join(',')})`;
  return {
    sea: tok('--stage-paper-2', '243 227 199'),
    land: tok('--stage-ink-2', '107 74 54'),
    accent: tok('--stage-accent-text', '184 58 34'),
  };
}

// Chấm gom theo 4 dải độ sâu z, mỗi dải một alpha ⇒ mỗi khung chỉ 4 lần fill (thay vì một lần mỗi chấm).
const BANDS = 4;
const bandAlpha = (b: number) => 0.35 + 0.65 * ((b + 0.5) / BANDS);

/**
 * Canvas 2D vẽ quả cầu chấm bi chiếu trực giao (T-110). Góc xoay lấy từ đồng hồ chung (`clock.ts`) nên instance
 * mới nối tiếp instance cũ. rAF khoá 30 fps (`slow`: 15 fps), dừng khi tab ẩn hoặc cầu ra khỏi khung; DPR ≤ 2.
 * Cỡ lấy từ phần tử cha (CSS quyết định đường kính), đổi cỡ thì rải lại chấm.
 */
export const GlobeCanvas: React.FC<GlobeCanvasProps> = ({ slow, className }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    setGlobeSpeed(slow ? GLOBE_SPEED_SLOW : GLOBE_SPEED_FULL);
    const frameMs = 1000 / (slow ? 15 : 30);

    let size = 0;
    let dpr = 1;
    let dots: GlobeDots = buildDots(1);
    let pal = readPalette(canvas);
    let buf: Float32Array[] = [];
    const counts = new Int32Array(BANDS);
    const p: Projected = { x: 0, y: 0, z: 0 };
    const hcm = { s: Math.sin(GLOBE_HCM.lat * D2R), c: Math.cos(GLOBE_HCM.lat * D2R), l: GLOBE_HCM.lon * D2R };

    const resize = () => {
      const w = canvas.parentElement?.clientWidth || canvas.clientWidth;
      const d = Math.min(2, window.devicePixelRatio || 1);
      if (!w || (w === size && d === dpr)) return;
      size = w;
      dpr = d;
      canvas.width = Math.round(w * d);
      canvas.height = Math.round(w * d);
      dots = buildDots(w / 2);
      buf = Array.from({ length: BANDS }, () => new Float32Array(dots.count * 3));
      pal = readPalette(canvas);
    };

    const draw = () => {
      if (!size) return;
      const R = size / 2;
      const view = viewOf(globeLonAt(), GLOBE_TILT_DEG);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = pal.sea;
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.fill();

      counts.fill(0);
      const r0 = Math.max(0.9, Math.min(1.9, R / 52));
      for (let i = 0; i < dots.count; i++) {
        projectInto(p, dots.sinLat[i], dots.cosLat[i], dots.lon[i], view);
        if (p.z <= 0) continue;
        const b = Math.min(BANDS - 1, Math.floor(p.z * BANDS));
        const k = counts[b]++ * 3;
        const arr = buf[b];
        arr[k] = R + R * p.x;
        arr[k + 1] = R - R * p.y;
        arr[k + 2] = r0 * (0.45 + 0.55 * Math.sqrt(p.z)); // mép co chấm ⇒ thấy cong
      }
      ctx.fillStyle = pal.land;
      for (let b = 0; b < BANDS; b++) {
        const n = counts[b];
        if (!n) continue;
        const arr = buf[b];
        ctx.globalAlpha = bandAlpha(b);
        ctx.beginPath();
        for (let j = 0; j < n * 3; j += 3) {
          ctx.moveTo(arr[j] + arr[j + 2], arr[j + 1]);
          ctx.arc(arr[j], arr[j + 1], arr[j + 2], 0, Math.PI * 2);
        }
        ctx.fill();
      }

      projectInto(p, hcm.s, hcm.c, hcm.l, view);
      if (p.z > 0) {
        ctx.globalAlpha = 0.4 + 0.6 * p.z;
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(R + R * p.x, R - R * p.y, Math.max(2.5, r0 * 1.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [slow]);

  return <canvas ref={ref} aria-hidden="true" className={className} style={{ width: '100%', height: '100%', display: 'block' }} />;
};
