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
import { GLOBE_SPEED_FULL, GLOBE_SPEED_SLOW, globeFrame, setGlobeSpeed } from './clock';
import {
  FRIENDS,
  friendPose,
  isStill,
  normLon,
  pinPose,
  ripplePhases,
  trailAlpha,
  type ChoreoState,
} from './choreo';
import { buildDots, D2R, GLOBE_HCM, projectInto, viewOf, type GlobeDots, type Projected } from './projection';

export interface GlobeCanvasProps {
  /** `lite` / reduced-motion: 20 s một vòng, 15 fps. */
  slow: boolean;
  className?: string;
  /** Biên đạo vừa xong (pha `done`, T-113): gọi một lần cho mỗi instance. */
  onStoryEnd?: () => void;
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
export const GlobeCanvas: React.FC<GlobeCanvasProps> = ({ slow, className, onStoryEnd }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const endRef = useRef(onStoryEnd);
  endRef.current = onStoryEnd;

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
    let paper = rgbCss(pal.paper);
    let friendColors = pal.friends.map(rgbCss);
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
      paper = rgbCss(pal.paper);
      friendColors = pal.friends.map(rgbCss);
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

    // Ghim + 4 chấm bạn bè bay theo cung bậc hai về ghim + gợn sóng (mock T-113). Toạ độ px CSS, tâm ghim (x, y).
    const drawPin = (f: ChoreoState, x: number, y: number, R: number) => {
      const t = f.pinT;
      if (f.friends) {
        const head = Math.max(2.6, R * 0.04);
        const ta = trailAlpha(t);
        FRIENDS.forEach((off, i) => {
          const { u, e } = friendPose(i, t, slow);
          if (u <= 0) return; // chưa bay
          if (slow) {
            // lite/reduced: không bay, hiện thẳng sát ghim cho tới lúc "nhập" vào ghim
            if (u >= 1) return;
            ctx.fillStyle = friendColors[i];
            ctx.strokeStyle = paper;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(x + off[0] * head * 1.6, y + off[1] * head * 1.6, head, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            return;
          }
          const x0 = x + off[0] * R * 0.95;
          const y0 = y + off[1] * R * 0.95;
          const mx = (x0 + x) / 2;
          const my = Math.min(y0, y) - R * 0.32;
          const bx = (k: number) => (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * x;
          const by = (k: number) => (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * y;
          // Vệt nét đứt sau đầu chấm (dài 0,55 cung); chấm đã tới thì vệt còn mờ dần tới TRAIL_FADE.
          if (ta > 0) {
            ctx.strokeStyle = friendColors[i];
            ctx.lineWidth = 1.6;
            ctx.globalAlpha = ta;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            const tail = Math.max(0, e - 0.55);
            ctx.moveTo(bx(tail), by(tail));
            for (let k = tail + 0.04; k < e; k += 0.04) ctx.lineTo(bx(k), by(k));
            ctx.lineTo(bx(e), by(e));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          if (u >= 1) return; // đã nhập vào ghim
          ctx.fillStyle = friendColors[i];
          ctx.strokeStyle = paper;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(bx(e), by(e), head, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        // Gợn sóng lặp trong lúc chờ bản đồ (không có ở lite/reduced và khi đã xong).
        if (!slow && f.phase === 'pin') {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.5;
          for (const w of ripplePhases(t)) {
            ctx.globalAlpha = 0.5 * (1 - w);
            ctx.beginPath();
            ctx.arc(x, y, 4 + w * R * 0.38, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
      const pose = pinPose(t, slow || !f.friends);
      const hgt = Math.max(13, R * 0.2) * pose.lift;
      const tipY = y - pose.bounce;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x, y + 1, 4, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      const hr = Math.max(5, R * 0.075) * pose.pulse;
      const hy = tipY - hgt;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(x, tipY);
      ctx.quadraticCurveTo(x - hr * 1.05, hy + hr * 0.6, x - hr, hy);
      ctx.arc(x, hy, hr, Math.PI, 0);
      ctx.quadraticCurveTo(x + hr * 1.05, hy + hr * 0.6, x, tipY);
      ctx.fill();
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(x, hy, hr * 0.42, 0, Math.PI * 2);
      ctx.fill();
    };

    // Khung tĩnh (dừng ở VN chờ tiles, hoặc đã xong) đã vẽ một lần ⇒ bỏ vẽ; `force` cho đổi cỡ / đổi theme.
    let drewStill = false;
    let ended = false;
    const draw = (force = false) => {
      if (!size) return;
      const f = globeFrame();
      if (f.phase === 'done' && !ended) {
        ended = true;
        endRef.current?.();
      }
      const still = isStill(f, slow);
      if (still && drewStill && !force) return;
      drewStill = still;
      const R = size / 2;
      const C = R * GLOBE_HALO;
      const view = viewOf(normLon(f.lon), f.lat);
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
      if ((f.phase === 'pin' || f.phase === 'done') && p.z > 0.05) {
        drawPin(f, C + R * p.x, C - R * p.y, R);
      } else if (p.z > 0) {
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
      draw(true);
    };

    resize();
    draw(true);
    sync();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { resize(); draw(true); }) : null;
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
