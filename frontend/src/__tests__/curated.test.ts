import { describe, it, expect, beforeAll } from 'vitest';
import {
  COLLECTION_CODES,
  curatedByCollection,
  curatedPhotos,
  findCurated,
  loadCurated,
  normalizeName,
  thumbFile,
  type CuratedData,
  type CuratedEntry,
} from '../room/curated';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

const CATEGORIES = ['FOOD', 'DRINK', 'ENTERTAINMENT', 'SIGHTSEEING', 'ACCOMMODATION', 'SHOPPING', 'OTHER'];
let data: CuratedData;

beforeAll(async () => {
  data = await loadCurated();
});

describe('hcm.json đúng schema', () => {
  it('mọi quán đủ vi+en, danh mục hợp lệ, 1 cover, toạ độ trong TP.HCM, id duy nhất', () => {
    const ids = new Set<string>();
    for (const e of data.places) {
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      expect([1, 2]).toContain(e.wave);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.intro.vi.length).toBeGreaterThan(10);
      expect(e.intro.en.length).toBeGreaterThan(10);
      expect(e.try.vi.length).toBeGreaterThan(0);
      expect(e.try.vi.length).toBe(e.try.en.length);
      expect(CATEGORIES).toContain(e.category);
      expect(e.price_per_person).toBeGreaterThan(0);
      expect(e.lat).toBeGreaterThan(10.6);
      expect(e.lat).toBeLessThan(11.0);
      expect(e.lng).toBeGreaterThan(106.5);
      expect(e.lng).toBeLessThan(107.0);
      expect(e.photos.length).toBeGreaterThanOrEqual(2);
      expect(e.photos.filter((p) => p.kind === 'cover')).toHaveLength(1);
      e.photos.forEach((p, i) => expect(p.file).toBe(`${e.id}-${i + 1}.webp`));
      e.collections.forEach((c) => expect(COLLECTION_CODES).toContain(c));
    }
  });

  it('đợt 1 có 10–15 quán, mỗi chủ đề ≥2 quán đợt 1', () => {
    const w1 = data.places.filter((e) => e.wave === 1);
    expect(w1.length).toBeGreaterThanOrEqual(10);
    expect(w1.length).toBeLessThanOrEqual(15);
    for (const c of COLLECTION_CODES) {
      expect(w1.filter((e) => e.collections.includes(c)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('có 3 quán của hero', () => {
    const ext = data.places.map((e) => e.external_id);
    for (const id of ['osm:node/1985346231', 'osm:node/1770305118', 'osm:node/1771654763']) {
      expect(ext).toContain(id);
    }
  });
});

describe('findCurated', () => {
  const ngon = (data0: CuratedData) => data0.places.find((e) => e.id === 'nha-hang-ngon') as CuratedEntry;

  it('khớp theo external_id', () => {
    expect(findCurated({ name: 'tên khác hẳn', external_id: ngon(data).external_id }, data)?.id).toBe('nha-hang-ngon');
  });

  it('khớp theo tên chuẩn hoá + ≤50 m', () => {
    const e = ngon(data);
    expect(findCurated({ name: 'NHA HANG NGON', latitude: e.lat + 0.0002, longitude: e.lng }, data)?.id).toBe('nha-hang-ngon');
  });

  it('không khớp khi xa >50 m hoặc thiếu toạ độ', () => {
    const e = ngon(data);
    expect(findCurated({ name: e.name, latitude: e.lat + 0.001, longitude: e.lng }, data)).toBeNull();
    expect(findCurated({ name: e.name }, data)).toBeNull();
  });

  it('chưa nạp dữ liệu → null', () => {
    expect(findCurated({ name: 'x', external_id: 'osm:node/1' }, null)).toBeNull();
  });

  it('normalizeName bỏ dấu và đ', () => {
    expect(normalizeName('\u0110ồ Ăn Ngon!')).toBe('do an ngon');
  });
});

describe('chủ đề và ảnh', () => {
  it('lọc theo chủ đề', () => {
    const view = curatedByCollection('view', data);
    expect(view.length).toBeGreaterThanOrEqual(2);
    expect(view.every((e) => e.collections.includes('view'))).toBe(true);
  });

  it('manifest thiếu ảnh → không trả URL; có thì trả src + thumb', () => {
    const e = data.places[0];
    expect(curatedPhotos(e, { ...data, files: new Set() })).toEqual([]);
    const got = curatedPhotos(e, { ...data, files: new Set([e.photos[0].file]) });
    expect(got).toHaveLength(1);
    expect(got[0].src).toBe(`/curated/${e.photos[0].file}`);
    expect(got[0].thumb).toBe(`/curated/${thumbFile(e.photos[0].file)}`);
  });
});

describe('i18n nhãn chủ đề', () => {
  it('vi và en đủ nhãn cho mọi mã', () => {
    for (const c of COLLECTION_CODES) {
      expect(vi.curated.collection[c].length).toBeGreaterThan(0);
      expect(en.curated.collection[c].length).toBeGreaterThan(0);
    }
  });
});
