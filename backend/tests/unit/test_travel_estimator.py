import math
from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.conflict_rule import (
    ConflictContext,
    PlaceVoteSummary,
    TravelTimeConflictRule,
)
from app.domain.patterns.itinerary import (
    HaversineTravelEstimator,
    ITravelTimeEstimator,
    haversine_distance_km,
)

BEN_THANH = (10.7725, 106.6980)
NHA_THO = (10.7798, 106.6992)


def test_interface_is_abstract():
    with pytest.raises(TypeError):
        ITravelTimeEstimator()  # type: ignore[abstract]


def test_same_point_costs_only_parking():
    assert HaversineTravelEstimator().minutes(BEN_THANH, BEN_THANH) == 10


def test_formula_matches_spec():
    km = haversine_distance_km(*BEN_THANH, *NHA_THO)
    expected = math.ceil(km * 1.3 / 30.0 * 60.0) + 10
    assert HaversineTravelEstimator().minutes(BEN_THANH, NHA_THO) == expected


def test_custom_parameters():
    est = HaversineTravelEstimator(average_speed_kmh=60, detour_factor=1.0, parking_minutes=0)
    km = haversine_distance_km(*BEN_THANH, *NHA_THO)
    assert est.minutes(BEN_THANH, NHA_THO) == math.ceil(km / 60 * 60)


def test_estimator_never_below_original_rule_formula():
    est = HaversineTravelEstimator()
    for dlat in (0.0, 0.001, 0.01, 0.05, 0.2):
        b = (BEN_THANH[0] + dlat, BEN_THANH[1] + dlat)
        km = haversine_distance_km(*BEN_THANH, *b)
        assert est.minutes(BEN_THANH, b) >= math.ceil(km / 30.0 * 60.0)


def _context(gap: int) -> ConflictContext:
    pa, pb = uuid4(), uuid4()
    sub = uuid4()

    def mk(pid, name, pos):
        return PlaceVoteSummary(
            place_id=pid,
            name=name,
            category=PlaceCategory.FOOD,
            status=PlaceStatus.ACCEPTED,
            submitted_by_id=sub,
            created_at=datetime.now(UTC),
            latitude=pos[0],
            longitude=pos[1],
        )

    items = [
        {"id": uuid4(), "place_id": pa, "day_offset": 0, "start_minute": 1000, "end_minute": 1060},
        {
            "id": uuid4(),
            "place_id": pb,
            "day_offset": 0,
            "start_minute": 1060 + gap,
            "end_minute": 1120 + gap,
        },
    ]
    return ConflictContext(
        room_id=uuid4(),
        places=[mk(pa, "A", BEN_THANH), mk(pb, "B", NHA_THO)],
        schedule_items=items,
    )


def test_rule_default_behaviour_unchanged():
    # ~0.8 km => rule gốc cần 2 phút; gap 2 là đủ
    assert TravelTimeConflictRule().evaluate(_context(gap=2)) == []


def test_rule_with_estimator_is_stricter():
    ctx = _context(gap=2)
    results = TravelTimeConflictRule(estimator=HaversineTravelEstimator()).evaluate(ctx)
    assert len(results) == 1
    assert results[0].rule_code == "TRAVEL_TIME"


def test_rule_with_estimator_passes_with_enough_gap():
    ctx = _context(gap=30)
    assert TravelTimeConflictRule(estimator=HaversineTravelEstimator()).evaluate(ctx) == []
