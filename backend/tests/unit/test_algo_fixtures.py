"""Đọc `docs/phase6/algo-fixtures.json` và kiểm các số chia sẻ với frontend (T-84).

Phần ước lượng chạy bằng code thật (`HaversineTravelEstimator`). Các phần ALGO-01…04 ở đây là bản tham chiếu tối
thiểu theo ALGORITHMS.md để chứng minh fixture tự nhất quán (code thật chạy ở test_algo_t86/t87). Mục `tie_break`
theo OMP gđ7 (docs/phase7/ALGORITHMS.md, T-94).
"""

import json
import math
from datetime import date
from pathlib import Path

import pytest

from app.core import algo_config as cfg
from app.domain.patterns.itinerary import HaversineTravelEstimator, TravelSource

FIXTURE = Path(__file__).resolve().parents[3] / "docs" / "phase6" / "algo-fixtures.json"
FX = json.loads(FIXTURE.read_text(encoding="utf-8"))
PTS = FX["points"]
TOL = FX["_meta"]["tolerance"]


def coord(ref) -> tuple[float, float]:
    p = PTS[ref] if isinstance(ref, str) else ref
    return p["lat"], p["lng"]


def margin(eta: int, end_curr_min: int, on: date) -> int:
    """Biên dự phòng ALGO-03 (§5)."""
    peak = cfg.PEAK_START_MIN <= end_curr_min < cfg.PEAK_END_MIN and on.weekday() < 5
    ratio = cfg.PEAK_MARGIN_RATIO if peak else cfg.OFFPEAK_MARGIN_RATIO
    return max(cfg.MARGIN_MIN, math.ceil(round(eta * ratio, 6)))


def omp_reference(
    round_trip: dict[str, list[float]], created: dict[str, int], params: dict | None = None
) -> tuple[list[str], dict[str, float]]:
    """Bản tham chiếu tối thiểu của OMP gđ7 (độc lập với `ordered_median.py`): cᵢ = dᵢ^k, λ, k theo `params`
    (mặc định = `algo_config`, T-99: λ = 1, k = 2)."""
    lam = params["lambda"] if params else cfg.OMP_LAMBDA
    k = params["k"] if params else cfg.OMP_K
    n = len(next(iter(round_trip.values())))
    w = [1.0] if n == 1 else [1 + lam * r / (n - 1) for r in range(n)]
    psi = {j: sum(a * b**k for a, b in zip(w, sorted(d), strict=True)) for j, d in round_trip.items()}
    ranking = sorted(
        round_trip,
        key=lambda j: (round(psi[j], 9), round(max(round_trip[j]), 9), round(sum(round_trip[j]), 9), created[j]),
    )
    return ranking, psi


def test_constants_in_fixture_match_algo_config():
    for name, value in FX["_meta"]["constants"].items():
        assert getattr(cfg, name) == value, name
    assert FX["tie_break"]["params"] == {"lambda": cfg.OMP_LAMBDA, "k": cfg.OMP_K}


@pytest.mark.parametrize("case", FX["estimate"], ids=lambda c: c["id"])
def test_estimate_cases(case):
    leg = HaversineTravelEstimator().leg(coord(case["from"]), coord(case["to"]))
    exp = case["expect"]
    assert leg.minutes == exp["minutes"]
    assert leg.distance_km == pytest.approx(exp["distance_km"], abs=TOL["distance_km"])
    assert leg.source is TravelSource(exp["source"])


def test_group_center_matches_fixture():
    g = FX["group_center"]
    xs = ys = zs = 0.0
    for m in g["members"]:
        phi, lam = (math.radians(v) for v in coord(m))
        xs += math.cos(phi) * math.cos(lam)
        ys += math.cos(phi) * math.sin(lam)
        zs += math.sin(phi)
    lat = math.degrees(math.atan2(zs, math.hypot(xs, ys)))
    lng = math.degrees(math.atan2(ys, xs))
    assert lat == pytest.approx(g["expect"]["lat"], abs=TOL["center_deg"])
    assert lng == pytest.approx(g["expect"]["lng"], abs=TOL["center_deg"])
    assert len(g["members"]) == g["expect"]["member_count"]


def _km_case(places: list[dict]) -> tuple[dict[str, list[float]], dict[str, int]]:
    rt = {p["id"]: [a + b for a, b in zip(p["km_to"], p["km_back"], strict=True)] for p in places}
    return rt, {p["id"]: p["created_order"] for p in places}


def test_tie_break_doc_case_by_km():
    """TC-04 (gđ7): km khứ hồi bằng ước lượng thật từ toạ độ fixture, Ψ theo bản tham chiếu."""
    case = FX["tie_break"]["doc_case"]
    est = HaversineTravelEstimator()
    exp = case["expect"]
    rt = {}
    for p in case["places"]:
        dest = (p["lat"], p["lng"])
        rt[p["id"]] = [est.leg(coord(m), dest).distance_km + est.leg(dest, coord(m)).distance_km for m in case["members"]]
        assert rt[p["id"]] == pytest.approx(exp["round_trip_km"][p["id"]], abs=TOL["distance_km"])
    ranking, psi = omp_reference(rt, {p["id"]: p["created_order"] for p in case["places"]})
    assert ranking == exp["ranking"] and ranking[0] == exp["recommended_place_id"]
    assert psi == pytest.approx(exp["psi"], abs=TOL["distance_km"])
    assert psi[ranking[1]] == pytest.approx(exp["runner_up_psi"], abs=TOL["distance_km"])


def test_tie_break_km_cases():
    ties = FX["tie_break"]["psi_ties"]
    groups = [(FX["tie_break"]["asymmetric"], None), *((g, ties["params"]) for g in ties["groups"])]
    for g, params in groups:
        rt, created = _km_case(g["places"])
        ranking, psi = omp_reference(rt, created, params)
        assert ranking == g["expect"]["ranking"]
        for j, v in g["expect"].get("psi", {}).items():
            assert psi[j] == pytest.approx(v, abs=1e-9)


@pytest.mark.parametrize("case", FX["margin"]["cases"], ids=lambda c: c["id"])
def test_margin_cases(case):
    on = date.fromisoformat(case["date"])
    assert margin(case["eta_min"], case["end_curr_min"], on) == case["expect_margin"]


def _risk(gap: int, eta: int, slack: int) -> str:
    return "SAFE" if slack >= 0 else ("SOFT_CONFLICT" if gap >= eta else "HIGH_RISK")


@pytest.mark.parametrize("case", FX["slack"]["cases"], ids=lambda c: c["id"])
def test_slack_cases(case):
    required = case["eta_min"] + case["margin_min"] + cfg.BUFFER_MIN
    slack = case["gap_min"] - required
    exp = case["expect"]
    assert (required, slack) == (exp["required_min"], exp["slack_min"])
    assert _risk(case["gap_min"], case["eta_min"], slack) == exp["risk"]


def test_feasibility_case():
    f = FX["slack"]["feasibility"]
    window = f["window"]["end_minute"] - f["window"]["start_minute"]
    required = sum(f["durations_min"]) + sum(
        leg["eta"] + leg["margin"] + cfg.BUFFER_MIN for leg in f["legs"]
    )
    assert required == f["expect"]["required_total_min"]
    assert window - required == f["expect"]["buffer_total_min"]
    assert (window - required >= 0) is f["expect"]["is_feasible"]


@pytest.mark.parametrize("case", FX["slack"]["doc_tc05_tc06"]["cases"], ids=lambda c: c["id"])
def test_doc_tc05_tc06(case):
    slack = case["gap_min"] - case["required_min"]
    assert slack == case["expect"]["slack_min"]
    assert _risk(case["gap_min"], case["eta_min"], slack) == case["expect"]["risk"]


@pytest.mark.parametrize("case", FX["priority"]["required_cases"], ids=lambda c: c["id"])
def test_priority_required_cases(case):
    room, exp = case["room"], case["expect"]
    start, end = room["start_minute"], room["end_minute"]
    available = max(0, min(end, case["close_minute"]) - max(start, case["open_minute"]))
    assert available == exp["available_min"]
    if available == 0:
        assert exp["risk"] == "HIGH_RISK"
        return
    m = margin(case["max_eta_min"], start, date.fromisoformat(room["date"]))
    required = cfg.DEFAULT_ACTIVITY_MIN + case["max_eta_min"] + m + cfg.BUFFER_MIN
    slack = available - required
    risk = (
        "HIGH_RISK"
        if slack < cfg.HIGH_RISK_SLACK_MIN
        else "SOFT_CONFLICT"
        if slack < 0
        else "SAFE"
    )
    assert (m, required, slack, risk) == (
        exp["margin_min"],
        exp["required_min"],
        exp["slack_min"],
        exp["risk"],
    )


@pytest.mark.parametrize("case", FX["priority"]["ordering_cases"], ids=lambda c: c["id"])
def test_priority_ordering_cases(case):
    rank = {"SAFE": 0, "SOFT_CONFLICT": 1, "HIGH_RISK": 2}
    ordered = sorted(
        case["places"],
        key=lambda p: (rank[p["risk"]], -p["upvotes"], -p["slack_min"], p["max_eta_min"], p["created_order"]),
    )
    assert [p["id"] for p in ordered] == case["expect"]["order"]
    labels = case["expect"].get("labels")
    if labels:
        top_votes = max(p["upvotes"] for p in case["places"])
        for rank_i, p in enumerate(ordered):
            got = []
            if rank_i == 0 and p["risk"] == "SAFE":
                got.append("RECOMMENDED")
            elif p["upvotes"] == top_votes and p["risk"] != "SAFE":
                got.append("MOST_VOTED_RISKY")
            elif p["upvotes"] == top_votes:
                got.append("MOST_VOTED")
            elif p["risk"] == "SAFE" and p["slack_min"] >= cfg.SCHEDULE_SAFE_SLACK_MIN:
                got.append("SCHEDULE_SAFE")
            assert got == labels[p["id"]], p["id"]
