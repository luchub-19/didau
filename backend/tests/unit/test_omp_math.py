"""T-94: tầng 1 + tầng 2 của OMP — chuyển từ `tiebreak_engine/tests/test_math.py` của Sơn (nhánh
`origin/feat/tie-breaker`), cộng ca trọng số chung với `docs/phase6/algo-fixtures.json` (mục `tie_break`).

Mã test: OMP-M01 … OMP-M08 (chép vào báo cáo).
"""

import itertools
import json
import math
from pathlib import Path

import pytest

from app.domain.algorithms.ordered_median import omp_weights, penalty, psi, rank_order

FX = json.loads(
    (Path(__file__).resolve().parents[3] / "docs" / "phase6" / "algo-fixtures.json").read_text(
        encoding="utf-8"
    )
)["tie_break"]


# ── Tầng 1: phạt cá nhân (Sơn: TestScoringFormula) ──────────────────────────────────────────────
def test_omp_m01_penalty_linear():
    """k = 1 giữ nguyên km."""
    assert penalty(0.0, 1.0) == 0.0
    assert penalty(10.5, 1.0) == 10.5


def test_omp_m02_penalty_polynomial():
    """k = 2 bình phương."""
    assert penalty(4.0, 2.0) == 16.0
    assert penalty(5.0, 2.0) == 25.0


def test_omp_m03_penalty_non_positive_and_k_below_one():
    """d ≤ 0 → 0; k < 1 bị chặn về 1 (không đảo chiều phạt)."""
    assert penalty(-5.0, 1.5) == 0.0
    assert penalty(9.0, 0.5) == 9.0


# ── Tầng 2: trọng số + Ψ (Sơn: test_weights_*, TestOrderedMedianAggregator) ────────────────────
def test_omp_m04_weights_minsum():
    """λ = 0 → toàn 1 (MinSum)."""
    assert omp_weights(5, 0.0) == [1.0] * 5


def test_omp_m05_weights_fairness_progression():
    """λ = 1, N = 4: w₁ = 1, w₄ = 2, không giảm."""
    w = omp_weights(4, 1.0)
    assert len(w) == 4 and w[0] == 1.0 and w[-1] == 2.0
    assert all(a <= b for a, b in itertools.pairwise(w))


@pytest.mark.parametrize("case", FX["weights_cases"], ids=lambda c: f"n{c['n']}-l{c['lambda']}")
def test_omp_m06_weights_shared_fixture(case):
    assert omp_weights(case["n"], case["lambda"]) == pytest.approx(case["expect"], abs=1e-9)


def test_omp_m06b_weights_edge_sizes():
    assert omp_weights(0) == [] and omp_weights(1) == [1.0]
    assert omp_weights(3, -2.0) == [1.0, 1.0, 1.0]  # λ âm coi là 0


def test_omp_m07_psi_sorts_then_dots():
    """Ψ = 10·1 + 20·1,5 + 30·2 = 100; hạng theo chi phí tăng dần."""
    costs = [30.0, 10.0, 20.0]
    assert math.isclose(psi(costs, [1.0, 1.5, 2.0]), 100.0, rel_tol=1e-12)
    assert rank_order(costs) == [1, 2, 0]


def test_omp_m08_psi_dimension_mismatch():
    with pytest.raises(ValueError):
        psi([10.0, 20.0], [1.0, 1.5, 2.0])
