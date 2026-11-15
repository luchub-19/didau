import type { Poi } from '../../types';

// Hàm thuần cho ô tìm quán (MapSearchBox, T-100): so không dấu, in đậm phần khớp, rút gọn địa chỉ, ↑/↓

/** Bỏ dấu từng ký tự (giữ nguyên độ dài để map vị trí về tên gốc); đ → d. */
function foldChar(ch: string): string {
  const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return (base[0] ?? ch).replace(/\u0111|\u0110/g, 'd').toLowerCase();
}

export function foldText(text: string): string {
  return Array.from(text, foldChar).join('');
}

/** Các đoạn [start, end) của `name` khớp (không dấu) với từng từ của `query`, đã gộp đoạn chồng nhau. */
export function matchRanges(name: string, query: string): Array<[number, number]> {
  const chars = Array.from(name);
  const folded = chars.map(foldChar).join('');
  const ranges: Array<[number, number]> = [];
  for (const token of foldText(query).split(/\s+/).filter(Boolean)) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      ranges.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

// Phần cuối địa chỉ chỉ là tên thành phố/quốc gia (so không dấu) → bỏ khi rút gọn
const CITY_PART = /^(tp\.? ?hcm|tp\.? ?ho chi minh|thanh pho ho chi minh|ho chi minh( city)?|ha noi|hanoi|thanh pho ha noi|viet ?nam)$/;

/** Dòng phụ kiểu Google Maps (MAP-POI §5): "số + đường, quận"; không có địa chỉ thì lấy `district`. */
export function shortAddress(poi: Pick<Poi, 'address' | 'district'>): string | null {
  const parts = (poi.address ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !CITY_PART.test(foldText(part)));
  if (parts.length === 0) return poi.district ?? null;
  const street = parts[0];
  const area = parts.length > 1 ? parts[parts.length - 1] : poi.district;
  if (!area || foldText(street).includes(foldText(area))) return street;
  return `${street}, ${area}`;
}

/** Ô chọn kế tiếp khi bấm ↑/↓ (vòng tròn; -1 = chưa chọn). */
export function nextIndex(current: number, delta: 1 | -1, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}
