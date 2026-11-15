"""Ordered Median (OMP) của Sơn + bộ giải quy hoạch động (docs/phase7/ALGORITHMS.md §2–§4).

Hàm thuần: không DB, không mạng, KHÔNG nhận lat/lng — chỉ nhận hàm khoảng cách một chiều `dist(a, b)` (km, có thể
không đối xứng: luôn hỏi đúng chiều). Nút là bất kỳ giá trị hashable nào: thành viên và quán dùng chung một hàm.

Mô hình (đúng như `tiebreak_engine/core` của Sơn, nhánh `origin/feat/tie-breaker`):
- lộ trình người i với tổ hợp (s₁, …, s_K): `dᵢ = d(Aᵢ, s₁) + Σₜ d(sₜ, sₜ₊₁) + d(s_K, Aᵢ)`;
- tầng 1 `cᵢ = dᵢ^k` (k ≥ 1; d ≤ 0 → 0); tầng 2 sắp c tăng dần, `Ψ = Σ_r w_r · c₍r₎`, `w_r = 1 + λ·(r−1)/(N−1)`;
- chọn Ψ nhỏ nhất; hoà Ψ (sai số 1e-9) → max dᵢ → Σ dᵢ → bộ khoá phụ (created_at) → bộ id (§3, Sơn chưa có).

Lệch nhỏ có chủ ý so với code Sơn: KHÔNG làm tròn w (Sơn làm tròn 4 số) và dᵢ (Sơn làm tròn 3 số) trước khi tính Ψ —
làm tròn chỉ ở đầu ra. Lý do: làm tròn có thể gộp hai độ dài đoạn giữa khác nhau thành một, làm DP (chỉ giữ đoạn giữa
ngắn nhất) và thử hết phá hoà khác nhau. Với số km thật, chênh Ψ < 0,001.
"""

import functools
import itertools
import math
from collections.abc import Callable, Hashable, Sequence
from dataclasses import dataclass
from typing import Any

from app.core import algo_config as cfg

Dist = Callable[[Any, Any], float]
TieKey = Callable[[Any], tuple[Any, Any]]


def _default_tie_key(option: Any) -> tuple[Any, Any]:
    return (option, str(option))


# ── Tầng 1 + tầng 2 (scoring_formula.py, ordered_median.py của Sơn) ──────────────────────────────
def penalty(distance_km: float, k: float = cfg.OMP_K) -> float:
    """`c = d^k`, k chặn dưới 1 (để không đảo chiều phạt); d ≤ 0 → 0."""
    if distance_km <= 0.0:
        return 0.0
    return float(distance_km ** max(1.0, float(k)))


def omp_weights(n: int, lam: float = cfg.OMP_LAMBDA) -> list[float]:
    """Vector trọng số theo thứ hạng (gần → xa): `w_r = 1 + λ·(r−1)/(N−1)`; N = 1 → [1]; λ < 0 coi là 0."""
    if n <= 0:
        return []
    if n == 1:
        return [1.0]
    lam = max(0.0, float(lam))
    return [1.0 + lam * r / (n - 1) for r in range(n)]


def psi(costs: Sequence[float], weights: Sequence[float]) -> float:
    """`Ψ = Σ w_r · c₍r₎` với c sắp tăng dần. Lệch độ dài → ValueError (như Sơn)."""
    if len(costs) != len(weights):
        raise ValueError(f"Lệch kích thước: {len(costs)} chi phí nhưng {len(weights)} trọng số.")
    return sum(w * c for w, c in zip(weights, sorted(costs), strict=True))


def rank_order(costs: Sequence[float]) -> list[int]:
    """Chỉ số gốc theo thứ hạng chi phí tăng dần (hạng 1 = gần nhất); bằng nhau giữ thứ tự đầu vào."""
    return sorted(range(len(costs)), key=lambda i: costs[i])


# ── Kết quả một tổ hợp ──────────────────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class OmpEval:
    """Đánh giá một tổ hợp. `distances[i]` ứng với `members[i]` của đầu vào (km khứ hồi, chưa làm tròn)."""

    combo: tuple[Any, ...]
    psi: float
    distances: tuple[float, ...]
    costs: tuple[float, ...]
    tie_key: tuple[tuple[Any, ...], tuple[Any, ...]]

    @property
    def max_km(self) -> float:
        return max(self.distances) if self.distances else 0.0

    @property
    def total_km(self) -> float:
        return sum(self.distances)


def _cmp_float(a: float, b: float, eps: float) -> int:
    if a < b - eps:
        return -1
    if a > b + eps:
        return 1
    return 0


def compare(a: OmpEval, b: OmpEval, eps: float = cfg.OMP_PSI_EPS) -> int:
    """Thứ tự §3: Ψ → max dᵢ → Σ dᵢ → bộ created_at → bộ id. Âm = a tốt hơn."""
    for x, y in ((a.psi, b.psi), (a.max_km, b.max_km), (a.total_km, b.total_km)):
        c = _cmp_float(x, y, eps)
        if c:
            return c
    if a.tie_key < b.tie_key:
        return -1
    if a.tie_key > b.tie_key:
        return 1
    return 0


def _combo_key(combo: Sequence[Any], tie_key: TieKey) -> tuple[tuple[Any, ...], tuple[Any, ...]]:
    keys = [tie_key(o) for o in combo]
    return tuple(k[0] for k in keys), tuple(k[1] for k in keys)


def _evaluate_with_middle(
    members: Sequence[Any],
    combo: tuple[Any, ...],
    middle_km: float,
    dist: Dist,
    weights: Sequence[float],
    k: float,
    tie_key: TieKey,
) -> OmpEval:
    first, last = combo[0], combo[-1]
    distances = tuple(dist(m, first) + middle_km + dist(last, m) for m in members)
    costs = tuple(penalty(d, k) for d in distances)
    return OmpEval(combo, psi(costs, weights), distances, costs, _combo_key(combo, tie_key))


def _middle_km(combo: Sequence[Any], dist: Dist) -> float:
    total = 0.0
    for a, b in itertools.pairwise(combo):
        total += dist(a, b)
    return total


def evaluate(
    members: Sequence[Any],
    combo: Sequence[Any],
    dist: Dist,
    *,
    lam: float = cfg.OMP_LAMBDA,
    k: float = cfg.OMP_K,
    tie_key: TieKey = _default_tie_key,
) -> OmpEval:
    """Ψ của một tổ hợp `Nhà → s₁ → … → s_K → Nhà` cho mọi thành viên."""
    if not members:
        raise ValueError("Cần ít nhất một thành viên.")
    if not combo:
        raise ValueError("Cần ít nhất một chặng.")
    combo_t = tuple(combo)
    return _evaluate_with_middle(
        members, combo_t, _middle_km(combo_t, dist), dist, omp_weights(len(members), lam), k, tie_key
    )


def _check(members: Sequence[Any], stages: Sequence[Sequence[Any]]) -> None:
    if not members:
        raise ValueError("Cần ít nhất một thành viên.")
    if not stages:
        raise ValueError("Cần ít nhất một chặng.")
    for t, options in enumerate(stages, start=1):
        if not options:
            raise ValueError(f"Chặng {t} không có quán ứng viên nào.")


def rank_candidates(
    members: Sequence[Any],
    candidates: Sequence[Any],
    dist: Dist,
    *,
    lam: float = cfg.OMP_LAMBDA,
    k: float = cfg.OMP_K,
    tie_key: TieKey = _default_tie_key,
) -> list[OmpEval]:
    """K = 1 (MVP): xếp hạng mọi ứng viên của một chặng, tốt → kém theo §3. O(M·N log N)."""
    _check(members, [candidates])
    weights = omp_weights(len(members), lam)
    evals = [_evaluate_with_middle(members, (c,), 0.0, dist, weights, k, tie_key) for c in candidates]
    return sorted(evals, key=functools.cmp_to_key(compare))


def combination_count(stages: Sequence[Sequence[Any]]) -> int:
    return math.prod(len(s) for s in stages)


def solve_brute(
    members: Sequence[Any],
    stages: Sequence[Sequence[Any]],
    dist: Dist,
    *,
    lam: float = cfg.OMP_LAMBDA,
    k: float = cfg.OMP_K,
    tie_key: TieKey = _default_tie_key,
    limit: int = cfg.OMP_BRUTE_LIMIT,
) -> OmpEval:
    """Thử hết mọi tổ hợp (`itertools.product`, như Sơn) — chỉ để đối chiếu DP; quá `limit` tổ hợp → ValueError."""
    _check(members, stages)
    if combination_count(stages) > limit:
        raise ValueError(f"Quá {limit} tổ hợp, không thử hết.")
    weights = omp_weights(len(members), lam)
    best: OmpEval | None = None
    for combo in itertools.product(*stages):
        ev = _evaluate_with_middle(members, combo, _middle_km(combo, dist), dist, weights, k, tie_key)
        if best is None or compare(ev, best) < 0:
            best = ev
    assert best is not None
    return best


def solve_dp(
    members: Sequence[Any],
    stages: Sequence[Sequence[Hashable]],
    dist: Dist,
    *,
    lam: float = cfg.OMP_LAMBDA,
    k: float = cfg.OMP_K,
    tie_key: TieKey = _default_tie_key,
    eps: float = cfg.OMP_PSI_EPS,
) -> OmpEval:
    """DP theo lớp (báo cáo Bảo, phụ lục B). Với mỗi s₁: `chain[t][v] = min_u chain[t−1][u] + d(u, v)` có truy vết.

    Đúng vì đoạn giữa cộng CÙNG số km cho mọi người và Ψ không giảm theo từng dᵢ (w ≥ 0, k ≥ 1): với (s₁, s_K) cố
    định, đoạn giữa ngắn nhất luôn tối ưu. Hai chuỗi giữa dài bằng nhau → giữ chuỗi có bộ khoá (created_at, id) nhỏ
    hơn — cùng thứ tự §3 với thử hết, nên kết quả trùng cả tổ hợp. Đoạn giữa cộng trái → phải như thử hết nên số
    thực trùng từng bit. O(M₁·Σₜ Mₜ·Mₜ₊₁·K + M₁·M_K·N log N).
    """
    _check(members, stages)
    weights = omp_weights(len(members), lam)
    keys = [[tie_key(o) for o in options] for options in stages]
    best: OmpEval | None = None
    for i1 in range(len(stages[0])):
        # chain: chỉ số quán ở chặng hiện tại → (km đoạn giữa, đường đi theo chỉ số)
        chain: dict[int, tuple[float, tuple[int, ...]]] = {i1: (0.0, (i1,))}
        for t in range(1, len(stages)):
            nxt: dict[int, tuple[float, tuple[int, ...]]] = {}
            for iv, v in enumerate(stages[t]):
                pick: tuple[float, tuple[int, ...]] | None = None
                for iu, (du, path) in chain.items():
                    cand = (du + dist(stages[t - 1][iu], v), (*path, iv))
                    if pick is None:
                        pick = cand
                        continue
                    c = _cmp_float(cand[0], pick[0], eps)
                    if c < 0 or (c == 0 and _path_key(cand[1], keys) < _path_key(pick[1], keys)):
                        pick = cand
                assert pick is not None
                nxt[iv] = pick
            chain = nxt
        for middle, path in chain.values():
            combo = tuple(stages[t][i] for t, i in enumerate(path))
            ev = _evaluate_with_middle(members, combo, middle, dist, weights, k, tie_key)
            if best is None or compare(ev, best, eps) < 0:
                best = ev
    assert best is not None
    return best


def _path_key(path: Sequence[int], keys: list[list[tuple[Any, Any]]]) -> tuple[tuple[Any, ...], tuple[Any, ...]]:
    ks = [keys[t][i] for t, i in enumerate(path)]
    return tuple(x[0] for x in ks), tuple(x[1] for x in ks)
