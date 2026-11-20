// Hàm thuần cho quả cầu chấm bi (T-110, docs/phase9/PLAN.md §4.3): giải bitmask, rải chấm đất, chiếu trực giao.
import { GLOBE_MASK_H, GLOBE_MASK_RLE, GLOBE_MASK_W } from './mask';

export const D2R = Math.PI / 180;
/** TP.HCM (Q1), dùng cho chấm nhấn và (T-113) điểm dừng của cầu. */
export const GLOBE_HCM = { lat: 10.78, lon: 106.7 } as const;

/** Phải trùng ABC trong scripts/gen_globe_mask.mjs. */
const MASK_ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Giải RLE ra 1 byte/ô (0 biển, 1 đất), thứ tự hàng 0 = 90°N, cột 0 = 180°W. */
export function decodeMask(rle: string, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  let pos = 0;
  let bit = 0;
  let acc = 0;
  for (let k = 0; k < rle.length; k++) {
    const v = MASK_ABC.indexOf(rle[k]);
    if (v >= 32) {
      acc = acc * 32 + (v - 32);
      continue;
    }
    const len = acc * 32 + v;
    acc = 0;
    if (bit) out.fill(1, pos, Math.min(out.length, pos + len));
    pos += len;
    bit ^= 1;
  }
  return out;
}

let mask: Uint8Array | null = null;
const getMask = () => (mask ??= decodeMask(GLOBE_MASK_RLE, GLOBE_MASK_W, GLOBE_MASK_H));

/** Điểm (độ) có phải đất không, theo ô 1°. Kinh độ tự quấn, vĩ độ kẹp vào [−90, 90]. */
export function isLand(lat: number, lon: number): boolean {
  let col = Math.floor(lon + 180) % GLOBE_MASK_W;
  if (col < 0) col += GLOBE_MASK_W;
  const row = Math.min(GLOBE_MASK_H - 1, Math.max(0, Math.floor(90 - lat)));
  return getMask()[row * GLOBE_MASK_W + col] === 1;
}

/**
 * Chấm đất dạng struct-of-arrays (vẽ mỗi khung, khỏi tạo object): sin/cos vĩ độ, kinh độ (rad),
 * `hash` ∈ [0, 1) tất định theo toạ độ (T-111 chọn đèn thành phố).
 */
export interface GlobeDots {
  count: number;
  sinLat: Float32Array;
  cosLat: Float32Array;
  lon: Float32Array;
  hash: Float32Array;
  /** Bước lấy mẫu (độ) đã dùng. */
  stepDeg: number;
}

/** Bước lấy mẫu sao cho hai chấm cạnh nhau ở tâm cầu cách ~3,1 px; kẹp [1°, 4°] (mask chỉ có 1°). */
export function dotStepDeg(radiusPx: number): number {
  return Math.max(1, Math.min(4, 3.1 / (Math.max(1, radiusPx) * D2R)));
}

const MAX_LAT = 84; // bỏ vùng cực: chấm dồn cục ở đỉnh

/** Rải chấm đều theo diện tích (số chấm mỗi vĩ tuyến ∝ cos vĩ độ), giữ chấm rơi vào đất. */
export function buildDots(radiusPx: number): GlobeDots {
  const step = dotStepDeg(radiusPx);
  const sl: number[] = [];
  const cl: number[] = [];
  const ln: number[] = [];
  const hs: number[] = [];
  for (let lat = -MAX_LAT + step / 2; lat < MAX_LAT; lat += step) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * D2R)) / step));
    for (let i = 0; i < n; i++) {
      const lon = -180 + ((i + 0.5) * 360) / n;
      if (!isLand(lat, lon)) continue;
      const h = Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453;
      sl.push(Math.sin(lat * D2R));
      cl.push(Math.cos(lat * D2R));
      ln.push(lon * D2R);
      hs.push(h - Math.floor(h));
    }
  }
  return {
    count: sl.length,
    sinLat: Float32Array.from(sl),
    cosLat: Float32Array.from(cl),
    lon: Float32Array.from(ln),
    hash: Float32Array.from(hs),
    stepDeg: step,
  };
}

/** Toạ độ chiếu trên đĩa đơn vị: x sang phải, y lên trên, z = cos góc tới tâm nhìn (z ≤ 0 là mặt sau). */
export interface Projected {
  x: number;
  y: number;
  z: number;
}

/** Hướng nhìn đã tính sẵn sin/cos (một lần mỗi khung). */
export interface View {
  lon0: number;
  sinLat0: number;
  cosLat0: number;
}

export function viewOf(lon0Deg: number, lat0Deg: number): View {
  return { lon0: lon0Deg * D2R, sinLat0: Math.sin(lat0Deg * D2R), cosLat0: Math.cos(lat0Deg * D2R) };
}

/** Chiếu trực giao một điểm (sin/cos vĩ độ, kinh độ rad) vào `out`; dùng trong vòng vẽ để khỏi cấp phát. */
export function projectInto(out: Projected, sinLat: number, cosLat: number, lonRad: number, v: View): Projected {
  const dl = lonRad - v.lon0;
  const cdl = Math.cos(dl);
  out.x = cosLat * Math.sin(dl);
  out.y = v.cosLat0 * sinLat - v.sinLat0 * cosLat * cdl;
  out.z = v.sinLat0 * sinLat + v.cosLat0 * cosLat * cdl;
  return out;
}

/** Chiếu một điểm (độ) khi tâm nhìn ở (lat0, lon0) (độ). */
export function project(point: { lat: number; lon: number }, lon0Deg: number, lat0Deg: number): Projected {
  return projectInto(
    { x: 0, y: 0, z: 0 },
    Math.sin(point.lat * D2R),
    Math.cos(point.lat * D2R),
    point.lon * D2R,
    viewOf(lon0Deg, lat0Deg),
  );
}
