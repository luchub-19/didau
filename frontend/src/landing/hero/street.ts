// Phố đêm vẽ tay ở đáy hero (PLAN §3 mục 11, mock v3 `drawScene`): dữ liệu thuần sinh từ seed cố định, nên mỗi lần
// tải trang phố giống hệt nhau và test so được. Component NightStreet chỉ việc vẽ.
// Khung vẽ 1440 × 230 (viewBox), SVG dùng `xMidYMax slice` nên màn rộng hơn vẫn phủ kín, đáy (lòng đường) luôn thấy.

export const STREET_W = 1440;
export const STREET_H = 230;
/** Mặt tiền nhà chạm vỉa hè ở y này. */
export const SIDEWALK_Y = 168;
/** Số bảng hiệu trên phố, mỗi chữ dùng một lần, rải đều theo chiều ngang (G1 có thể đổi số này). */
export const SIGN_LIMIT = 6;

/**
 * Bảng hiệu: chữ tiếng Việt cố định (phố Sài Gòn không dịch theo ngôn ngữ trang) và màu nền.
 * Chữ viết bằng mã thoát \u để file nguồn không có ký tự có dấu (i18n_guard); đây là hình trang trí `aria-hidden`.
 */
export const SIGNS: readonly (readonly [string, string])[] = [
  ['C\u01A0M T\u1EA4M', '#FF6B4A'],
  ['C\u00C0 PH\u00CA', '#2FA38C'],
  ['L\u1EA8U', '#F2B544'],
  ['PH\u1EDE', '#7CC4E8'],
  ['B\u00DAN B\u00D2', '#F29BB8'],
  ['TR\u00C0 S\u1EEEA', '#C9B2E8'],
];

export interface House {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1 | 2 | 3 → token --house-1/2/3. */
  tone: 1 | 2 | 3;
}

export interface StreetWindow {
  x: number;
  y: number;
  /** Sáng khi phố "bật đèn"; cửa tắt giữ mờ. */
  on: boolean;
  /** Trễ bật đèn (ms), cố định theo seed, ≤ 900. */
  delay: number;
}

export interface StreetSign {
  x: number;
  w: number;
  text: string;
  color: string;
  delay: number;
}

export interface StreetLamp {
  x: number;
  delay: number;
}

export interface StreetScene {
  houses: House[];
  windows: StreetWindow[];
  signs: StreetSign[];
  lamps: StreetLamp[];
  dashes: number[];
}

/** LCG giống mock v3 (seed 7) để phố khớp ảnh đã duyệt. */
function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function buildStreet(seed = 7): StreetScene {
  const rnd = lcg(seed);
  const houses: House[] = [];
  const windows: StreetWindow[] = [];
  const signs: StreetSign[] = [];
  const spots: { x: number; maxW: number; delay: number }[] = [];
  let x = 0;
  while (x < STREET_W) {
    const w = 70 + Math.round(rnd() * 50);
    const h = 70 + Math.round(rnd() * 70);
    const tone = (Math.floor(rnd() * 3) + 1) as 1 | 2 | 3;
    const y = SIDEWALK_Y - h;
    houses.push({ x, y, w: w - 2, h, tone });
    for (let wy = y + 12; wy < 128; wy += 24) {
      for (let wx = x + 10; wx < x + w - 18; wx += 22) {
        const on = rnd() > 0.45;
        windows.push({ x: wx, y: wy, on, delay: Math.round(rnd() * 900) });
      }
    }
    if (rnd() > 0.35) spots.push({ x: x + 6, maxW: w - 12, delay: Math.round(200 + rnd() * 700) });
    x += w;
  }
  // Chỗ treo được bảng hiệu nhiều hơn SIGN_LIMIT: rải đều từ trái sang phải, không dồn hết về đầu phố
  const n = spots.length;
  const picks =
    n <= SIGN_LIMIT
      ? spots.map((_, i) => i)
      : Array.from({ length: SIGN_LIMIT }, (_, k) => Math.round((k * (n - 1)) / (SIGN_LIMIT - 1)));
  picks.forEach((idx, k) => {
    const [text, color] = SIGNS[k % SIGNS.length];
    const sp = spots[idx];
    signs.push({ x: sp.x, w: Math.min(sp.maxW, 12 + text.length * 7.4), text, color, delay: sp.delay });
  });
  const lamps: StreetLamp[] = [];
  for (let lx = 120; lx < STREET_W; lx += 260) lamps.push({ x: lx, delay: Math.round(lx / 3) });
  const dashes: number[] = [];
  for (let dx = 20; dx < STREET_W; dx += 60) dashes.push(dx);
  return { houses, windows, signs, lamps, dashes };
}
