// Sinh bitmask đất liền 0,5° (720×360) từ world-atlas land-110m (Natural Earth, public domain).
// Dùng: node gen-mask.js <land-110m.json> > mask.b64
const fs = require('fs');
const topo = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
const arcs = topo.arcs.map((arc) => {
  let x = 0, y = 0;
  return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty]; });
});
const ringPts = (idxs) => {
  const out = [];
  for (const i of idxs) {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    out.push(...(out.length ? a.slice(1) : a));
  }
  return out;
};
const rings = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const p of polys) for (const r of p) rings.push(ringPts(r));
}
const W = 720, H = 360, STEP = 0.5;
const bits = new Uint8Array((W * H) / 8);
let land = 0;
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5) * STEP;
  const xs = [];
  for (const r of rings) {
    for (let k = 0; k < r.length - 1; k++) {
      const [x1, y1] = r[k], [x2, y2] = r[k + 1];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.sort((a, b) => a - b);
  for (let col = 0; col < W; col++) {
    const lon = -180 + (col + 0.5) * STEP;
    let n = 0;
    for (const x of xs) if (x < lon) n++;
    if (n % 2) { const i = row * W + col; bits[i >> 3] |= 1 << (i & 7); land++; }
  }
}
// Bờ Nam Cực ở world-atlas dừng ở −85,6°: phần dưới coi là đất.
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5) * STEP;
  if (lat < -85.5) for (let col = 0; col < W; col++) { const i = row * W + col; bits[i >> 3] |= 1 << (i & 7); }
}
process.stderr.write(`land cells ${land}/${W * H}\n`);
if (process.argv[3] === 'ascii') {
  for (let row = 0; row < H; row += 8) {
    let s = '';
    for (let col = 0; col < W; col += 4) { const i = row * W + col; s += bits[i >> 3] & (1 << (i & 7)) ? '#' : '.'; }
    process.stderr.write(s + '\n');
  }
}
process.stdout.write(Buffer.from(bits).toString('base64'));
