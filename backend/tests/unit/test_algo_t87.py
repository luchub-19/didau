"""T-87: ALGO-03 khả thi lịch + ALGO-04 sắp xếp ưu tiên — phần thuần + luật TRAVEL_TIME (không DB, không mạng).

Chạy cùng `docs/phase6/algo-fixtures.json` với frontend. Tên test theo mã TC của tài liệu đồ án (TC-05 → TC-08).
"""

import json
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.core import algo_config as cfg
from app.domain.algorithms import (
    PlanItem,
    PriorityInput,
    PriorityLabel,
    Risk,
    assess_leg,
    available_minutes,
    consecutive_pairs,
    margin_for,
    plan_feasibility,
    rank_places,
)
from app.domain.algorithms.feasibility import is_peak, risk_for
from app.domain.enums import ConflictLevel, PlaceCategory, PlaceStatus
from app.domain.patterns.conflict_rule import (
    ConflictContext,
    ConflictDetectionEngine,
    PlaceVoteSummary,
    TimeOverlapConflictRule,
    TravelTimeConflictRule,
)
from app.domain.patterns.itinerary.travel import (
    Coord,
    HaversineTravelEstimator,
    ITravelTimeEstimator,
    Leg,
    TravelSource,
)
from app.services.algorithm_service import AlgorithmService

FX = json.loads(
    (Path(__file__).resolve().parents[3] / "docs" / "phase6" / "algo-fixtures.json").read_text(
        encoding="utf-8"
    )
)
T0 = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
MONDAY, FRIDAY, SATURDAY = date(2026, 11, 9), date(2026, 11, 13), date(2026, 11, 14)
A, B = (10.7725, 106.698), (10.7798, 106.6992)


class FixedLeg(ITravelTimeEstimator):
    """Mọi chặng = `minutes` phút (quãng đường 1 km) — để dựng đúng ca của tài liệu."""

    def __init__(self, minutes: int, source: TravelSource = TravelSource.ESTIMATE) -> None:
        self.minutes_ = minutes
        self.source = source
        self.departs: list[datetime | None] = []

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        self.departs.append(depart_at)
        if a == b:
            return Leg(0, 0.0, self.source)
        return Leg(self.minutes_, 1.0, self.source)


def item(start: int, end: int, *, day: int = 0, coord: Coord | None = A, order: int = 0) -> PlanItem:
    return PlanItem(uuid4(), day, start, end, order, coord)


# ── ALGO-03: biên, mức, tổng (fixture) ─────────────────────────────────────────────────────────────
@pytest.mark.parametrize("case", FX["margin"]["cases"], ids=lambda c: c["id"])
def test_fixture_margin_cases(case: dict[str, Any]) -> None:
    on = date.fromisoformat(case["date"])
    assert margin_for(case["eta_min"], case["end_curr_min"], on) == case["expect_margin"]


@pytest.mark.parametrize("case", FX["slack"]["cases"], ids=lambda c: c["id"])
def test_fixture_slack_cases_through_assess_leg(case: dict[str, Any]) -> None:
    # 18:00 thứ Hai → biên 50%: eta 12 → 6 (đúng `margin_min` của fixture)
    end = 1080
    curr, nxt = item(1020, end), item(end + case["gap_min"], end + case["gap_min"] + 60, coord=B)
    a = assess_leg(curr, nxt, Leg(case["eta_min"], 3.0), MONDAY)
    assert a.margin_min == case["margin_min"]
    assert a.required_min == case["expect"]["required_min"]
    assert a.slack_min == case["expect"]["slack_min"]
    assert a.risk.value == case["expect"]["risk"]
    assert a.peak is True and a.buffer_min == cfg.BUFFER_MIN


def test_fixture_plan_total() -> None:
    f = FX["slack"]["feasibility"]
    w = f["window"]
    # mục 2 kết thúc 19:20 (vẫn trong cao điểm [16:30, 19:30)) để biên đúng 6′ như fixture
    items = [item(w["start_minute"] + i * 80, w["start_minute"] + i * 80 + d) for i, d in enumerate(f["durations_min"])]
    legs = [
        assess_leg(items[i], items[i + 1], Leg(lg["eta"], 3.0), MONDAY) for i, lg in enumerate(f["legs"])
    ]
    assert [lg.margin_min for lg in legs] == [lg["margin"] for lg in f["legs"]]
    res = plan_feasibility(w["start_minute"], w["end_minute"], items, legs)
    assert res.required_total_min == f["expect"]["required_total_min"]
    assert res.buffer_total_min == f["expect"]["buffer_total_min"]
    assert res.is_feasible is f["expect"]["is_feasible"]
    assert res.window_min == 360 and res.estimated is True


@pytest.mark.parametrize("case", FX["slack"]["doc_tc05_tc06"]["cases"], ids=lambda c: c["id"])
def test_doc_tc05_tc06_risk_levels(case: dict[str, Any]) -> None:
    slack = case["gap_min"] - case["required_min"]
    assert slack == case["expect"]["slack_min"]
    assert risk_for(case["gap_min"], case["eta_min"], slack).value == case["expect"]["risk"]


def test_peak_window_is_half_open_and_weekday_only() -> None:
    assert is_peak(cfg.PEAK_START_MIN, FRIDAY) is True  # 16:30 tính
    assert is_peak(cfg.PEAK_END_MIN - 1, FRIDAY) is True
    assert is_peak(cfg.PEAK_END_MIN, FRIDAY) is False  # 19:30 không tính
    assert is_peak(cfg.PEAK_START_MIN - 1, FRIDAY) is False
    assert is_peak(1080, SATURDAY) is False and is_peak(1080, SATURDAY + timedelta(days=1)) is False
    assert is_peak(1080, None) is False  # không biết ngày → ngoài cao điểm


def test_same_spot_leg_needs_no_margin_or_parking() -> None:
    a = assess_leg(item(1020, 1080), item(1080, 1140), Leg(0, 0.0), MONDAY)
    assert (a.eta_min, a.margin_min, a.buffer_min, a.slack_min, a.risk) == (0, 0, 0, 0, Risk.SAFE)


def test_pairs_are_per_day_sorted_by_start_then_order_and_no_leg_from_home() -> None:
    x0, x1 = item(1200, 1260, order=1), item(1020, 1080, order=5)
    y0 = item(1020, 1080, day=1)
    tie_a, tie_b = item(1300, 1320, order=2), item(1300, 1330, order=1)
    pairs = consecutive_pairs([x0, y0, x1, tie_a, tie_b])
    assert [(p.item_id, q.item_id) for p, q in pairs] == [
        (x1.item_id, x0.item_id),
        (x0.item_id, tie_b.item_id),
        (tie_b.item_id, tie_a.item_id),
    ]
    assert consecutive_pairs([x0]) == []


# ── ALGO-03 trên luật TRAVEL_TIME (CR-07 + CR-12) ──────────────────────────────────────────────────
def _ctx(gaps: list[int], *, on: date | None = SATURDAY, end0: int = 1080, coords: list[Coord | None] | None = None):
    """Mục 1 kết thúc `end0`; mỗi mục sau bắt đầu sau mục trước `gap` phút, dài 60'."""
    coords = coords or [A, B] + [A, B] * len(gaps)
    places, items = [], []
    start, end = end0 - 60, end0
    for i in range(len(gaps) + 1):
        pid = uuid4()
        c = coords[i]
        places.append(
            PlaceVoteSummary(
                place_id=pid,
                name=f"Quán {i}",
                category=PlaceCategory.FOOD,
                status=PlaceStatus.PROPOSED,
                submitted_by_id=uuid4(),
                created_at=T0,
                latitude=c[0] if c else None,
                longitude=c[1] if c else None,
            )
        )
        items.append({"id": uuid4(), "place_id": pid, "day_offset": 0, "start_minute": start, "end_minute": end, "order_index": i})
        if i < len(gaps):
            start, end = end + gaps[i], end + gaps[i] + 60
    return ConflictContext(room_id=uuid4(), places=places, schedule_items=items, event_date=on)


def test_tc05_gap_30_needing_60_is_not_safe() -> None:
    # eta 44 ngoài cao điểm → biên 11 + gửi xe 5 → cần 60'; khe 30' < eta → HIGH_RISK
    res = TravelTimeConflictRule(FixedLeg(44)).evaluate(_ctx([30]))
    assert len(res) == 1
    p = res[0].params
    assert res[0].level == ConflictLevel.WARNING and res[0].rule_code == "TRAVEL_TIME"
    assert (p["eta_min"], p["margin_min"], p["buffer_min"], p["gap_min"], p["slack_min"]) == (44, 11, 5, 30, -30)
    assert p["risk"] == "HIGH_RISK" and p["peak"] is False
    soft = TravelTimeConflictRule(FixedLeg(44)).evaluate(_ctx([50]))[0].params
    assert soft["risk"] == "SOFT_CONFLICT" and soft["slack_min"] == -10


def test_tc06_gap_70_needing_60_is_safe_with_10_spare() -> None:
    est = FixedLeg(44)
    ctx = _ctx([70])
    assert TravelTimeConflictRule(est).evaluate(ctx) == []
    curr, nxt = item(1020, 1080), item(1150, 1210, coord=B)
    a = assess_leg(curr, nxt, est.leg(A, B), SATURDAY)
    assert (a.required_min, a.slack_min, a.risk) == (60, 10, Risk.SAFE)


def test_peak_saturday_vs_friday() -> None:
    # Rời quán 18:00, đi 20': thứ Sáu cao điểm → biên 10 (cần 35'), thứ Bảy → biên 5 (cần 30'); khe 33'
    fri = TravelTimeConflictRule(FixedLeg(20)).evaluate(_ctx([33], on=FRIDAY))
    assert len(fri) == 1 and fri[0].params["peak"] is True and fri[0].params["margin_min"] == 10
    assert fri[0].params["slack_min"] == -2 and fri[0].params["risk"] == "SOFT_CONFLICT"
    assert TravelTimeConflictRule(FixedLeg(20)).evaluate(_ctx([33], on=SATURDAY)) == []


def test_rule_passes_departure_time_of_the_room_day_to_estimator() -> None:
    est = FixedLeg(20)
    TravelTimeConflictRule(est).evaluate(_ctx([40], on=FRIDAY, end0=1110))
    assert est.departs[0] is not None
    assert est.departs[0].date() == FRIDAY and (est.departs[0].hour, est.departs[0].minute) == (18, 30)


def test_overlapping_pair_only_reports_time_overlap() -> None:
    engine = ConflictDetectionEngine([TimeOverlapConflictRule(), TravelTimeConflictRule(FixedLeg(30))])
    codes = [r.rule_code for r in engine.evaluate_all(_ctx([-15]))]
    assert codes == ["TIME_OVERLAP"]


def test_missing_coords_or_same_spot_gives_no_travel_warning() -> None:
    assert TravelTimeConflictRule(FixedLeg(30)).evaluate(_ctx([0], coords=[A, None])) == []
    assert TravelTimeConflictRule(FixedLeg(30)).evaluate(_ctx([0], coords=[A, A])) == []


def test_google_source_is_carried_and_still_gets_margin() -> None:
    p = TravelTimeConflictRule(FixedLeg(20, TravelSource.GOOGLE)).evaluate(_ctx([10]))[0].params
    assert p["source"] == "GOOGLE" and p["estimated"] is False and p["margin_min"] == 5


# ── ALGO-04 (fixture) ──────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("case", FX["priority"]["required_cases"], ids=lambda c: c["id"])
def test_fixture_priority_required_cases(case: dict[str, Any]) -> None:
    room = case["room"]
    on = date.fromisoformat(room["date"])
    pi = PriorityInput(uuid4(), 1, T0, case["open_minute"], case["close_minute"], case["max_eta_min"])
    (r,) = rank_places([pi], room["start_minute"], room["end_minute"], on)
    exp = case["expect"]
    assert r.available_min == exp["available_min"]
    assert r.risk.value == exp["risk"]
    for key in ("margin_min", "required_min", "slack_min"):
        if key in exp:
            assert getattr(r, key) == exp[key], key


def _inputs_for(places: list[dict[str, Any]]) -> list[PriorityInput]:
    """Dựng giờ mở cửa sao cho ra đúng `slack_min` của fixture (phòng 17:00–23:00 thứ Bảy, biên = sàn/25%)."""
    out = []
    for p in places:
        eta = p["max_eta_min"]
        required = cfg.DEFAULT_ACTIVITY_MIN + eta + margin_for(eta, 1020, SATURDAY) + cfg.BUFFER_MIN
        available = required + p["slack_min"]
        out.append(
            PriorityInput(
                UUID(int=hash(p["id"]) & (2**128 - 1)),
                p["upvotes"],
                T0 + timedelta(minutes=p["created_order"]),
                1020,
                1020 + available,
                eta,
            )
        )
    return out


@pytest.mark.parametrize("case", FX["priority"]["ordering_cases"], ids=lambda c: c["id"])
def test_fixture_priority_ordering_cases(case: dict[str, Any]) -> None:
    """TC-07 (cùng phiếu cùng slack → giữ thứ tự thêm), TC-08 (12 phiếu −30' xếp sau 10 và 8 phiếu SAFE)."""
    inputs = _inputs_for(case["places"])
    names = {pi.place_id: p["id"] for pi, p in zip(inputs, case["places"], strict=True)}
    ranked = rank_places(inputs, 1020, 1380, SATURDAY)
    assert [names[r.place_id] for r in ranked] == case["expect"]["order"]
    assert [r.rank for r in ranked] == list(range(1, len(ranked) + 1))
    for r, p in ((r, next(x for x in case["places"] if x["id"] == names[r.place_id])) for r in ranked):
        assert r.risk.value == p["risk"] and r.slack_min == p["slack_min"]
    for pid, labels in case["expect"].get("labels", {}).items():
        got = next(r for r in ranked if names[r.place_id] == pid)
        assert [lb.value for lb in got.labels] == labels


def test_tc07_input_order_does_not_matter_and_result_is_stable() -> None:
    case = next(c for c in FX["priority"]["ordering_cases"] if c["id"] == "TC-07")
    inputs = _inputs_for(case["places"])
    first = [r.place_id for r in rank_places(inputs, 1020, 1380, SATURDAY)]
    assert first == [r.place_id for r in rank_places(list(reversed(inputs)), 1020, 1380, SATURDAY)]
    assert first == [r.place_id for r in rank_places(inputs, 1020, 1380, SATURDAY)]


def test_labels_most_voted_and_schedule_safe_one_per_place() -> None:
    win = (1020, 1380)
    risky_top = PriorityInput(uuid4(), 9, T0, 1350, 1380, 10)  # 30' mở cửa → HIGH_RISK
    safe_a = PriorityInput(uuid4(), 3, T0 + timedelta(minutes=1), None, None, 10)  # dư lớn
    safe_b = PriorityInput(uuid4(), 3, T0 + timedelta(minutes=2), 1020, 1110, 10)  # dư 5'
    ranked = {r.place_id: r for r in rank_places([risky_top, safe_a, safe_b], *win, SATURDAY)}
    assert ranked[safe_a.place_id].labels == (PriorityLabel.RECOMMENDED,)
    assert ranked[risky_top.place_id].labels == (PriorityLabel.MOST_VOTED_RISKY,)
    assert ranked[risky_top.place_id].rank == 3
    assert ranked[safe_b.place_id].labels == ()  # SAFE nhưng dư < 30'
    # Hạng 1 không SAFE → không ai là RECOMMENDED; quán SAFE nhiều phiếu nhất là MOST_VOTED, dư ≥ 30' là SCHEDULE_SAFE
    closed = PriorityInput(uuid4(), 1, T0, 480, 960, 10)
    only_bad = rank_places([closed], *win, SATURDAY)
    assert only_bad[0].labels == (PriorityLabel.MOST_VOTED_RISKY,)
    roomy = PriorityInput(uuid4(), 0, T0, None, None, 5)
    top = PriorityInput(uuid4(), 4, T0, None, None, 5)
    ranked2 = rank_places([roomy, top], *win, SATURDAY)
    assert [lb for r in ranked2 for lb in r.labels] == [PriorityLabel.RECOMMENDED, PriorityLabel.SCHEDULE_SAFE]
    zero = rank_places([PriorityInput(uuid4(), 0, T0, 1350, 1380, 5)], *win, SATURDAY)
    assert zero[0].labels == ()  # không ai bỏ phiếu → không có "nhiều phiếu nhất"


def test_no_opening_hours_uses_whole_window() -> None:
    (r,) = rank_places([PriorityInput(uuid4(), 0, T0, None, None, 20)], 1020, 1380, SATURDAY)
    assert r.hours_unknown is True and r.available_min == 360 and r.risk is Risk.SAFE


def test_no_origin_means_eta_unknown_and_zero() -> None:
    (r,) = rank_places([PriorityInput(uuid4(), 0, T0, 1020, 1380, None)], 1020, 1380, SATURDAY)
    assert r.eta_unknown is True and r.max_eta_min == 0 and r.estimated is False
    assert r.required_min == cfg.DEFAULT_ACTIVITY_MIN + cfg.MARGIN_MIN + cfg.BUFFER_MIN


def test_closed_for_whole_window_is_high_risk() -> None:
    (r,) = rank_places([PriorityInput(uuid4(), 5, T0, 480, 1020, 5)], 1020, 1380, SATURDAY)
    assert r.available_min == 0 and r.risk is Risk.HIGH_RISK


def test_available_minutes_overnight_and_all_day() -> None:
    assert available_minutes(1080, 120, 1020, 1380) == 300  # 18:00–02:00 ∩ 17:00–23:00
    assert available_minutes(1080, 120, 30, 180) == 90  # phần sau nửa đêm của hôm trước: 00:30–02:00
    assert available_minutes(600, 600, 1020, 1380) == 360  # mở = đóng → cả ngày
    assert available_minutes(None, 600, 1020, 1380) is None


# ── Hiệu năng (§6, task mục 4) ─────────────────────────────────────────────────────────────────────
class _Obj:
    def __init__(self, **kw: Any) -> None:
        self.__dict__.update(kw)


class _Repo:
    def __init__(self, **data: Any) -> None:
        self.data = data

    async def get_by_id(self, _id: UUID) -> Any:
        return self.data["room"]

    async def list_by_room(self, _id: UUID) -> list[Any]:
        return self.data["rows"]

    async def get_vote_summary_by_room(self, _id: UUID) -> dict[UUID, dict[str, int]]:
        return self.data["votes"]


async def test_priority_for_10_members_x_30_places_under_150ms(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.services.algorithm_service as algo_module

    monkeypatch.setattr(algo_module, "get_travel_estimator", lambda: HaversineTravelEstimator())
    room = _Obj(
        id=uuid4(), event_date=FRIDAY, start_minute=1020, end_minute=1380,
        origin_lat=10.776, origin_lng=106.70, city="HCM",
    )
    members = [
        _Obj(id=uuid4(), nickname=f"m{i}", is_active=True,
             origin_lat=10.70 + i * 0.012 if i % 3 else None, origin_lng=106.62 + i * 0.01 if i % 3 else None)
        for i in range(10)
    ]
    places = [
        _Obj(id=uuid4(), status=PlaceStatus.VOTING, created_at=T0 + timedelta(minutes=j),
             latitude=10.72 + j * 0.004, longitude=106.64 + (j % 7) * 0.01,
             open_minute=None if j % 5 == 0 else 600 + (j % 4) * 180, close_minute=None if j % 5 == 0 else 1380)
        for j in range(30)
    ]
    votes = {p.id: {"upvotes": j % 6, "downvotes": 0, "score": j % 6} for j, p in enumerate(places)}
    service = AlgorithmService(
        room_repo=_Repo(room=room), member_repo=_Repo(rows=members), place_repo=_Repo(rows=places),
        vote_repo=_Repo(votes=votes),
    )
    await service.place_priorities(room.id)  # làm nóng import/JIT của lần đầu
    t = time.perf_counter()
    for _ in range(5):
        res = await service.place_priorities(room.id)
    per_call_ms = (time.perf_counter() - t) / 5 * 1000
    assert len(res) == 30 and sorted(r.rank for r in res.values()) == list(range(1, 31))
    assert per_call_ms <= 150, f"ALGO-04 chậm: {per_call_ms:.1f} ms cho 10 × 30"
