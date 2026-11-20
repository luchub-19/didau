// Hai lớp tĩnh của quả cầu (T-111): `paintBack` (quầng khí quyển + biển gradient) nằm DƯỚI chấm đất, `paintFront`
// (rìa tối + vệt phản chiếu + viền) nằm TRÊN. Cả hai không đổi theo góc xoay ⇒ vẽ một lần ra canvas phụ,
// mỗi khung chỉ `drawImage`. Toạ độ tính bằng px CSS của canvas (đã `setTransform(dpr)`); tâm cầu ở (C, C).
import { GLOBE_LIGHT, rgbaCss, rgbCss, type GlobePalette } from './palette';

/** Quầng khí quyển lan tới `HALO` lần bán kính; canvas phải rộng 2·HALO·R. */
export const GLOBE_HALO = 1.28;

const TAU = Math.PI * 2;

function circleClip(ctx: CanvasRenderingContext2D, c: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, TAU);
  ctx.clip();
}

export function paintBack(ctx: CanvasRenderingContext2D, c: number, r: number, pal: GlobePalette): void {
  const halo = ctx.createRadialGradient(c, c, r * 0.92, c, c, r * GLOBE_HALO);
  halo.addColorStop(0, rgbaCss(pal.atmo, 0.42));
  halo.addColorStop(0.35, rgbaCss(pal.atmo, 0.16));
  halo.addColorStop(1, rgbaCss(pal.atmo, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(c, c, r * GLOBE_HALO, 0, TAU);
  ctx.fill();

  circleClip(ctx, c, r);
  const sea = ctx.createRadialGradient(c + GLOBE_LIGHT[0] * r * 0.5, c - GLOBE_LIGHT[1] * r * 0.5, r * 0.1, c, c, r * 1.05);
  sea.addColorStop(0, rgbCss(pal.seaLit));
  sea.addColorStop(1, rgbCss(pal.seaDark));
  ctx.fillStyle = sea;
  ctx.fillRect(c - r, c - r, r * 2, r * 2);
  ctx.restore();
}

export function paintFront(ctx: CanvasRenderingContext2D, c: number, r: number, pal: GlobePalette): void {
  circleClip(ctx, c, r);
  // Phía tối + rìa tối: trong suốt ở phía nắng, đậm dần ra mép đối diện.
  const shade = ctx.createRadialGradient(c + GLOBE_LIGHT[0] * r * 0.7, c - GLOBE_LIGHT[1] * r * 0.7, r * 0.2, c, c, r * 1.15);
  shade.addColorStop(0, rgbaCss(pal.rim, 0));
  shade.addColorStop(0.6, rgbaCss(pal.rim, 0.05));
  shade.addColorStop(1, rgbaCss(pal.rim, pal.rimAlpha));
  ctx.fillStyle = shade;
  ctx.fillRect(c - r, c - r, r * 2, r * 2);
  // Vệt phản chiếu ở phía nắng.
  const sx = c + GLOBE_LIGHT[0] * r * 0.48;
  const sy = c - GLOBE_LIGHT[1] * r * 0.48;
  const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.42);
  spec.addColorStop(0, rgbaCss(pal.spec, 0.38));
  spec.addColorStop(1, rgbaCss(pal.spec, 0));
  ctx.fillStyle = spec;
  ctx.fillRect(c - r, c - r, r * 2, r * 2);
  ctx.restore();

  ctx.lineWidth = 1;
  ctx.strokeStyle = rgbaCss(pal.atmo, 0.55);
  ctx.beginPath();
  ctx.arc(c, c, r - 0.5, 0, TAU);
  ctx.stroke();
}
