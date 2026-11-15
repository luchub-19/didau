"""CR-17 A (T-100): kind/category, gộp trùng Overture + OSM, score/minzoom của `scripts/build_places.py`,
và cách `PoiService` đọc snapshot mới (xếp theo score, xếp hạng tìm kiếm, alias, retired)."""

import gzip
import importlib.util
import json
import sys
from pathlib import Path

import pytest

from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector.osm_mapping import kind_category, osm_kind, overture_kind
from app.services.poi_service import PoiService

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "build_places.py"


@pytest.fixture(scope="module")
def bp():
    spec = importlib.util.spec_from_file_location("build_places", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["build_places"] = module
    spec.loader.exec_module(module)
    return module


# ── kind → category ────────────────────────────────────────────────────────────────────────────


def test_osm_kind_covers_new_groups() -> None:
    assert osm_kind({"amenity": "restaurant"}) == "restaurant"
    assert osm_kind({"amenity": "pub"}) == "bar"
    assert osm_kind({"amenity": "karaoke_box"}) == "karaoke"
    assert osm_kind({"shop": "mall"}) == "mall"
    assert osm_kind({"shop": "supermarket"}) == "supermarket"
    assert osm_kind({"leisure": "park"}) == "park"
    assert osm_kind({"tourism": "museum"}) == "museum"
    assert osm_kind({"shop": "convenience"}) is None  # MAP-POI §3.1: không lấy cửa hàng tiện lợi
    assert osm_kind({}) is None


def test_overture_kind_prefers_taxonomy_and_karaoke_name() -> None:
    assert overture_kind("coffee_shop", "coffee_shop") == "cafe"
    assert overture_kind("casual_eatery", "bakery") == "bakery"
    assert overture_kind("casual_eatery", "ice_cream_shop") == "dessert"
    assert overture_kind("non_alcoholic_beverage_venue", "bubble_tea_shop") == "tea"
    assert overture_kind("food_and_beverage_store", "grocery_store") == "supermarket"
    assert overture_kind("movie_theater", "movie_theater") == "cinema"
    assert overture_kind("bar", "bar", "Karaoke Nice") == "karaoke"
    assert overture_kind("convenience_store", "convenience_store") is None
    assert overture_kind("hotel", "hotel") is None
    assert overture_kind(None, None) is None


def test_kind_category() -> None:
    assert kind_category("eatery") == PlaceCategory.FOOD
    assert kind_category("tea") == PlaceCategory.DRINK
    assert kind_category("mall") == PlaceCategory.SHOPPING
    assert kind_category("karaoke") == PlaceCategory.ENTERTAINMENT
    assert kind_category("park") == PlaceCategory.SIGHTSEEING
    assert kind_category(None) == PlaceCategory.OTHER
    assert kind_category("lạ") == PlaceCategory.OTHER


# ── gộp trùng ──────────────────────────────────────────────────────────────────────────────────


def _ovt(bp, gid, name, lat, lng, kind="cafe", conf=0.9, **kw):
    return bp.Rec(
        external_id=f"ovt:{gid}",
        name=name,
        kind=kind,
        lat=lat,
        lng=lng,
        confidence=conf,
        datasets={"meta"},
        sources=["overture"],
        **kw,
    )


def _osm(bp, oid, name, lat, lng, kind="cafe", **kw):
    return bp.Rec(
        external_id=f"osm:node/{oid}",
        name=name,
        kind=kind,
        lat=lat,
        lng=lng,
        confidence=bp.OSM_ONLY_CONF,
        datasets={"OpenStreetMap"},
        sources=["osm"],
        **kw,
    )


def test_name_key_strips_common_words(bp) -> None:
    assert bp.name_key("Phúc Long Coffee & Tea") == "phuc long"
    assert bp.name_key("Cà Phê Phúc Long") == "phuc long"
    assert bp.name_key("Quán Cafe") == "quan cafe"  # bỏ hết thì giữ tên gốc


def test_merge_osm_into_overture_keeps_osm_id_and_hours(bp) -> None:
    ovt = _ovt(bp, "a", "Phúc Long Coffee & Tea", 10.7770, 106.7000, address="42 Lê Lợi, Quận 1")
    osm = _osm(bp, 1, "Phúc Long", 10.7772, 106.7001, opening_hours="Mo-Su 07:00-22:00")
    kept, stats = bp.merge([ovt], [osm])
    assert len(kept) == 1 and stats["gộp osm+overture"] == 1
    rec = kept[0]
    assert rec.external_id == "osm:node/1"  # quán phòng cũ vẫn tra được
    assert rec.name == "Phúc Long Coffee & Tea" and rec.address == "42 Lê Lợi, Quận 1"
    assert rec.opening_hours == "Mo-Su 07:00-22:00"
    assert rec.sources == ["overture", "osm"]


def test_merge_respects_distance_and_category(bp) -> None:
    far = _osm(bp, 2, "Phúc Long", 10.7780, 106.7000)  # ~110 m
    mall = _ovt(bp, "m", "Vincom", 10.7770, 106.7000, kind="mall")
    shop = _ovt(bp, "s", "Vincom", 10.7770, 106.7001, kind="cafe", conf=0.8)
    kept, _ = bp.merge([_ovt(bp, "a", "Phúc Long", 10.7770, 106.7000), mall, shop], [far])
    assert len(kept) == 4


def test_merge_same_brand_within_30m(bp) -> None:
    a = _ovt(bp, "a", "Highlands Coffee Lê Lợi", 10.7770, 106.7000, brand="Highlands Coffee")
    b = _ovt(bp, "b", "HLC Tầng 2", 10.7771, 106.7001, brand="Highlands Coffee", conf=0.8)
    c = _ovt(bp, "c", "HLC Kiosk", 10.7773, 106.7001, brand="Highlands Coffee", conf=0.75)  # ~37 m
    kept, stats = bp.merge([a, b, c], [])
    assert [r.external_id for r in kept] == ["ovt:a", "ovt:c"]
    assert stats["gộp overture"] == 1


def test_merge_two_osm_keeps_alias(bp) -> None:
    ovt = _ovt(bp, "a", "Cộng Cà Phê", 10.7770, 106.7000)
    kept, _ = bp.merge(
        [ovt],
        [_osm(bp, 1, "Cộng", 10.7770, 106.7000), _osm(bp, 2, "Cộng Cà Phê", 10.7770, 106.7000)],
    )
    assert len(kept) == 1
    assert kept[0].external_id == "osm:node/1" and kept[0].aliases == ["osm:node/2"]


# ── score, minzoom, district ───────────────────────────────────────────────────────────────────


def test_score_formula(bp) -> None:
    bare = _ovt(bp, "a", "Quán A", 10.0, 106.0, conf=0.7)
    assert bp.compute_score(bare) == 28  # 40 × 0,7
    rich = _ovt(
        bp,
        "b",
        "Vincom",
        10.0,
        106.0,
        kind="mall",
        conf=1.0,
        website="x",
        phone="1",
        brand="Vincom",
    )
    rich.datasets = {"meta", "Microsoft", "AllThePlaces"}
    rich.sources = ["overture", "osm"]
    assert bp.compute_score(rich) == 100  # 40+16+8+4+12+8+25 = 113 → kẹp 100


def test_minzoom_top_n_per_cell(bp) -> None:
    recs = [
        _ovt(bp, f"c{i}", f"Quán {i}", 10.7701 + i * 1e-5, 106.7001, conf=0.7) for i in range(10)
    ]
    recs.append(_ovt(bp, "m", "Mall", 10.7701, 106.7001, kind="mall"))
    for i, rec in enumerate(recs):
        rec.score = 50 - i
    recs[-1].score = 90
    bp.assign_minzoom(recs)
    zooms = {r.external_id: r.minzoom for r in recs}
    assert zooms["ovt:m"] == 12  # mốc lớn
    assert [zooms[f"ovt:c{i}"] for i in range(10)] == [13, 13, 13, 14, 14, 14, 14, 15, 15, 15]


def test_district_from_nearest_center_or_locality(bp) -> None:
    rec = _ovt(bp, "a", "A", 10.7770, 106.7000, locality="Quận 1")
    bp.assign_district(rec, [("Q1", 10.776, 106.700), ("Q3", 10.78, 106.68)])
    assert rec.district == "Q1"
    far = _ovt(bp, "b", "B", 10.95, 106.82, locality="Thành phố Biên Hòa")
    bp.assign_district(far, [("Q1", 10.776, 106.700)])
    assert far.district == "Biên Hòa"


# ── PoiService đọc snapshot mới ────────────────────────────────────────────────────────────────

PLACES = [
    {
        "external_id": "ovt:1",
        "name": "Phúc Long Lê Lợi",
        "kind": "cafe",
        "lat": 10.7770,
        "lng": 106.7000,
        "address": "42 Lê Lợi",
        "district": "Q1",
        "brand": "Phúc Long",
        "brand_key": "phuc-long",
        "score": 60,
    },
    {
        "external_id": "ovt:2",
        "name": "Phúc Long Nguyễn Trãi",
        "kind": "cafe",
        "lat": 10.7650,
        "lng": 106.6900,
        "district": "Q5",
        "brand_key": "phuc-long",
        "score": 80,
    },
    {
        "external_id": "ovt:3",
        "name": "Phúc Long Thủ Đức",
        "kind": "cafe",
        "lat": 10.8500,
        "lng": 106.7700,
        "score": 95,
    },
    {
        "external_id": "osm:node/9",
        "name": "Trà Sữa Long",
        "kind": "tea",
        "lat": 10.7771,
        "lng": 106.7001,
        "score": 99,
        "aliases": ["osm:node/10"],
    },
    {
        "external_id": "ovt:4",
        "name": "Vincom Center",
        "kind": "mall",
        "lat": 10.7780,
        "lng": 106.7020,
        "score": 90,
        "category": "SHOPPING",
    },
    {
        "external_id": "ovt:5",
        "name": "Cơm Gà",
        "kind": "restaurant",
        "lat": 10.7775,
        "lng": 106.7005,
        "score": 20,
        "brand": "Phúc Long",
    },
]
RETIRED = [
    {
        "external_id": "osm:node/77",
        "name": "Quán đã đóng",
        "amenity": "cafe",
        "lat": 10.77,
        "lng": 106.70,
    }
]


@pytest.fixture
def places(tmp_path: Path) -> PoiService:
    with gzip.open(tmp_path / "places_hcm.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(
            {"metadata": {"attribution": "OSM · Overture"}, "pois": PLACES, "retired": RETIRED}, fh
        )
    # snapshot cũ cùng thư mục bị bỏ qua khi đã có places_*
    with gzip.open(tmp_path / "pois_hcm.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(
            {
                "pois": [
                    {
                        "external_id": "osm:node/500",
                        "name": "Cũ",
                        "amenity": "cafe",
                        "lat": 10.77,
                        "lng": 106.70,
                    }
                ]
            },
            fh,
        )
    return PoiService(data_dir=tmp_path, weekday=0)


def test_places_load_fields_and_ignore_legacy(places: PoiService) -> None:
    assert len(places) == len(PLACES)
    assert places.get("osm:node/500") is None
    mall = places.get("ovt:4")
    assert (mall.kind, mall.category, mall.score, mall.minzoom) == (
        "mall",
        PlaceCategory.SHOPPING,
        90,
        17,
    )
    assert places.get("ovt:1").district == "Q1" and places.get("ovt:1").brand_key == "phuc-long"
    assert places.attribution == "OSM · Overture"


def test_alias_and_retired_resolve_by_id_only(places: PoiService) -> None:
    assert places.get("osm:node/10").external_id == "osm:node/9"
    retired = places.get("osm:node/77")
    assert retired is not None and retired.category == PlaceCategory.DRINK
    assert places.search("da dong", None, 10) == []
    assert all(
        p.external_id != "osm:node/77"
        for p in places.in_bbox((10.7, 106.6, 10.9, 106.8), None, 100)
    )


def test_in_bbox_sorted_by_score(places: PoiService) -> None:
    found = places.in_bbox((10.7, 106.6, 10.9, 106.8), None, 3)
    assert [p.external_id for p in found] == ["osm:node/9", "ovt:3", "ovt:4"]


def test_search_rank_name_then_band_then_score(places: PoiService) -> None:
    near_q1 = [p.external_id for p in places.search("phuc long", (10.7770, 106.7000), 10)]
    # khớp tên trước (brand-only "Cơm Gà" cuối); trong 3 km: Nguyễn Trãi (80) > Lê Lợi (60); Thủ Đức xa > 3 km
    assert near_q1 == ["ovt:2", "ovt:1", "ovt:3", "ovt:5"]
    # không có vị trí: theo score
    assert [p.external_id for p in places.search("phuc long", None, 3)] == [
        "ovt:3",
        "ovt:2",
        "ovt:1",
    ]
    # "long" là chuỗi con: "Trà Sữa Long" khớp đủ từ nên đứng cùng tầng với "Phúc Long …"
    assert places.search("long", None, 1)[0].external_id == "osm:node/9"
