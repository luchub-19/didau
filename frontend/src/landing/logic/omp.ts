// Bản port Ordered Median (OMP) cho K = 1 — đúng backend/app/domain/algorithms/ordered_median.py và
// docs/phase7/ALGORITHMS.md §2–§3. Hàm thuần, không phụ thuộc DOM/mạng.
//   cᵢ = dᵢ^k (k ≥ 1; d ≤ 0 → 0) → sắp tăng → Ψ = Σ w_r · c₍r₎ với w_r = 1 + λ(r−1)/(N−1).
// Hoà (sai số 1e-9): Ψ → max d nhỏ hơn → Σ d nhỏ hơn → thứ tự đầu vào.

export interface OmpParams {
  lambda: number;
  k: number;
}

/** Mặc định của backend (algo_config: OMP_LAMBDA = 1, OMP_K = 2). */
export const OMP_DEFAULT: OmpParams = { lambda: 1, k: 2 };
export const PSI_EPS = 1e-9;

export interface RankInput {
  id: string;
  /** km khứ hồi của từng thành viên tới quán này. */
  km: readonly number[];
}

export interface RankedRow {
  id: string;
  /** Hạng bắt đầu từ 1 (1 = được đề xuất). */
  rank: number;
  psi: number;
  maxKm: number;
  sumKm: number;
}

export function penalty(km: number, k: number): number {
  if (km <= 0) return 0;
  return km ** Math.max(1, k);
}

export function ompWeights(n: number, lambda: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const lam = Math.max(0, lambda);
  return Array.from({ length: n }, (_, r) => 1 + (lam * r) / (n - 1));
}

/** Ψ của một quán: `km` là km khứ hồi của từng người. */
export function psi(km: readonly number[], p: OmpParams = OMP_DEFAULT): number {
  const costs = km.map((d) => penalty(d, p.k)).sort((a, b) => a - b);
  const w = ompWeights(costs.length, p.lambda);
  let total = 0;
  for (let i = 0; i < costs.length; i++) total += w[i] * costs[i];
  return total;
}

function cmp(a: number, b: number): number {
  if (a < b - PSI_EPS) return -1;
  if (a > b + PSI_EPS) return 1;
  return 0;
}

interface Scored {
  id: string;
  order: number;
  psi: number;
  maxKm: number;
  sumKm: number;
}

function score(rows: readonly RankInput[], p: OmpParams): Scored[] {
  return rows.map((r, order) => ({
    id: r.id,
    order,
    psi: psi(r.km, p),
    maxKm: r.km.length ? Math.max(...r.km) : 0,
    sumKm: r.km.reduce((s, d) => s + d, 0),
  }));
}

function finish(sorted: Scored[]): RankedRow[] {
  return sorted.map((s, i) => ({ id: s.id, rank: i + 1, psi: s.psi, maxKm: s.maxKm, sumKm: s.sumKm }));
}

/** Xếp quán theo OMP, tốt → kém. */
export function rankByOmp(rows: readonly RankInput[], p: OmpParams = OMP_DEFAULT): RankedRow[] {
  const sorted = score(rows, p).sort(
    (a, b) => cmp(a.psi, b.psi) || cmp(a.maxKm, b.maxKm) || cmp(a.sumKm, b.sumKm) || a.order - b.order,
  );
  return finish(sorted);
}

/** Xếp theo tổng km ("Cộng tổng km"); hoà → max nhỏ hơn → thứ tự đầu vào. Ψ vẫn được tính để hiển thị. */
export function rankBySum(rows: readonly RankInput[], p: OmpParams = OMP_DEFAULT): RankedRow[] {
  const sorted = score(rows, p).sort(
    (a, b) => cmp(a.sumKm, b.sumKm) || cmp(a.maxKm, b.maxKm) || a.order - b.order,
  );
  return finish(sorted);
}
