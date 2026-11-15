// T-105 (CR-18): tìm quán chỉ trong thành phố của phòng, tâm tìm = nơi xuất phát của mình, bước chia sẻ vị trí bắt buộc.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { http, HttpResponse } from 'msw';
import '../i18n';
import { server } from '../mocks/server';
import { hasMyOrigin, searchCenter } from '../room/origin';
import { useMapStore } from '../store/useMapStore';
import { Sheet } from '../components/ui/Sheet';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('searchCenter (CR-18)', () => {
  const room = { origin_lat: 10.8, origin_lng: 106.7, city: 'HCM' };

  it('nơi xuất phát của mình thắng điểm hẹn và tâm bản đồ', () => {
    expect(searchCenter(room, { origin_lat: 10.75, origin_lng: 106.66 }, { lat: 16, lng: 106 })).toEqual({
      lat: 10.75,
      lng: 106.66,
    });
  });

  it('chưa có vị trí của mình → điểm hẹn → tâm bản đồ → tâm thành phố', () => {
    expect(searchCenter(room, null, { lat: 16, lng: 106 })).toEqual({ lat: 10.8, lng: 106.7 });
    expect(searchCenter({ city: 'HCM' }, { origin_lat: null, origin_lng: null }, { lat: 10.9, lng: 106.8 })).toEqual({
      lat: 10.9,
      lng: 106.8,
    });
    expect(searchCenter({ city: 'HN' }).lat).toBeGreaterThan(20);
  });

  it('hasMyOrigin: cờ has_origin hoặc toạ độ của chính chủ', () => {
    expect(hasMyOrigin(null)).toBe(false);
    expect(hasMyOrigin({ has_origin: false })).toBe(false);
    expect(hasMyOrigin({ has_origin: true })).toBe(true);
    expect(hasMyOrigin({ has_origin: false, origin_lat: 10.7, origin_lng: 106.7 })).toBe(true);
  });
});

describe('useMapStore.search gửi city (CR-18)', () => {
  it('kèm city + lat/lng lên /pois/search và /pois/brands', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get('*/api/v1/pois/search', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json([]);
      }),
      http.get('*/api/v1/pois/brands', ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json([]);
      }),
    );
    await useMapStore.getState().search('phê la', { lat: 10.77, lng: 106.7 }, 'HCM');
    expect(seen).toHaveLength(2);
    for (const params of seen) {
      expect(params.get('city')).toBe('HCM');
      expect(params.get('lat')).toBe('10.77');
    }
  });

  it('mock MSW lọc theo thành phố', async () => {
    const hn = await useMapStore.getState().search('phuc long', undefined, 'HN');
    expect(hn.every((p) => p.lat > 16)).toBe(true);
  });
});

describe('Sheet dismissible={false} (bước bắt buộc)', () => {
  it('không có nút đóng X, vẫn là dialog modal', () => {
    const closable = renderToStaticMarkup(
      <Sheet isOpen onClose={() => {}} title="A">
        x
      </Sheet>,
    );
    const required = renderToStaticMarkup(
      <Sheet isOpen onClose={() => {}} title="A" dismissible={false}>
        x
      </Sheet>,
    );
    expect(closable).toContain(`aria-label="${vi.ui.close}"`);
    expect(required).not.toContain(`aria-label="${vi.ui.close}"`);
    expect(required).toContain('aria-modal="true"');
  });

  it('chuỗi bước bắt buộc có đủ VI/EN', () => {
    expect(vi.algo.origin.requiredTitle).toBeTruthy();
    expect(en.algo.origin.requiredTitle).toBeTruthy();
    expect(en.algo.origin.requiredDesc).not.toBe(vi.algo.origin.requiredDesc);
  });
});
