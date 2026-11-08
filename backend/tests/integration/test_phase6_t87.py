"""T-87: ALGO-03 (`TRAVEL_TIME` mới, `GET /schedule/feasibility`) + ALGO-04 (`priority`, `?sort=priority`, WS
`PRIORITY_UPDATED`) — Postgres thật, TestClient đồng bộ (cùng khung với test T-85/T-86).

Thời gian đi: estimator Haversine thật (toạ độ fixture: Bến Thành → Nhà thờ = 3′) hoặc estimator giả số cố định.
"""

import asyncio
import json
import time
import warnings
from collections.abc import AsyncGenerator, Generator, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.websocket as ws_module
import app.main as main_module
import app.services.algorithm_service as algo_module
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.models import Room
from app.domain.patterns.event_bus import InMemoryEventBus
from app.domain.patterns.itinerary.travel import (
    Coord,
    HaversineTravelEstimator,
    ITravelTimeEstimator,
    Leg,
)
from app.main import app
from app.services.websocket_manager import (
    WebSocketConnectionManager,
    reset_websocket_manager,
    set_websocket_manager,
)

engine = create_async_engine(get_settings().DATABASE_URL, poolclass=NullPool)
Session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)

H = "X-Member-Token"
FX = json.loads(
    (Path(__file__).resolve().parents[3] / "docs" / "phase6" / "algo-fixtures.json").read_text(
        encoding="utf-8"
    )
)
PTS = {k: (v["lat"], v["lng"]) for k, v in FX["points"].items()}
SECRET = {"bao": (10.7626123, 106.6820456), "nam": (10.7950789, 106.7218321), "linh": (10.8015654, 106.6185987)}
FRIDAY, SATURDAY = "2026-11-20", "2026-11-21"


class ByPlace(ITravelTimeEstimator):
    """Thời gian đi tới quán theo toạ độ đích (mọi xuất phát như nhau); không có thì Haversine."""

    def __init__(self, table: dict[Coord, int]) -> None:
        self.table = table
        self._fallback = HaversineTravelEstimator()

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        if b in self.table:
            return Leg(self.table[b], 2.0)
        return self._fallback.leg(a, b)

    async def amatrix(
        self, origins: Sequence[Coord], dests: Sequence[Coord], depart_at: datetime | None = None
    ) -> list[list[Leg]]:
        return self.matrix(origins, dests, depart_at)


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
    app.dependency_overrides[get_db] = _db
    set_event_bus(InMemoryEventBus())
    set_websocket_manager(WebSocketConnectionManager())
    with TestClient(app) as c:
        c.created_rooms = created_rooms  # type: ignore[attr-defined]
        yield c

    async def _cleanup() -> None:
        async with Session() as session:
            for room_id in created_rooms:
                await session.execute(delete(Room).where(Room.id == room_id))
            await session.commit()

    asyncio.run(_cleanup())
    app.dependency_overrides.pop(get_db, None)
    ws_module.set_session_factory(old_factory)
    main_module.AsyncSessionLocal = old_main_factory
    reset_websocket_manager()


@pytest.fixture
def by_place(monkeypatch: pytest.MonkeyPatch) -> ByPlace:
    est = ByPlace({})
    monkeypatch.setattr(algo_module, "get_travel_estimator", lambda: est)
    return est


def _room(client: TestClient, event_date: str = FRIDAY, **extra: Any) -> dict[str, Any]:
    res = client.post(
        "/api/v1/rooms",
        json={"title": "Phòng T-87", "event_date": event_date, "creator_nickname": "Host", "max_places_per_member": None, **extra},
    )
    assert res.status_code == 201, res.text
    data = res.json()
    client.created_rooms.append(data["room"]["id"])  # type: ignore[attr-defined]
    return {"id": data["room"]["id"], "code": data["room"]["code"], "host": {"id": data["creator_member"]["id"], "h": {H: data["member_token"]}, "token": data["member_token"]}}


def _join(client: TestClient, room: dict[str, Any], nickname: str) -> dict[str, Any]:
    res = client.post("/api/v1/rooms/join", json={"room_code": room["code"], "nickname": nickname})
    assert res.status_code == 200, res.text
    data = res.json()
    return {"id": data["member"]["id"], "h": {H: data["member_token"]}, "token": data["member_token"]}


def _share(client: TestClient, room: dict[str, Any], who: dict[str, Any], coord: Coord | None) -> None:
    lat, lng = coord if coord else (None, None)
    res = client.patch(f"/api/v1/rooms/{room['id']}/members/me", headers=who["h"], json={"origin_lat": lat, "origin_lng": lng})
    assert res.status_code == 200, res.text


def _place(client: TestClient, room: dict[str, Any], who: dict[str, Any], name: str, coord: Coord | None = None, **extra: Any) -> str:
    body: dict[str, Any] = {"name": name, "category": "FOOD", **extra}
    if coord is not None:
        body.update(latitude=coord[0], longitude=coord[1])
    res = client.post(f"/api/v1/rooms/{room['id']}/places", headers=who["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _vote(client: TestClient, room: dict[str, Any], who: dict[str, Any], place_id: str) -> None:
    res = client.post(f"/api/v1/rooms/{room['id']}/places/{place_id}/votes", headers=who["h"], json={"vote_value": 1})
    assert res.status_code == 200, res.text


def _item(client: TestClient, room: dict[str, Any], who: dict[str, Any], place_id: str, start: int, end: int) -> dict[str, Any]:
    res = client.post(
        f"/api/v1/rooms/{room['id']}/schedule",
        headers=who["h"],
        json={"place_id": place_id, "day_offset": 0, "start_minute": start, "end_minute": end},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _feasibility(client: TestClient, room: dict[str, Any], who: dict[str, Any]) -> dict[str, Any]:
    res = client.get(f"/api/v1/rooms/{room['id']}/schedule/feasibility", headers=who["h"])
    assert res.status_code == 200, res.text
    return res.json()


def _conflicts(client: TestClient, room: dict[str, Any], who: dict[str, Any]) -> list[dict[str, Any]]:
    res = client.get(f"/api/v1/rooms/{room['id']}/conflicts", headers=who["h"])
    assert res.status_code == 200, res.text
    return res.json()


def _drain_until_pong(ws: Any) -> list[dict[str, Any]]:
    ws.send_json({"type": "PING", "payload": {}})
    out: list[dict[str, Any]] = []
    for _ in range(120):
        msg = ws.receive_json()
        out.append(msg)
        if msg["type"] == "PONG":
            return out
    raise AssertionError("Không nhận được PONG")


def _no_secret(obj: Any) -> None:
    text = json.dumps(obj, ensure_ascii=False)
    for lat, lng in SECRET.values():
        assert str(lat) not in text and str(lng) not in text


def _move(client: TestClient, room: dict[str, Any], who: dict[str, Any], items: list[dict[str, Any]], **starts: tuple[int, int]) -> None:
    """PUT bulk; `starts` = {item_key: (start, end)} với key 'i0', 'i1'…"""
    payload = []
    for idx, it in enumerate(items):
        start, end = starts.get(f"i{idx}", (it["start_minute"], it["end_minute"]))
        payload.append({"id": it["id"], "day_offset": 0, "start_minute": start, "end_minute": end, "order_index": idx, "note": None})
    res = client.put(f"/api/v1/rooms/{room['id']}/schedule", headers=who["h"], json={"items": payload})
    assert res.status_code == 200, res.text


# ── ALGO-03 ─────────────────────────────────────────────────────────────────────────────────────────
def test_feasibility_and_new_travel_time_params(client: TestClient) -> None:
    room = _room(client, FRIDAY)
    host = room["host"]
    a = _place(client, room, host, "Bến Thành", PTS["ben_thanh"])
    b = _place(client, room, host, "Nhà thờ", PTS["nha_tho"])
    c = _place(client, room, host, "Không toạ độ")
    i0 = _item(client, room, host, a, 1080, 1140)  # 18:00–19:00
    i1 = _item(client, room, host, b, 1150, 1210)  # 19:10 (khe 10′, rời 19:00 thứ Sáu = cao điểm)
    i2 = _item(client, room, host, c, 1230, 1290)
    items = [i0, i1, i2]

    f = _feasibility(client, room, host)
    assert (f["window_min"], f["item_count"], f["unknown_leg_count"]) == (360, 3, 1)
    (leg,) = f["legs"]
    assert leg["from_item_id"] == i0["id"] and leg["to_item_id"] == i1["id"]
    assert (leg["eta_min"], leg["margin_min"], leg["buffer_min"], leg["gap_min"], leg["slack_min"]) == (3, 5, 5, 10, -3)
    assert leg["risk"] == "SOFT_CONFLICT" and leg["peak"] is True and leg["source"] == "ESTIMATE"
    assert f["required_total_min"] == 180 + 13 and f["buffer_total_min"] == 360 - 193
    assert f["is_feasible"] is True and f["estimated"] is True  # SOFT không làm kế hoạch bất khả thi

    travel = [x for x in _conflicts(client, room, host) if x["rule_code"] == "TRAVEL_TIME"]
    assert len(travel) == 1 and travel[0]["level"] == "WARNING"
    p = travel[0]["params"]
    assert {k: p[k] for k in ("eta_min", "margin_min", "buffer_min", "gap_min", "slack_min", "risk", "peak")} == {
        "eta_min": 3, "margin_min": 5, "buffer_min": 5, "gap_min": 10, "slack_min": -3, "risk": "SOFT_CONFLICT", "peak": True,
    }
    assert p["source"] == "ESTIMATE" and p["estimated"] is True and "travel_min" not in p
    assert p["place_names"] == ["Bến Thành", "Nhà thờ"] and p["distance_km"] == 1.07

    # Khe 2′ < đi 3′ → HIGH_RISK → kế hoạch bất khả thi
    _move(client, room, host, items, i1=(1142, 1202))
    f = _feasibility(client, room, host)
    assert f["legs"][0]["risk"] == "HIGH_RISK" and f["is_feasible"] is False
    assert [x["params"]["risk"] for x in _conflicts(client, room, host) if x["rule_code"] == "TRAVEL_TIME"] == ["HIGH_RISK"]

    # Khe 13′ → SAFE, không còn cảnh báo
    _move(client, room, host, items, i1=(1153, 1213))
    assert _feasibility(client, room, host)["legs"][0]["risk"] == "SAFE"
    assert not [x for x in _conflicts(client, room, host) if x["rule_code"] == "TRAVEL_TIME"]

    # CR-07: chồng giờ chỉ TIME_OVERLAP; feasibility đánh HIGH_RISK cho cặp đó
    _move(client, room, host, items, i1=(1110, 1170))
    codes = [x["rule_code"] for x in _conflicts(client, room, host)]
    assert "TIME_OVERLAP" in codes and "TRAVEL_TIME" not in codes
    f = _feasibility(client, room, host)
    assert f["legs"][0]["gap_min"] == -30 and f["legs"][0]["risk"] == "HIGH_RISK" and f["is_feasible"] is False


def test_feasibility_saturday_has_no_peak_margin(client: TestClient, by_place: ByPlace) -> None:
    room = _room(client, SATURDAY)
    host = room["host"]
    a = _place(client, room, host, "A", PTS["ben_thanh"])
    b = _place(client, room, host, "B", PTS["nha_tho"])
    by_place.table[PTS["nha_tho"]] = 20
    _item(client, room, host, a, 1020, 1080)
    _item(client, room, host, b, 1110, 1170)  # khe 30′, đi 20′ + 5 + 5 = 30 → dư 0
    (leg,) = _feasibility(client, room, host)["legs"]
    assert (leg["peak"], leg["margin_min"], leg["slack_min"], leg["risk"]) == (False, 5, 0, "SAFE")


def test_feasibility_empty_schedule_and_access(client: TestClient) -> None:
    room = _room(client)
    f = _feasibility(client, room, room["host"])
    assert f == {
        "window_min": 360, "required_total_min": 0, "buffer_total_min": 360, "is_feasible": True, "legs": [],
        "estimated": False, "item_count": 0, "unknown_leg_count": 0,
    }
    other = _room(client)
    res = client.get(f"/api/v1/rooms/{room['id']}/schedule/feasibility", headers=other["host"]["h"])
    assert res.status_code == 401  # cùng quy ước với các endpoint thuật toán của T-86


# ── ALGO-04 ─────────────────────────────────────────────────────────────────────────────────────────
def _tc08_room(client: TestClient, by_place: ByPlace) -> tuple[dict[str, Any], dict[str, str], list[dict[str, Any]]]:
    """TC-08 qua API: Dinh Độc Lập nhiều phiếu nhất nhưng chỉ mở 60′ cuối khung → xếp sau 2 quán SAFE."""
    room = _room(client, SATURDAY)
    host = room["host"]
    people = [host] + [_join(client, room, f"Bạn {i}") for i in range(11)]
    _share(client, room, host, SECRET["bao"])
    _share(client, room, people[1], SECRET["nam"])
    _share(client, room, people[2], SECRET["linh"])
    coords = {"van_hanh": (10.770, 106.670), "saigon_centre": (10.773, 106.701), "dinh": (10.777, 106.695)}
    by_place.table.update({coords["van_hanh"]: 25, coords["saigon_centre"]: 28, coords["dinh"]: 32})
    ids = {
        "van_hanh": _place(client, room, host, "Vạn Hạnh Mall", coords["van_hanh"], open_minute=600, close_minute=1380),
        "saigon_centre": _place(client, room, host, "Saigon Centre", coords["saigon_centre"], open_minute=600, close_minute=1380),
        "dinh": _place(client, room, host, "Dinh Độc Lập", coords["dinh"], open_minute=1320, close_minute=1380),
    }
    for who in people[:10]:
        _vote(client, room, who, ids["van_hanh"])
    for who in people[:8]:
        _vote(client, room, who, ids["saigon_centre"])
    for who in people[:12]:
        _vote(client, room, who, ids["dinh"])
    return room, ids, people


def test_tc08_sort_priority_and_labels(client: TestClient, by_place: ByPlace) -> None:
    room, ids, _ = _tc08_room(client, by_place)
    host = room["host"]
    url = f"/api/v1/rooms/{room['id']}/places"
    by_default = client.get(url, headers=host["h"]).json()
    assert [p["id"] for p in by_default] == [ids["van_hanh"], ids["saigon_centre"], ids["dinh"]]  # thứ tự thêm (cũ)

    ranked = client.get(url, params={"sort": "priority"}, headers=host["h"]).json()
    assert [p["id"] for p in ranked] == [ids["van_hanh"], ids["saigon_centre"], ids["dinh"]]
    pri = {p["id"]: p["priority"] for p in ranked}
    assert pri[ids["van_hanh"]]["rank"] == 1 and pri[ids["van_hanh"]]["labels"] == ["RECOMMENDED"]
    assert pri[ids["dinh"]]["rank"] == 3 and pri[ids["dinh"]]["labels"] == ["MOST_VOTED_RISKY"]
    # Dinh: mở 60′, cần 60 + 32 + 8 + 5 = 105 → thiếu 45 → HIGH_RISK (dưới −30)
    assert pri[ids["dinh"]]["risk"] == "HIGH_RISK" and pri[ids["dinh"]]["slack_min"] == -45
    assert pri[ids["van_hanh"]]["max_eta_min"] == 25 and pri[ids["van_hanh"]]["eta_unknown"] is False
    assert set(pri[ids["van_hanh"]]) == {"rank", "risk", "slack_min", "max_eta_min", "labels", "estimated", "hours_unknown", "eta_unknown"}
    single = client.get(f"{url}/{ids['dinh']}", headers=host["h"]).json()
    assert single["priority"] == pri[ids["dinh"]]
    _no_secret(ranked)

    bad = client.get(url, params={"sort": "nonsense"}, headers=host["h"])
    assert bad.status_code == 422


def test_rejected_place_has_no_priority_and_sorts_last(client: TestClient, by_place: ByPlace) -> None:
    room = _room(client, SATURDAY)
    host = room["host"]
    first = _place(client, room, host, "Bị loại", PTS["ben_thanh"])
    second = _place(client, room, host, "Còn lại", PTS["nha_tho"])
    res = client.patch(f"/api/v1/rooms/{room['id']}/places/{first}", headers=host["h"], json={"status": "REJECTED"})
    assert res.status_code == 200, res.text
    ranked = client.get(f"/api/v1/rooms/{room['id']}/places?sort=priority", headers=host["h"]).json()
    assert [p["id"] for p in ranked] == [second, first]
    assert ranked[1]["priority"] is None and ranked[0]["priority"]["rank"] == 1


def test_no_origin_and_no_hours_flags(client: TestClient) -> None:
    room = _room(client, SATURDAY)
    host = room["host"]
    pid = _place(client, room, host, "Chưa rõ", PTS["ben_thanh"])
    (p,) = client.get(f"/api/v1/rooms/{room['id']}/places", headers=host["h"]).json()
    assert p["id"] == pid
    assert p["priority"]["eta_unknown"] is True and p["priority"]["max_eta_min"] == 0
    assert p["priority"]["hours_unknown"] is True and p["priority"]["risk"] == "SAFE"
    # Có điểm hẹn → người chưa chia sẻ xuất phát từ điểm hẹn → biết eta
    res = client.patch(f"/api/v1/rooms/{room['id']}", headers=host["h"], json={"origin_lat": PTS["nha_tho"][0], "origin_lng": PTS["nha_tho"][1]})
    assert res.status_code == 200, res.text
    (p,) = client.get(f"/api/v1/rooms/{room['id']}/places", headers=host["h"]).json()
    assert p["priority"]["eta_unknown"] is False and p["priority"]["max_eta_min"] == 3


def test_ws_priority_updated_after_vote_origin_and_window(client: TestClient, by_place: ByPlace) -> None:
    room = _room(client, SATURDAY)
    host = room["host"]
    nam = _join(client, room, "Nam")
    a = _place(client, room, host, "Gần", (10.70, 106.60), open_minute=600, close_minute=1380)
    b = _place(client, room, host, "Xa", (10.71, 106.61), open_minute=600, close_minute=1380)
    by_place.table.update({(10.70, 106.60): 10, (10.71, 106.61): 40})
    _share(client, room, host, SECRET["bao"])

    with client.websocket_connect(f"/ws/rooms/{room['id']}?token={nam['token']}") as ws:
        ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        _drain_until_pong(ws)

        _vote(client, room, nam, b)  # Xa có phiếu → lên đầu (cùng SAFE)
        msgs = _drain_until_pong(ws)
        vote = next(m for m in msgs if m["type"] == "VOTE_UPDATED")
        (pri,) = [m for m in msgs if m["type"] == "PRIORITY_UPDATED"]
        assert pri["state_version"] == vote["state_version"] + 1
        assert msgs.index(pri) > msgs.index(vote)
        items = pri["payload"]["items"]
        assert [i["place_id"] for i in items] == [b, a] and [i["rank"] for i in items] == [1, 2]
        assert items[0]["labels"] == ["RECOMMENDED"] and items[0]["max_eta_min"] == 40
        assert set(items[0]) == {"place_id", "rank", "risk", "slack_min", "max_eta_min", "labels", "estimated", "hours_unknown", "eta_unknown"}
        _no_secret(msgs)

        _share(client, room, nam, SECRET["nam"])  # đổi vị trí → phát lại
        assert [m for m in _drain_until_pong(ws) if m["type"] == "PRIORITY_UPDATED"]

        client.patch(f"/api/v1/rooms/{room['id']}", headers=host["h"], json={"title": "Chỉ đổi tên"})
        assert not [m for m in _drain_until_pong(ws) if m["type"] == "PRIORITY_UPDATED"]

        # Khung chỉ còn 22:00–23:00 → mọi quán thiếu giờ; thứ tự vẫn ổn định theo khoá
        client.patch(f"/api/v1/rooms/{room['id']}", headers=host["h"], json={"start_minute": 1320})
        (pri,) = [m for m in _drain_until_pong(ws) if m["type"] == "PRIORITY_UPDATED"]
        assert {i["risk"] for i in pri["payload"]["items"]} <= {"SOFT_CONFLICT", "HIGH_RISK"}

        res = client.delete(f"/api/v1/rooms/{room['id']}/places/{b}", headers=host["h"])
        assert res.status_code == 200, res.text
        (pri,) = [m for m in _drain_until_pong(ws) if m["type"] == "PRIORITY_UPDATED"]
        assert [i["place_id"] for i in pri["payload"]["items"]] == [a]


def test_priority_10_members_x_30_places_timing(client: TestClient) -> None:
    """Đo cả request `GET /places?sort=priority` với ước lượng thật; vượt 150 ms thì cảnh báo (máy chậm/DB), không đỏ."""
    room = _room(client, FRIDAY)
    host = room["host"]
    members = [host] + [_join(client, room, f"M{i}") for i in range(9)]
    for i, who in enumerate(members):
        _share(client, room, who, (10.70 + i * 0.012, 106.62 + i * 0.01))
    for j in range(30):
        _place(client, room, host, f"Q{j}", (10.72 + j * 0.004, 106.64 + (j % 7) * 0.01), open_minute=600 + (j % 4) * 180, close_minute=1380)
    url = f"/api/v1/rooms/{room['id']}/places?sort=priority"
    client.get(url, headers=host["h"])  # làm nóng
    t = time.perf_counter()
    res = client.get(url, headers=host["h"])
    ms = (time.perf_counter() - t) * 1000
    assert res.status_code == 200 and [p["priority"]["rank"] for p in res.json()] == list(range(1, 31))
    if ms > 150:
        warnings.warn(f"CHẬM: GET /places?sort=priority 10 × 30 mất {ms:.0f} ms (> 150)", stacklevel=1)
