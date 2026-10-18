import itertools
import time
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.conflict_rule import (
    ConflictContext,
    ConflictDetectionEngine,
    OpeningHoursConflictRule,
    TimeOverlapConflictRule,
    TravelTimeConflictRule,
)
from app.domain.patterns.itinerary import (
    HaversineTravelEstimator,
    HeuristicItineraryPlanner,
    PlanConstraints,
    select_candidates,
)
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary

BASE = datetime(2026, 10, 17, tzinfo=UTC)
EVENT = date(2026, 10, 17)  # Thứ Bảy
SUBMITTER = uuid4()
DINNER = (17 * 60 + 30, 20 * 60 + 30)


def mk(
    name,
    category=PlaceCategory.FOOD,
    pos=(10.7725, 106.6980),
    status=PlaceStatus.ACCEPTED,
    score=0,
    open_minute=None,
    close_minute=None,
    seq=0,
):
    return PlaceVoteSummary(
        place_id=uuid4(),
        name=name,
        category=category,
        status=status,
        submitted_by_id=SUBMITTER,
        created_at=BASE + timedelta(minutes=seq),
        score=score,
        latitude=pos[0] if pos else None,
        longitude=pos[1] if pos else None,
        open_minute=open_minute,
        close_minute=close_minute,
    )


def cons(**kw):
    return PlanConstraints(event_date=EVENT, **kw)


def plan(places, **kw):
    return HeuristicItineraryPlanner().plan(places, cons(**kw))


def slot_of(slots, place):
    return next(s for s in slots if s.place_id == place.place_id)


def spread(n, step=0.004):
    return [(10.77 + step * i, 106.69 + step * i) for i in range(n)]


def test_empty_input():
    assert plan([]) == ([], [])


def test_single_place_starts_at_window_start():
    p = mk("A", PlaceCategory.SHOPPING)
    slots, dropped = plan([p])
    assert dropped == []
    assert (slots[0].start_minute, slots[0].end_minute) == (1020, 1080)


def test_default_durations():
    cases = {
        PlaceCategory.FOOD: 75,
        PlaceCategory.DRINK: 75,
        PlaceCategory.ENTERTAINMENT: 120,
        PlaceCategory.SIGHTSEEING: 90,
        PlaceCategory.SHOPPING: 60,
        PlaceCategory.OTHER: 60,
    }
    for cat, minutes in cases.items():
        slots, _ = plan([mk("X", cat)])
        assert slots[0].end_minute - slots[0].start_minute == minutes


def test_duration_override():
    p = mk("A", PlaceCategory.FOOD)
    slots, _ = plan([p], duration_overrides={p.place_id: 30})
    assert slots[0].end_minute - slots[0].start_minute == 30


def test_default_window_food_cafe_cinema_food_in_dinner_window():
    pos = spread(3)
    food = mk("Cơm tấm", PlaceCategory.FOOD, pos[0])
    cafe = mk("Cafe", PlaceCategory.DRINK, pos[1])
    cinema = mk("Rạp", PlaceCategory.ENTERTAINMENT, pos[2])
    slots, dropped = plan([food, cafe, cinema])
    assert dropped == []
    f = slot_of(slots, food)
    assert f.start_minute >= DINNER[0]
    assert f.end_minute <= DINNER[1]


def test_drink_after_food():
    pos = spread(2)
    food = mk("Ăn", PlaceCategory.FOOD, pos[0])
    cafe = mk("Cafe", PlaceCategory.DRINK, pos[1])
    slots, _ = plan([cafe, food])
    assert slot_of(slots, food).start_minute < slot_of(slots, cafe).start_minute


def test_slots_within_window_and_sequential():
    places = [mk(f"P{i}", PlaceCategory.SHOPPING, p) for i, p in enumerate(spread(4))]
    slots, _ = plan(places)
    ordered = sorted(slots, key=lambda s: s.start_minute)
    assert ordered[0].start_minute >= 1020
    assert ordered[-1].end_minute <= 1380
    for a, b in itertools.pairwise(ordered):
        assert b.start_minute >= a.end_minute + b.travel_from_prev_min


def test_place_closing_at_2100_not_scheduled_after():
    pos = spread(3)
    early = mk("Quán đóng sớm", PlaceCategory.SHOPPING, pos[0], open_minute=600, close_minute=1260)
    others = [
        mk("Rạp", PlaceCategory.ENTERTAINMENT, pos[1]),
        mk("Ăn", PlaceCategory.FOOD, pos[2]),
    ]
    slots, dropped = plan([early, *others])
    assert dropped == []
    assert slot_of(slots, early).end_minute <= 1260


def test_place_closed_too_early_is_dropped_with_reason():
    p = mk("Đóng 17:30", PlaceCategory.FOOD, close_minute=1050, open_minute=600)
    slots, dropped = plan([p])
    assert slots == []
    assert dropped[0].place_id == p.place_id
    assert "đóng cửa" in dropped[0].reason


def test_wait_for_opening():
    p = mk("Mở 19:00", PlaceCategory.SHOPPING, open_minute=1140, close_minute=1380)
    slots, _ = plan([p])
    assert slots[0].start_minute == 1140


def test_six_places_some_dropped():
    places = [mk(f"P{i}", PlaceCategory.SIGHTSEEING, p) for i, p in enumerate(spread(6))]
    slots, dropped = plan(places)
    assert dropped
    assert len(slots) + len(dropped) == 6
    assert all("Hết giờ" in d.reason for d in dropped)


def test_no_place_is_lost():
    places = [mk(f"P{i}", PlaceCategory.FOOD, p) for i, p in enumerate(spread(5))]
    slots, dropped = plan(places)
    ids = {s.place_id for s in slots} | {d.place_id for d in dropped}
    assert ids == {p.place_id for p in places}


def test_seven_places_under_200ms():
    places = [mk(f"P{i}", PlaceCategory.SHOPPING, p) for i, p in enumerate(spread(7))]
    t0 = time.perf_counter()
    plan(places)
    assert time.perf_counter() - t0 < 0.2


def test_ten_places_valid_result():
    places = [mk(f"P{i}", PlaceCategory.SHOPPING, p) for i, p in enumerate(spread(10, 0.003))]
    slots, dropped = plan(places)
    assert len(slots) + len(dropped) == 10
    ordered = sorted(slots, key=lambda s: s.start_minute)
    for a, b in itertools.pairwise(ordered):
        assert b.start_minute >= a.end_minute
    assert all(1020 <= s.start_minute and s.end_minute <= 1380 for s in slots)


def test_deterministic():
    places = [mk(f"P{i}", PlaceCategory.FOOD, p) for i, p in enumerate(spread(5))]
    a = plan(places)
    b = plan(list(reversed(places)))
    assert a[0] == b[0]
    assert a[1] == b[1]


def test_nearby_places_ordered_by_distance():
    far = mk("Xa", PlaceCategory.SHOPPING, (10.90, 106.80))
    near1 = mk("Gần 1", PlaceCategory.SHOPPING, (10.7725, 106.6980))
    near2 = mk("Gần 2", PlaceCategory.SHOPPING, (10.7730, 106.6985))
    slots, _ = plan([near1, far, near2], meeting_point=(10.7725, 106.6980))
    order = [s.place_id for s in sorted(slots, key=lambda s: s.start_minute)]
    assert order[-1] == far.place_id


def test_meeting_point_travel_on_first_slot():
    p = mk("A", PlaceCategory.SHOPPING, (10.80, 106.70))
    slots, _ = plan([p], meeting_point=(10.7725, 106.6980))
    assert slots[0].travel_from_prev_min > 0
    assert slots[0].start_minute == 1020 + slots[0].travel_from_prev_min


def test_missing_coordinates_zero_travel():
    a = mk("A", PlaceCategory.SHOPPING, pos=None)
    b = mk("B", PlaceCategory.SHOPPING, pos=None)
    slots, _ = plan([a, b])
    assert all(s.travel_from_prev_min == 0 for s in slots)


def test_custom_window():
    p = mk("A", PlaceCategory.SHOPPING)
    slots, _ = plan([p], start_minute=540, end_minute=720)
    assert slots[0].start_minute == 540


def test_lunch_window_when_day_covers_noon():
    f = mk("Trưa", PlaceCategory.FOOD)
    s = mk("Tham quan", PlaceCategory.SIGHTSEEING, (10.7726, 106.6981))
    slots, _ = plan([f, s], start_minute=540, end_minute=1080)
    fs = slot_of(slots, f)
    assert 660 <= fs.start_minute
    assert fs.end_minute <= 810


def test_default_window_has_no_lunch_anchor():
    f = mk("Ăn", PlaceCategory.FOOD)
    slots, _ = plan([f])
    assert slots[0].start_minute >= 1020


def test_multi_day_overflow_goes_to_next_day():
    places = [mk(f"P{i}", PlaceCategory.SIGHTSEEING, p) for i, p in enumerate(spread(6))]
    slots, dropped = plan(places, num_days=2)
    assert {s.day_offset for s in slots} == {0, 1}
    assert len(slots) + len(dropped) == 6


def test_single_day_overflow_marks_dropped_not_next_day():
    places = [mk(f"P{i}", PlaceCategory.SIGHTSEEING, p) for i, p in enumerate(spread(6))]
    slots, _ = plan(places, num_days=1)
    assert {s.day_offset for s in slots} == {0}


def test_day_offset_respected():
    slots, _ = plan([mk("A", PlaceCategory.SHOPPING)], day_offset=2, num_days=3)
    assert slots[0].day_offset == 2


def test_opening_hours_raw_used_for_event_weekday():
    p = mk("OSM", PlaceCategory.SHOPPING)
    raw = {p.place_id: "Mo-Fr 08:00-23:00; Sa,Su 19:00-23:00"}  # event là Thứ Bảy
    slots, _ = plan([p], opening_hours_raw=raw)
    assert slots[0].start_minute == 1140


def test_opening_hours_raw_closed_on_event_day():
    p = mk("OSM", PlaceCategory.SHOPPING)
    slots, dropped = plan([p], opening_hours_raw={p.place_id: "Mo-Fr 08:00-23:00"})
    assert slots == []
    assert dropped[0].place_id == p.place_id


def test_unknown_opening_hours_pattern_falls_back_to_minutes():
    p = mk("OSM", PlaceCategory.SHOPPING, open_minute=1100, close_minute=1380)
    slots, _ = plan([p], opening_hours_raw={p.place_id: "sunrise-sunset"})
    assert slots[0].start_minute == 1100


def test_overnight_open_close_minutes():
    p = mk("Bar", PlaceCategory.DRINK, open_minute=1200, close_minute=120)
    slots, _ = plan([p])
    assert slots[0].start_minute == 1200


def test_split_opening_intervals_skip_lunch_break():
    p = mk("Nghỉ trưa", PlaceCategory.SHOPPING)
    raw = {p.place_id: "Mo-Su 07:00-17:30,19:00-23:00"}
    slots, _ = plan([p], opening_hours_raw=raw, duration_overrides={p.place_id: 90})
    assert slots[0].start_minute == 1140


def test_reasons_mention_dinner_window():
    f = mk("Ăn tối", PlaceCategory.FOOD)
    slots, _ = plan([f], start_minute=1050)
    assert any("bữa tối" in r for r in slots[0].reasons)


def test_reasons_mention_travel():
    a = mk("A", PlaceCategory.SHOPPING, (10.77, 106.69))
    b = mk("B", PlaceCategory.SHOPPING, (10.78, 106.70))
    slots, _ = plan([a, b])
    second = max(slots, key=lambda s: s.start_minute)
    assert any("Di chuyển" in r for r in second.reasons)


def test_select_candidates_prefers_accepted():
    a = mk("A", status=PlaceStatus.ACCEPTED)
    p = mk("P", status=PlaceStatus.PROPOSED, score=9)
    chosen, fallback = select_candidates([a, p])
    assert chosen == [a]
    assert fallback is False


def test_select_candidates_fallback_top_per_category():
    f1 = mk("F1", PlaceCategory.FOOD, status=PlaceStatus.PROPOSED, score=1)
    f2 = mk("F2", PlaceCategory.FOOD, status=PlaceStatus.PROPOSED, score=5)
    d1 = mk("D1", PlaceCategory.DRINK, status=PlaceStatus.VOTING, score=2)
    rej = mk("R", PlaceCategory.SHOPPING, status=PlaceStatus.REJECTED, score=99)
    chosen, fallback = select_candidates([f1, f2, d1, rej])
    assert fallback is True
    assert {p.name for p in chosen} == {"F2", "D1"}


def test_select_candidates_nothing():
    assert select_candidates([]) == ([], False)


@pytest.mark.asyncio
async def test_plan_day_async_matches_sync():
    planner = HeuristicItineraryPlanner()
    p = mk("A", PlaceCategory.SHOPPING)
    assert await planner.plan_day([p], cons()) == planner.plan([p], cons())


@pytest.mark.asyncio
async def test_optimize_route_keeps_interface_contract():
    ids: list[UUID] = [uuid4(), uuid4()]
    assert await HeuristicItineraryPlanner().optimize_route(ids) == ids


def _engine() -> ConflictDetectionEngine:
    engine = ConflictDetectionEngine()
    engine.register_rule(TimeOverlapConflictRule())
    engine.register_rule(TravelTimeConflictRule())
    engine.register_rule(OpeningHoursConflictRule())
    return engine


def _contract_check(places, **kw):
    slots, _ = plan(places, **kw)
    items = [
        {
            "id": uuid4(),
            "place_id": s.place_id,
            "day_offset": s.day_offset,
            "start_minute": s.start_minute,
            "end_minute": s.end_minute,
            "order_index": i,
        }
        for i, s in enumerate(sorted(slots, key=lambda s: (s.day_offset, s.start_minute)))
    ]
    ctx = ConflictContext(room_id=uuid4(), places=places, schedule_items=items)
    codes = {r.rule_code for r in _engine().evaluate_all(ctx)}
    assert codes.isdisjoint({"TIME_OVERLAP", "TRAVEL_TIME", "OPENING_HOURS"})
    return slots


def test_contract_default_three_places():
    pos = spread(3, 0.01)
    _contract_check(
        [
            mk("Ăn", PlaceCategory.FOOD, pos[0], open_minute=600, close_minute=1320),
            mk("Cafe", PlaceCategory.DRINK, pos[1], open_minute=420, close_minute=1380),
            mk("Rạp", PlaceCategory.ENTERTAINMENT, pos[2], open_minute=540, close_minute=1380),
        ]
    )


def test_contract_many_places_and_far_apart():
    pos = [(10.70, 106.60), (10.80, 106.75), (10.85, 106.65), (10.75, 106.70)]
    places = [
        mk(f"P{i}", PlaceCategory.SHOPPING, p, open_minute=480, close_minute=1380)
        for i, p in enumerate(pos)
    ]
    _contract_check(places, meeting_point=(10.77, 106.69))


def test_contract_ten_places():
    places = [
        mk(f"P{i}", PlaceCategory.SHOPPING, p, open_minute=0, close_minute=1439)
        for i, p in enumerate(spread(10, 0.01))
    ]
    _contract_check(places)


def test_contract_waiting_for_open():
    places = [
        mk("Mở muộn", PlaceCategory.DRINK, (10.78, 106.70), open_minute=1200, close_minute=1380),
        mk("Ăn", PlaceCategory.FOOD, (10.77, 106.69), open_minute=600, close_minute=1380),
    ]
    _contract_check(places)


def test_planner_travel_not_below_rule_estimate():
    est = HaversineTravelEstimator()
    assert est.minutes((10.77, 106.69), (10.78, 106.70)) >= 1


def test_cr06_planner_reason_codes_and_dropped():
    """Kiểm tra CR-06: slots có reason_codes và dropped có reason_code."""
    p_food = mk("Ăn tối", PlaceCategory.FOOD, open_minute=1000, close_minute=1300)
    p_drink = mk("Trà chanh", PlaceCategory.DRINK, open_minute=1000, close_minute=1380)
    p_closed = mk("Đóng cửa sớm", PlaceCategory.SHOPPING, open_minute=480, close_minute=600)  # Đóng cửa trước giờ bắt đầu (1020)

    slots, dropped = plan([p_food, p_drink, p_closed], start_minute=1050, end_minute=1350)

    # 1. Kiểm tra slot
    assert len(slots) >= 1
    for slot in slots:
        assert isinstance(slot.reason_codes, list)
        assert len(slot.reason_codes) == len(slot.reasons)

    # Slot ăn tối phải có MEAL_WINDOW
    food_slot = next(s for s in slots if s.place_id == p_food.place_id)
    meal_rc = next(rc for rc in food_slot.reason_codes if rc["code"] == "MEAL_WINDOW")
    assert meal_rc["params"]["window"] == "dinner"
    assert "start_minute" in meal_rc["params"]
    assert "end_minute" in meal_rc["params"]

    # 2. Kiểm tra dropped place
    assert len(dropped) >= 1
    closed_drop = next(d for d in dropped if d.place_id == p_closed.place_id)
    assert closed_drop.reason_code == "CLOSED_OR_NO_FIT"
    assert isinstance(closed_drop.reason_params, dict)

