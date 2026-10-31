// Logic thuần của avatar nhân vật (DESIGN gđ5 §4): đọc style + seed từ URL dạng DiceBear mà KHÔNG tải URL đó.
// Tách khỏi component để lint fast-refresh không phàn nàn và test không cần render.
import { createAvatar } from '@dicebear/core';
import * as thumbs from '@dicebear/thumbs';

/** Style duy nhất đóng gói (CC0, nhẹ). URL mang style khác (vd. `bottts` của dữ liệu cũ) vẫn dùng seed của nó. */
export const AVATAR_STYLE = 'thumbs';
const URL_PREFIX = 'https://api.dicebear.com/9.x';
const URL_RE = /^https:\/\/api\.dicebear\.com\/[\w.]+\/([\w-]+)\/svg\?(.*)$/;

export interface ParsedAvatar {
  style: string;
  seed: string;
}

/** Lấy `style` + `seed` từ URL; rỗng/lạ → `null` (nơi gọi dùng seed dự phòng). Không bao giờ fetch. */
export function parseAvatarUrl(url: string | null | undefined): ParsedAvatar | null {
  if (!url) return null;
  const m = URL_RE.exec(url.trim());
  if (!m) return null;
  const seed = new URLSearchParams(m[2]).get('seed');
  if (!seed) return null;
  return { style: m[1], seed };
}

/** Giá trị lưu vào `avatar_url` khi tạo/vào phòng. */
export function avatarUrlFor(seed: string): string {
  return `${URL_PREFIX}/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

/** Seed ngẫu nhiên cho nút "Đổi nhân vật". */
export function randomSeed(): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else {
    bytes[0] = Math.floor(Math.random() * 2 ** 32);
    bytes[1] = Math.floor(Math.random() * 2 ** 32);
  }
  return Array.from(bytes, (n) => n.toString(36)).join('');
}

/** Seed dùng để vẽ: lấy từ `avatarUrl`, thiếu/lạ thì `fallbackSeed` (thường `member.id`). */
export function resolveAvatarSeed(avatarUrl: string | null | undefined, fallbackSeed: string): string {
  return parseAvatarUrl(avatarUrl)?.seed ?? fallbackSeed;
}

const cache = new Map<string, string>();

/** SVG (data URI) của nhân vật; cùng seed luôn ra cùng chuỗi. Có cache vì danh sách vẽ lại rất nhiều lần. */
export function characterDataUri(seed: string): string {
  const hit = cache.get(seed);
  if (hit) return hit;
  const uri = createAvatar(thumbs, { seed }).toDataUri();
  if (cache.size > 200) cache.clear();
  cache.set(seed, uri);
  return uri;
}
