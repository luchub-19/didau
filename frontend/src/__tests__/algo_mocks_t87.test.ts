import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { MOCK_HOST_TOKEN, mockRoom } from '../mocks/mockData';
import { resetMockDb } from '../mocks/handlers';
import type { Place, ScheduleFeasibility, ScheduleItem } from '../types';

const BASE = `http://localhost/api/v1/rooms/${mockRoom.id}`;
const auth = { 'X-Member-Token': MOCK_HOST_TOKEN, 'Content-Type': 'application/json' };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

async function places(query = ''): Promise<Place[]> {
  return (await (await fetch(`${BASE}/places${query}`, { headers: auth })).json()) as Place[];
}

describe('T-87: mock priority + schedule/feasibility (kiểu cho T-90)', () => {
  it('GET /places có priority; ?sort=priority theo rank, mặc định giữ thứ tự cũ', async () => {
    const plain = await places();
    const ranked = await places('?sort=priority');
    expect(plain.map((p) => p.id).sort()).toEqual(ranked.map((p) => p.id).sort());
    for (const p of plain) {
      if (p.status === 'REJECTED') expect(p.priority).toBeNull();
      else expect(p.priority).toMatchObject({ rank: expect.any(Number), risk: expect.any(String), labels: expect.any(Array) });
    }
    const ranks = ranked.filter((p) => p.priority).map((p) => p.priority!.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks[0]).toBe(1);
    for (const p of ranked) expect((p.priority?.labels.length ?? 0) <= 1).toBe(true);
  });

  it('GET /schedule/feasibility: tổng = thời lượng + (đi + biên + gửi xe), cần token', async () => {
    expect((await fetch(`${BASE}/schedule/feasibility`)).status).toBe(401);
    const list = (await (await fetch(`${BASE}/places`, { headers: auth })).json()) as Place[];
    const withCoords = list.filter((p) => p.latitude != null && p.longitude != null).slice(0, 2);
    expect(withCoords.length).toBe(2);
    for (const [i, p] of withCoords.entries()) {
      const res = await fetch(`${BASE}/schedule`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ place_id: p.id, day_offset: 0, start_minute: 1080 + i * 70, end_minute: 1140 + i * 70 }),
      });
      expect(res.status).toBe(201);
    }
    const sched = (await (await fetch(`${BASE}/schedule`, { headers: auth })).json()) as ScheduleItem[];
    const f = (await (await fetch(`${BASE}/schedule/feasibility`, { headers: auth })).json()) as ScheduleFeasibility;
    const day0 = sched.filter((s) => (s.day_offset ?? 0) === 0);
    expect(f.item_count).toBe(day0.length);
    expect(f.legs.length + f.unknown_leg_count).toBe(Math.max(0, day0.length - 1));
    const durations = day0.reduce((a, s) => a + s.end_minute - s.start_minute, 0);
    const legs = f.legs.reduce((a, l) => a + l.eta_min + l.margin_min + l.buffer_min, 0);
    expect(f.required_total_min).toBe(durations + legs);
    expect(f.buffer_total_min).toBe(f.window_min - f.required_total_min);
    for (const l of f.legs) {
      expect(l.slack_min).toBe(l.gap_min - (l.eta_min + l.margin_min + l.buffer_min));
      expect(['SAFE', 'SOFT_CONFLICT', 'HIGH_RISK']).toContain(l.risk);
    }
  });
});
