import { vi } from './locales/vi';
import { en } from './locales/en';
import type { Language } from './useLanguage';

/**
 * Nhãn món/loại hình theo giá trị `cuisine` / `amenity` của OSM (bảng nằm ở nhóm `osm` của locales).
 * Giá trị lạ trả `null` để component ẩn thay vì hiện chữ thô.
 */
export function cuisineLabel(value: string | null | undefined, lang: Language): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const dict = (lang === 'en' ? en.osm : vi.osm) as Record<string, string>;
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
}
