"""T-95: cache km `travel_legs` (Postgres thật) + làm ấm SAU commit + `GET /routes/me`, `GET /schedule/routes`.

Valhalla giả bằng httpx.MockTransport (`FakeValhalla` của test unit) — không test nào gọi mạng thật. Toạ độ của
file này riêng (không trùng test khác) và mọi dòng `travel_legs` có khoá của chúng được xoá sau mỗi test.
"""

import asyncio
import json
from collections.abc import AsyncGenerator, Generator
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.websocket as ws_module
import app.main as main_module
import app.services.algorithm_service as algo_module
import app.services.route_service as route_module
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.models import Room, TravelLeg
from app.domain.patterns.event_bus import InMemoryEventBus
from app.domain.patterns.itinerary.travel import (
    CachedLeg,
    DbCachedEstimator,
    HaversineTravelEstimator,
    ValhallaEstimator,
    coord_key,
    minutes_for_km,
    reset_travel_estimator,
)
from app.main import app
from app.repositories.place_repo import PlaceRepository
from app.repositories.travel_leg_repo import (
    SessionLegStore,
    TravelLegRepository,
    set_session_factory,
)
from app.services.websocket_manager import (
    WebSocketConnectionManager,
    reset_websocket_manager,
    set_websocket_manager,
)
from tests.unit.test_valhalla_estimator import FakeValhalla, km_of

engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
Session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)

H = "X-Member-Token"
# Toạ độ riêng của file này (7 chữ số như vị trí thật) — quét payload tìm chúng
HOST_HOME = (10.7581234, 106.6712345)
BAO_HOME = (10.8123456, 106.7234567)
P1 = (10.7769011, 106.7009022)
P2 = (10.7880033, 106.6900044)
P3 = (10.7701055, 106.6950066)
ALL = [HOST_HOME, BAO_HOME, P1, P2, P3]
KEYS = [coord_key(c) for c in ALL]


async def _wipe_legs() -> None:
    async with Session() as session:
        await session.execute(
            delete(TravelLeg).where(or_(TravelLeg.from_key.in_(KEYS), TravelLeg.to_key.in_(KEYS)))
        )
        await session.commit()


async def _rows() -> dict[tuple[str, str], TravelLeg]:
    async with Session() as session:
        res = await session.execute(
            select(TravelLeg).where(TravelLeg.from_key.in_(KEYS), TravelLeg.to_key.in_(KEYS))
        )
        return {(r.from_key, r.to_key): r for r in res.scalars()}


def k(a, b) -> tuple[str, str]:
    return (coord_key(a), coord_key(b))


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    created_rooms: list[str] = []

    async def _db() -> AsyncGenerator[AsyncSession, None]:
        async with Session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    old_factory = ws_module.get_session_factory()
    old_main_factory = main_module.AsyncSessionLocal
    ws_module.set_session_factory(Session)
    main_module.AsyncSessionLocal = Session
    set_session_factory(Session)
    app.dependency_overrides[get_db] = _db
    set_event_bus(InMemoryEventBus())
    set_websocket_manager(WebSocketConnectionManager())
    asyncio.run(_wipe_legs())
    with TestClient(app) as c:
        c.created_rooms = created_rooms  # type: ignore[attr-defined]
        yield c
        c.portal.call(route_module.get_route_warmer().drain)

    async def _cleanup() -> None:
        async with Session() as session:
            for room_id in created_rooms:
                await session.execute(delete(Room).where(Room.id == room_id))
            await session.commit()
        await _wipe_legs()

    asyncio.run(_cleanup())
    app.dependency_overrides.pop(get_db, None)
    ws_module.set_session_factory(old_factory)
    main_module.AsyncSessionLocal = old_main_factory
    set_session_factory(None)
    reset_websocket_manager()
    reset_travel_estimator()


@pytest.fixture
def fake() -> FakeValhalla:
    return FakeValhalla()


def _valhalla_estimator(fake: FakeValhalla) -> DbCachedEstimator:
    fetcher = ValhallaEstimator("http://valhalla.test", "k", client=fake.client(), cooldown_s=0)
    return DbCachedEstimator(SessionLegStore(Session), fetcher=fetcher)


@pytest.fixture
def valhalla(monkeypatch: pytest.MonkeyPatch, fake: FakeValhalla) -> DbCachedEstimator:
    """Bật nguồn Valhalla cho service (thay `get_travel_estimator` như ROUTING_PROVIDER=valhalla)."""
    est = _valhalla_estimator(fake)
    monkeypatch.setattr(route_module, "get_travel_estimator", lambda: est)
    monkeypatch.setattr(algo_module, "get_travel_estimator", lambda: est)
    return est


def _drain(client: TestClient) -> None:
    client.portal.call(route_module.get_route_warmer().drain)


def _room(client: TestClient) -> dict[str, Any]:
    res = client.post(
        "/api/v1/rooms",
        json={"title": "Phòng T-95", "event_date": "2026-11-20", "creator_nickname": "Host", "max_places_per_member": None},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    client.created_rooms.append(data["room"]["id"])  # type: ignore[attr-defined]
    return {"id": data["room"]["id"], "code": data["room"]["code"], "host": {"h": {H: data["member_token"]}}}


def _join(client: TestClient, room: dict[str, Any], nickname: str) -> dict[str, Any]:
    res = client.post("/api/v1/rooms/join", json={"room_code": room["code"], "nickname": nickname})
    assert res.status_code == 200, res.text
    return {"h": {H: res.json()["member_token"]}}


def _share(client: TestClient, room: dict[str, Any], who: dict[str, Any], coord) -> None:
    res = client.patch(
        f"/api/v1/rooms/{room['id']}/members/me", headers=who["h"], json={"origin_lat": coord[0], "origin_lng": coord[1]}
    )
    assert res.status_code == 200, res.text


def _place(client: TestClient, room: dict[str, Any], who: dict[str, Any], name: str, coord=None) -> str:
    body: dict[str, Any] = {"name": name, "category": "FOOD"}
    if coord is not None:
        body.update(latitude=coord[0], longitude=coord[1])
    res = client.post(f"/api/v1/rooms/{room['id']}/places", headers=who["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _item(client: TestClient, room: dict[str, Any], who: dict[str, Any], place_id: str, start: int, end: int) -> str:
    res = client.post(
        f"/api/v1/rooms/{room['id']}/schedule",
        headers=who["h"],
        json={"place_id": place_id, "day_offset": 0, "start_minute": start, "end_minute": end},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _vote(client: TestClient, room: dict[str, Any], who: dict[str, Any], place_id: str) -> None:
    res = client.post(f"/api/v1/rooms/{room['id']}/places/{place_id}/votes", headers=who["h"], json={"vote_value": 1})
    assert res.status_code == 200, res.text


def _no_other_home(obj: Any, *homes) -> None:
    """Payload không chứa toạ độ (dạng thô hoặc khoá cache) của nhà người khác, không có khoá cache nào."""
    text = json.dumps(obj, ensure_ascii=False)
    assert "from_key" not in text and "to_key" not in text
    for lat, lng in homes:
        assert str(lat) not in text and str(lng) not in text
        assert coord_key((lat, lng)) not in text


# ── Kho travel_legs ─────────────────────────────────────────────────────────────────────────────────
async def test_val21_repository_roundtrip_keeps_km_and_shape_separately() -> None:
    await _wipe_legs()
    try:
        async with Session() as session:
            repo = TravelLegRepository(session)
            a, b = coord_key(P1), coord_key(P2)
            await repo.save_legs([CachedLeg(a, b, 3.0), CachedLeg(a, b, 3.2), CachedLeg(b, a, 4.1)])  # trùng khoá: sau thắng
            await repo.save_shapes([CachedLeg(a, b, 99.0, "shp")])  # dòng có rồi: chỉ ghi shape, giữ km
            await repo.save_shapes([CachedLeg(a, coord_key(P3), 5.5, "shp2")])  # dòng chưa có: thêm cùng km
            await repo.save_legs([CachedLeg(a, b, 3.3)])  # ghi km: giữ shape
            await session.commit()
        async with Session() as session:
            got = await TravelLegRepository(session).get_many([(a, b), (b, a), (a, coord_key(P3)), (b, coord_key(P3))])
            assert (got[(a, b)].distance_km, got[(a, b)].shape) == (3.3, "shp")
            assert (got[(b, a)].distance_km, got[(b, a)].shape) == (4.1, None)
            assert got[(a, coord_key(P3))].distance_km == 5.5
            assert (b, coord_key(P3)) not in got
            assert await TravelLegRepository(session, profile="auto").get_many([(a, b)]) == {}
        rows = await _rows()
        assert rows[(a, b)].minutes == minutes_for_km(3.3) and rows[(a, b)].source == "VALHALLA"
    finally:
        await _wipe_legs()


async def test_val22_cache_survives_restart_and_offline_valhalla() -> None:
    """Demo không phụ thuộc mạng: process mới (RAM trống) + Valhalla sập vẫn đọc được km/shape từ DB."""
    await _wipe_legs()
    try:
        fake = FakeValhalla()
        est = _valhalla_estimator(fake)
        assert await est.warm([(P1, P2), (P2, P1)]) == 2
        await est.routes([(P1, P2)])
        down = FakeValhalla(exc=httpx.ConnectError("pc tắt"))
        fresh = _valhalla_estimator(down)
        m = await fresh.amatrix([P1, P2], [P2, P1])
        assert m[0][0].source.value == "VALHALLA" and m[0][0].distance_km == km_of(P1, P2)
        assert m[1][1].distance_km == km_of(P2, P1)
        (r,) = await fresh.routes([(P1, P2)])
        assert r.shape == f"shape:{coord_key(P1)}>{coord_key(P2)}"
        assert down.requests == []  # có đủ trong DB: không gọi mạng
    finally:
        await _wipe_legs()


# ── Làm ấm sau commit ───────────────────────────────────────────────────────────────────────────────
def test_val23_warm_runs_only_after_commit(client: TestClient, fake: FakeValhalla, monkeypatch) -> None:
    room = _room(client)
    _place(client, room, room["host"], "Quán 1", P1)  # cờ tắt lúc này: không làm ấm
    _place(client, room, room["host"], "Quán 2", P2)
    _drain(client)
    assert fake.requests == [] and asyncio.run(_rows()) == {}

    est = _valhalla_estimator(fake)
    monkeypatch.setattr(route_module, "get_travel_estimator", lambda: est)
    from uuid import UUID

    async def scenario() -> None:
        room_id = UUID(room["id"])
        async with Session() as session:
            await PlaceRepository(session).list_by_room(room_id)  # request đã chạm DB rồi mới hỏng
            route_module.warm_after_commit(PlaceRepository(session), room_id)
            await session.rollback()  # thao tác hỏng → không làm ấm
            await session.commit()  # commit rỗng sau rollback: hàng đợi đã bị xoá
        await route_module.get_route_warmer().drain()
        assert fake.requests == []
        async with Session() as session:
            route_module.warm_after_commit(PlaceRepository(session), room_id)
            route_module.warm_after_commit(PlaceRepository(session), room_id)  # gom: một lượt
            assert fake.requests == []  # chưa commit: chưa chạy
            await session.commit()
        await route_module.get_route_warmer().drain()

    asyncio.run(scenario())
    assert len(fake.bodies("/sources_to_targets")) == 1
    rows = asyncio.run(_rows())
    assert {k(P1, P2), k(P2, P1)} <= rows.keys()


def test_val24_api_warms_routes_me_schedule_and_ties(client: TestClient, valhalla: DbCachedEstimator, fake: FakeValhalla) -> None:
    room = _room(client)
    host = room["host"]
    bao = _join(client, room, "Bảo")
    linh = _join(client, room, "Linh")  # không chia sẻ vị trí
    _share(client, room, host, HOST_HOME)
    _share(client, room, bao, BAO_HOME)
    p1 = _place(client, room, host, "Quán 1", P1)
    p2 = _place(client, room, host, "Quán 2", P2)
    p0 = _place(client, room, host, "Không toạ độ")
    _drain(client)

    # Mỗi lần kích hoạt tối đa MỘT yêu cầu ma trận; đủ mọi cặp nhà ↔ quán hai chiều + quán ↔ quán
    assert len(fake.bodies("/sources_to_targets")) <= 4
    rows = asyncio.run(_rows())
    for home in (HOST_HOME, BAO_HOME):
        for p in (P1, P2):
            assert rows[k(home, p)].distance_km == km_of(home, p)
            assert rows[k(p, home)].distance_km == km_of(p, home)
    assert rows[k(P1, P2)].distance_km == km_of(P1, P2) and k(P2, P1) in rows
    assert rows[k(HOST_HOME, P1)].shape is not None  # hình dạng lấy sẵn khi làm ấm

    # Đường của mình: nhà mình → quán và quán → nhà mình, không đối xứng, có shape, không lộ nhà Bảo
    n = len(fake.requests)
    res = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=host["h"], params={"place_id": p1})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["place_id"] == p1
    assert body["to_place"] == {
        "km": km_of(HOST_HOME, P1),
        "minutes": minutes_for_km(km_of(HOST_HOME, P1)),
        "shape": f"shape:{coord_key(HOST_HOME)}>{coord_key(P1)}",
        "source": "VALHALLA",
    }
    assert body["to_home"]["km"] == km_of(P1, HOST_HOME) != body["to_place"]["km"]
    assert body["to_home"]["shape"] == f"shape:{coord_key(P1)}>{coord_key(HOST_HOME)}"
    assert len(fake.requests) == n  # đã có trong cache: không gọi mạng
    _no_other_home(body, BAO_HOME)
    bao_body = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=bao["h"], params={"place_id": p2}).json()
    assert bao_body["to_place"]["km"] == km_of(BAO_HOME, P2)
    _no_other_home(bao_body, HOST_HOME)

    # Lỗi: chưa chia sẻ vị trí / quán thiếu toạ độ / quán phòng khác
    res = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=linh["h"], params={"place_id": p1})
    assert res.status_code == 404 and res.json()["error"]["code"] == "NO_ORIGIN"
    res = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=host["h"], params={"place_id": p0})
    assert res.status_code == 404 and res.json()["error"]["code"] == "NO_PLACE_COORDS"
    other = _room(client)
    other_place = _place(client, other, other["host"], "Phòng khác", P3)
    res = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=host["h"], params={"place_id": other_place})
    assert res.status_code == 404 and res.json()["error"]["code"] == "PLACE_NOT_FOUND"
    res = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=other["host"]["h"], params={"place_id": p1})
    assert res.status_code == 401

    # Đường lịch: Quán 1 → Quán 2 (có shape), Quán 2 → quán thiếu toạ độ chỉ được đếm
    i1 = _item(client, room, host, p1, 1080, 1140)
    i2 = _item(client, room, host, p2, 1150, 1210)
    _item(client, room, host, p0, 1230, 1290)
    res = client.get(f"/api/v1/rooms/{room['id']}/schedule/routes", headers=bao["h"])
    assert res.status_code == 200, res.text
    sched = res.json()
    assert sched["unknown_leg_count"] == 1
    (leg,) = sched["legs"]
    assert (leg["from_item_id"], leg["to_item_id"], leg["source"]) == (i1, i2, "VALHALLA")
    assert leg["km"] == km_of(P1, P2) and leg["shape"] == f"shape:{coord_key(P1)}>{coord_key(P2)}"
    _no_other_home(sched, HOST_HOME, BAO_HOME)

    # Hoà phiếu: km khứ hồi đọc từ cache DB → nguồn VALHALLA, không ước lượng
    _vote(client, room, host, p1)
    _vote(client, room, host, p2)
    tie = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=host["h"]).json()
    assert tie["available"] is True
    (food,) = tie["suggestions"]
    assert food["source"] == "VALHALLA" and food["estimated"] is False
    round_trip = {m["nickname"]: m["km"] for m in food["members"]}
    best = food["recommended_place_id"]
    pt = P1 if best == p1 else P2
    assert round_trip["Host"] == pytest.approx(km_of(HOST_HOME, pt) + km_of(pt, HOST_HOME), abs=1e-3)
    _no_other_home(tie, HOST_HOME, BAO_HOME)


def test_val25_estimated_tie_self_heals_by_warming(client: TestClient, valhalla: DbCachedEstimator, fake: FakeValhalla) -> None:
    room = _room(client)
    host = room["host"]
    fake.status = fake.route_status = 403  # Valhalla từ chối khoá: làm ấm thất bại, không ghi gì
    _share(client, room, host, HOST_HOME)
    p1 = _place(client, room, host, "Quán 1", P1)
    p3 = _place(client, room, host, "Quán 3", P3)
    _vote(client, room, host, p1)
    _vote(client, room, host, p3)
    _drain(client)
    assert not any(key[0] == coord_key(HOST_HOME) for key in asyncio.run(_rows()))
    url = f"/api/v1/rooms/{room['id']}/tie-break/suggestion"
    first = client.get(url, headers=host["h"]).json()["suggestions"][0]
    assert first["source"] == "ESTIMATE" and first["estimated"] is True

    fake.status = fake.route_status = 200  # PC bật lại: GET thấy ô ước lượng → hẹn làm ấm nền
    client.get(url, headers=host["h"])
    _drain(client)
    healed = client.get(url, headers=host["h"]).json()["suggestions"][0]
    assert healed["source"] == "VALHALLA" and healed["estimated"] is False


def test_val26_default_flag_estimates_and_never_touches_network_or_cache(client: TestClient, monkeypatch) -> None:
    def boom(*a, **kw):
        raise AssertionError("cờ tắt nhưng vẫn dựng httpx.AsyncClient")

    monkeypatch.setattr(httpx.AsyncClient, "__init__", boom)
    room = _room(client)
    host = room["host"]
    _share(client, room, host, HOST_HOME)
    p1 = _place(client, room, host, "Quán 1", P1)
    p2 = _place(client, room, host, "Quán 2", P2)
    _item(client, room, host, p1, 1080, 1140)
    _item(client, room, host, p2, 1150, 1210)
    _drain(client)
    body = client.get(f"/api/v1/rooms/{room['id']}/routes/me", headers=host["h"], params={"place_id": p1}).json()
    est = HaversineTravelEstimator()
    assert body["to_place"] == {
        "km": round(est.leg(HOST_HOME, P1).distance_km, 3),
        "minutes": est.leg(HOST_HOME, P1).minutes,
        "shape": None,
        "source": "ESTIMATE",
    }
    (leg,) = client.get(f"/api/v1/rooms/{room['id']}/schedule/routes", headers=host["h"]).json()["legs"]
    assert leg["source"] == "ESTIMATE" and leg["shape"] is None
    assert asyncio.run(_rows()) == {}
