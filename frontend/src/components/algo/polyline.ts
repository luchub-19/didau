// Giải mã polyline mã hoá của Valhalla (CR-15 mục 37/38). Valhalla dùng độ chính xác 6 (1e-6 độ), KHÔNG phải 5
// như Google: giải bằng 1e5 sẽ ra toạ độ lệch ×10 (giữa biển). Trả [lng, lat] theo thứ tự GeoJSON/MapLibre.

export const POLYLINE_PRECISION = 6;

/** Chuỗi hỏng (cắt cụt giữa chừng) → bỏ điểm dở dang, trả những điểm đã giải được. */
export function decodePolyline(encoded: string, precision = POLYLINE_PRECISION): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/** Mã hoá ngược (dùng cho mock MSW và test). Đầu vào [lng, lat]. */
export function encodePolyline(coords: readonly [number, number][], precision = POLYLINE_PRECISION): string {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * factor);
    const ln = Math.round(lng * factor);
    enc(la - prevLat);
    enc(ln - prevLng);
    prevLat = la;
    prevLng = ln;
  }
  return out;
}
