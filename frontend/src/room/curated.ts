import type { Place } from '../types';

/** Bộ dữ liệu quán tuyển chọn (DESIGN gđ5 §6 tầng 1). Schema + quy trình: `src/curated/README.md`. */
export const COLLECTION_CODES = ['view', 'latenight', 'date', 'cheap', 'local', 'chill'] as const;
export type CollectionCode = (typeof COLLECTION_CODES)[number];

export type PhotoKind = 'cover' | 'dish' | 'view';

export interface CuratedPhoto {
  file: string;
  kind: PhotoKind;
  source: string;
}

export interface CuratedEntry {
  id: string;
  wave: 1 | 2;
  external_id?: string | null;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: Place['category'];
  price_per_person: number;
  collections: CollectionCode[];
  intro: { vi: string; en: string };
  try: { vi: string[]; en: string[] };
  photos: CuratedPhoto[];
  hours_note?: { vi: string; en: string };
}

export interface CuratedPhotoUrls {
  kind: PhotoKind;
  src: string;
  thumb: string;
}

export interface CuratedData {
  places: CuratedEntry[];
  /** Tên file ảnh đã xử lý (do `scripts/curated_images.py` sinh); trình duyệt không liệt kê được thư mục. */
  files: ReadonlySet<string>;
}

/** Ngưỡng khớp theo tên + toạ độ. */
export const MATCH_RADIUS_M = 50;

let cache: CuratedData | null = null;
let loading: Promise<CuratedData> | null = null;

/** Nạp bằng import động → JSON thành chunk riêng, không nằm trong entry bundle. */
export function loadCurated(): Promise<CuratedData> {
  if (cache) return Promise.resolve(cache);
  loading ??= Promise.all([import('../curated/hcm.json'), import('../curated/photos.json')]).then(
    ([hcm, photos]) => {
      cache = {
        places: (hcm.default as unknown as { places: CuratedEntry[] }).places,
        files: new Set((photos.default as { files: string[] }).files),
      };
      return cache;
    },
  );
  return loading;
}

/** Dữ liệu đã nạp, hoặc `null` nếu `loadCurated()` chưa xong. */
export function curatedLoaded(): CuratedData | null {
  return cache;
}

export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0111/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type MatchInput = Pick<Place, 'name'> &
  Partial<Pick<Place, 'external_id' | 'latitude' | 'longitude'>>;

/** Khớp `external_id` trước; không có thì tên chuẩn hoá (bỏ dấu, chữ thường) + toạ độ ≤ 50 m. */
export function findCurated(place: MatchInput, data: CuratedData | null = cache): CuratedEntry | null {
  if (!data) return null;
  if (place.external_id) {
    const byId = data.places.find((e) => e.external_id === place.external_id);
    if (byId) return byId;
  }
  if (place.latitude == null || place.longitude == null) return null;
  const name = normalizeName(place.name);
  if (!name) return null;
  for (const e of data.places) {
    if (normalizeName(e.name) !== name) continue;
    if (distanceM(place.latitude, place.longitude, e.lat, e.lng) <= MATCH_RADIUS_M) return e;
  }
  return null;
}

export function curatedByCollection(
  code: CollectionCode,
  data: CuratedData | null = cache,
): CuratedEntry[] {
  return data ? data.places.filter((e) => e.collections.includes(code)) : [];
}

export function thumbFile(file: string): string {
  return file.replace(/\.webp$/, '.thumb.webp');
}

/** Chỉ trả ảnh có trong manifest (file thật tồn tại); thiếu thì bỏ, tầng dưới lo. */
export function curatedPhotos(entry: CuratedEntry, data: CuratedData | null = cache): CuratedPhotoUrls[] {
  if (!data) return [];
  return entry.photos
    .filter((p) => data.files.has(p.file))
    .map((p) => ({ kind: p.kind, src: `/curated/${p.file}`, thumb: `/curated/${thumbFile(p.file)}` }));
}
