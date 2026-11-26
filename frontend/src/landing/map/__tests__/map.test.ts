// T-125: shared landing map module. maplibre-gl is mocked (no WebGL in node); English names/comments (i18n_guard).
import { afterEach, describe, expect, it, vi } from 'vitest';

const ctor = vi.fn();
class FakeMarker {
  el: HTMLElement;
  constructor(o: { element: HTMLElement }) {
    this.el = o.element;
  }
  setLngLat() {
    return this;
  }
  addTo() {
    return this;
  }
}
vi.mock('maplibre-gl', () => ({
  default: {
    Map: function FakeMap(this: unknown, o: unknown) {
      ctor(o);
      return makeMap();
    },
    Marker: FakeMarker,
  },
}));

import { FALLBACK_MAP_STYLE, MAP_STYLE_URL } from '../../../config';
import {
  HERO_MAP_BOUNDS,
  HERO_MAP_PADDING,
  HIDDEN_LAYER_RE,
  createLandingMap,
  fitProject,
  heroMapOptions,
  loadMap,
  snapshotAndRelease,
  tidyStyle,
  type MapLib,
} from '..';
import type { Map as MlMap } from 'maplibre-gl';

type Handler = (e?: unknown) => void;

function makeMap(opts: { loaded?: boolean; styleLoaded?: boolean } = {}) {
  const handlers: Record<string, Handler[]> = {};
  const once: Record<string, Handler[]> = {};
  const map = {
    styleLoaded: opts.styleLoaded ?? false,
    isLoaded: opts.loaded ?? false,
    removed: 0,
    on: vi.fn((ev: string, fn: Handler): unknown => {
      (handlers[ev] ??= []).push(fn);
      return map;
    }),
    once: vi.fn((ev: string, fn: Handler): unknown => {
      (once[ev] ??= []).push(fn);
      return map;
    }),
    fire(ev: string, e?: unknown): void {
      (handlers[ev] ?? []).forEach((f) => f(e));
      const o = once[ev] ?? [];
      once[ev] = [];
      o.forEach((f) => f(e));
    },
    isStyleLoaded: (): boolean => map.styleLoaded,
    loaded: (): boolean => map.isLoaded,
    areTilesLoaded: (): boolean => map.isLoaded,
    setStyle: vi.fn(),
    // idle phát sau khung vẽ kế nếu ô đã đủ (giả lập MapLibre)
    triggerRepaint: vi.fn((): void => {
      if (map.isLoaded) queueMicrotask(() => map.fire('idle'));
    }),
    getStyle: () => ({ layers: [{ id: 'poi_r1' }, { id: 'road_primary' }, { id: 'housenumber' }, { id: 'water' }, { id: 'transit_stop' }] }),
    setLayoutProperty: vi.fn(),
    getContainer: () => ({ clientWidth: 320, clientHeight: 440 }),
    getCanvas: () => ({ width: 640, height: 880 }),
    project: ([lng, lat]: [number, number]) => ({ x: lng * 10, y: lat * 10 }),
    remove: vi.fn((): void => {
      map.removed += 1;
    }),
  };
  return map;
}

function fakeCanvas() {
  const drawImage = vi.fn();
  return {
    canvas: { width: 0, height: 0, style: {} as Record<string, string>, getContext: () => ({ drawImage }) },
    drawImage,
  };
}

afterEach(() => {
  vi.useRealTimers();
  ctor.mockClear();
});

describe('T-125 map: lazy load', () => {
  it('loadMap imports maplibre-gl once and memoizes the promise', async () => {
    const a = loadMap();
    const b = loadMap();
    expect(a).toBe(b);
    const ml = await a;
    expect(typeof ml.Map).toBe('function');
  });
});

describe('T-125 map: tidyStyle + createLandingMap', () => {
  it('hides poi/transit/bus/rail/aeroway/housenum layers only', () => {
    const m = makeMap();
    expect(tidyStyle(m as unknown as MlMap)).toBe(3);
    const hidden = m.setLayoutProperty.mock.calls.map((c: unknown[]) => c[0]);
    expect(hidden).toEqual(['poi_r1', 'housenumber', 'transit_stop']);
    for (const id of ['bus_stop', 'railway', 'aeroway_fill']) expect(HIDDEN_LAYER_RE.test(id)).toBe(true);
    expect(HIDDEN_LAYER_RE.test('road_primary')).toBe(false);
  });

  it('uses the app style; a style error before load falls back once, a second one fails', async () => {
    const ml = await loadMap();
    const onFail = vi.fn();
    const h = createLandingMap(ml, { container: {} as HTMLElement, onFail, ...heroMapOptions() });
    expect(h).not.toBeNull();
    const opts = ctor.mock.calls[0][0];
    expect(opts.style).toBe(MAP_STYLE_URL);
    expect(opts.interactive).toBe(false);
    expect(opts.preserveDrawingBuffer).toBe(true);
    const map = h!.map as unknown as ReturnType<typeof makeMap>;
    map.fire('error', { error: { message: 'style 404' } });
    expect(map.setStyle).toHaveBeenCalledWith(FALLBACK_MAP_STYLE);
    expect(h!.usedFallback()).toBe(true);
    expect(onFail).not.toHaveBeenCalled();
    map.fire('error', { error: { message: 'tiles down' } });
    expect(onFail).toHaveBeenCalledWith('tiles down');
  });

  it('tile errors after the style loaded are ignored', async () => {
    const ml = await loadMap();
    const onFail = vi.fn();
    const h = createLandingMap(ml, { container: {} as HTMLElement, onFail });
    const map = h!.map as unknown as ReturnType<typeof makeMap>;
    map.styleLoaded = true;
    map.fire('error', { error: { message: 'one tile' } });
    expect(map.setStyle).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });

  it('no WebGL (constructor throws): onFail + null', () => {
    const onFail = vi.fn();
    const ml = {
      Map: function Broken() {
        throw new Error('WebGL unavailable');
      },
    } as unknown as MapLib;
    expect(createLandingMap(ml, { container: {} as HTMLElement, onFail })).toBeNull();
    expect(onFail).toHaveBeenCalledWith('Error: WebGL unavailable');
  });
});

describe('T-130 map: one-context gate', () => {
  // Module state is global: earlier tests leave fake maps "alive", so each test here imports a fresh copy
  const fresh = async () => {
    vi.resetModules();
    return import('..');
  };

  it('whenMapsReleased resolves only after every live map fired remove', async () => {
    const { loadMap, createLandingMap, whenMapsReleased } = await fresh();
    const ml = await loadMap();
    const a = createLandingMap(ml, { container: {} as HTMLElement })!.map as unknown as ReturnType<typeof makeMap>;
    const b = createLandingMap(ml, { container: {} as HTMLElement })!.map as unknown as ReturnType<typeof makeMap>;
    let released = false;
    void whenMapsReleased().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    a.fire('remove');
    await Promise.resolve();
    expect(released).toBe(false);
    b.fire('remove');
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(true);
    // nothing alive any more: resolves at once
    await expect(whenMapsReleased()).resolves.toBeUndefined();
  });

  it('gives up waiting after the cap (a stuck hero must not cost the tie map)', async () => {
    vi.useFakeTimers();
    const { loadMap, createLandingMap, whenMapsReleased } = await fresh();
    const ml = await loadMap();
    createLandingMap(ml, { container: {} as HTMLElement });
    let released = false;
    void whenMapsReleased(1000).then(() => {
      released = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(released).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(released).toBe(true);
  });
});

describe('T-125 map: snapshotAndRelease (at most one live WebGL context)', () => {
  const pts = { pizza: [106.72284, 10.77227] as const, dookki: [106.70325, 10.73017] as const };

  it('waits for idle, copies the canvas into a 2D canvas, projects pins, then removes the map once', async () => {
    const m = makeMap();
    const { canvas, drawImage } = fakeCanvas();
    const p = snapshotAndRelease(m as unknown as MlMap, canvas as unknown as HTMLCanvasElement, pts);
    expect(m.remove).not.toHaveBeenCalled();
    m.fire('idle');
    const snap = await p;
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(880);
    expect(canvas.style.width).toBe('320px');
    expect(snap).toMatchObject({ width: 320, height: 440, drawn: true, timedOut: false });
    expect(snap.points.pizza[0]).toBeCloseTo(1067.2284, 3);
    expect(m.remove).toHaveBeenCalledTimes(1);
    m.fire('idle');
    expect(m.remove).toHaveBeenCalledTimes(1);
  });

  it('already loaded: forces a repaint and snapshots on the next idle (never on loaded() alone)', async () => {
    const m = makeMap({ loaded: true });
    const { canvas } = fakeCanvas();
    const p = snapshotAndRelease(m as unknown as MlMap, canvas as unknown as HTMLCanvasElement, pts);
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.triggerRepaint).toHaveBeenCalledTimes(1);
    const snap = await p;
    expect(snap.drawn).toBe(true);
    expect(m.remove).toHaveBeenCalledTimes(1);
  });

  it('slow tiles: releases the context after the timeout anyway', async () => {
    vi.useFakeTimers();
    const m = makeMap();
    const { canvas } = fakeCanvas();
    const p = snapshotAndRelease(m as unknown as MlMap, canvas as unknown as HTMLCanvasElement, pts, { timeoutMs: 5000 });
    vi.advanceTimersByTime(5000);
    const snap = await p;
    expect(snap.timedOut).toBe(true);
    expect(m.remove).toHaveBeenCalledTimes(1);
  });

  it('a 2D copy failure still releases the map and keeps pin positions', async () => {
    const m = makeMap({ loaded: true });
    const canvas = {
      width: 0,
      height: 0,
      style: {},
      getContext: () => {
        throw new Error('tainted');
      },
    };
    const snap = await snapshotAndRelease(m as unknown as MlMap, canvas as unknown as HTMLCanvasElement, pts);
    expect(snap.drawn).toBe(false);
    expect(Object.keys(snap.points)).toEqual(['pizza', 'dookki']);
    expect(m.remove).toHaveBeenCalledTimes(1);
  });
});

describe('T-125 map: fitProject (paper fallback keeps pins in place)', () => {
  it('fits the bounds inside the padding like fitBounds, north up', () => {
    const W = 330;
    const H = 440;
    const p = fitProject(
      { sw: HERO_MAP_BOUNDS[0], ne: HERO_MAP_BOUNDS[1], mid: [106.714, 10.7785] },
      HERO_MAP_BOUNDS,
      W,
      H,
      HERO_MAP_PADDING,
    );
    const { top, bottom, left, right } = HERO_MAP_PADDING;
    for (const [x, y] of Object.values(p)) {
      expect(x).toBeGreaterThanOrEqual(left - 1e-6);
      expect(x).toBeLessThanOrEqual(W - right + 1e-6);
      expect(y).toBeGreaterThanOrEqual(top - 1e-6);
      expect(y).toBeLessThanOrEqual(H - bottom + 1e-6);
    }
    // tall bounds in a tall box: the height is the binding side
    expect(p.sw[1]).toBeCloseTo(H - bottom, 6);
    expect(p.ne[1]).toBeCloseTo(top, 6);
    expect(p.sw[0]).toBeLessThan(p.ne[0]);
    expect(p.mid[0]).toBeCloseTo((left + W - right) / 2, 0);
  });
});
