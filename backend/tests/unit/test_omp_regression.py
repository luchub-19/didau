"""T-94: hồi quy 20 case của Sơn (`hangout_20_cases.json`, nhánh `origin/feat/tie-breaker`, chép vào
`tests/fixtures/`). Toạ độ trong dataset là km trên mặt phẳng; dùng thẳng `dist_matrix` (KHÔNG đối xứng).

- OMP-R01: DP == thử hết (Ψ và tổ hợp) mọi case ≤ 60 000 tổ hợp, k = 1 và k = 1,5.
- OMP-R02: case 20 (3,3 × 10¹² tổ hợp) DP < 1 s.
- OMP-R03: Ψ của DP ổn định (số đã ghi ở docs/phase7/PROGRESS.md dòng T-94) — đổi lõi thì test này báo.
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


@pytest.mark.parametrize("k", [1.0, 1.5])
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
    assert round(solve_dp(members, stages, dist).psi, 3) == pytest.approx(PSI_K1[case["case_id"]], abs=1e-3)
