// Phác thảo tuyến cho thẻ chuyến đi (DESIGN gđ6 §5): chiếu toạ độ thành polyline SVG trong một khung, không tile bản đồ.
// Hàm thuần, không đụng DOM.

export interface SketchInput {
  lat?: number | null;
  lng?: number | null;
}

export interface SketchNode {
  /** Chỉ số của điểm trong danh sách đầu vào (để đánh số khớp danh sách điểm trên thẻ). */
  index: number;
  x: number;
  y: number;
}

export interface RouteSketch {
  nodes: SketchNode[];
  /** Giá trị cho thuộc tính `points` của `<polyline>`. */
  points: string;
  width: number;
  height: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

function valid(p: SketchInput): p is { lat: number; lng: number } {
  return (
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

/**
 * Chiếu các điểm có toạ độ vào khung `width × height` (chừa lề `pad`), giữ nguyên tỉ lệ (kinh độ co theo cos vĩ độ),
 * bắc ở trên. Dưới 2 điểm có toạ độ → `null` (thẻ bỏ phần phác thảo). Các điểm trùng toạ độ thì nằm giữa khung.
 * Điểm thiếu toạ độ bị bỏ qua nhưng các điểm còn lại giữ `index` gốc.
 */
export function routeSketch(
  stops: readonly SketchInput[],
  width: number,
  height: number,
  pad = 12,
): RouteSketch | null {
  const found = stops.map((s, index) => ({ s, index })).filter(({ s }) => valid(s));
  if (found.length < 2) return null;

  const meanLat = found.reduce((sum, { s }) => sum + (s.lat as number), 0) / found.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const pts = found.map(({ s, index }) => ({ index, px: (s.lng as number) * k, py: -(s.lat as number) }));

  const xs = pts.map((p) => p.px);
  const ys = pts.map((p) => p.py);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;

  const innerW = Math.max(1, width - pad * 2);
  const innerH = Math.max(1, height - pad * 2);
  // Hai điểm trùng nhau (cả hai span = 0): không co giãn, đặt giữa khung
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const offX = pad + (innerW - spanX * scale) / 2;
  const offY = pad + (innerH - spanY * scale) / 2;

  const nodes = pts.map((p) => ({
    index: p.index,
    x: round(offX + (p.px - minX) * scale),
    y: round(offY + (p.py - minY) * scale),
  }));
  return { nodes, points: nodes.map((n) => `${n.x},${n.y}`).join(' '), width, height };
}
