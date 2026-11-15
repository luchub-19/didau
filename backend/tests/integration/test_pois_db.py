"""T-102 (CR-17 B): tìm quán trong Postgres (`pg_trgm`), `GET /pois/brands`, `GET /pois/brands/{key}`, lệnh nạp.

Chạy với Postgres thật (`DATABASE_URL`, đã `alembic upgrade head`). Mỗi test nạp snapshot vào bảng `pois` TRONG một
transaction rồi rollback — không đụng dữ liệu đã nạp của máy dev.
"""

import gzip
import json
import time
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db
from app.api.v1.pois import get_poi_repository
from app.config import get_settings
from app.main import app
from app.repositories.poi_repo import PoiRepository, load_snapshot, reset_ready_cache
from app.services.poi_service import DEFAULT_DATA_DIR, PoiService, get_poi_service

engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
Session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

Q1 = (10.7769, 106.7009)


def _rec(eid: str, name: str, lat: float, lng: float, **extra: object) -> dict:
    return {"external_id": eid, "name": name, "lat": lat, "lng": lng, "kind": "cafe", "score": 50, **extra}


PHUC_LONG = {"brand": "Phúc Long", "brand_key": "phuc-long"}
VINCOM = {"brand": "Vincom", "brand_key": "vincom", "kind": "mall"}
RECORDS = [
    _rec("ovt:pl1", "Phúc Long - Lê Lợi", 10.7740, 106.7010, **PHUC_LONG, score=70),
    _rec("ovt:pl2", "Phúc Long Coffee & Tea", 10.7800, 106.6990, **PHUC_LONG),
    _rec("ovt:pl3", "Phúc Long Thảo Điền", 10.8030, 106.7380, **PHUC_LONG),
    _rec("ovt:pl4", "Phúc Long Hoàn Kiếm", 21.0285, 105.8520, **PHUC_LONG, score=90),  # Hà Nội
    _rec("ovt:v1", "Vincom Center Đồng Khởi", 10.7780, 106.7020, **VINCOM, score=95),
    _rec("ovt:v2", "Vincom Plaza 3 Tháng 2", 10.7760, 106.6810, **VINCOM),
    _rec("ovt:v3", "Vincom Mega Mall Thảo Điền", 10.8020, 106.7400, **VINCOM),
    _rec("ovt:h1", "Highlands Coffee", 10.7750, 106.7000, brand="Highlands Coffee", brand_key="highlands"),
    _rec("ovt:h2", "Highlands Coffee Nhà Thờ", 10.7790, 106.6990, brand="Highlands Coffee", brand_key="highlands"),
    _rec("osm:node/9", "Phở Hòa Pasteur", 10.7890, 106.6900, kind="restaurant", cuisine="vietnamese"),
    _rec("osm:node/10", "Quán 100%_Ngon", 10.7700, 106.7000, kind="restaurant"),
]


def _service(tmp_path: Path, records: list[dict] = RECORDS) -> PoiService:
    with gzip.open(tmp_path / "places_test.json.gz", "wt", encoding="utf-8") as fh:
        json.dump({"pois": records}, fh, ensure_ascii=False)
    return PoiService(data_dir=tmp_path, weekday=0)


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    reset_ready_cache()
    async with Session() as sess:
        yield sess
        await sess.rollback()
    reset_ready_cache()


@pytest.fixture
def service(tmp_path: Path) -> PoiService:
    return _service(tmp_path)


@pytest.fixture
async def client(session: AsyncSession, service: PoiService) -> AsyncGenerator[AsyncClient, None]:
    assert await load_snapshot(session, service, force=True) == len(RECORDS)

    async def _db() -> AsyncGenerator[AsyncSession, None]:
        yield session  # cùng transaction với dữ liệu vừa nạp; fixture rollback cuối test

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_poi_service] = lambda: service
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_poi_service, None)


async def _search(ac: AsyncClient, q: str, near: tuple[float, float] | None = Q1, **params: object) -> list[dict]:
    if near is not None:
        params |= {"lat": near[0], "lng": near[1]}
    resp = await ac.get("/api/v1/pois/search", params={"q": q, **params})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_extensions_and_indexes_exist(session: AsyncSession) -> None:
    exts = set((await session.execute(text("SELECT extname FROM pg_extension"))).scalars())
    assert "pg_trgm" in exts
    idx = set(
        (await session.execute(text("SELECT indexname FROM pg_indexes WHERE tablename = 'pois'"))).scalars()
    )
    assert {"ix_pois_norm_text_trgm", "ix_pois_norm_brand_trgm", "ix_pois_lat_lng", "ix_pois_brand_key"} <= idx


async def test_search_missing_accents_and_prefix(client: AsyncClient) -> None:
    body = await _search(client, "phuc lon")
    assert body[0]["name"].startswith("Phúc Long")
    assert all(p["distance_km"] is not None for p in body)
    # Dải 3 km: chi nhánh Q1 trước Thảo Điền, Hà Nội cuối
    assert [p["external_id"] for p in body][-1] == "ovt:pl4"


async def test_search_typo_uses_trigram(client: AsyncClient, service: PoiService) -> None:
    assert service.search("vincon", Q1, 10) == []  # RAM chỉ khớp chuỗi con
    body = await _search(client, "vincon")
    assert {p["external_id"] for p in body[:3]} == {"ovt:v1", "ovt:v2", "ovt:v3"}
    assert (await _search(client, "highland cofee"))[0]["brand_key"] == "highlands"


async def test_search_exact_match_beats_fuzzy(client: AsyncClient) -> None:
    body = await _search(client, "pho")
    assert body[0]["external_id"] == "osm:node/9"


async def test_search_response_shape_matches_ram(client: AsyncClient, service: PoiService) -> None:
    db = await _search(client, "pho hoa")
    ram = [p for p in service.search("pho hoa", Q1, 10)]
    assert [p["external_id"] for p in db] == [p.external_id for p in ram]
    assert db[0]["distance_km"] == ram[0].distance_km
    assert db[0]["cuisine"] == "vietnamese" and db[0]["kind"] == "restaurant"


async def test_search_without_location(client: AsyncClient) -> None:
    body = await _search(client, "phuc long", near=None)
    assert len(body) == 4 and all(p["distance_km"] is None for p in body)
    assert body[0]["external_id"] == "ovt:pl4"  # không có vị trí: score cao nhất trước


async def test_search_like_wildcards_are_literal(client: AsyncClient) -> None:
    assert [p["external_id"] for p in await _search(client, "100%_")] == ["osm:node/10"]
    assert await _search(client, "%zzq") == []  # "%" là ký tự thường, không phải "mọi chuỗi"


async def test_brands_with_location_counts_within_radius(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/brands", params={"q": "phúc long", "lat": Q1[0], "lng": Q1[1]})
    assert resp.status_code == 200
    assert resp.json() == [{"brand_key": "phuc-long", "name": "Phúc Long", "count": 3, "nearest_km": 0.323}]


async def test_brands_without_location_counts_all(client: AsyncClient) -> None:
    body = (await client.get("/api/v1/pois/brands", params={"q": "phuc lo"})).json()
    assert body == [{"brand_key": "phuc-long", "name": "Phúc Long", "count": 4, "nearest_km": None}]


async def test_brands_need_three_branches_and_prefix(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/pois/brands", params={"q": "highlands"})).json() == []  # 2 chi nhánh
    assert (await client.get("/api/v1/pois/brands", params={"q": "long"})).json() == []  # không phải tiền tố
    typo = (await client.get("/api/v1/pois/brands", params={"q": "vincon"})).json()
    assert [b["brand_key"] for b in typo] == ["vincom"]


async def test_brand_branches_near_to_far(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/pois/brands/phuc-long", params={"lat": Q1[0], "lng": Q1[1]})
    assert resp.status_code == 200
    body = resp.json()
    assert [p["external_id"] for p in body] == ["ovt:pl1", "ovt:pl2", "ovt:pl3"]  # Hà Nội ngoài 60 km
    dists = [p["distance_km"] for p in body]
    assert dists == sorted(dists)
    everywhere = (await client.get("/api/v1/pois/brands/phuc-long")).json()
    assert len(everywhere) == 4
    assert (await client.get("/api/v1/pois/brands/khong-co")).json() == []
    limited = await client.get("/api/v1/pois/brands/phuc-long", params={"limit": 1})
    assert len(limited.json()) == 1


async def test_brand_routes_validation(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/pois/brands")).status_code == 422
    assert (await client.get("/api/v1/pois/brands", params={"q": "x", "limit": 0})).status_code == 422
    assert (await client.get("/api/v1/pois/brands/phuc-long", params={"limit": 501})).status_code == 422


async def test_load_is_idempotent(session: AsyncSession, service: PoiService, tmp_path: Path) -> None:
    assert await load_snapshot(session, service, force=True) == len(RECORDS)
    assert await load_snapshot(session, service) is None  # cùng dấu vân tay → bỏ qua
    other = tmp_path / "other"
    other.mkdir()
    changed = _service(other, RECORDS[:2])
    assert changed.fingerprint != service.fingerprint
    assert await load_snapshot(session, changed) == 2
    count = (await session.execute(text("SELECT count(*) FROM pois"))).scalar_one()
    assert count == 2


async def test_not_loaded_falls_back_to_ram(session: AsyncSession, service: PoiService) -> None:
    await session.execute(text("DELETE FROM poi_snapshots"))
    assert await PoiRepository(session).is_ready() is False

    async def _db() -> AsyncGenerator[AsyncSession, None]:
        yield session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_poi_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            body = await _search(ac, "phuc long")
            brands = (await ac.get("/api/v1/pois/brands", params={"q": "phuc"})).json()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_poi_service, None)
    assert body[0]["external_id"] == "ovt:pl1"
    assert [b["brand_key"] for b in brands] == ["phuc-long"]


class BrokenRepo:
    async def is_ready(self) -> bool:
        raise SQLAlchemyError("db down")


async def test_db_error_falls_back_to_ram(service: PoiService) -> None:
    app.dependency_overrides[get_poi_repository] = BrokenRepo
    app.dependency_overrides[get_poi_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            body = await _search(ac, "vincom")
            brands = (await ac.get("/api/v1/pois/brands", params={"q": "vincom"})).json()
    finally:
        app.dependency_overrides.pop(get_poi_repository, None)
        app.dependency_overrides.pop(get_poi_service, None)
    assert {p["external_id"] for p in body} == {"ovt:v1", "ovt:v2", "ovt:v3"}
    assert brands[0]["count"] == 3


# --- Snapshot thật (74k quán) nạp vào Postgres: tiêu chí hoàn thành của T-102 ---

real_snapshot = pytest.mark.skipif(
    not list(DEFAULT_DATA_DIR.glob("places_*.json.gz")),
    reason="Chưa có snapshot: chạy scripts/build_places.py",
)


@real_snapshot
async def test_real_snapshot_typos_brands_and_latency(session: AsyncSession) -> None:
    service = PoiService()
    # Máy dev đã nạp đúng snapshot này (đã commit) thì đo trên bảng thật; chưa thì nạp tạm trong transaction —
    # bảng khi đó lẫn dòng chết của bản cũ nên không đo tốc độ (số đo không giống production).
    committed = await load_snapshot(session, service) is None
    repo = PoiRepository(session)

    async def names(q: str) -> list[str]:
        return [service.get(pid).name for pid, _ in await repo.search(q, Q1, 8)]  # type: ignore[union-attr]

    assert any("Phuc Long" in n or "Phúc Long" in n for n in await names("phuc lon"))
    assert any(n.lower().startswith("vincom") for n in await names("vincon"))
    brands = await repo.brands("phúc long", Q1, 5)
    assert brands and brands[0].brand_key.startswith("phuc-long") and brands[0].count >= 50
    assert len(service.branches(brands[0].brand_key, Q1, 300)) == brands[0].count

    if not committed:
        pytest.skip("bảng pois chưa nạp snapshot hiện tại (python -m app.repositories.poi_repo) — bỏ đo tốc độ")
    queries = ["phuc lon", "vincon", "pho", "p", "ca", "bun bo hue", "katinat", "the cofee house", "com tam"]
    timings = []
    for _ in range(4):
        for q in queries:
            start = time.perf_counter()
            await repo.search(q, Q1, 8)
            await repo.brands(q, Q1, 5)
            timings.append((time.perf_counter() - start) * 1000)
    timings.sort()
    assert timings[int(len(timings) * 0.95)] < 150
