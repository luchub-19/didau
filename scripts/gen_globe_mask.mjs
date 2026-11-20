// Sinh bitmask đất liền 1° (360×180 bit) cho quả cầu hero (T-110, docs/phase9/PLAN.md §4.3).
// Nguồn: world-atlas@2.0.2 land-110m.json (devDependency của frontend; dữ liệu Natural Earth, public domain; gói ISC).
// Chạy tay từ gốc repo, rồi commit file sinh ra:
//   node scripts/gen_globe_mask.mjs            → ghi frontend/src/stage/hero/globe/mask.ts
//   node scripts/gen_globe_mask.mjs ascii      → in thêm bản đồ ASCII ra stderr để soát
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'frontend/node_modules/world-atlas/land-110m.json');
const OUT = resolve(root, 'frontend/src/stage/hero/globe/mask.ts');

const topo = JSON.parse(readFileSync(SRC, 'utf8'));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;
// Giải mã arc TopoJSON (toạ độ lượng tử hoá + delta) ra [kinh độ, vĩ độ].
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * sx + tx, y * sy + ty];
  });
});
const ringPts = (idxs) => {
  const out = [];
  for (const i of idxs) {
    const a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    out.push(...(out.length ? a.slice(1) : a));
  }
  return out;
};
// Vòng nào vắt qua kinh tuyến 180° (Nga, Fiji, Nam Cực) có cạnh nhảy ±360°: duỗi ra thành toạ độ liên tục, rồi xét
// chẵn-lẻ riêng từng vòng ở lon, lon ± 360. Vòng không khép sau khi duỗi (Nam Cực, ôm cực) thì khép bằng hai điểm ở −90°.
const unwrap = (pts) => {
  const out = [pts[0].slice()];
  let shift = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k][0] - pts[k - 1][0];
    if (dx > 180) shift -= 360;
    else if (dx < -180) shift += 360;
    out.push([pts[k][0] + shift, pts[k][1]]);
  }
  const a = out[0];
  const b = out[out.length - 1];
  if (Math.abs(b[0] - a[0]) > 180) out.push([b[0], -90], [a[0], -90], a.slice());
  return out;
};
const rings = [];
for (const g of topo.objects.land.geometries) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
  for (const p of polys) for (const r of p) rings.push(unwrap(ringPts(r)));
}

// Với đường vĩ tuyến `lat`: danh sách giao điểm (đã sắp) của từng vòng cắt nó.
const crossings = (lat) => {
  const per = [];
  for (const r of rings) {
    const xs = [];
    for (let k = 0; k < r.length - 1; k++) {
      const [x1, y1] = r[k];
      const [x2, y2] = r[k + 1];
      if (y1 > lat !== y2 > lat) xs.push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
    }
    if (xs.length) per.push(xs);
  }
  return per;
};
const oddLeft = (xs, x) => {
  let n = 0;
  for (const v of xs) if (v < x) n++;
  return n % 2 === 1;
};
// Chẵn-lẻ tổng (XOR các vòng) để hồ/lỗ trong lục địa vẫn là biển.
const inside = (per, lon) => {
  let odd = false;
  for (const xs of per) if (oddLeft(xs, lon) || oddLeft(xs, lon + 360) || oddLeft(xs, lon - 360)) odd = !odd;
  return odd;
};

// Ô 1° là đất nếu ≥ 3/9 điểm mẫu (lưới 3×3 trong ô) nằm trong đất: giữ được dải hẹp như Việt Nam, Ý, Nhật.
const W = 360;
const H = 180;
const SUB = [1 / 6, 3 / 6, 5 / 6];
const bits = new Uint8Array((W * H) / 8);
let land = 0;
for (let row = 0; row < H; row++) {
  const subRows = SUB.map((f) => crossings(90 - (row + f)));
  for (let col = 0; col < W; col++) {
    let hits = 0;
    for (const xs of subRows) for (const f of SUB) if (inside(xs, -180 + col + f)) hits++;
    // Bờ Nam Cực ở world-atlas dừng ở −85,6°: phần dưới coi là đất.
    if (hits >= 3 || 90 - (row + 0.5) < -85.5) {
      const i = row * W + col;
      bits[i >> 3] |= 1 << (i & 7);
      land++;
    }
  }
}

// Mã hoá RLE (gzip ~1,5 kB, base64 thô ~2,1 kB): các độ dài chuỗi xen kẽ biển/đất theo thứ tự bit, bắt đầu bằng biển.
// Mỗi độ dài viết theo cơ số 32, chữ số cao trước; chữ số không phải cuối dùng ABC[32 + d], chữ số cuối ABC[d].
// ABC phải trùng MASK_ABC trong frontend/src/stage/hero/globe/projection.ts.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const bitAt = (i) => (bits[i >> 3] >> (i & 7)) & 1;
const runs = [];
let cur = 0;
let len = 0;
for (let i = 0; i < W * H; i++) {
  if (bitAt(i) === cur) len++;
  else {
    runs.push(len);
    cur ^= 1;
    len = 1;
  }
}
runs.push(len);
let rle = '';
for (let r of runs) {
  const d = [];
  do {
    d.push(r & 31);
    r >>= 5;
  } while (r);
  for (let k = d.length - 1; k > 0; k--) rle += ABC[32 + d[k]];
  rle += ABC[d[0]];
}

const body = `// FILE SINH TỰ ĐỘNG bởi scripts/gen_globe_mask.mjs — đừng sửa tay, chạy lại script.
// Bitmask đất liền 1° (360×180): ô (hàng, cột), hàng 0 = 90°N…89°N, cột 0 = 180°W…179°W, chỉ số = hàng * 360 + cột.
// Mã RLE (biển/đất xen kẽ, bắt đầu bằng biển): giải bằng decodeMask() ở projection.ts.
// Nguồn: world-atlas@2.0.2 land-110m.json — dữ liệu Natural Earth (public domain); gói world-atlas ISC © 2013-2019 Michael Bostock.
export const GLOBE_MASK_W = ${W};
export const GLOBE_MASK_H = ${H};
export const GLOBE_MASK_RLE =
  '${rle}';
`;
writeFileSync(OUT, body);
process.stderr.write(
  `land cells ${land}/${W * H}; runs ${runs.length}; mask.ts ${body.length} B, gzip ${gzipSync(body).length} B (dữ liệu ${gzipSync(rle).length} B)\n`,
);

if (process.argv[2] === 'ascii') {
  for (let row = 0; row < H; row += 4) {
    let s = '';
    for (let col = 0; col < W; col += 2) {
      const i = row * W + col;
      s += bits[i >> 3] & (1 << (i & 7)) ? '#' : '.';
    }
    process.stderr.write(s + '\n');
  }
}
