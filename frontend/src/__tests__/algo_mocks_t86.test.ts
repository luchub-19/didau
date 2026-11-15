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

/** Phá hoà FOOD (mock có Cơm Tấm Ba Ghiền = Cơm Tấm Cali = 3 điểm): chủ phòng bấm "Muốn đi" Cali → 4 điểm. */
async function breakFoodTie() {
  const places = (await (await fetch(`${BASE}/places`)).json()) as Place[];
  const cali = places.find((p) => p.name.startsWith('Cơm Tấm Cali'))!;
  const vote = await fetch(`${BASE}/places/${cali.id}/votes`, {
    method: 'POST',
    headers: auth(MOCK_HOST_TOKEN),
    body: JSON.stringify({ vote_value: 1 }),
  });
  expect(vote.status).toBe(200);
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

  it('tie-break/suggestion (CR-15): hoà theo điểm + loại; NO_ORIGINS khi chưa ai chia sẻ; xếp hạng Ψ khi đủ dữ liệu', async () => {
    const url = `${BASE}/tie-break/suggestion`;
    const get = async () => (await (await fetch(url, { headers: auth(MOCK_HOST_TOKEN) })).json()) as TieSuggestion;

    // Cà phê (DRINK) 3 điểm và Cơm Tấm (FOOD) 3 điểm KHÔNG hoà nhau vì khác loại; chỉ FOOD hoà
    const none = await get();
    expect(none).toMatchObject({ available: false, reason: 'NO_ORIGINS' });
    expect(none.suggestions.map((x) => x.category)).toEqual(['FOOD']);
    expect(none.suggestions[0].ranking).toEqual([]);

    await share(MOCK_HOST_TOKEN, 10.7626, 106.682);
    await share(MOCK_MEMBER_TOKEN, 10.795, 106.7218);
    const s = await get();
    expect(s.available).toBe(true);
    const food = s.suggestions[0];
    expect(food.candidates).toHaveLength(2);
    expect(food.ranking.map((r) => r.rank)).toEqual([1, 2]);
    expect(food.ranking[0].psi).toBeLessThanOrEqual(food.ranking[1].psi);
    expect(food.recommended_place_id).toBe(food.ranking[0].place_id);
    expect(food.runner_up_psi).toBe(food.ranking[1].psi);
    expect(food.members.map((m) => m.rank)).toEqual([1, 2]);
    expect(food.members.map((m) => m.weight)).toEqual([1, 2]);
    expect(food.params).toEqual({ lambda: 1, k: 2 }); // T-99 (CR-16), như backend
    expect(JSON.stringify(s)).not.toContain('10.7626');
    expect(JSON.stringify(s)).not.toContain('10.795');

    await breakFoodTie();
    expect(await get()).toEqual({ available: false, reason: 'NO_TIE', suggestions: [] });
  });

  it('voting/resolve TRAVEL_TIME chốt quán đề xuất của loại đứng đầu (điểm, loại), bỏ qua số client gửi', async () => {
    await share(MOCK_HOST_TOKEN, 10.7626, 106.682);
    await share(MOCK_MEMBER_TOKEN, 10.795, 106.7218);
    const s = (await (await fetch(`${BASE}/tie-break/suggestion`, { headers: auth(MOCK_HOST_TOKEN) })).json()) as TieSuggestion;
    const food = s.suggestions[0];
    const loser = food.ranking[1].place_id;
    const res = await fetch(`${BASE}/voting/resolve`, {
      method: 'POST',
      headers: auth(MOCK_HOST_TOKEN),
      body: JSON.stringify({ strategy: 'TRAVEL_TIME', max_accepted_places: 1, recommended_place_id: loser }),
    });
    const body = (await res.json()) as { resolved_places: { id: string }[]; tie_break_strategy: string };
    expect(body.tie_break_strategy).toBe('TRAVEL_TIME');
    // (3, FOOD) > (3, DRINK) theo tên loại giảm dần, như backend
    expect(body.resolved_places.map((p) => p.id)).toEqual([food.recommended_place_id]);
  });
});
