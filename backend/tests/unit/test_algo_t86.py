"""T-86: ALGO-01 tâm nhóm + ALGO-02 hoà phiếu — phần thuần (không DB, không mạng).

Chạy cùng `docs/phase6/algo-fixtures.json` với frontend. Tên test theo mã TC của tài liệu đồ án.
"""

import itertools
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.domain.algorithms import (
    OriginSource,
    TieMember,
    TiePlace,
    compute_group_center,
    decide,
    resolve_origins,
    tied_candidates,
)
from app.domain.algorithms.group_center import area_label, load_districts, spherical_mean
from app.domain.enums import PlaceStatus
from app.domain.patterns.itinerary.travel import Leg
from app.domain.patterns.tie_break import (
    PlaceVoteSummary,
    TieBreakContext,
    TravelTimeTieBreakStrategy,
    resolve_voting_with_tie_break,
)

FX = json.loads(
    (Path(__file__).resolve().parents[3] / "docs" / "phase6" / "algo-fixtures.json").read_text(
        encoding="utf-8"
    )
)
PTS = FX["points"]
TOL = FX["_meta"]["tolerance"]
T0 = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)


def pt(name: str) -> tuple[float, float]:
    return PTS[name]["lat"], PTS[name]["lng"]


def mk_members(n: int) -> list[TieMember]:
    return [
        TieMember(uuid4(), f"m{i}", (10.77, 106.70), OriginSource.MEMBER) for i in range(n)
    ]


def mk_places(spec: dict) -> list[TiePlace]:
    """`spec`: id → (upvotes, created_order); toạ độ giả (ma trận cho sẵn nên không dùng)."""
    return [
        TiePlace(uuid4(), pid, PlaceStatus.PROPOSED, up, T0 + timedelta(minutes=order), (10.77, 106.70))
        for pid, (up, order) in spec.items()
    ]


def matrix_for(case: dict, places: list[TiePlace], members: list[TieMember]):
    by_name = {p.name: i for i, p in enumerate(places)}
    cells: list[list[Leg | None]] = [[None] * len(places) for _ in members]
    for spec in case["places"]:
        j = by_name[spec["id"]]
        dist = spec.get("distance_km") or case.get("distance_km", {}).get(spec["id"]) or [1] * len(members)
        for i, minutes in enumerate(spec["minutes"]):
            cells[i][j] = Leg(minutes, float(dist[i]))
    return cells


def run_case(case: dict):
    places = mk_places({p["id"]: (p["upvotes"], p["created_order"]) for p in case["places"]})
    members = mk_members(len(case["places"][0]["minutes"]))
    outcome = decide(places, members, matrix_for(case, places, members))
    names = {p.place_id: p.name for p in places}
    return outcome, names


# ── ALGO-01 ───────────────────────────────────────────────────────────────────────────────────────
def test_tc01_three_positions_give_center():
    pts = [pt(n) for n in FX["group_center"]["members"]]
    result = compute_group_center(pts, "HCM")
    exp = FX["group_center"]["expect"]
    assert result.available and result.member_count == exp["member_count"]
    assert result.center[0] == pytest.approx(exp["lat"], abs=TOL["center_deg"])
    assert result.center[1] == pytest.approx(exp["lng"], abs=TOL["center_deg"])
    # làm tròn đúng 3 chữ số (riêng tư ~100 m)
    assert result.center == (round(result.center[0], 3), round(result.center[1], 3))
    assert result.area_label


def test_tc02_adding_member_moves_center():
    three = compute_group_center([pt(n) for n in ("bao", "nam", "linh")], "HCM")
    four = compute_group_center([pt(n) for n in ("bao", "nam", "linh", "ben_thanh")], "HCM")
    assert four.member_count == 4 and four.center != three.center
    # đổi đủ lớn hơn độ làm tròn 3 chữ số
    assert abs(four.center[1] - three.center[1]) >= 0.001 or abs(four.center[0] - three.center[0]) >= 0.001


@pytest.mark.parametrize("n", [0, 1])
def test_fewer_than_two_members_has_no_center(n):
    r = compute_group_center([pt("bao")][:n], "HCM")
    assert not r.available and r.center is None and r.area_label is None and r.member_count == n


def test_center_is_permutation_invariant_and_spherical_across_antimeridian():
    pts = [pt("bao"), pt("nam"), pt("linh")]
    base = compute_group_center(pts, "HCM")
    for perm in itertools.permutations(pts):
        assert compute_group_center(list(perm), "HCM") == base
    # hai điểm sát hai bên kinh tuyến 180° phải ra ~180°, không phải 0° (trung bình số học sai)
    mid = spherical_mean([(0.0, 179.0), (0.0, -179.0)])
    assert abs(abs(mid[1]) - 180.0) < 1e-6


def test_antipodal_points_have_no_center():
    assert spherical_mean([(10.0, 20.0), (-10.0, -160.0)]) is None


def test_area_label_single_and_two_districts():
    d = load_districts("HCM")
    q1 = next(x for x in d if x.short == "Q1")
    assert area_label((q1.lat, q1.lng), d) == "Q1"
    q3 = next(x for x in d if x.short == "Q3")
    # điểm nằm giữa Q1 và Q3 → nhãn gộp, gần nhất đứng trước
    mid = ((q1.lat + q3.lat) / 2, (q1.lng + q3.lng) / 2 - 0.002)
    label = area_label(mid, d)
    assert " – " in label and {"Q1", "Q3"} <= set(label.split(" – "))


def test_area_label_hn_and_far_city():
    assert load_districts("HN") and load_districts("HCM")
    r = compute_group_center([(21.03, 105.85), (21.02, 105.84)], "HCM")  # phòng ghi sai thành phố
    assert r.available and r.area_label  # lùi sang bảng HN
    far = compute_group_center([(48.85, 2.35), (48.86, 2.36)], "HCM")
    assert far.available and far.area_label is None


# ── ALGO-02 ───────────────────────────────────────────────────────────────────────────────────────
def test_tc04_fixture_van_hanh_mall_wins_by_3():
    outcome, names = run_case(FX["tie_break"]["doc_case"])
    exp = FX["tie_break"]["doc_case"]["expect"]
    assert [names[r.place_id] for r in outcome.ranking] == exp["ranking"]
    assert names[outcome.recommended_place_id] == exp["recommended_place_id"]
    assert outcome.margin_vs_second_min == exp["margin_vs_second_min"]
    assert {names[r.place_id]: r.total_min for r in outcome.ranking} == exp["S"]
    assert {names[r.place_id]: r.max_min for r in outcome.ranking} == exp["M"]


def test_threshold_is_not_transitive():
    case = FX["tie_break"]["threshold_not_transitive"]
    outcome, names = run_case(case)
    assert [names[r.place_id] for r in outcome.ranking] == case["expect"]["ranking"]
    assert {names[r.place_id]: r.max_min for r in outcome.ranking} == case["expect"]["M"]


def test_ties_fall_through_to_distance_then_created():
    case = FX["tie_break"]["tie_break_by_distance_then_created"]
    outcome, names = run_case(case)
    assert [names[r.place_id] for r in outcome.ranking] == case["expect"]["ranking"]


@pytest.mark.parametrize(
    "case_key", ["doc_case", "threshold_not_transitive", "tie_break_by_distance_then_created"]
)
def test_candidate_order_does_not_change_result(case_key):
    case = FX["tie_break"][case_key]
    base_places = mk_places({p["id"]: (p["upvotes"], p["created_order"]) for p in case["places"]})
    members = mk_members(len(case["places"][0]["minutes"]))
    baseline = None
    for perm in itertools.permutations(base_places):
        outcome = decide(list(perm), members, matrix_for(case, list(perm), members))
        names = {p.place_id: p.name for p in base_places}
        got = [names[r.place_id] for r in outcome.ranking]
        baseline = baseline or got
        assert got == baseline


def test_tc03_two_places_tied_candidates_and_trigger_rules():
    places = mk_places({"a": (3, 0), "b": (3, 1), "c": (1, 2)})
    assert [p.name for p in tied_candidates(places)] == ["a", "b"]
    # >3 quán hoà → xét tất cả
    many = mk_places({f"p{i}": (4, i) for i in range(5)} | {"low": (2, 9)})
    assert len(tied_candidates(many)) == 5


@pytest.mark.parametrize(
    "spec",
    [
        {"only": (5, 0), "lower": (2, 1)},  # một quán dẫn đầu
        {"a": (0, 0), "b": (0, 1)},  # hoà ở 0 phiếu: không phải hoà có nghĩa
        {},
    ],
)
def test_no_tie_returns_empty(spec):
    assert tied_candidates(mk_places(spec)) == []


def test_accepted_place_blocks_trigger_but_not_resolve_and_rejected_is_ignored():
    places = mk_places({"a": (3, 0), "b": (3, 1), "c": (3, 2)})
    places[0] = TiePlace(
        places[0].place_id, "a", PlaceStatus.ACCEPTED, 3, places[0].created_at, places[0].coord
    )
    places[2] = TiePlace(places[2].place_id, "c", PlaceStatus.REJECTED, 3, places[2].created_at, places[2].coord)
    assert tied_candidates(places) == []
    assert [p.name for p in tied_candidates(places, ignore_accepted=True)] == ["a", "b"]


def test_member_without_origin_takes_meeting_point_or_is_excluded():
    a, b, c = uuid4(), uuid4(), uuid4()
    rows = [(a, "A", (10.78, 106.70)), (b, "B", None), (c, "C", None)]
    members, excluded = resolve_origins(rows, (10.77, 106.69))
    assert excluded == 0
    assert [m.origin_source for m in members] == [
        OriginSource.MEMBER,
        OriginSource.MEETING_POINT,
        OriginSource.MEETING_POINT,
    ]
    assert members[1].origin == (10.77, 106.69)
    members, excluded = resolve_origins(rows, None)
    assert [m.member_id for m in members] == [a] and excluded == 2


def test_place_without_coords_is_unranked_and_never_recommended():
    places = mk_places({"near": (3, 1), "nocoord": (3, 0)})
    places[1] = TiePlace(places[1].place_id, "nocoord", PlaceStatus.PROPOSED, 3, places[1].created_at, None)
    members = mk_members(2)
    matrix = [[Leg(10, 2.0), None], [Leg(12, 2.5), None]]
    outcome = decide(places, members, matrix)
    assert outcome.recommended_place_id == places[0].place_id
    assert outcome.unranked == (places[1].place_id,)
    assert outcome.margin_vs_second_min is None


def test_estimated_flag_false_only_when_every_leg_is_google():
    from app.domain.patterns.itinerary.travel import TravelSource

    places = mk_places({"a": (3, 0), "b": (3, 1)})
    members = mk_members(1)
    g = [[Leg(5, 1.0, TravelSource.GOOGLE), Leg(6, 1.0, TravelSource.GOOGLE)]]
    assert decide(places, members, g).estimated is False
    mixed = [[Leg(5, 1.0, TravelSource.GOOGLE), Leg(6, 1.0)]]
    assert decide(places, members, mixed).estimated is True


# ── Chiến lược TRAVEL_TIME ────────────────────────────────────────────────────────────────────────
def _summary(name: str, up: int, down: int, order: int) -> PlaceVoteSummary:
    return PlaceVoteSummary(
        place_id=uuid4(),
        name=name,
        submitted_by_id=uuid4(),
        created_at=T0 + timedelta(minutes=order),
        upvotes=up,
        downvotes=down,
        score=up - down,
    )


def test_strategy_follows_ranking_and_groups_by_upvotes_not_score():
    # b có score thấp hơn a (nhiều downvote) nhưng cùng upvotes → vẫn hoà, xếp theo thứ hạng đi lại
    a, b, c = _summary("a", 5, 0, 0), _summary("b", 5, 3, 1), _summary("c", 2, 0, 2)
    strategy = TravelTimeTieBreakStrategy([b.place_id, a.place_id])
    ctx = TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    resolved, applied = resolve_voting_with_tie_break([a, b, c], 1, strategy, ctx)
    assert [(r.name, r.status.value) for r in resolved] == [
        ("b", "ACCEPTED"),
        ("a", "REJECTED"),
        ("c", "REJECTED"),
    ]
    assert applied


def test_strategy_without_ranking_falls_back_to_upvotes_then_earliest():
    a, b = _summary("a", 4, 0, 5), _summary("b", 4, 0, 1)
    resolved, _ = resolve_voting_with_tie_break(
        [a, b], 1, TravelTimeTieBreakStrategy(), TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    )
    assert resolved[0].name == "b"


def test_old_strategies_still_group_by_score():
    from app.domain.patterns.tie_break import MostUpvotesTieBreakStrategy

    a, b = _summary("a", 5, 0, 0), _summary("b", 5, 3, 1)
    resolved, applied = resolve_voting_with_tie_break(
        [a, b], 1, MostUpvotesTieBreakStrategy(), TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    )
    assert resolved[0].name == "a" and not applied  # score khác nhau → không phải hoà
