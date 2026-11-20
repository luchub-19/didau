// Bảng màu + ánh sáng của quả cầu (T-111, docs/phase9/PLAN.md §4.3). Hàm thuần, không đụng DOM/canvas ⇒ test được.
// Màu lấy từ token `--stage-*` (đổi theme là đổi bảng); riêng màu biển và rìa tối là hằng theo từng theme vì chỉ để tạo khối
// (không mang chữ, không cần đo tương phản).

export type RGB = readonly [number, number, number];

/** Token Stage mà bảng màu cầu đọc; cả hai theme phải khai báo đủ trong `styles/tokens.css`. */
export const GLOBE_TOKENS = [
  '--stage-paper',
  '--stage-ink',
  '--stage-ink-2',
  '--stage-accent-text',
  '--stage-sun',
  '--stage-sky',
  '--stage-leaf',
  '--stage-brick',
] as const;

export interface GlobePalette {
  dark: boolean;
  /** Biển: phía hứng nắng → phía tối (gradient tâm lệch về phía nắng). */
  seaLit: RGB;
  seaDark: RGB;
  /** Đất: phía tối → phía hứng nắng (trộn theo lambert, lượng tử hoá thành `GLOBE_LEVELS` mức). */
  land: RGB;
  landLit: RGB;
  /** Màu đèn thành phố ở phía đêm; null ở theme sáng (ban ngày không có đèn). */
  night: RGB | null;
  /** Quầng khí quyển + viền. */
  atmo: RGB;
  /** Rìa tối và độ đậm ở mép. */
  rim: RGB;
  rimAlpha: number;
  /** Vệt phản chiếu. */
  spec: RGB;
  /** Chấm TP.HCM / ghim. */
  accent: RGB;
  /** Lõi ghim + viền chấm bạn bè. */
  paper: RGB;
  /** 4 chấm bạn bè (T-113): sky, leaf, sun, brick — hình minh hoạ, không mang dữ liệu. */
  friends: readonly [RGB, RGB, RGB, RGB];
}

/** Giá trị token khi `getPropertyValue` trả rỗng (khớp tokens.css; chỉ để cầu không vỡ nếu thiếu token). */
const FALLBACK: Record<'light' | 'dark', Record<(typeof GLOBE_TOKENS)[number], string>> = {
  light: {
    '--stage-paper': '251 243 228',
    '--stage-ink': '43 27 18',
    '--stage-ink-2': '107 74 54',
    '--stage-accent-text': '184 58 34',
    '--stage-sun': '233 164 0',
    '--stage-sky': '31 111 168',
    '--stage-leaf': '59 122 58',
    '--stage-brick': '168 72 42',
  },
  dark: {
    '--stage-paper': '26 20 32',
    '--stage-ink': '251 239 224',
    '--stage-ink-2': '205 182 164',
    '--stage-accent-text': '255 143 112',
    '--stage-sun': '255 201 77',
    '--stage-sky': '134 189 232',
    '--stage-leaf': '147 197 139',
    '--stage-brick': '232 145 107',
  },
};

/** "233 164 0" → [233, 164, 0]; sai định dạng thì trả null. */
export function parseRgbToken(raw: string): RGB | null {
  const m = raw.trim().match(/^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/);
  if (!m) return null;
  const c: RGB = [Number(m[1]), Number(m[2]), Number(m[3])];
  return c.every((v) => v <= 255) ? c : null;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}

export const rgbCss = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;
export const rgbaCss = (c: RGB, a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Đang ở theme tối? `data-theme` thắng; không có thì theo `prefers-color-scheme` (khớp luật tokens.css). */
export function isDarkStage(root: HTMLElement = document.documentElement): boolean {
  const t = root.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** Dựng bảng màu từ hàm đọc token (`read('--stage-sun')` → "255 201 77"). */
export function readGlobePalette(read: (token: string) => string, dark: boolean): GlobePalette {
  const fb = FALLBACK[dark ? 'dark' : 'light'];
  const tok = (name: (typeof GLOBE_TOKENS)[number]): RGB => parseRgbToken(read(name)) ?? (parseRgbToken(fb[name]) as RGB);
  const paper = tok('--stage-paper');
  const ink = tok('--stage-ink');
  const ink2 = tok('--stage-ink-2');
  const sun = tok('--stage-sun');
  const sky = tok('--stage-sky');
  const accent = tok('--stage-accent-text');
  const friends = [sky, tok('--stage-leaf'), sun, tok('--stage-brick')] as const;
  if (dark) {
    return {
      dark,
      seaLit: [58, 49, 82],
      seaDark: [18, 13, 24],
      land: mixRgb(ink2, paper, 0.5),
      landLit: mixRgb(ink2, ink, 0.5),
      night: sun,
      atmo: sky,
      rim: [0, 0, 0],
      rimAlpha: 0.55,
      spec: ink,
      accent,
      paper,
      friends,
    };
  }
  return {
    dark,
    seaLit: [231, 239, 239],
    seaDark: [180, 202, 214],
    land: ink2,
    landLit: mixRgb(ink2, sun, 0.35),
    night: null,
    atmo: sky,
    rim: ink,
    rimAlpha: 0.32,
    spec: [255, 255, 255],
    accent,
    paper,
    friends,
  };
}

/** Hướng nắng cố định trong hệ nhìn (x phải, y lên, z về phía người xem): phía trên-trái, đã chuẩn hoá. */
export const GLOBE_LIGHT: RGB = (() => {
  const [x, y, z] = [-0.55, 0.5, 0.67];
  const m = Math.hypot(x, y, z);
  return [x / m, y / m, z / m];
})();

/** Lambert ∈ [−1, 1] của điểm đã chiếu (x, y, z) với hướng nắng cố định. */
export const lambert = (x: number, y: number, z: number): number => x * GLOBE_LIGHT[0] + y * GLOBE_LIGHT[1] + z * GLOBE_LIGHT[2];

/** Số mức sáng của chấm đất: mỗi mức một path ⇒ gom lệnh vẽ (≤ 6, PLAN T-111). */
export const GLOBE_LEVELS = 6;

/** Lượng tử hoá lambert thành mức 0 … levels−1 (0 tối nhất). Cùng công thức trộn màu của mock: 0,15 + 0,95·lam. */
export function shadeLevel(lam: number, levels: number = GLOBE_LEVELS): number {
  const t = Math.max(0, Math.min(1, 0.15 + lam * 0.95));
  return Math.min(levels - 1, Math.floor(t * levels));
}

/** Màu (css) của từng mức: trung điểm khoảng của mức đó. */
export function levelColors(pal: GlobePalette, levels: number = GLOBE_LEVELS): string[] {
  return Array.from({ length: levels }, (_, k) => rgbCss(mixRgb(pal.land, pal.landLit, (k + 0.5) / levels)));
}

/** Tỉ lệ chấm đất làm đèn thành phố (theo hash tất định), chỉ ở phía đêm của theme tối. */
export const CITY_FRACTION = 0.18;
/** Ngưỡng lambert coi là "phía đêm". */
export const NIGHT_LAMBERT = -0.05;

/** Chấm (hash ∈ [0,1), lambert) có sáng đèn thành phố không. */
export function isCityLight(pal: GlobePalette, hash: number, lam: number): boolean {
  return pal.night !== null && lam < NIGHT_LAMBERT && hash < CITY_FRACTION;
}
