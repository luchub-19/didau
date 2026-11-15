import type { Map as MapLibreMap } from 'maplibre-gl';
import type { PlaceCategory, PoiKind } from '../../types';

/**
 * Ảnh icon cho lớp quán trên bản đồ (T-101, MAP-POI §4): dựng lúc chạy từ path SVG Phosphor (bản `fill`,
 * khung 256×256, chép từ `@phosphor-icons/react` 2.1.10 — cùng bộ với `ui/Icon.tsx`) → canvas → `map.addImage`.
 * Vẽ bằng `Path2D` nên đồng bộ, không phải chờ ảnh tải. Màu do PoiLayer truyền vào (hiện cố định bảng sáng);
 * gọi lại `registerPoiImages` với màu mới thì ảnh được `updateImage`.
 */

/** Path Phosphor (weight fill, viewBox 0 0 256 256). */
const PHOSPHOR_FILL = {
  ForkKnife:
    'M216,40V224a8,8,0,0,1-16,0V176H152a8,8,0,0,1-8-8,268.75,268.75,0,0,1,7.22-56.88c9.78-40.49,28.32-67.63,53.63-78.47A8,8,0,0,1,216,40Zm-96.11-1.31a8,8,0,1,0-15.78,2.63L111.89,88H88V40a8,8,0,0,0-16,0V88H48.11l7.78-46.68a8,8,0,1,0-15.78-2.63l-8,48A8.17,8.17,0,0,0,32,88a48.07,48.07,0,0,0,40,47.32V224a8,8,0,0,0,16,0V135.32A48.07,48.07,0,0,0,128,88a8.17,8.17,0,0,0-.11-1.31Z',
  BowlFood:
    'M224,104h-8.37a88,88,0,0,0-175.26,0H32a8,8,0,0,0-8,8,104.35,104.35,0,0,0,56,92.28V208a16,16,0,0,0,16,16h64a16,16,0,0,0,16-16v-3.72A104.35,104.35,0,0,0,232,112,8,8,0,0,0,224,104ZM173.48,56.23q2.75,2.25,5.27,4.75a87.92,87.92,0,0,0-49.15,43H100.1A72.26,72.26,0,0,1,168,56C169.83,56,171.66,56.09,173.48,56.23ZM148.12,104a71.84,71.84,0,0,1,41.27-29.57A71.45,71.45,0,0,1,199.54,104ZM128,40a71.87,71.87,0,0,1,19,2.57A88.36,88.36,0,0,0,83.33,104H56.46A72.08,72.08,0,0,1,128,40Z',
  Hamburger:
    'M35.58,98.06a16,16,0,0,1-3.23-13.44C39.78,49.5,80,24,128,24s88.22,25.5,95.65,60.62A16,16,0,0,1,207.93,104H48.07A16,16,0,0,1,35.58,98.06Zm193.68,54.42-41.13,15L151,152.57a8,8,0,0,0-5.94,0l-37,14.81L71,152.57a8,8,0,0,0-5.7-.09l-44,16a8,8,0,0,0,5.47,15L40,178.69V184a40,40,0,0,0,40,40h96a40,40,0,0,0,40-40v-9.67l18.73-6.81a8,8,0,1,0-5.47-15ZM24,136H232a8,8,0,0,0,0-16H24a8,8,0,0,0,0,16Z',
  Cake:
    'M208,88H136V79a32.06,32.06,0,0,0,24-31c0-28-26.44-45.91-27.56-46.66a8,8,0,0,0-8.88,0C122.44,2.09,96,20,96,48a32.06,32.06,0,0,0,24,31v9H48a24,24,0,0,0-24,24v23.33a40.84,40.84,0,0,0,8,24.24V200a24,24,0,0,0,24,24H200a24,24,0,0,0,24-24V159.57a40.84,40.84,0,0,0,8-24.24V112A24,24,0,0,0,208,88ZM112,48c0-13.57,10-24.46,16-29.79,6,5.33,16,16.22,16,29.79a16,16,0,0,1-32,0Zm104,87.33c0,13.25-10.46,24.31-23.32,24.66A24,24,0,0,1,168,136a8,8,0,0,0-16,0,24,24,0,0,1-48,0,8,8,0,0,0-16,0,24,24,0,0,1-24.68,24C50.46,159.64,40,148.58,40,135.33V112a8,8,0,0,1,8-8H208a8,8,0,0,1,8,8Z',
  Coffee:
    'M208,80H32a8,8,0,0,0-8,8v48a96.3,96.3,0,0,0,32.54,72H32a8,8,0,0,0,0,16H208a8,8,0,0,0,0-16H183.46a96.59,96.59,0,0,0,27-40.09A40,40,0,0,0,248,128v-8A40,40,0,0,0,208,80Zm24,48a24,24,0,0,1-17.2,23,95.78,95.78,0,0,0,1.2-15V97.38A24,24,0,0,1,232,120ZM112,56V24a8,8,0,0,1,16,0V56a8,8,0,0,1-16,0Zm32,0V24a8,8,0,0,1,16,0V56a8,8,0,0,1-16,0ZM80,56V24a8,8,0,0,1,16,0V56a8,8,0,0,1-16,0Z',
  Drop:
    'M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75Zm9.85,105.59a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z',
  IceCream:
    'M208,97.37V96A80,80,0,0,0,48,96v1.37A24,24,0,0,0,56,144h3.29l54.82,95.94a16,16,0,0,0,27.78,0L196.71,144H200a24,24,0,0,0,8-46.63ZM146.89,198.94,115.5,144h19.29l21.75,38.06ZM77.71,144H97.07l40.61,71.06L128,232Zm88,21.94L153.21,144h25.08Z',
  BeerStein:
    'M216,88H200V72a40,40,0,0,0-40-40H148.82c-11.91-10.2-28-16-44.82-16C68.71,16,40,41.12,40,72V208a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16v-8h16a24,24,0,0,0,24-24V112A24,24,0,0,0,216,88ZM104,184a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0ZM57,64c4.46-18.24,23.85-32,47-32,13.87,0,27.06,5,36.21,13.78A8,8,0,0,0,145.74,48H160a24,24,0,0,1,22.62,16ZM224,176a8,8,0,0,1-8,8H200V104h16a8,8,0,0,1,8,8Z',
  Storefront:
    'M231.69,93.81,217.35,43.6A16.07,16.07,0,0,0,202,32H54A16.07,16.07,0,0,0,38.65,43.6L24.31,93.81A7.94,7.94,0,0,0,24,96v16a40,40,0,0,0,16,32v72a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V144a40,40,0,0,0,16-32V96A7.94,7.94,0,0,0,231.69,93.81ZM88,112a24,24,0,0,1-35.12,21.26,7.88,7.88,0,0,0-1.82-1.06A24,24,0,0,1,40,112v-8H88Zm64,0a24,24,0,0,1-48,0v-8h48Zm64,0a24,24,0,0,1-11.07,20.2,8.08,8.08,0,0,0-1.8,1.05A24,24,0,0,1,168,112v-8h48Z',
  ShoppingCart:
    'M230.14,58.87A8,8,0,0,0,224,56H62.68L56.6,22.57A8,8,0,0,0,48.73,16H24a8,8,0,0,0,0,16h18L67.56,172.29a24,24,0,0,0,5.33,11.27,28,28,0,1,0,44.4,8.44h45.42A27.75,27.75,0,0,0,160,204a28,28,0,1,0,28-28H91.17a8,8,0,0,1-7.87-6.57L80.13,152h116a24,24,0,0,0,23.61-19.71l12.16-66.86A8,8,0,0,0,230.14,58.87ZM104,204a12,12,0,1,1-12-12A12,12,0,0,1,104,204Zm96,0a12,12,0,1,1-12-12A12,12,0,0,1,200,204Z',
  FilmSlate:
    'M216,104H102.09L210,75.51a8,8,0,0,0,5.68-9.84l-8.16-30a15.93,15.93,0,0,0-19.42-11.13L35.81,64.74a15.75,15.75,0,0,0-9.7,7.4,15.51,15.51,0,0,0-1.55,12L32,111.56c0,.14,0,.29,0,.44v88a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V112A8,8,0,0,0,216,104ZM192.16,40l6,22.07L164.57,71,136.44,54.72ZM77.55,70.27l28.12,16.24-59.6,15.73-6-22.08Z',
  Microphone:
    'M80,128V64a48,48,0,0,1,96,0v64a48,48,0,0,1-96,0Zm128,0a8,8,0,0,0-16,0,64,64,0,0,1-128,0,8,8,0,0,0-16,0,80.11,80.11,0,0,0,72,79.6V240a8,8,0,0,0,16,0V207.6A80.11,80.11,0,0,0,208,128Z',
  GameController:
    'M247.44,173.75a.68.68,0,0,0,0-.14L231.05,89.44c0-.06,0-.12,0-.18A60.08,60.08,0,0,0,172,40H83.89a59.88,59.88,0,0,0-59,49.52L8.58,173.61a.68.68,0,0,0,0,.14,36,36,0,0,0,60.9,31.71l.35-.37L109.52,160h37l39.71,45.09c.11.13.23.25.35.37A36.08,36.08,0,0,0,212,216a36,36,0,0,0,35.43-42.25ZM104,112H96v8a8,8,0,0,1-16,0v-8H72a8,8,0,0,1,0-16h8V88a8,8,0,0,1,16,0v8h8a8,8,0,0,1,0,16Zm40-8a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H152A8,8,0,0,1,144,104Zm84.37,87.47a19.84,19.84,0,0,1-12.9,8.23A20.09,20.09,0,0,1,198,194.31L167.8,160H172a60,60,0,0,0,51-28.38l8.74,45A19.82,19.82,0,0,1,228.37,191.47Z',
  Tree:
    'M128,187.85a72.44,72.44,0,0,0,8,4.62V232a8,8,0,0,1-16,0V192.47A72.44,72.44,0,0,0,128,187.85ZM198.1,62.59a76,76,0,0,0-140.2,0A71.71,71.71,0,0,0,16,127.8C15.9,166,48,199,86.14,200A72.22,72.22,0,0,0,120,192.47V156.94L76.42,135.16a8,8,0,1,1,7.16-14.32L120,139.06V88a8,8,0,0,1,16,0v27.06l36.42-18.22a8,8,0,1,1,7.16,14.32L136,132.94v59.53A72.17,72.17,0,0,0,168,200l1.82,0C208,199,240.11,166,240,127.8A71.71,71.71,0,0,0,198.1,62.59Z',
  Bank:
    'M248,208a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H240A8,8,0,0,1,248,208ZM16.3,98.18a8,8,0,0,1,3.51-9l104-64a8,8,0,0,1,8.38,0l104,64A8,8,0,0,1,232,104H208v64h16a8,8,0,0,1,0,16H32a8,8,0,0,1,0-16H48V104H24A8,8,0,0,1,16.3,98.18ZM144,160a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Zm-48,0a8,8,0,0,0,16,0V112a8,8,0,0,0-16,0Z',
  MapPin:
    'M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z',
} as const;

type GlyphName = keyof typeof PHOSPHOR_FILL;

/** kind → category (giống `backend/app/domain/patterns/category_detector/osm_mapping.py` KIND_CATEGORY). */
export const KIND_CATEGORY: Record<PoiKind, PlaceCategory> = {
  restaurant: 'FOOD',
  eatery: 'FOOD',
  fast_food: 'FOOD',
  bakery: 'FOOD',
  cafe: 'DRINK',
  tea: 'DRINK',
  dessert: 'DRINK',
  bar: 'DRINK',
  mall: 'SHOPPING',
  supermarket: 'SHOPPING',
  cinema: 'ENTERTAINMENT',
  karaoke: 'ENTERTAINMENT',
  play: 'ENTERTAINMENT',
  park: 'SIGHTSEEING',
  museum: 'SIGHTSEEING',
};

/** kind → icon Phosphor (MAP-POI §3.1). */
export const KIND_GLYPH: Record<PoiKind, GlyphName> = {
  restaurant: 'ForkKnife',
  eatery: 'BowlFood',
  fast_food: 'Hamburger',
  bakery: 'Cake',
  cafe: 'Coffee',
  tea: 'Drop',
  dessert: 'IceCream',
  bar: 'BeerStein',
  mall: 'Storefront',
  supermarket: 'ShoppingCart',
  cinema: 'FilmSlate',
  karaoke: 'Microphone',
  play: 'GameController',
  park: 'Tree',
  museum: 'Bank',
};

/** Quán thiếu `kind` (snapshot cũ `pois_*`): icon theo category. */
const CATEGORY_GLYPH: Record<PlaceCategory, GlyphName> = {
  FOOD: 'ForkKnife',
  DRINK: 'Coffee',
  ENTERTAINMENT: 'GameController',
  SIGHTSEEING: 'Bank',
  SHOPPING: 'Storefront',
  ACCOMMODATION: 'MapPin',
  OTHER: 'MapPin',
};

const CATEGORIES = Object.keys(CATEGORY_GLYPH) as PlaceCategory[];
const KINDS = Object.keys(KIND_GLYPH) as PoiKind[];

/** Khoá icon của một quán: `kind` nếu biết, không thì `c-<CATEGORY>`. */
export function poiIconKey(kind: string | null | undefined, category: PlaceCategory): string {
  return kind && kind in KIND_GLYPH ? kind : `c-${category}`;
}

export const poiIconImage = (key: string) => `poi-icon-${key}`;
export const poiPinImage = (key: string) => `poi-pin-${key}`;
export const poiDotImage = (category: PlaceCategory) => `poi-dot-${category}`;

/** Tỉ lệ điểm ảnh của ảnh icon (vẽ gấp đôi cho màn retina). */
const PIXEL_RATIO = 2;
/** Đường kính vòng icon (px CSS) — MAP-POI §4 ~22px. */
export const ICON_SIZE = 22;
/** Đường kính chấm nhỏ (px CSS) — §4 ~7px. */
export const DOT_SIZE = 7;
/** Ghim quán đang chọn (px CSS). */
export const PIN_W = 30;
export const PIN_H = 38;

export interface PoiIconColors {
  /** Màu loại theo category (nền vòng/ghim). */
  category: Record<PlaceCategory, string>;
  /** Màu glyph + viền (trắng). */
  surface: string;
}

function newCanvas(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = w * PIXEL_RATIO;
    c.height = h * PIXEL_RATIO;
    const ctx = c.getContext('2d');
    ctx?.scale(PIXEL_RATIO, PIXEL_RATIO);
    return ctx;
  } catch {
    return null;
  }
}

/** Vẽ glyph Phosphor cỡ `size` px, tâm tại (cx, cy). */
function drawGlyph(ctx: CanvasRenderingContext2D, glyph: GlyphName, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 256, size / 256);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(PHOSPHOR_FILL[glyph]));
  ctx.restore();
}

function readImage(ctx: CanvasRenderingContext2D): ImageData {
  return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Vòng màu loại + viền surface + icon màu surface. */
function drawIcon(glyph: GlyphName, fill: string, surface: string): ImageData | null {
  const s = ICON_SIZE;
  const ctx = newCanvas(s, s);
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 0.75, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = surface;
  ctx.stroke();
  drawGlyph(ctx, glyph, s / 2, s / 2, 13, surface);
  return readImage(ctx);
}

function drawDot(fill: string, surface: string): ImageData | null {
  // Khung rộng hơn chấm 1px mỗi bên cho viền
  const s = DOT_SIZE + 2;
  const ctx = newCanvas(s, s);
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, DOT_SIZE / 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = surface;
  ctx.stroke();
  return readImage(ctx);
}

/** Ghim giọt nước: đầu tròn + mũi nhọn ở đáy (icon-anchor bottom). */
function drawPin(glyph: GlyphName, fill: string, surface: string): ImageData | null {
  const w = PIN_W;
  const h = PIN_H;
  const ctx = newCanvas(w, h);
  if (!ctx) return null;
  const r = w / 2 - 1.5;
  const cx = w / 2;
  const cy = r + 1.5;
  ctx.beginPath();
  // Cung tròn phía trên rồi hai cạnh chụm về mũi ở đáy
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2);
  ctx.lineTo(cx, h - 1.5);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = surface;
  ctx.stroke();
  drawGlyph(ctx, glyph, cx, cy, 16, surface);
  return readImage(ctx);
}

function putImage(map: MapLibreMap, id: string, data: ImageData | null) {
  if (!data) return;
  if (map.hasImage(id)) map.updateImage(id, data);
  else map.addImage(id, data, { pixelRatio: PIXEL_RATIO });
}

/** Thêm/cập nhật mọi ảnh của lớp quán theo màu hiện tại. Trả về false khi không có canvas (jsdom). */
export function registerPoiImages(map: MapLibreMap, colors: PoiIconColors): boolean {
  if (!newCanvas(1, 1)) return false;
  const entries: [string, GlyphName, PlaceCategory][] = [
    ...KINDS.map((k) => [k, KIND_GLYPH[k], KIND_CATEGORY[k]] as [string, GlyphName, PlaceCategory]),
    ...CATEGORIES.map((c) => [`c-${c}`, CATEGORY_GLYPH[c], c] as [string, GlyphName, PlaceCategory]),
  ];
  for (const [key, glyph, cat] of entries) {
    const fill = colors.category[cat];
    putImage(map, poiIconImage(key), drawIcon(glyph, fill, colors.surface));
    putImage(map, poiPinImage(key), drawPin(glyph, fill, colors.surface));
  }
  for (const c of CATEGORIES) putImage(map, poiDotImage(c), drawDot(colors.category[c], colors.surface));
  return true;
}
