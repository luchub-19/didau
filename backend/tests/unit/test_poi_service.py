import gzip
import json
from pathlib import Path

import pytest

from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector.osm_mapping import osm_address, osm_category
from app.services.poi_service import PoiService, normalize_text

RECORDS = [
    {
        "external_id": "osm:node/1",
        "name": "Phở Hòa Pasteur",
        "amenity": "restaurant",
        "lat": 10.7769,
        "lng": 106.6918,
        "cuisine": "vietnamese",
        "opening_hours": "Mo-Su 06:00-22:00",
        "addr": {"housenumber": "260C", "street": "Pasteur"},
    },
    {
        "external_id": "osm:node/2",
        "name": "Bún Bò Huế Cô Ba",
        "amenity": "restaurant",
        "lat": 10.7790,
        "lng": 106.7000,
        "cuisine": "bun_bo",
    },
    {
        "external_id": "osm:way/3",
        "name": "Cà Phê Sữa Đá",
        "amenity": "cafe",
        "lat": 10.7800,
        "lng": 106.7010,
        "opening_hours": "Mo-Fr 07:00-17:00; Sa,Su off",
    },
    {
        "external_id": "osm:node/4",
        "name": "Phở Bắc",
        "amenity": "fast_food",
        "lat": 10.8500,
        "lng": 106.7500,
    },
    {"external_id": "osm:node/5", "name": "", "amenity": "cafe", "lat": 10.78, "lng": 106.70},
    {
        "external_id": "osm:node/6",
        "name": "Kem Tràng Tiền",
        "amenity": "ice_cream",
        "lat": 10.7795,
        "lng": 106.7005,
    },
    {
        "external_id": "osm:node/1",
        "name": "Trùng id",
        "amenity": "cafe",
        "lat": 10.7769,
        "lng": 106.6918,
    },
]


@pytest.fixture
def service(tmp_path: Path) -> PoiService:
    payload = {"metadata": {"attribution": "© OSM test"}, "pois": RECORDS}
    with gzip.open(tmp_path / "pois_test.json.gz", "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    return PoiService(data_dir=tmp_path, weekday=0)  # Thứ Hai


def test_normalize_text() -> None:
    assert normalize_text("  Phở  Đặc Biệt ") == "pho dac biet"
    assert normalize_text("Bún Bò Huế") == "bun bo hue"


def test_category_and_address_mapping() -> None:
    assert osm_category({"amenity": "restaurant"}) == PlaceCategory.FOOD
    assert osm_category({"amenity": "fast_food"}) == PlaceCategory.FOOD
    assert osm_category({"amenity": "cafe"}) == PlaceCategory.DRINK
    assert osm_category({"amenity": "ice_cream"}) == PlaceCategory.DRINK
    assert osm_category({"amenity": "cinema"}) == PlaceCategory.OTHER
    assert osm_category({}) == PlaceCategory.OTHER
    assert osm_address({"addr:housenumber": "1", "addr:street": "Lê Lợi", "addr:city": "HCM"}) == (
        "1 Lê Lợi, HCM"
    )
    assert osm_address({}) is None


def test_load_skips_nameless_and_duplicates(service: PoiService) -> None:
    assert len(service) == 5
    assert service.get("osm:node/1").name == "Phở Hòa Pasteur"  # bản đầu thắng
    assert service.get("osm:node/5") is None
    assert service.attribution == "© OSM test"


def test_missing_data_dir_gives_empty_service(tmp_path: Path) -> None:
    empty = PoiService(data_dir=tmp_path / "khong-co")
    assert len(empty) == 0
    assert empty.search("pho", None, 10) == []
    assert empty.in_bbox((10.0, 106.0, 10.1, 106.1), None, 10) == []


def test_get_maps_fields_and_hours(service: PoiService) -> None:
    pho = service.get("osm:node/1")
    assert pho.category == PlaceCategory.FOOD
    assert pho.address == "260C Pasteur"
    assert (pho.open_minute, pho.close_minute) == (360, 1320)
    cafe = service.get("osm:way/3")
    assert (cafe.open_minute, cafe.close_minute) == (420, 1020)
    assert service.get("osm:node/2").open_minute is None


def test_hours_use_weekday(tmp_path: Path) -> None:
    with gzip.open(tmp_path / "pois_x.json.gz", "wt", encoding="utf-8") as fh:
        json.dump({"pois": [RECORDS[2]]}, fh)
    sunday = PoiService(data_dir=tmp_path, weekday=6)
    assert sunday.get("osm:way/3").open_minute is None  # Su off


def test_in_bbox_filters_by_area_and_category(service: PoiService) -> None:
    bbox = (10.77, 106.69, 10.79, 106.71)
    ids = {p.external_id for p in service.in_bbox(bbox, None, 100)}
    assert ids == {"osm:node/1", "osm:node/2", "osm:way/3", "osm:node/6"}
    drinks = service.in_bbox(bbox, PlaceCategory.DRINK, 100)
    assert {p.external_id for p in drinks} == {"osm:way/3", "osm:node/6"}
    assert len(service.in_bbox(bbox, None, 2)) == 2


def test_in_bbox_spans_multiple_grid_cells(service: PoiService) -> None:
    ids = {p.external_id for p in service.in_bbox((10.70, 106.60, 10.90, 106.80), None, 100)}
    assert "osm:node/4" in ids and "osm:node/1" in ids


def test_search_accent_insensitive(service: PoiService) -> None:
    assert [p.external_id for p in service.search("pho", None, 10)] == ["osm:node/1", "osm:node/4"]
    assert service.search("PHỞ", None, 10) == service.search("pho", None, 10)
    assert service.search("bun bo", None, 10)[0].name == "Bún Bò Huế Cô Ba"
    assert service.search("ca phe sua da", None, 10)[0].external_id == "osm:way/3"
    assert service.search("zzzz", None, 10) == []
    assert service.search("   ", None, 10) == []


def test_search_matches_cuisine_but_ranks_name_first(service: PoiService) -> None:
    assert [p.external_id for p in service.search("vietnamese", None, 10)] == ["osm:node/1"]


def test_search_sorts_by_distance_and_sets_distance(service: PoiService) -> None:
    near_bac = service.search("pho", (10.8500, 106.7500), 10)
    assert near_bac[0].external_id == "osm:node/4"
    assert near_bac[0].distance_km == 0.0
    assert near_bac[1].distance_km > 5
    assert service.search("pho", None, 10)[0].distance_km is None
