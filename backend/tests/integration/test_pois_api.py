import gzip
import json
import time
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.v1.pois import get_poi_repository
from app.main import app
from app.services.poi_service import DEFAULT_DATA_DIR, PoiService, get_poi_service


class RamOnlyRepo:
    """Bảng `pois` "chưa nạp": các test ở file này kiểm đường tìm trong RAM (test Postgres: test_pois_db.py)."""

    async def is_ready(self) -> bool:
        return False

RECORDS = [
    {
        "external_id": "osm:node/1",
        "name": "Phở Hòa Pasteur",
        "amenity": "restaurant",
        "lat": 10.7769,
        "lng": 106.6918,
        "cuisine": "vietnamese",
        "opening_hours": "Mo-Su 06:00-22:00",
        "addr": {"street": "Pasteur"},
    },
    {
        "external_id": "osm:way/2",
        "name": "Bún Bò Huế Cô Ba",
        "amenity": "restaurant",
        "lat": 10.7790,
        "lng": 106.7000,
    },
    {
        "external_id": "osm:node/3",
        "name": "Cà Phê Sữa Đá",
        "amenity": "cafe",
        "lat": 10.7800,
        "lng": 106.7010,
    },
]
Q1_BBOX = "10.76,106.68,10.79,106.71"


def _service(tmp_path: Path) -> PoiService:
    with gzip.open(tmp_path / "pois_test.json.gz", "wt", encoding="utf-8") as fh:
        json.dump({"pois": RECORDS}, fh, ensure_ascii=False)
    return PoiService(data_dir=tmp_path, weekday=0)


@pytest.fixture
async def client(tmp_path: Path) -> AsyncGenerator[AsyncClient, None]:
    service = _service(tmp_path)
    app.dependency_overrides[get_poi_service] = lambda: service
    app.dependency_overrides[get_poi_repository] = RamOnlyRepo
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_poi_service, None)
    app.dependency_overrides.pop(get_poi_repository, None)


async def test_list_by_bbox_and_category(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois", params={"bbox": Q1_BBOX})
    assert resp.status_code == 200
    assert {p["external_id"] for p in resp.json()} == {"osm:node/1", "osm:way/2", "osm:node/3"}

    drinks = await client.get("/api/v1/pois", params={"bbox": Q1_BBOX, "category": "DRINK"})
    assert [p["name"] for p in drinks.json()] == ["Cà Phê Sữa Đá"]

    limited = await client.get("/api/v1/pois", params={"bbox": Q1_BBOX, "limit": 1})
    assert len(limited.json()) == 1


async def test_list_response_shape(client: AsyncClient) -> None:
    pho = (
        await client.get("/api/v1/pois", params={"bbox": "10.776,106.691,10.778,106.693"})
    ).json()[0]
    assert pho["category"] == "FOOD"
    assert pho["address"] == "Pasteur"
    assert (pho["open_minute"], pho["close_minute"]) == (360, 1320)
    assert pho["distance_km"] is None


@pytest.mark.parametrize(
    "bbox",
    [
        "10.0,106.0,11.0,107.0",  # quá lớn (1° × 1°)
        "10.0,106.0,10.3,106.1",  # lat span 0,3°
        "10.79,106.68,10.76,106.71",  # min > max
        "a,b,c,d",
        "10.76,106.68,10.79",
        "",
    ],
)
async def test_list_rejects_bad_bbox(client: AsyncClient, bbox: str) -> None:
    resp = await client.get("/api/v1/pois", params={"bbox": bbox})
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_list_requires_bbox_and_valid_params(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/pois")).status_code == 422
    bad_cat = await client.get("/api/v1/pois", params={"bbox": Q1_BBOX, "category": "XYZ"})
    assert bad_cat.status_code == 422
    bad_limit = await client.get("/api/v1/pois", params={"bbox": Q1_BBOX, "limit": 0})
    assert bad_limit.status_code == 422


async def test_search_accent_insensitive(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/search", params={"q": "pho"})
    assert [p["name"] for p in resp.json()] == ["Phở Hòa Pasteur"]
    resp = await client.get("/api/v1/pois/search", params={"q": "bun bo"})
    assert [p["name"] for p in resp.json()] == ["Bún Bò Huế Cô Ba"]


async def test_search_with_location_adds_distance(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/search", params={"q": "ca", "lat": 10.78, "lng": 106.701})
    body = resp.json()
    assert body[0]["distance_km"] is not None and body[0]["distance_km"] < 0.1


async def test_search_validation(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/pois/search")).status_code == 422
    assert (await client.get("/api/v1/pois/search", params={"q": ""})).status_code == 422
    assert (
        await client.get("/api/v1/pois/search", params={"q": "pho", "lat": 999, "lng": 0})
    ).status_code == 422


async def test_get_poi_with_slash_in_id(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/osm:way/2")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Bún Bò Huế Cô Ba"


async def test_get_poi_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/osm:node/999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "POI_NOT_FOUND"


async def test_response_has_cr17_fields(tmp_path: Path) -> None:
    rec = {
        "external_id": "ovt:abc",
        "name": "Vincom Center",
        "category": "SHOPPING",
        "kind": "mall",
        "lat": 10.778,
        "lng": 106.702,
        "address": "72 Lê Thánh Tôn, Quận 1",
        "district": "Q1",
        "brand": "Vincom",
        "brand_key": "vincom",
        "score": 90,
        "minzoom": 12,
    }
    with gzip.open(tmp_path / "places_test.json.gz", "wt", encoding="utf-8") as fh:
        json.dump({"pois": [rec]}, fh, ensure_ascii=False)
    service = PoiService(data_dir=tmp_path, weekday=0)
    app.dependency_overrides[get_poi_service] = lambda: service
    app.dependency_overrides[get_poi_repository] = RamOnlyRepo
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            body = (await ac.get("/api/v1/pois/search", params={"q": "vincom"})).json()[0]
            one = (await ac.get("/api/v1/pois/ovt:abc")).json()
    finally:
        app.dependency_overrides.pop(get_poi_service, None)
        app.dependency_overrides.pop(get_poi_repository, None)
    for key in ("kind", "district", "brand", "brand_key", "score", "minzoom", "category", "address"):
        assert body[key] == rec[key]
    assert one["external_id"] == "ovt:abc"


# --- Kiểm tra trên snapshot thật (sinh bởi scripts/build_places.py) ---

real_snapshot = pytest.mark.skipif(
    not list(DEFAULT_DATA_DIR.glob("places_*.json.gz")),
    reason="Chưa có snapshot: chạy scripts/build_places.py",
)
HCM_Q1 = (10.7769, 106.7009)


@pytest.fixture(scope="module")
def real_service() -> PoiService:
    return PoiService()


@real_snapshot
def test_real_snapshot_q1_has_over_500_points(real_service: PoiService) -> None:
    service = real_service
    # Lõi Q.1 ~3×3 km
    assert len(service.in_bbox((10.7600, 106.6800, 10.7900, 106.7150), None, 1000)) > 500


@real_snapshot
def test_real_snapshot_search_and_latency(real_service: PoiService) -> None:
    service = real_service
    assert any("Phở" in p.name for p in service.search("pho", (10.776, 106.70), 10))
    timings = []
    for _ in range(200):
        start = time.perf_counter()
        service.in_bbox((10.7600, 106.6800, 10.7900, 106.7150), None, 500)
        service.search("bun bo", (10.776, 106.70), 10)
        timings.append((time.perf_counter() - start) * 1000)
    timings.sort()
    assert timings[int(len(timings) * 0.95)] < 30


@real_snapshot
def test_real_snapshot_phuc_long_branches_have_address(real_service: PoiService) -> None:
    """T-100: "phuc long" ra ≥ 10 chi nhánh, ≥ 80% có address hoặc district để phân biệt."""
    found = real_service.search("phuc long", HCM_Q1, 50)
    branches = [p for p in found if p.kind in ("cafe", "tea")]
    assert len(branches) >= 10
    assert sum(1 for p in branches if p.address or p.district) >= 0.8 * len(branches)


@real_snapshot
@pytest.mark.parametrize(
    ("q", "kind"),
    [("vincom", "mall"), ("cgv", "cinema"), ("bach hoa xanh", "supermarket"), ("karaoke", "karaoke")],
)
def test_real_snapshot_new_kinds_searchable(real_service: PoiService, q: str, kind: str) -> None:
    found = real_service.search(q, HCM_Q1, 20)
    assert any(p.kind == kind for p in found)
    assert found[0].distance_km is not None and found[0].distance_km < 30  # không trả quán Hà Nội lên đầu


@real_snapshot
def test_real_snapshot_old_osm_ids_still_resolve(real_service: PoiService) -> None:
    """Quán phòng cũ (`osm:*` của snapshot pois_* trước CR-17) vẫn mở được chi tiết."""
    old_ids: list[str] = []
    for path in DEFAULT_DATA_DIR.glob("pois_*.json.gz"):
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            old_ids += [p["external_id"] for p in json.load(fh)["pois"]]
    if not old_ids:
        pytest.skip("không có snapshot cũ để đối chiếu")
    assert [i for i in old_ids if real_service.get(i) is None] == []


@real_snapshot
def test_real_snapshot_bbox_sorted_by_score(real_service: PoiService) -> None:
    found = real_service.in_bbox((10.7600, 106.6800, 10.7900, 106.7150), None, 200)
    scores = [p.score for p in found]
    assert scores == sorted(scores, reverse=True)
    assert {p.kind for p in found[:20]} & {"mall", "cinema", "museum", "park"}


@real_snapshot
def test_real_snapshot_city_filter_phe_la(real_service: PoiService) -> None:
    """CR-18 (lỗi người dùng báo 2026-11-15): "phê la" không vị trí ra Phê La Hà Nội đầu tiên (score 78 > 77).
    Có `city` thì mọi kết quả nằm trong khung thành phố của phòng."""
    from app.services.poi_service import city_bbox

    assert real_service.search("phê la", None, 8)[0].lat > 20  # hành vi cũ không có city: Hà Nội đứng đầu
    hcm = real_service.search("phê la", None, 8, city_bbox("HCM"))
    assert hcm and all(p.lat < 12 for p in hcm)
    hn = real_service.search("phê la", None, 8, city_bbox("HN"))
    assert hn and all(p.lat > 20 for p in hn)
    assert city_bbox(None) is None and city_bbox("DN") is None


async def test_search_city_param_ram(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/search", params={"q": "pho", "city": "HN"})
    assert resp.status_code == 200 and resp.json() == []  # dữ liệu test toàn TP.HCM
    assert (await client.get("/api/v1/pois/search", params={"q": "pho", "city": "HCM"})).json()
