// Số đo của phần 6 (T-129). Nguồn duy nhất: docs/proposal/mvp/script-thuyet-trinh-v2.md §1.1 (không bịa, không làm tròn lại).
// Thuần (không React/DOM) để test được.

export type AlgoKey = 'greedy' | 'weighted' | 'life' | 'sum' | 'random' | 'us';

export interface BarDatum {
  algo: AlgoKey;
  /** Phần trăm đúng như bảng §1.1. */
  value: number;
  us?: boolean;
}

/** Cả hai biểu đồ dùng chung thang 0–50% để thanh so được với nhau (PLAN §4.1 dòng 6). */
export const SCALE_MAX = 50;

/** Biểu đồ 1: tổng km dư so với đường ngắn nhất, trung bình 20 bộ. */
export const CHART_SUM: readonly BarDatum[] = [
  { algo: 'greedy', value: 44.7 },
  { algo: 'weighted', value: 20.1 },
  { algo: 'life', value: 13.9 },
  { algo: 'us', value: 1.13, us: true },
];

/** Biểu đồ 2: người xa nhất thiệt nhiều nhất, tệ nhất trong 20 bộ. */
export const CHART_FAR: readonly BarDatum[] = [
  { algo: 'sum', value: 35.7 },
  { algo: 'us', value: 9.37, us: true },
];

/** Hai số lớn chạy từ 0. `sign` chỉ có ở số đầu ("+1,13%"). */
export const BIG_NUMBERS = [
  { value: 1.13, decimals: 2, sign: '+' },
  { value: 9.37, decimals: 2, sign: '' },
] as const;

/** Thứ tự dòng của bảng đầy đủ + ba cột Có/Một phần/Không (§1.1). */
export type Mark = 'yes' | 'part' | 'no';
export const TABLE_ROWS: readonly { algo: AlgoKey; marks: [Mark, Mark, Mark] }[] = [
  { algo: 'random', marks: ['no', 'no', 'no'] },
  { algo: 'greedy', marks: ['yes', 'no', 'part'] },
  { algo: 'weighted', marks: ['yes', 'no', 'part'] },
  { algo: 'life', marks: ['yes', 'part', 'part'] },
  { algo: 'sum', marks: ['yes', 'yes', 'no'] },
  { algo: 'us', marks: ['yes', 'yes', 'yes'] },
];

export const COUNT_MS = 1000;
export const STAGGER_MS = 90;
/** Nhãn số nằm trong thanh khi thanh dài hơn ngưỡng này (mock v3: > 55% bề ngang). */
export const INSIDE_PCT = 55;

export function barWidthPct(value: number): number {
  return (value / SCALE_MAX) * 100;
}

export function labelInside(value: number): boolean {
  return barWidthPct(value) > INSIDE_PCT;
}

/** easeOutCubic cho số chạy lên; p ngoài [0,1] bị kẹp. */
export function countValue(target: number, p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return target * (1 - Math.pow(1 - q, 3));
}

/** Định dạng theo ngôn ngữ: vi dùng dấu phẩy thập phân, en dùng dấu chấm. */
export function formatNumber(v: number, decimals: number, lang: string): string {
  const s = v.toFixed(decimals);
  return lang.startsWith('vi') ? s.replace('.', ',') : s;
}

/** Số chữ số thập phân của một số đo: lấy đúng như nguồn (44,7 · 1,13 · 9,37), không làm tròn lại. */
export function decimalsOf(v: number): number {
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}
