import pytest

from app.domain.patterns.itinerary.opening_hours import parse_opening_hours

MON, TUE, SAT, SUN = 0, 1, 5, 6


def test_none_and_empty_are_unknown():
    assert parse_opening_hours(None, MON) is None
    assert parse_opening_hours("", MON) is None
    assert parse_opening_hours("   ", MON) is None


def test_24_7():
    assert parse_opening_hours("24/7", SUN) == [(0, 1439)]


def test_simple_range_all_days():
    assert parse_opening_hours("Mo-Su 07:00-22:00", SUN) == [(420, 1320)]


def test_range_without_days_applies_to_all():
    assert parse_opening_hours("08:30-21:00", TUE) == [(510, 1260)]


def test_weekday_weekend_rules():
    raw = "Mo-Fr 08:00-17:00; Sa,Su 09:00-12:00"
    assert parse_opening_hours(raw, MON) == [(480, 1020)]
    assert parse_opening_hours(raw, SAT) == [(540, 720)]
    assert parse_opening_hours(raw, SUN) == [(540, 720)]


def test_day_not_listed_is_closed():
    assert parse_opening_hours("Mo-Fr 08:00-17:00", SAT) == []


def test_multiple_intervals_same_day():
    assert parse_opening_hours("Mo-Su 07:00-12:00,13:00-22:00", MON) == [(420, 720), (780, 1320)]


def test_later_rule_overrides_earlier():
    raw = "Mo-Su 08:00-22:00; Su off"
    assert parse_opening_hours(raw, MON) == [(480, 1320)]
    assert parse_opening_hours(raw, SUN) == []


def test_public_holiday_rule_ignored():
    raw = "Mo-Su 08:00-22:00; PH off"
    assert parse_opening_hours(raw, MON) == [(480, 1320)]


def test_only_public_holiday_rule_is_unknown():
    assert parse_opening_hours("PH off", MON) is None


def test_overnight_is_cut_at_end_of_day():
    assert parse_opening_hours("Mo-Su 18:00-02:00", MON) == [(1080, 1439)]


def test_24_00_close_is_cut_to_last_minute():
    assert parse_opening_hours("Mo-Su 00:00-24:00", MON) == [(0, 1439)]


def test_wraparound_day_range():
    assert parse_opening_hours("Fr-Mo 10:00-20:00", SUN) == [(600, 1200)]
    assert parse_opening_hours("Fr-Mo 10:00-20:00", TUE) == []


@pytest.mark.parametrize(
    "raw",
    [
        "sunrise-sunset",
        "Mo-Su 25:00-26:00",
        "Mo-Su 10:75-12:00",
        "Xx 10:00-12:00",
        "by appointment",
        "Mo[1] 10:00-12:00",
    ],
)
def test_unknown_patterns_return_none(raw):
    assert parse_opening_hours(raw, MON) is None
