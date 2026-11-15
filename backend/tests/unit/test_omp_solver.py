"""T-94: bộ giải OMP — chuyển từ `test_solver.py`, `test_service.py`, `test_router.py` (phần không mạng) của Sơn,
cộng DP == thử hết trên dữ liệu ngẫu nhiên, phá hoà §3, hoán vị đầu vào, N = 1 (ALGORITHMS gđ7 §3–§4, §8).

Khác Sơn: không có router/OSRM — khoảng cách là hàm truyền vào; ở đây dùng `HaversineTravelEstimator`
(× `DETOUR_FACTOR` = 1,3, Sơn dùng 1,35). Mã test: OMP-S01 … OMP-S12.
"""

import itertools
import random
from datetime import datetime

import pytest

from app.core import algo_config as cfg
from app.domain.algorithms.ordered_median import (
    combination_count,
    evaluate,
    rank_candidates,
    solve_brute,
    solve_dp,
)
from app.domain.patterns.itinerary.travel import (
    CachedEstimator,
    HaversineTravelEstimator,
    ITravelTimeEstimator,
    Leg,
    TravelSource,
    haversine_distance_km,
)

EST = HaversineTravelEstimator()


def geo_dist(coords: dict[str, tuple[float, float]]):
    return lambda a, b: EST.leg(coords[a], coords[b]).distance_km


# ── Sơn: TestItinerarySolver (P1, P2 ở Bình Thạnh; P3 lạc ở Q7) ─────────────────────────────────
SOLVER_COORDS = {
    "p1": (10.8000, 106.7000),
    "p2": (10.8050, 106.7020),
    "p3": (10.7300, 106.7100),
    "cand_north": (10.8020, 106.7010),
    "cand_center": (10.7700, 106.7050),
}


def test_omp_s01_minsum_prefers_cluster():
    """λ = 0, k = 1: cụm đông người (P1, P2) quyết định → quán phía Bắc."""
    dist = geo_dist(SOLVER_COORDS)
    stages = [["cand_north", "cand_center"]]
    best = solve_dp(["p1", "p2", "p3"], stages, dist, lam=0.0, k=1.0)
    assert best.combo == ("cand_north",)
    assert combination_count(stages) == 2


def test_omp_s02_fairness_protects_outlier():
    """k = 2, λ = 1,5: phạt bình phương người lạc → quán ở giữa thắng."""
    best = solve_dp(["p1", "p2", "p3"], [["cand_north", "cand_center"]], geo_dist(SOLVER_COORDS), lam=1.5, k=2.0)
    assert best.combo == ("cand_center",)


def test_omp_s03_end_to_end_two_people_one_stage():
    """Sơn: test_end_to_end_resolution — 2 người, 1 chặng 2 quán, mặc định λ 0,5 k 1."""
    coords = {
        "u1": (10.7769, 106.7009),
        "u2": (10.7550, 106.6660),
        "c1": (10.7720, 106.6980),
        "c2": (10.7520, 106.6600),
    }
    ranked = rank_candidates(["u1", "u2"], ["c1", "c2"], geo_dist(coords))
    assert len(ranked) == 2 and ranked[0].psi > 0.0
    assert len(ranked[0].distances) == 2
    assert ranked[0].psi <= ranked[1].psi


# ── Sơn: test_router (phần không mạng) ─────────────────────────────────────────────────────────────
def test_omp_s04_haversine_known_pair_and_same_point():
    d = haversine_distance_km(10.7797, 106.6990, 10.7725, 106.6980)
    assert 0.6 < d < 1.2
    assert haversine_distance_km(10.7769, 106.7009, 10.7769, 106.7009) == 0.0


def test_omp_s05_fallback_is_haversine_times_detour():
    leg = EST.leg((10.7700, 106.6900), (10.7800, 106.7000))
    assert leg.source is TravelSource.ESTIMATE
    assert leg.distance_km == pytest.approx(
        haversine_distance_km(10.77, 106.69, 10.78, 106.70) * cfg.DETOUR_FACTOR, abs=1e-12
    )


class _GoogleLike(ITravelTimeEstimator):
    def __init__(self) -> None:
        self.calls = 0

    def leg(self, a, b, depart_at: datetime | None = None) -> Leg:
        return Leg(5, 1.234, TravelSource.ESTIMATE)

    async def amatrix(self, origins, dests, depart_at=None):
        self.calls += 1
        return [[Leg(7, 2.5, TravelSource.GOOGLE) for _ in dests] for _ in origins]


async def test_omp_s06_memory_cache_hits_second_time():
    inner = _GoogleLike()
    cached = CachedEstimator(inner)
    a, b = (10.77, 106.69), (10.78, 106.70)
    first = await cached.amatrix([a], [b])
    assert inner.calls == 1 and first[0][0].distance_km == 2.5
    assert cached.leg(a, b).source is TravelSource.GOOGLE  # đồng bộ đọc được từ cache
    await cached.amatrix([a], [b])
    assert inner.calls == 1


# ── DP == thử hết, phá hoà, hoán vị ────────────────────────────────────────────────────────────────
def _random_instance(rng: random.Random, n: int, sizes: list[int], *, grid: bool):
    members = [f"m{i}" for i in range(n)]
    stages = [[f"s{t}o{j}" for j in range(m)] for t, m in enumerate(sizes)]
    nodes = members + [o for s in stages for o in s]
    # grid=True: km nguyên nhỏ → nhiều hoà thật, ép phá hoà §3 phải khớp giữa hai bộ giải
    table = {
        (a, b): float(rng.randint(1, 4)) if grid else round(rng.uniform(0.5, 20.0), 2)
        for a in nodes
        for b in nodes
        if a != b
    }
    return members, stages, lambda a, b: table[a, b]


@pytest.mark.parametrize("grid", [False, True], ids=["real", "ties"])
@pytest.mark.parametrize("k", [1.0, 1.5, 2.0])
def test_omp_s07_dp_equals_brute_random(grid, k):
    rng = random.Random(2026 + int(k * 10) + grid)
    for _ in range(60):
        n = rng.randint(1, 5)
        sizes = [rng.randint(1, 4) for _ in range(rng.randint(1, 4))]
        members, stages, dist = _random_instance(rng, n, sizes, grid=grid)
        for lam in (0.0, 0.5, 2.0):
            dp = solve_dp(members, stages, dist, lam=lam, k=k)
            bf = solve_brute(members, stages, dist, lam=lam, k=k)
            assert dp.combo == bf.combo
            assert dp.psi == pytest.approx(bf.psi, abs=1e-9)


def test_omp_s08_tie_break_order_psi_max_sum_then_key():
    """§3: Ψ bằng → max dᵢ nhỏ hơn; còn bằng → Σ nhỏ hơn; còn bằng → khoá (created_at) nhỏ hơn.

    Số tính tay ở tham số của Sơn (λ = 0,5; k = 1) — luật phá hoà không phụ thuộc tham số."""
    # Hai người, một chiều đi = về: d = 2 × km
    km = {
        ("a", "far"): 0.5, ("b", "far"): 2.5,  # d = [1, 5]: Ψ = 1 + 1,5·5 = 8,5, max 5
        ("a", "fair"): 1.25, ("b", "fair"): 2.0,  # d = [2,5; 4]: Ψ = 2,5 + 6 = 8,5, max 4
    }
    dist = lambda x, y: km.get((x, y), km.get((y, x)))
    ranked = rank_candidates(["a", "b"], ["far", "fair"], dist, lam=0.5, k=1.0)
    assert [e.combo[0] for e in ranked] == ["fair", "far"]
    assert ranked[0].psi == pytest.approx(ranked[1].psi, abs=1e-12)

    same = {("a", "x"): 1.0, ("b", "x"): 2.0, ("a", "y"): 1.0, ("b", "y"): 2.0}
    d2 = lambda x, y: same.get((x, y), same.get((y, x)))
    order = {"x": 2, "y": 1}  # y thêm sớm hơn
    ranked = rank_candidates(["a", "b"], ["x", "y"], d2, tie_key=lambda o: (order[o], o))
    assert [e.combo[0] for e in ranked] == ["y", "x"]


def test_omp_s09_input_order_does_not_change_result():
    rng = random.Random(7)
    members, stages, dist = _random_instance(rng, 4, [3, 3, 2], grid=True)
    base = solve_dp(members, stages, dist)
    for perm_m in itertools.permutations(members):
        shuffled = [rng.sample(s, len(s)) for s in stages]
        got = solve_dp(list(perm_m), shuffled, dist)
        assert got.combo == base.combo and got.psi == pytest.approx(base.psi, abs=1e-12)


def test_omp_s10_single_member_and_single_option():
    dist = lambda a, b: 3.0
    ev = solve_dp(["solo"], [["only"]], dist, k=1.0)
    assert ev.combo == ("only",) and ev.distances == (6.0,) and ev.psi == 6.0
    assert evaluate(["solo"], ["only"], dist, k=1.0).psi == 6.0
    assert solve_dp(["solo"], [["only"]], dist).psi == pytest.approx(6.0**cfg.OMP_K)  # N = 1 → w = 1, Ψ = d^k


def test_omp_s11_asymmetric_distance_is_respected():
    """Không giả định đối xứng: đi 2 về 6 (X) tệ hơn đi 4 về 3 (Y)."""
    km = {("a", "x"): 2, ("x", "a"): 6, ("a", "y"): 4, ("y", "a"): 3}
    ranked = rank_candidates(["a"], ["x", "y"], lambda p, q: km[p, q])
    assert [e.combo[0] for e in ranked] == ["y", "x"]
    assert [e.distances[0] for e in ranked] == [7, 8]


def test_omp_s12_invalid_inputs_raise():
    dist = lambda a, b: 1.0
    with pytest.raises(ValueError):
        solve_dp([], [["x"]], dist)
    with pytest.raises(ValueError):
        solve_dp(["a"], [], dist)
    with pytest.raises(ValueError):
        solve_dp(["a"], [["x"], []], dist)
    with pytest.raises(ValueError):
        solve_brute(["a"], [["x"] * 300, ["y"] * 300], dist)  # 90 000 > trần 60 000
