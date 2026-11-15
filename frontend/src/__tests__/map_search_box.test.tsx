import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../i18n';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { server } from '../mocks/server';
import { mockPois } from '../mocks/mockData';
import { BrandRow, MapSearchBox, SearchResultRow } from '../components/map/MapSearchBox';
import { foldText, matchRanges, nextIndex, shortAddress } from '../components/map/searchText';
import { poiApi } from '../services/api/poiApi';
import type { Poi } from '../types';

// T-100: ô tìm kiểu Google Maps (MAP-POI §5) — dòng phụ địa chỉ/quận, in đậm phần khớp, ↑/↓/Enter/Esc

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const phucLong = mockPois.find((p) => p.external_id === 'ovt:mock-phuclong-1') as Poi;

describe('MapSearchBox helpers', () => {
  it('foldText bỏ dấu nhưng giữ độ dài', () => {
    expect(foldText('Phúc Long Đồng Khởi')).toBe('phuc long dong khoi');
    expect(foldText('Phúc Long').length).toBe('Phúc Long'.length);
  });

  it('matchRanges tìm từng từ không dấu, gộp đoạn chồng nhau', () => {
    expect(matchRanges('Phúc Long Coffee & Tea', 'phuc long')).toEqual([
      [0, 4],
      [5, 9],
    ]);
    expect(matchRanges('Cà Phê Sữa Đá', 'ca phe')).toEqual([
      [0, 2],
      [3, 6],
    ]);
    expect(matchRanges('Bún Bò', 'zz')).toEqual([]);
    expect(matchRanges('aaaa', 'aa aaa')).toEqual([[0, 4]]);
  });

  it('shortAddress rút gọn "số + đường, quận", bỏ tên thành phố, lùi về district', () => {
    expect(shortAddress({ address: '260C Pasteur, P.8, Quận 3, TP.HCM', district: 'Q3' })).toBe('260C Pasteur, Quận 3');
    expect(shortAddress({ address: '42 Lê Lợi, Quận 1', district: 'Q1' })).toBe('42 Lê Lợi, Quận 1');
    expect(shortAddress({ address: '10 Nguyễn Huệ', district: 'Q1' })).toBe('10 Nguyễn Huệ, Q1');
    expect(shortAddress({ address: '10, Ho Chi Minh City', district: 'Q3' })).toBe('10, Q3');
    expect(shortAddress({ address: null, district: 'Q3' })).toBe('Q3');
    expect(shortAddress({ address: null, district: null })).toBeNull();
  });

  it('nextIndex vòng tròn ↑/↓', () => {
    expect(nextIndex(-1, 1, 3)).toBe(0);
    expect(nextIndex(-1, -1, 3)).toBe(2);
    expect(nextIndex(2, 1, 3)).toBe(0);
    expect(nextIndex(0, -1, 3)).toBe(2);
    expect(nextIndex(0, 1, 0)).toBe(-1);
  });
});

describe('SearchResultRow', () => {
  it('in đậm phần khớp, có dòng địa chỉ và khoảng cách', () => {
    const html = renderToStaticMarkup(
      <SearchResultRow poi={{ ...phucLong, distance_km: 0.42 }} query="phuc long" lang="vi" />,
    );
    expect(html).toContain('<strong class="font-semibold text-ink">Phúc</strong>');
    expect(html).toContain('<strong class="font-semibold text-ink">Long</strong>');
    expect(html).toContain('42 Lê Lợi, Quận 1');
    expect(html).toContain("0,4 km");
  });

  it('không có địa chỉ thì hiện quận', () => {
    const noAddr = mockPois.find((p) => p.external_id === 'ovt:mock-phuclong-2') as Poi;
    const html = renderToStaticMarkup(<SearchResultRow poi={noAddr} query="phuc" lang="en" />);
    expect(html).toContain('Q3');
  });

  it('ô nhập là combobox có listbox', () => {
    const html = renderToStaticMarkup(<MapSearchBox getCenter={() => ({ lat: 10.77, lng: 106.7 })} onPick={() => {}} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('MSW /pois/search (CR-17 A)', () => {
  it('trả chi nhánh Phúc Long kèm district, gần trước', async () => {
    const found = await poiApi.searchPois({ q: 'phuc long', lat: 10.7725, lng: 106.699 });
    const branches = found.filter((p) => p.brand_key === 'phuc-long');
    expect(branches.length).toBe(3);
    expect(branches[0].external_id).toBe('ovt:mock-phuclong-1');
    expect(branches.every((p) => p.address || p.district)).toBe(true);
  });

  it('tìm được mall và rạp', async () => {
    expect((await poiApi.searchPois({ q: 'vincom' })).some((p) => p.kind === 'mall')).toBe(true);
    expect((await poiApi.searchPois({ q: 'cgv' }))[0].kind).toBe('cinema');
  });
});

describe('Dòng "Xem N chi nhánh" (T-102)', () => {
  const brand = { brand_key: 'phuc-long', name: 'Phúc Long', count: 93, nearest_km: 0.42 };

  it('tên chuỗi in đậm phần khớp + số chi nhánh, đủ VI/EN', async () => {
    await i18n.changeLanguage('vi');
    const vi = renderToStaticMarkup(<BrandRow brand={brand} query="phuc" />);
    expect(vi).toContain('<strong class="font-semibold text-ink">Phúc</strong>');
    expect(vi).toContain('Xem 93 chi nhánh');
    await i18n.changeLanguage('en');
    expect(renderToStaticMarkup(<BrandRow brand={brand} query="phuc" />)).toContain('See 93 locations');
    expect(renderToStaticMarkup(<BrandRow brand={{ ...brand, count: 1 }} query="" />)).toContain('See 1 location<');
    await i18n.changeLanguage('vi');
  });

  it('icon theo kind thay cho icon category', () => {
    const mall = mockPois.find((p) => p.kind === 'mall') as Poi;
    const asCafe = renderToStaticMarkup(<SearchResultRow poi={{ ...mall, kind: 'cafe' }} query="" lang="vi" />);
    const asMall = renderToStaticMarkup(<SearchResultRow poi={mall} query="" lang="vi" />);
    expect(asMall).not.toEqual(asCafe);
    const noKind = renderToStaticMarkup(<SearchResultRow poi={{ ...mall, kind: null }} query="" lang="vi" />);
    expect(noKind).toContain('<svg');
  });
});

describe('MSW /pois/brands (CR-17 B)', () => {
  it('chuỗi ≥ 3 chi nhánh khớp tiền tố, kèm chi nhánh gần nhất', async () => {
    const brands = await poiApi.searchBrands({ q: 'phuc', lat: 10.7725, lng: 106.699 });
    expect(brands).toEqual([{ brand_key: 'phuc-long', name: 'Phúc Long', count: 3, nearest_km: 0 }]);
    expect(await poiApi.searchBrands({ q: 'vincom' })).toEqual([]); // 1 chi nhánh
  });

  it('chi nhánh gần → xa', async () => {
    const pois = await poiApi.getBrandBranches('phuc-long', { lat: 10.7546, lng: 106.6639 });
    expect(pois[0].external_id).toBe('ovt:mock-phuclong-3');
    const d = pois.map((p) => p.distance_km ?? 0);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});
