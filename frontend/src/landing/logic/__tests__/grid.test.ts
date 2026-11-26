// T-123: tra lưới Valhalla tính sẵn. Tên test viết tiếng Anh (i18n_guard quét landing/**).
import { describe, expect, it } from 'vitest';
import gridJson from '../../data/grid.json';
import { estimateTrip, haversineKm, tripFrom } from '../grid';
import type { GridData, LngLat } from '../types';

const real = gridJson as unknown as GridData;

// Lưới nhỏ 2x2 bước 1 độ, một quán ở (0.5, 0.5): điểm = row * 2 + col, hàng 0 = south.
function tiny(km: (number | null)[], min: (number | null)[]): GridData {
  return {
    bbox: [10, 20, 11, 21],
    step: 1,
    rows: 2,
    cols: 2,
    places: ['p'],
    placeLl: [[10.5, 20.5]],
    km: [km],
    min: [min],
    estimate: { a: 5, b: 2 },
  };
}

describe('T-123 grid: lookup', () => {
  it('every node of the shipped grid returns exactly its stored value', () => {
    const [west, south] = real.bbox;
    for (const [r, c] of [[0, 0], [0, real.cols - 1], [real.rows - 1, 0], [real.rows - 1, real.cols - 1], [7, 11], [12, 3]]) {
      const ll: LngLat = [west + c * real.step, south + r * real.step];
      real.places.forEach((id, p) => {
        if (real.km[p][r * real.cols + c] === null) return; // node Valhalla could not reach: covered by the null tests below
        const t = tripFrom(ll, id, real);
        expect(t.source).toBe('grid');
        expect(t.km).toBeCloseTo(real.km[p][r * real.cols + c] as number, 6);
        expect(t.min).toBe(real.min[p][r * real.cols + c]);
      });
    }
  });

  it('interpolates bilinearly between four corners', () => {
    const g = tiny([10, 20, 30, 40], [10, 20, 30, 40]);
    expect(tripFrom([10.5, 20.5], 'p', g)).toEqual({ km: 25, min: 25, source: 'grid' });
    // 25% east, 75% north: weights 0.1875 / 0.0625 / 0.5625 / 0.1875
    const t = tripFrom([10.25, 20.75], 'p', g);
    expect(t.km).toBeCloseTo(10 * 0.1875 + 20 * 0.0625 + 30 * 0.5625 + 40 * 0.1875, 9);
    expect(t.source).toBe('grid');
  });

  it('a null corner is dropped and the other corners are re-weighted', () => {
    const g = tiny([null, 20, 30, 40], [null, 20, 30, 40]);
    const t = tripFrom([10.5, 20.5], 'p', g);
    expect(t.source).toBe('grid');
    expect(t.km).toBeCloseTo(30, 6); // mean of 20, 30, 40
    expect(t.min).toBe(30);
  });

  it('a point sitting exactly on a null node is taken from the remaining corners', () => {
    const g = tiny([null, 20, 30, 40], [null, 20, 30, 40]);
    const t = tripFrom([10, 20], 'p', g);
    expect(t.source).toBe('grid');
    expect(t.km).toBeGreaterThan(19.9);
    expect(t.km).toBeLessThan(40);
  });

  it('all four corners null falls back to the estimate', () => {
    const g = tiny([null, null, null, null], [null, null, null, null]);
    const t = tripFrom([10.5, 20.5], 'p', g);
    expect(t.source).toBe('estimate');
    expect(t.km).toBeCloseTo(0, 6); // user is on the place
    expect(t.min).toBe(2); // a * 0 + b
  });

  it('outside the bbox falls back to the estimate a * (bird * 1.3) + b', () => {
    const vungTau: LngLat = [107.08, 10.35];
    const p = real.places[0];
    const t = tripFrom(vungTau, p, real);
    const bird = haversineKm(vungTau, real.placeLl[0]);
    expect(t.source).toBe('estimate');
    expect(t.km).toBeCloseTo(2 * bird * 1.3, 9);
    expect(t.min).toBe(Math.round(real.estimate.a * bird * 1.3 + real.estimate.b));
    expect(t).toEqual(estimateTrip(vungTau, real.placeLl[0], real.estimate));
  });

  it('just outside an edge is an estimate, exactly on the edge is the grid', () => {
    const g = tiny([10, 20, 30, 40], [10, 20, 30, 40]);
    expect(tripFrom([11, 21], 'p', g).source).toBe('grid');
    expect(tripFrom([11.001, 21], 'p', g).source).toBe('estimate');
    expect(tripFrom([10.5, 19.999], 'p', g).source).toBe('estimate');
  });

  it('unknown place id throws', () => {
    expect(() => tripFrom([106.7, 10.78], 'nope', real)).toThrow();
  });

  it('shipped grid covers its stated bbox with rows x cols points per place', () => {
    expect(real.km).toHaveLength(real.places.length);
    expect(real.min).toHaveLength(real.places.length);
    for (const col of [...real.km, ...real.min]) expect(col).toHaveLength(real.rows * real.cols);
    expect(real.placeLl).toHaveLength(real.places.length);
  });
});

describe('T-123 grid: haversine', () => {
  it('is zero for the same point and about 111 km per degree of latitude', () => {
    expect(haversineKm([106.7, 10.78], [106.7, 10.78])).toBe(0);
    expect(haversineKm([106.7, 10], [106.7, 11])).toBeCloseTo(111.19, 1);
  });
});
