"""T-86: ALGO-01 tâm nhóm; T-94: ALGO-02 hoà phiếu bằng OMP (gđ7) — phần thuần (không DB, không mạng).

Chạy cùng `docs/phase6/algo-fixtures.json` với frontend. Tên test theo mã TC của tài liệu đồ án.
"""

import itertools
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.core import algo_config as cfg
from app.domain.algorithms import (
    OriginSource,
    TieGroup,
    TieMember,
    TiePlace,
    compute_group_center,
    decide,
    member_origins,
    resolve_origins,
    tied_groups,
)
from app.domain.algorithms.group_center import area_label, load_districts, spherical_mean
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.itinerary.travel import HaversineTravelEstimator, Leg, TravelSource
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


# ── ALGO-02 = OMP (gđ7, CR-15) ───────────────────────────────────────────────────────────────────
EST = HaversineTravelEstimator()


def mk_members(names: list[str], coords: dict[str, tuple[float, float]] | None = None) -> list[TieMember]:
    return [TieMember(uuid4(), n, (coords or {}).get(n, (10.77, 106.70))) for n in names]


def mk_place(
    name: str,
    score: int,
    order: int,
    *,
    coord: tuple[float, float] | None = (10.77, 106.70),
    category: PlaceCategory = PlaceCategory.FOOD,
    status: PlaceStatus = PlaceStatus.PROPOSED,
    down: int = 0,
) -> TiePlace:
    return TiePlace(
        uuid4(), name, status, score + down, T0 + timedelta(minutes=order), coord, category, down
    )


def km_grids(case_places: list[dict], places: list[TiePlace], n: int):
    """Ma trận km cho sẵn (fixture): `km_to[i]` = người i → quán, `km_back[i]` = quán → người i."""
    spec = {p["id"]: p for p in case_places}
    go = [[Leg(1, float(spec[p.name]["km_to"][i])) for p in places] for i in range(n)]
    back = [[Leg(1, float(spec[p.name]["km_back"][i])) for p in places] for i in range(n)]
    return go, back


def run_km_case(members: list[str], case_places: list[dict], params: dict | None = None):
    places = [mk_place(p["id"], 3, p["created_order"]) for p in case_places]
    tm = mk_members(members)
    go, back = km_grids(case_places, places, len(tm))
    kw = {"lam": params["lambda"], "k": params["k"]} if params else {}
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(places)), tm, go, back, **kw)
    return out, {p.place_id: p.name for p in places}


def geo_grids(members: list[TieMember], places: list[TiePlace]):
    go = [[None if p.coord is None else EST.leg(m.origin, p.coord) for p in places] for m in members]
    back = [[None if p.coord is None else EST.leg(p.coord, m.origin) for p in places] for m in members]
    return go, back


def doc_case():
    case = FX["tie_break"]["doc_case"]
    places = [
        mk_place(p["id"], p["score"], p["created_order"], coord=(p["lat"], p["lng"])) for p in case["places"]
    ]
    members = mk_members(case["members"], {n: pt(n) for n in case["members"]})
    return case, places, members


def test_tc04_fixture_van_hanh_mall_still_wins_by_km():
    """TC-04 tính lại bằng km khứ hồi (Haversine × 1,3): Vạn Hạnh Mall vẫn được đề xuất."""
    case, places, members = doc_case()
    go, back = geo_grids(members, places)
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(sorted(places, key=lambda p: p.created_at))), members, go, back)
    names = {p.place_id: p.name for p in places}
    exp = case["expect"]
    assert [names[r.place_id] for r in out.ranking] == exp["ranking"]
    assert names[out.recommended_place_id] == exp["recommended_place_id"]
    for r in out.ranking:
        n = names[r.place_id]
        assert r.psi == pytest.approx(exp["psi"][n], abs=1e-3)
        assert r.max_km == pytest.approx(exp["max_km"][n], abs=1e-3)
        assert r.total_km == pytest.approx(exp["total_km"][n], abs=1e-3)
    assert out.runner_up_psi == pytest.approx(exp["runner_up_psi"], abs=1e-3)
    # thành viên ở quán đề xuất: km khứ hồi đúng fixture, hạng 1..3 theo km tăng dần, w = 1 / 1 + λ/2 / 1 + λ
    km = dict(zip(case["members"], exp["round_trip_km"]["van_hanh_mall"], strict=True))
    assert {m.nickname: m.km for m in out.members} == pytest.approx(km, abs=1e-3)
    assert [m.rank for m in out.members] == [1, 2, 3]
    assert [m.weight for m in out.members] == [1.0, 1 + cfg.OMP_LAMBDA / 2, 1 + cfg.OMP_LAMBDA]
    assert [m.km for m in out.members] == sorted(m.km for m in out.members)
    assert out.estimated is True and out.source == "ESTIMATE"
    assert (out.lam, out.k) == (cfg.OMP_LAMBDA, cfg.OMP_K) == (1.0, 2.0)


def test_tc04_round_trip_uses_both_directions():
    """Bẫy T-94: trước T-95 leg() đối xứng nên khứ hồi = 2 × một chiều — nhưng lõi phải hỏi hai chiều."""
    _, places, members = doc_case()
    go, back = geo_grids(members, places)
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(places)), members, go, back)
    one_way = {p.place_id: [go[i][j].distance_km for i in range(3)] for j, p in enumerate(places)}
    rec = out.recommended_place_id
    assert sorted(m.km for m in out.members) == pytest.approx(sorted(2 * x for x in one_way[rec]), abs=1e-3)


def test_asymmetric_km_case():
    case = FX["tie_break"]["asymmetric"]
    out, names = run_km_case(case["members"], case["places"])
    assert [names[r.place_id] for r in out.ranking] == case["expect"]["ranking"]
    assert {names[r.place_id]: r.psi for r in out.ranking} == case["expect"]["psi"]


@pytest.mark.parametrize("g", range(len(FX["tie_break"]["psi_ties"]["groups"])))
def test_psi_ties_fall_through_max_sum_created(g):
    group = FX["tie_break"]["psi_ties"]["groups"][g]
    out, names = run_km_case(group["members"], group["places"], FX["tie_break"]["psi_ties"]["params"])
    assert [names[r.place_id] for r in out.ranking] == group["expect"]["ranking"]
    for name, value in group["expect"].get("psi", {}).items():
        assert next(r.psi for r in out.ranking if names[r.place_id] == name) == pytest.approx(value, abs=1e-9)


@pytest.mark.parametrize("key", ["asymmetric", "psi_ties"])
def test_candidate_and_member_order_does_not_change_result(key):
    groups = FX["tie_break"]["psi_ties"]["groups"] if key == "psi_ties" else [FX["tie_break"]["asymmetric"]]
    for group in groups:
        base = [mk_place(p["id"], 3, p["created_order"]) for p in group["places"]]
        names = {p.place_id: p.name for p in base}
        tm = mk_members(group["members"])
        spec = {p["id"]: p for p in group["places"]}
        baseline = None
        for perm in itertools.permutations(base):
            for mperm in itertools.permutations(range(len(tm))):
                members = [tm[i] for i in mperm]
                # hoán vị thành viên thì hàng km cũng phải đi theo người
                go = [[Leg(1, float(spec[p.name]["km_to"][i])) for p in perm] for i in mperm]
                back = [[Leg(1, float(spec[p.name]["km_back"][i])) for p in perm] for i in mperm]
                out = decide(TieGroup(PlaceCategory.FOOD, tuple(perm)), members, go, back)
                got = ([names[r.place_id] for r in out.ranking], [(m.nickname, m.rank) for m in out.members])
                baseline = baseline or got
                assert got == baseline


def test_tc03_tie_is_by_score_per_category():
    """TC-03: hoà theo ĐIỂM (Muốn đi − Không) trong cùng loại; > 2 quán hoà thì xét tất cả."""
    a = mk_place("a", 3, 0)
    b = mk_place("b", 3, 1, down=2)  # 5 Muốn đi − 2 Không = 3 điểm: vẫn hoà với a
    c = mk_place("c", 1, 2)
    drink1, drink2 = mk_place("d1", 2, 3, category=PlaceCategory.DRINK), mk_place("d2", 2, 4, category=PlaceCategory.DRINK)
    groups = tied_groups([c, b, drink2, a, drink1])
    assert [(g.category, [p.name for p in g.candidates]) for g in groups] == [
        (PlaceCategory.FOOD, ["a", "b"]),
        (PlaceCategory.DRINK, ["d1", "d2"]),
    ]
    many = [mk_place(f"p{i}", 4, i) for i in range(5)] + [mk_place("low", 2, 9)]
    assert len(tied_groups(many)[0].candidates) == 5


def test_same_score_in_different_categories_is_not_a_tie():
    assert tied_groups([mk_place("food", 3, 0), mk_place("drink", 3, 1, category=PlaceCategory.DRINK)]) == []


def test_more_upvotes_but_lower_score_is_not_tied():
    """gđ6 hoà theo số Muốn đi; gđ7 theo điểm: 5↑2↓ (3 điểm) không hoà với 5↑0↓ (5 điểm)."""
    assert tied_groups([mk_place("a", 5, 0), mk_place("b", 3, 1, down=2)]) == []


@pytest.mark.parametrize(
    "places",
    [
        [("only", 5, 0), ("lower", 2, 1)],  # một quán dẫn đầu
        [("a", 0, 0), ("b", 0, 1)],  # chưa ai bỏ phiếu: không phải hoà có nghĩa
        [],
    ],
)
def test_no_tie_returns_empty(places):
    assert tied_groups([mk_place(n, s, o) for n, s, o in places]) == []


def test_zero_score_tie_counts_when_people_voted():
    """1↑1↓ và 0 phiếu → cùng 0 điểm, có hoạt động bỏ phiếu → hoà (như TIE_AT_TOP)."""
    groups = tied_groups([mk_place("a", 0, 0, down=1), mk_place("b", 0, 1)])
    assert [p.name for p in groups[0].candidates] == ["a", "b"]


def test_accepted_place_blocks_its_category_only_and_rejected_is_ignored():
    places = [
        mk_place("a", 3, 0, status=PlaceStatus.ACCEPTED),
        mk_place("b", 3, 1),
        mk_place("c", 3, 2, status=PlaceStatus.REJECTED),
        mk_place("v", 3, 3, status=PlaceStatus.VISITED),
        mk_place("d1", 1, 4, category=PlaceCategory.DRINK),
        mk_place("d2", 1, 5, category=PlaceCategory.DRINK),
    ]
    assert [g.category for g in tied_groups(places)] == [PlaceCategory.DRINK]
    resolved = tied_groups(places, ignore_accepted=True)
    assert [p.name for p in resolved[0].candidates] == ["a", "b"]


def test_member_without_own_origin_is_excluded_no_meeting_point():
    a, b, c = uuid4(), uuid4(), uuid4()
    rows = [(a, "A", (10.78, 106.70)), (b, "B", None), (c, "C", None)]
    members, excluded = member_origins(rows)
    assert [m.member_id for m in members] == [a] and excluded == 2
    assert members[0].origin_source is OriginSource.MEMBER
    # ALGO-04 vẫn lùi về điểm hẹn (gđ6 §1, không đổi)
    members, excluded = resolve_origins(rows, (10.77, 106.69))
    assert excluded == 0 and members[1].origin_source is OriginSource.MEETING_POINT


def test_place_without_coords_is_unranked_and_never_recommended():
    near = mk_place("near", 3, 1)
    nocoord = mk_place("nocoord", 3, 0, coord=None)
    members = mk_members(["a", "b"])
    go = [[Leg(10, 2.0), None], [Leg(12, 2.5), None]]
    back = [[Leg(10, 2.0), None], [Leg(12, 2.5), None]]
    out = decide(TieGroup(PlaceCategory.FOOD, (near, nocoord)), members, go, back)
    assert out.recommended_place_id == near.place_id
    assert out.unranked == (nocoord.place_id,)
    assert out.runner_up_psi is None
    assert out.ranking[0].max_min == 24  # 12 đi + 12 về


def test_no_members_or_no_coords_gives_no_recommendation():
    p, q = mk_place("p", 3, 0, coord=None), mk_place("q", 3, 1, coord=None)
    out = decide(TieGroup(PlaceCategory.FOOD, (p, q)), [], [], [])
    assert out.recommended_place_id is None and out.ranking == () and set(out.unranked) == {p.place_id, q.place_id}


def test_single_member_weight_is_one():
    p, q = mk_place("p", 3, 0), mk_place("q", 3, 1)
    members = mk_members(["solo"])
    go = [[Leg(5, 1.0), Leg(5, 3.0)]]
    back = [[Leg(5, 1.5), Leg(5, 0.5)]]
    out = decide(TieGroup(PlaceCategory.FOOD, (p, q)), members, go, back)
    assert out.recommended_place_id == p.place_id  # 2,5 km < 3,5 km
    assert [(m.rank, m.weight, m.km) for m in out.members] == [(1, 1.0, 2.5)]


def test_source_and_estimated_flags():
    p, q = mk_place("p", 3, 0), mk_place("q", 3, 1)
    members = mk_members(["a"])
    g = TravelSource.GOOGLE
    all_google = [[Leg(5, 1.0, g), Leg(6, 1.0, g)]]
    out = decide(TieGroup(PlaceCategory.FOOD, (p, q)), members, all_google, all_google)
    assert (out.estimated, out.source) == (False, "GOOGLE")
    mixed = [[Leg(5, 1.0, g), Leg(6, 1.0)]]
    out = decide(TieGroup(PlaceCategory.FOOD, (p, q)), members, mixed, all_google)
    assert (out.estimated, out.source) == (True, "ESTIMATE")


# ── Chiến lược TRAVEL_TIME (resolve) ─────────────────────────────────────────────────────────────
def _summary(name: str, up: int, down: int, order: int, category: PlaceCategory = PlaceCategory.FOOD) -> PlaceVoteSummary:
    return PlaceVoteSummary(
        place_id=uuid4(),
        name=name,
        category=category,
        submitted_by_id=uuid4(),
        created_at=T0 + timedelta(minutes=order),
        upvotes=up,
        downvotes=down,
        score=up - down,
    )


def test_strategy_follows_ranking_and_groups_by_score():
    # b: 6↑3↓ = 3 điểm, a: 3↑0↓ = 3 điểm → hoà theo điểm, xếp theo thứ hạng OMP
    a, b, c = _summary("a", 3, 0, 0), _summary("b", 6, 3, 1), _summary("c", 2, 0, 2)
    strategy = TravelTimeTieBreakStrategy([b.place_id, a.place_id])
    ctx = TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    resolved, applied = resolve_voting_with_tie_break([a, b, c], 1, strategy, ctx)
    assert [(r.name, r.status.value) for r in resolved] == [
        ("b", "ACCEPTED"),
        ("a", "REJECTED"),
        ("c", "REJECTED"),
    ]
    assert applied


def test_strategy_same_upvotes_but_different_score_is_not_tied():
    """gđ6 gom theo upvotes; gđ7 theo điểm → a (5 điểm) thắng b (2 điểm) dù thứ hạng OMP đặt b trước."""
    a, b = _summary("a", 5, 0, 0), _summary("b", 5, 3, 1)
    strategy = TravelTimeTieBreakStrategy([b.place_id, a.place_id])
    resolved, applied = resolve_voting_with_tie_break(
        [a, b], 1, strategy, TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    )
    assert resolved[0].name == "a" and not applied


def test_strategy_groups_per_category():
    """Cùng 3 điểm nhưng khác loại → hai nhóm riêng; thứ hạng chỉ so trong một loại."""
    f1, f2 = _summary("f1", 3, 0, 0), _summary("f2", 3, 0, 1)
    d1 = _summary("d1", 3, 0, 2, PlaceCategory.DRINK)
    strategy = TravelTimeTieBreakStrategy([f2.place_id, f1.place_id, d1.place_id])
    assert TravelTimeTieBreakStrategy.group_key(f1) == (3, "FOOD")
    resolved, applied = resolve_voting_with_tie_break(
        [d1, f1, f2], 3, strategy, TieBreakContext(room_id=uuid4(), host_member_id=uuid4())
    )
    names = [r.name for r in resolved]
    assert names.index("f2") < names.index("f1") and applied


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


# ── CR-19: người xa nhất của từng quán ───────────────────────────────────────────────────────────
def test_cr19_farthest_member_per_ranking_row_doc_case():
    """Fixture 4 người: mỗi dòng ranking gọi đúng người có km khứ hồi lớn nhất ở quán đó."""
    _, places, members = doc_case()
    go, back = geo_grids(members, places)
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(places)), members, go, back)
    col = {p.place_id: j for j, p in enumerate(places)}
    assert len(out.ranking) == len(places)
    for r in out.ranking:
        j = col[r.place_id]
        km = [go[i][j].distance_km + back[i][j].distance_km for i in range(len(members))]
        assert r.farthest_member_id == members[km.index(max(km))].member_id
        assert round(max(km), 3) == r.max_km


def test_cr19_farthest_tie_picks_smaller_member_id():
    ids = sorted(uuid4() for _ in range(3))
    # đưa thành viên vào theo thứ tự đảo để thấy kết quả không phụ thuộc thứ tự đầu vào
    members = [TieMember(ids[2], "C", (10.77, 106.70)), TieMember(ids[0], "A", (10.77, 106.70)),
               TieMember(ids[1], "B", (10.77, 106.70))]
    places = [mk_place("P", 3, 0)]
    go = [[Leg(1, 5.0)], [Leg(1, 5.0)], [Leg(1, 2.0)]]
    back = [[Leg(1, 5.0)], [Leg(1, 5.0)], [Leg(1, 2.0)]]
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(places)), members, go, back)
    assert out.ranking[0].farthest_member_id == min(ids[2], ids[0], key=str)


def test_cr19_unranked_place_has_no_row():
    """Quán thiếu toạ độ không có dòng ranking → không có farthest_member_id."""
    members = mk_members(["A", "B"])
    places = [mk_place("P", 3, 0), mk_place("Q", 3, 1, coord=None)]
    go = [[Leg(1, 3.0), None], [Leg(1, 4.0), None]]
    back = [[Leg(1, 3.0), None], [Leg(1, 4.0), None]]
    out = decide(TieGroup(PlaceCategory.FOOD, tuple(places)), members, go, back)
    assert [r.place_id for r in out.ranking] == [places[0].place_id]
    assert out.ranking[0].farthest_member_id == members[1].member_id
