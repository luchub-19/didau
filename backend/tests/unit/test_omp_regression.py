"""T-94: hồi quy 20 case của Sơn (`hangout_20_cases.json`, nhánh `origin/feat/tie-breaker`, chép vào
`tests/fixtures/`). Toạ độ trong dataset là km trên mặt phẳng; dùng thẳng `dist_matrix` (KHÔNG đối xứng).

- OMP-R01: DP == thử hết (Ψ và tổ hợp) mọi case ≤ 60 000 tổ hợp, k = 1, 1,5 và 2 (mặc định T-99).
- OMP-R02: case 20 (3,3 × 10¹² tổ hợp) DP < 1 s.
- OMP-R03: Ψ của DP ổn định ở tham số của Sơn (λ = 0,5; k = 1 — bảng T-94 ở docs/phase7/PROGRESS.md) — đổi lõi thì báo.
- OMP-R04 (T-99, CR-16): Ψ ở mặc định mới (λ = 1; k = 2); so với (0,5; 1) chỉ đổi kết quả ở case 7, 11, 19 với đúng số km
  trong báo cáo của Bảo (2026-11-15).
"""

import json
import time
from pathlib import Path

import pytest

from app.core import algo_config as cfg
from app.domain.algorithms.ordered_median import combination_count, solve_brute, solve_dp

CASES = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "hangout_20_cases.json").read_text())

# Ψ (λ = 0,5) của DP, làm tròn 3 số — chạy 2026-11-15 (T-94)
PSI_K1 = {
    1: 83.017, 2: 173.26, 3: 57.685, 4: 74.633, 5: 132.525, 6: 96.093, 7: 244.754, 8: 362.309, 9: 172.253,
    10: 166.059, 11: 236.931, 12: 214.136, 13: 265.196, 14: 421.964, 15: 242.109, 16: 451.438, 17: 302.905,
    18: 192.881, 19: 138.37, 20: 424.789,
}

# Ψ (λ = 1; k = 2, mặc định T-99) của DP, làm tròn 3 số — chạy 2026-11-15. Đơn vị km² (k = 2).
PSI_DEFAULT = {
    1: 3282.537, 2: 8738.78, 3: 1705.479, 4: 1398.879, 5: 3306.768, 6: 2664.363, 7: 10712.562, 8: 26420.4,
    9: 5605.738, 10: 6091.946, 11: 7144.649, 12: 6382.921, 13: 7717.39, 14: 22061.548, 15: 5863.297, 16: 23753.545,
    17: 8480.484, 18: 4093.146, 19: 2331.432, 20: 19551.9,
}

# Báo cáo của Bảo §3: tổng km nhóm / km người xa nhất, (0,5; 1) → (1; 2)
CHANGED_VS_SON = {7: ((184.5, 49.9), (194.5, 44.9)), 11: ((179.6, 33.0), (193.2, 27.2)), 19: ((103.4, 25.0), (113.3, 18.4))}


def _problem(case: dict):
    m = case["dist_matrix"]
    members = [v["index"] for v in case["vertices"] if v["role"] == "person"]
    stages = [
        [v["index"] for v in case["vertices"] if v["role"] != "person" and v["stage"] == t]
        for t in range(1, case["num_stages"] + 1)
    ]
    return members, stages, lambda a, b: m[a][b]


def test_dataset_shape():
    assert len(CASES) == 20
    for c in CASES:
        members, stages, _ = _problem(c)
        assert len(members) == c["num_people"]
        assert [len(s) for s in stages] == c["options_per_stage"]
    asym = any(
        c["dist_matrix"][i][j] != c["dist_matrix"][j][i]
        for c in CASES
        for i in range(len(c["dist_matrix"]))
        for j in range(i)
    )
    assert asym  # dataset có đường một chiều: lõi phải hỏi đúng chiều


SMALL = [c for c in CASES if combination_count(_problem(c)[1]) <= cfg.OMP_BRUTE_LIMIT]


@pytest.mark.parametrize("k", [1.0, 1.5, 2.0])
@pytest.mark.parametrize("case", SMALL, ids=lambda c: f"case{c['case_id']}")
def test_omp_r01_dp_equals_brute(case, k):
    members, stages, dist = _problem(case)
    dp = solve_dp(members, stages, dist, k=k)
    bf = solve_brute(members, stages, dist, k=k)
    assert dp.combo == bf.combo
    assert dp.psi == pytest.approx(bf.psi, abs=1e-9)


def test_omp_r01_covers_the_expected_cases():
    assert sorted(c["case_id"] for c in SMALL) == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 19]


def test_omp_r02_case20_under_one_second():
    case = next(c for c in CASES if c["case_id"] == 20)
    members, stages, dist = _problem(case)
    assert combination_count(stages) > 3 * 10**12
    t0 = time.perf_counter()
    best = solve_dp(members, stages, dist)
    assert time.perf_counter() - t0 < 1.0
    assert len(best.combo) == 12


@pytest.mark.parametrize("case", CASES, ids=lambda c: f"case{c['case_id']}")
def test_omp_r03_psi_is_stable(case):
    members, stages, dist = _problem(case)
    psi = solve_dp(members, stages, dist, lam=0.5, k=1.0).psi
    assert round(psi, 3) == pytest.approx(PSI_K1[case["case_id"]], abs=1e-3)


def test_omp_r04_default_params_are_bao_recommendation():
    assert (cfg.OMP_LAMBDA, cfg.OMP_K) == (1.0, 2.0)


@pytest.mark.parametrize("case", CASES, ids=lambda c: f"case{c['case_id']}")
def test_omp_r04_psi_at_default_params(case):
    members, stages, dist = _problem(case)
    new = solve_dp(members, stages, dist)
    assert round(new.psi, 3) == pytest.approx(PSI_DEFAULT[case["case_id"]], abs=1e-3)
    old = solve_dp(members, stages, dist, lam=0.5, k=1.0)
    if case["case_id"] in CHANGED_VS_SON:
        (old_tot, old_max), (new_tot, new_max) = CHANGED_VS_SON[case["case_id"]]
        assert new.combo != old.combo
        assert (round(old.total_km, 1), round(old.max_km, 1)) == (old_tot, old_max)
        assert (round(new.total_km, 1), round(new.max_km, 1)) == (new_tot, new_max)
    else:
        assert new.combo == old.combo
