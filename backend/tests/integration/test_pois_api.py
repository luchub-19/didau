import gzip
import json
import time
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.poi_service import DEFAULT_DATA_DIR, PoiService, get_poi_service

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
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_poi_service, None)


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


# --- Kiểm tra trên snapshot thật (sinh bởi scripts/build_osm_pois.py) ---

real_snapshot = pytest.mark.skipif(
    not list(DEFAULT_DATA_DIR.glob("pois_*.json.gz")),
    reason="Chưa có snapshot: chạy scripts/build_osm_pois.py",
)


@real_snapshot
def test_real_snapshot_q1_has_over_500_points() -> None:
    service = PoiService()
    # Lõi Q.1 ~3×3 km
    assert len(service.in_bbox((10.7600, 106.6800, 10.7900, 106.7150), None, 1000)) > 500


@real_snapshot
def test_real_snapshot_search_and_latency() -> None:
    service = PoiService()
    assert any("Phở" in p.name for p in service.search("pho", (10.776, 106.70), 10))
    timings = []
    for _ in range(200):
        start = time.perf_counter()
        service.in_bbox((10.7600, 106.6800, 10.7900, 106.7150), None, 500)
        service.search("bun bo", (10.776, 106.70), 10)
        timings.append((time.perf_counter() - start) * 1000)
    timings.sort()
    assert timings[int(len(timings) * 0.95)] < 30
