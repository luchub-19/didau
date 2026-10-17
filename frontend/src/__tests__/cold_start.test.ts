import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { roomApi } from '../services/api';
import { coldStartManager, type ColdStartState } from '../services/api/coldStart';

let last: ColdStartState = { status: 'idle', message: '' };

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  coldStartManager.subscribe((s) => {
    last = s;
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Cold start: chỉ "đánh thức" khi timeout/502/503', () => {
  it('nhận về HTML (URL sai/Vercel rewrite) -> lỗi, không phải "đang thức"', async () => {
    server.use(
      http.get('*/api/v1/rooms/:id', () =>
        new HttpResponse('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        }),
      ),
    );
    await expect(roomApi.getRoom('x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(last.status).toBe('error');
    expect(last.message).toContain('HTML');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('/api/v1/rooms/x'));
  });

  it('404 không phải envelope của API -> lỗi', async () => {
    server.use(http.get('*/api/v1/rooms/:id', () => HttpResponse.json({ detail: 'Not Found' }, { status: 404 })));
    await expect(roomApi.getRoom('x')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(last.status).toBe('error');
  });

  it('401 đúng envelope của API -> server đã thức, không retry, trả lỗi cho nơi gọi', async () => {
    server.use(
      http.get('*/api/v1/rooms/:id', () =>
        HttpResponse.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
      ),
    );
    await expect(roomApi.getRoom('x')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(last.status).toBe('idle');
    expect(coldStartManager.isCompleted()).toBe(true);
  });
});
