// T-123: bản port OMP khớp backend. File nằm trong landing/** nên i18n_guard quét: tên test viết tiếng Anh.
import { describe, expect, it } from 'vitest';
import demoJson from '../../data/demoCase.json';
import { OMP_DEFAULT, penalty, psi, rankByOmp, rankBySum, type RankInput } from '../omp';
import type { DemoCaseData } from '../types';

const demo = demoJson as unknown as DemoCaseData;

// Sinh bằng backend/app/domain/algorithms/ordered_median.rank_candidates (K = 1) trên backend/tests/fixtures/hangout_20_cases.json.
// Mỗi bài = một chặng của một case: dᵢ = d(Aᵢ, s) + d(s, Aᵢ) lấy từ dist_matrix (không đối xứng), λ = 1, k = 2 (mặc định app).
// `ompL05K1` = cùng bài với λ = 0,5, k = 1 (mặc định cũ của Sơn) để kiểm tham số. `sumOrder` = xếp theo Σ d, hoà → max d.
const BACKEND_CASES: {
  label: string;
  km: Record<string, number[]>;
  omp: [string, number][];
  ompL05K1: [string, number][];
  sumOrder: string[];
}[] = [
  {
    label: 'case 5, stage 1 (N=6, M=3)',
    km: {
      S1_O1: [12.96, 5.72, 9.05, 20.79, 3.96, 6.29],
      S1_O2: [13.47, 5.3, 8.24, 21.0, 4.06, 8.14],
      S1_O3: [12.65, 6.95, 1.93, 12.0, 13.34, 16.06],
    },
    omp: [['S1_O3', 1355.49118], ['S1_O1', 1408.1565], ['S1_O2', 1460.18482]],
    ompL05K1: [['S1_O1', 78.894], ['S1_O2', 80.728], ['S1_O3', 83.186]],
    sumOrder: ['S1_O1', 'S1_O2', 'S1_O3'],
  },
  {
    label: 'case 7, stage 2 (N=7, M=3)',
    km: {
      S2_O1: [18.19, 25.43, 19.36, 11.74, 16.37, 14.26, 21.47],
      S2_O2: [41.74, 2.75, 40.44, 34.49, 42.41, 35.37, 2.95],
      S2_O3: [3.81, 39.82, 6.39, 12.92, 11.22, 13.61, 33.46],
    },
    omp: [['S2_O1', 3991.8306], ['S2_O3', 6012.92725], ['S2_O2', 12997.307033]],
    ompL05K1: [['S2_O1', 163.398333], ['S2_O3', 165.250833], ['S2_O2', 267.063333]],
    sumOrder: ['S2_O3', 'S2_O1', 'S2_O2'],
  },
  {
    label: 'case 9, stage 2 (N=8, M=6)',
    km: {
      S2_O1: [3.79, 8.52, 4.12, 29.66, 38.39, 7.79, 10.41, 4.39],
      S2_O2: [32.72, 42.26, 39.38, 4.86, 1.32, 40.56, 36.57, 37.83],
      S2_O3: [5.59, 6.91, 3.18, 31.73, 36.54, 6.35, 7.83, 3.0],
      S2_O4: [14.09, 5.81, 6.21, 33.28, 36.72, 2.38, 0.82, 5.56],
      S2_O5: [2.85, 11.51, 8.79, 32.92, 38.33, 11.8, 14.83, 10.26],
      S2_O6: [1.58, 14.03, 9.09, 28.08, 32.28, 13.06, 14.38, 9.69],
    },
    omp: [['S2_O6', 4673.452], ['S2_O3', 4838.571871], ['S2_O1', 5026.419657], ['S2_O4', 5249.660643], ['S2_O5', 5967.8649], ['S2_O2', 14850.1403]],
    ompL05K1: [['S2_O3', 140.155714], ['S2_O4', 146.508571], ['S2_O1', 147.719286], ['S2_O6', 164.340714], ['S2_O5', 177.791429], ['S2_O2', 311.743571]],
    sumOrder: ['S2_O3', 'S2_O4', 'S2_O1', 'S2_O6', 'S2_O5', 'S2_O2'],
  },
  {
    label: 'case 18, stage 5 (N=10, M=10)',
    km: {
      S5_O1: [14.4, 24.23, 11.7, 10.7, 15.29, 5.73, 8.96, 9.16, 7.06, 14.73],
      S5_O2: [14.81, 3.45, 12.87, 16.29, 10.04, 15.19, 13.79, 12.69, 12.12, 9.0],
      S5_O3: [20.35, 2.97, 19.99, 22.54, 18.53, 21.7, 20.37, 17.15, 18.5, 14.76],
      S5_O4: [10.38, 15.96, 8.1, 7.47, 9.38, 1.27, 4.3, 3.0, 1.41, 8.55],
      S5_O5: [4.32, 13.6, 2.56, 5.51, 0.61, 9.11, 5.5, 6.4, 8.27, 2.17],
      S5_O6: [18.74, 2.47, 14.63, 17.92, 12.99, 15.9, 16.03, 13.07, 14.26, 11.21],
      S5_O7: [1.2, 20.09, 4.4, 4.45, 5.71, 11.8, 8.74, 9.88, 11.3, 7.2],
      S5_O8: [3.64, 18.78, 5.93, 6.69, 5.83, 13.65, 9.78, 12.01, 13.32, 7.92],
      S5_O9: [4.06, 18.35, 2.31, 1.45, 4.86, 6.13, 2.92, 4.06, 5.13, 5.21],
      S5_O10: [15.3, 2.06, 14.12, 17.77, 12.34, 17.51, 16.01, 13.25, 15.83, 10.14],
    },
    omp: [['S5_O5', 845.955533], ['S5_O9', 937.5233], ['S5_O4', 1213.351144], ['S5_O7', 1744.251656], ['S5_O8', 2006.197433], ['S5_O2', 2584.662822], ['S5_O1', 3023.6328], ['S5_O10', 3274.818467], ['S5_O6', 3393.519378], ['S5_O3', 5517.699044]],
    ompL05K1: [['S5_O9', 73.497222], ['S5_O5', 78.126111], ['S5_O4', 93.949444], ['S5_O7', 113.465556], ['S5_O8', 128.764444], ['S5_O2', 155.532778], ['S5_O1', 159.941111], ['S5_O10', 174.030556], ['S5_O6', 177.565556], ['S5_O3', 227.958889]],
    sumOrder: ['S5_O9', 'S5_O5', 'S5_O4', 'S5_O7', 'S5_O8', 'S5_O2', 'S5_O1', 'S5_O10', 'S5_O6', 'S5_O3'],
  },
  {
    label: 'case 20, stage 1 (N=12, M=10)',
    km: {
      S1_O1: [14.35, 2.26, 12.45, 41.6, 13.91, 5.22, 42.27, 37.51, 15.11, 37.33, 9.13, 12.61],
      S1_O2: [18.55, 19.02, 16.93, 20.38, 15.69, 21.19, 22.19, 20.83, 4.35, 21.52, 17.03, 4.85],
      S1_O3: [9.52, 8.88, 7.78, 46.0, 9.5, 5.18, 47.74, 43.15, 20.04, 40.64, 5.68, 16.43],
      S1_O4: [9.39, 7.33, 7.26, 36.05, 8.61, 7.86, 40.1, 36.85, 16.12, 39.37, 4.64, 12.33],
      S1_O5: [6.64, 13.63, 5.01, 34.96, 4.49, 13.28, 35.85, 32.7, 14.11, 35.73, 4.67, 9.94],
      S1_O6: [15.16, 3.23, 14.82, 41.29, 14.92, 7.65, 41.2, 37.39, 14.81, 35.69, 11.81, 12.74],
      S1_O7: [38.22, 36.67, 36.16, 2.91, 34.52, 40.77, 4.63, 2.67, 22.2, 2.28, 37.73, 25.32],
      S1_O8: [3.86, 15.75, 3.28, 36.67, 0.59, 13.9, 38.91, 37.69, 17.75, 38.6, 4.76, 12.9],
      S1_O9: [1.15, 16.1, 3.2, 41.31, 3.95, 15.32, 42.63, 40.81, 20.77, 41.9, 5.65, 18.16],
      S1_O10: [10.36, 4.65, 9.27, 37.14, 11.18, 4.85, 39.61, 41.51, 17.18, 40.5, 6.69, 13.97],
    },
    omp: [['S1_O2', 6269.798055], ['S1_O5', 10210.673182], ['S1_O4', 11999.487718], ['S1_O8', 12243.294355], ['S1_O10', 13135.052264], ['S1_O6', 13176.645018], ['S1_O1', 13363.227764], ['S1_O9', 14949.933464], ['S1_O3', 16399.114918], ['S1_O7', 16660.112218]],
    ompL05K1: [['S1_O2', 262.589545], ['S1_O5', 285.974091], ['S1_O4', 306.299091], ['S1_O8', 307.010455], ['S1_O10', 321.577273], ['S1_O1', 329.654091], ['S1_O6', 336.468636], ['S1_O9', 342.330909], ['S1_O3', 354.674091], ['S1_O7', 382.335455]],
    sumOrder: ['S1_O2', 'S1_O5', 'S1_O8', 'S1_O4', 'S1_O10', 'S1_O1', 'S1_O6', 'S1_O9', 'S1_O3', 'S1_O7'],
  },];

const toRows = (km: Record<string, number[]>): RankInput[] => Object.entries(km).map(([id, v]) => ({ id, km: v }));

describe('T-123 omp: parity with backend ordered_median', () => {
  it('ranks the demo case like the backend `expected` block (order + psi within the 3-decimal rounding of the backend)', () => {
    const rows = demo.places.map((p) => ({ id: p.id, km: demo.members.map((m) => demo.trips[m.id][p.id].km) }));
    const got = rankByOmp(rows);
    expect(got.map((r) => r.id)).toEqual(demo.expected.omp.map((r) => r.placeId));
    got.forEach((r, i) => {
      expect(r.psi).toBeCloseTo(demo.expected.omp[i].psi, 2);
      expect(r.maxKm).toBeCloseTo(demo.expected.omp[i].maxKm, 2);
      expect(r.sumKm).toBeCloseTo(demo.expected.omp[i].sumKm, 2);
      expect(r.rank).toBe(i + 1);
    });
  });

  it('ranks the demo case by total km like the backend `expected` block', () => {
    const rows = demo.places.map((p) => ({ id: p.id, km: demo.members.map((m) => demo.trips[m.id][p.id].km) }));
    expect(rankBySum(rows).map((r) => r.id)).toEqual(demo.expected.sum.map((r) => r.placeId));
  });

  it('demo case: OMP proposes pizza, total km would propose haidilao', () => {
    const rows = demo.places.map((p) => ({ id: p.id, km: demo.members.map((m) => demo.trips[m.id][p.id].km) }));
    expect(rankByOmp(rows)[0].id).toBe('pizza');
    expect(rankBySum(rows)[0].id).toBe('haidilao');
  });

  describe.each(BACKEND_CASES)('hangout_20_cases K=1: $label', (c) => {
    it('default params (lambda 1, k 2): same order and psi as the backend', () => {
      const got = rankByOmp(toRows(c.km));
      expect(got.map((r) => r.id)).toEqual(c.omp.map(([id]) => id));
      got.forEach((r, i) => expect(r.psi).toBeCloseTo(c.omp[i][1], 6));
    });
    it('lambda 0.5, k 1: same order and psi as the backend', () => {
      const got = rankByOmp(toRows(c.km), { lambda: 0.5, k: 1 });
      expect(got.map((r) => r.id)).toEqual(c.ompL05K1.map(([id]) => id));
      got.forEach((r, i) => expect(r.psi).toBeCloseTo(c.ompL05K1[i][1], 6));
    });
    it('total-km order matches', () => {
      expect(rankBySum(toRows(c.km)).map((r) => r.id)).toEqual(c.sumOrder);
    });
  });
});

describe('T-123 omp: building blocks and tie rules', () => {
  it('penalty: d <= 0 is 0, k is floored at 1', () => {
    expect(penalty(-3, 2)).toBe(0);
    expect(penalty(0, 2)).toBe(0);
    expect(penalty(4, 2)).toBe(16);
    expect(penalty(4, 0.2)).toBe(4);
  });

  it('psi: single person has weight 1; weights grow with rank', () => {
    expect(psi([5], OMP_DEFAULT)).toBe(25);
    // [1, 3] -> c = [1, 9], w = [1, 2] -> 1 + 18
    expect(psi([3, 1], OMP_DEFAULT)).toBe(19);
    expect(psi([])).toBe(0);
  });

  it('negative lambda is treated as 0', () => {
    expect(psi([1, 3], { lambda: -2, k: 2 })).toBe(10);
  });

  it('ties on psi: smaller max km wins, then smaller total, then input order', () => {
    // k = 1, lambda = 0: psi = sum, so equal sums tie on psi
    const flat = { lambda: 0, k: 1 };
    const rows: RankInput[] = [
      { id: 'a', km: [10, 10] },
      { id: 'b', km: [12, 8] },
      { id: 'c', km: [10, 10] },
    ];
    expect(rankByOmp(rows, flat).map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(rankByOmp([...rows].reverse(), flat).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('total-km ranking: tie on total goes to smaller max km', () => {
    const rows: RankInput[] = [
      { id: 'wide', km: [12, 8] },
      { id: 'even', km: [10, 10] },
    ];
    expect(rankBySum(rows).map((r) => r.id)).toEqual(['even', 'wide']);
  });

  it('psi differences below 1e-9 count as a tie', () => {
    const rows: RankInput[] = [
      { id: 'x', km: [5, 7] },
      { id: 'y', km: [5, 7 + 1e-12] },
    ];
    expect(rankByOmp(rows).map((r) => r.id)).toEqual(['x', 'y']);
    expect(rankByOmp([...rows].reverse()).map((r) => r.id)).toEqual(['y', 'x']);
  });
});
