import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { MOCK_HOST_TOKEN, MOCK_MEMBER_TOKEN, mockRoom } from '../mocks/mockData';
import { resetMockDb } from '../mocks/handlers';
import type { GroupCenterResponse, Place, TieSuggestion } from '../types';

const BASE = `http://localhost/api/v1/rooms/${mockRoom.id}`;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

const auth = (token: string) => ({ 'X-Member-Token': token, 'Content-Type': 'application/json' });

async function share(token: string, lat: number | null, lng: number | null) {
  const res = await fetch(`${BASE}/members/me`, {
    method: 'PATCH',
    headers: auth(token),
    body: JSON.stringify({ origin_lat: lat, origin_lng: lng }),
  });
  expect(res.status).toBe(200);
}

async function makeTie() {
  const places = (await (await fetch(`${BASE}/places`)).json()) as Place[];
  // Quán dẫn đầu (4 phiếu) mất phiếu của mình → hoà 3–3 với quán thứ hai
  const leader = places.find((p) => p.upvotes === 4)!;
  const vote = await fetch(`${BASE}/places/${leader.id}/votes`, {
    method: 'POST',
    headers: auth(MOCK_HOST_TOKEN),
    body: JSON.stringify({ vote_value: 0 }),
  });
  expect(vote.status).toBe(200);
  return places;
}

describe('T-86: mock group-center + tie-break/suggestion (kiểu cho T-88/T-89)', () => {
  it('group-center: ẩn khi <2 người, có tâm làm tròn 3 chữ số và không lộ toạ độ riêng', async () => {
    const url = `${BASE}/group-center`;
    const none = (await (await fetch(url, { headers: auth(MOCK_HOST_TOKEN) })).json()) as GroupCenterResponse;
    expect(none).toMatchObject({ available: false, center: null, member_count: 0, nearby_pois: [] });

    await share(MOCK_HOST_TOKEN, 10.7626123, 106.6820456);
    await share(MOCK_MEMBER_TOKEN, 10.795079, 106.721832);
    const res = await fetch(url, { headers: auth(MOCK_MEMBER_TOKEN) });
    const body = (await res.json()) as GroupCenterResponse;
    expect(body.available).toBe(true);
    expect(body.member_count).toBe(2);
    expect(body.center!.lat).toBe(Math.round(body.center!.lat * 1000) / 1000);
    expect(JSON.stringify(body)).not.toContain('10.7626123');
    const dist = body.nearby_pois.map((p) => p.distance_km!);
    expect(dist).toEqual([...dist].sort((a, b) => a - b));

    await share(MOCK_MEMBER_TOKEN, null, null);
    expect(((await (await fetch(url, { headers: auth(MOCK_HOST_TOKEN) })).json()) as GroupCenterResponse).available).toBe(false);
  });

  it('tie-break/suggestion: NO_TIE khi chưa hoà, NO_ORIGINS khi chưa ai chia sẻ, xếp hạng khi đủ dữ liệu', async () => {
    const url = `${BASE}/tie-break/suggestion`;
    const get = async () => (await (await fetch(url, { headers: auth(MOCK_HOST_TOKEN) })).json()) as TieSuggestion;

    expect(await get()).toMatchObject({ available: false, reason: 'NO_TIE', threshold_min: 2 });

    await makeTie();
    expect(await get()).toMatchObject({ available: false, reason: 'NO_ORIGINS' });

    await share(MOCK_HOST_TOKEN, 10.7626, 106.682);
    await share(MOCK_MEMBER_TOKEN, 10.795, 106.7218);
    const s = await get();
    expect(s.available).toBe(true);
    expect(s.travel_mode).toBe('TWO_WHEELER');
    expect(s.members).toHaveLength(2);
    expect(s.matrix).toHaveLength(2);
    expect(s.candidates).toHaveLength(2);
    expect(s.ranking.map((r) => r.rank)).toEqual([1, 2]);
    expect(s.recommended_place_id).toBe(s.ranking[0].place_id);
    expect(s.margin_vs_second_min).toBe(s.ranking[1].total_min - s.ranking[0].total_min);
    expect(JSON.stringify(s)).not.toContain('10.7626');
  });

  it('voting/resolve TRAVEL_TIME chốt quán đứng đầu thứ hạng, bỏ qua số client gửi', async () => {
    await makeTie();
    await share(MOCK_HOST_TOKEN, 10.7626, 106.682);
    await share(MOCK_MEMBER_TOKEN, 10.795, 106.7218);
    const s = (await (await fetch(`${BASE}/tie-break/suggestion`, { headers: auth(MOCK_HOST_TOKEN) })).json()) as TieSuggestion;
    const loser = s.ranking[1].place_id;
    const res = await fetch(`${BASE}/voting/resolve`, {
      method: 'POST',
      headers: auth(MOCK_HOST_TOKEN),
      body: JSON.stringify({ strategy: 'TRAVEL_TIME', max_accepted_places: 1, recommended_place_id: loser }),
    });
    const body = (await res.json()) as { resolved_places: { id: string }[]; tie_break_strategy: string };
    expect(body.tie_break_strategy).toBe('TRAVEL_TIME');
    expect(body.resolved_places.map((p) => p.id)).toEqual([s.recommended_place_id]);
  });
});
