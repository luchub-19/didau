"""T-86: GET /group-center, GET /tie-break/suggestion, resolve TRAVEL_TIME, WS GROUP_CENTER_UPDATED.

Postgres thật, TestClient đồng bộ (cùng khung với test T-85). Thời gian đi dùng estimator giả có số cố định
(không mạng); riêng vài ca dùng estimator Haversine thật để chắc đường đi qua `get_travel_estimator()`.
"""

import asyncio
import json
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
PTS = FX["points"]
# Toạ độ riêng khác thường: không được xuất hiện nguyên văn trong bất kỳ phản hồi nào
SECRET = {"bao": (10.7626123, 106.6820456), "nam": (10.7950789, 106.7218321), "linh": (10.8015654, 106.6185987)}


class FixedEstimator(ITravelTimeEstimator):
    """Thời gian cố định theo (xuất phát, đích); thiếu cặp thì dùng Haversine."""

    def __init__(self, table: dict[tuple[Coord, Coord], int]) -> None:
        self.table = table
        self.calls = 0
        self._fallback = HaversineTravelEstimator()

    def leg(self, a: Coord, b: Coord, depart_at: datetime | None = None) -> Leg:
        if (a, b) in self.table:
            return Leg(self.table[(a, b)], 1.0)
        return self._fallback.leg(a, b)

    async def amatrix(
        self, origins: Sequence[Coord], dests: Sequence[Coord], depart_at: datetime | None = None
    ) -> list[list[Leg]]:
        self.calls += 1
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
def estimator(monkeypatch: pytest.MonkeyPatch) -> FixedEstimator:
    est = FixedEstimator({})
    monkeypatch.setattr(algo_module, "get_travel_estimator", lambda: est)
    return est


def _room(client: TestClient, **extra: Any) -> dict[str, Any]:
    res = client.post(
        "/api/v1/rooms",
        json={
            "title": "Phòng T-86",
            "event_date": "2026-11-20",
            "creator_nickname": "Host",
            "max_places_per_member": None,
            **extra,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    client.created_rooms.append(data["room"]["id"])  # type: ignore[attr-defined]
    return {
        "id": data["room"]["id"],
        "code": data["room"]["code"],
        "room": data["room"],
        "host_id": data["creator_member"]["id"],
        "host": {H: data["member_token"]},
    }


def _join(client: TestClient, room: dict[str, Any], nickname: str) -> dict[str, Any]:
    res = client.post("/api/v1/rooms/join", json={"room_code": room["code"], "nickname": nickname})
    assert res.status_code == 200, res.text
    data = res.json()
    return {"id": data["member"]["id"], "h": {H: data["member_token"]}, "token": data["member_token"]}


def _share(client: TestClient, room: dict[str, Any], who: dict[str, Any], lat: float, lng: float) -> None:
    res = client.patch(
        f"/api/v1/rooms/{room['id']}/members/me",
        headers=who["h"],
        json={"origin_lat": lat, "origin_lng": lng},
    )
    assert res.status_code == 200, res.text


def _place(
    client: TestClient, room: dict[str, Any], who: dict[str, Any], name: str, lat: float | None, lng: float | None
) -> str:
    body: dict[str, Any] = {"name": name}
    if lat is not None:
        body.update(latitude=lat, longitude=lng)
    res = client.post(f"/api/v1/rooms/{room['id']}/places", headers=who["h"], json=body)
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _vote(client: TestClient, room: dict[str, Any], who: dict[str, Any], place_id: str, value: int = 1) -> None:
    res = client.post(
        f"/api/v1/rooms/{room['id']}/places/{place_id}/votes", headers=who["h"], json={"vote_value": value}
    )
    assert res.status_code == 200, res.text


def _trio(client: TestClient) -> tuple[dict[str, Any], dict[str, Any]]:
    """Phòng với Bảo (host), Nam, Linh đều đã chia sẻ vị trí (toạ độ riêng khác thường)."""
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    nam, linh = _join(client, room, "Nam"), _join(client, room, "Linh")
    for who, key in ((host, "bao"), (nam, "nam"), (linh, "linh")):
        _share(client, room, who, *SECRET[key])
    room["people"] = {"bao": host, "nam": nam, "linh": linh}
    return room, room["people"]


def _no_secret(obj: Any) -> None:
    text = json.dumps(obj, ensure_ascii=False)
    for lat, lng in SECRET.values():
        assert str(lat) not in text and str(lng) not in text


def _drain_until_pong(ws: Any) -> list[dict[str, Any]]:
    ws.send_json({"type": "PING", "payload": {}})
    out: list[dict[str, Any]] = []
    for _ in range(80):
        msg = ws.receive_json()
        out.append(msg)
        if msg["type"] == "PONG":
            return out
    raise AssertionError("Không nhận được PONG")


# ── ALGO-01 ───────────────────────────────────────────────────────────────────────────────────────
def test_tc01_group_center_three_members(client: TestClient) -> None:
    room, people = _trio(client)
    res = client.get(f"/api/v1/rooms/{room['id']}/group-center", headers=people["nam"]["h"])
    assert res.status_code == 200, res.text
    body = res.json()
    exp = FX["group_center"]["expect"]
    assert body["available"] is True and body["member_count"] == 3
    assert body["center"]["lat"] == pytest.approx(exp["lat"], abs=0.0015)
    assert body["center"]["lng"] == pytest.approx(exp["lng"], abs=0.0015)
    # làm tròn 3 chữ số
    assert body["center"]["lat"] == round(body["center"]["lat"], 3)
    assert body["center"]["lng"] == round(body["center"]["lng"], 3)
    assert body["area_label"]
    pois = body["nearby_pois"]
    assert 0 < len(pois) <= 10
    dists = [p["distance_km"] for p in pois]
    assert dists == sorted(dists) and max(dists) <= 2.0
    _no_secret(body)


def test_group_center_unavailable_below_two(client: TestClient) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    url = f"/api/v1/rooms/{room['id']}/group-center"
    assert client.get(url, headers=host["h"]).json() == {
        "available": False,
        "center": None,
        "area_label": None,
        "member_count": 0,
        "nearby_pois": [],
    }
    _share(client, room, host, *SECRET["bao"])
    one = client.get(url, headers=host["h"]).json()
    assert one["available"] is False and one["member_count"] == 1 and one["center"] is None


def test_meeting_point_is_not_part_of_group_center(client: TestClient) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    assert client.patch(
        f"/api/v1/rooms/{room['id']}",
        headers=host["h"],
        json={"origin_lat": 10.9, "origin_lng": 106.9},
    ).status_code == 200
    nam = _join(client, room, "Nam")
    _share(client, room, nam, *SECRET["nam"])
    body = client.get(f"/api/v1/rooms/{room['id']}/group-center", headers=host["h"]).json()
    assert body["available"] is False and body["member_count"] == 1


def test_tc02_adding_member_changes_center_and_ws_event(client: TestClient) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    nam, linh = _join(client, room, "Nam"), _join(client, room, "Linh")
    url = f"/api/v1/rooms/{room['id']}/group-center"
    with client.websocket_connect(f"/ws/rooms/{room['id']}?token={linh['token']}") as ws:
        ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        _drain_until_pong(ws)

        _share(client, room, host, *SECRET["bao"])  # 1 người: chưa có gì để vẽ
        assert not [m for m in _drain_until_pong(ws) if m["type"] == "GROUP_CENTER_UPDATED"]

        _share(client, room, nam, *SECRET["nam"])  # đủ 2 → có tâm
        two = client.get(url, headers=host["h"]).json()
        msgs = _drain_until_pong(ws)
        ev = [m for m in msgs if m["type"] == "GROUP_CENTER_UPDATED"]
        assert len(ev) == 1
        assert ev[0]["payload"]["available"] is True and ev[0]["payload"]["member_count"] == 2
        assert ev[0]["payload"]["center"] == two["center"]
        member_updated = next(m for m in msgs if m["type"] == "MEMBER_UPDATED")
        assert ev[0]["state_version"] == member_updated["state_version"] + 1
        _no_secret(msgs)

        _share(client, room, linh, *SECRET["linh"])  # thêm người → tâm đổi
        three = client.get(url, headers=host["h"]).json()
        assert three["member_count"] == 3 and three["center"] != two["center"]
        ev = [m for m in _drain_until_pong(ws) if m["type"] == "GROUP_CENTER_UPDATED"]
        assert ev[-1]["payload"]["center"] == three["center"]

        for who in (linh, nam):  # còn 1 người → tâm mất
            client.patch(
                f"/api/v1/rooms/{room['id']}/members/me",
                headers=who["h"],
                json={"origin_lat": None, "origin_lng": None},
            )
        ev = [m for m in _drain_until_pong(ws) if m["type"] == "GROUP_CENTER_UPDATED"]
        assert ev[-1]["payload"] == {"available": False, "member_count": 1}


def test_algorithm_endpoints_require_membership(client: TestClient) -> None:
    room, _ = _trio(client)
    other = _room(client)
    for path in ("group-center", "tie-break/suggestion"):
        url = f"/api/v1/rooms/{room['id']}/{path}"
        assert client.get(url).status_code == 401
        assert client.get(url, headers=other["host"]).status_code == 401


# ── ALGO-02 ───────────────────────────────────────────────────────────────────────────────────────
def _tie_setup(client: TestClient, estimator: FixedEstimator, upvotes: dict[str, int]) -> dict[str, Any]:
    """Phòng Bảo/Nam/Linh + 3 quán (tên theo fixture TC-04) với số phút đúng fixture."""
    room, people = _trio(client)
    case = FX["tie_break"]["doc_case"]
    place_coords = {
        "dinh_doc_lap": (10.7770, 106.6953),
        "saigon_centre": (10.7745, 106.7010),
        "van_hanh_mall": (10.7700, 106.6700),
    }
    names = ["bao", "nam", "linh"]
    ids: dict[str, str] = {}
    for spec in case["places"]:
        pid = _place(client, room, people["bao"], spec["id"], *place_coords[spec["id"]])
        ids[spec["id"]] = pid
        for who, minutes in zip(names, spec["minutes"], strict=True):
            estimator.table[(SECRET[who], place_coords[spec["id"]])] = minutes
    voters = [people["bao"], people["nam"], people["linh"], _join(client, room, "V4"), _join(client, room, "V5")]
    for name, n in upvotes.items():
        for who in voters[:n]:
            _vote(client, room, who, ids[name])
    room["ids"] = ids
    return room


def test_tc03_tc04_three_way_tie_suggests_van_hanh_mall(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 3, "van_hanh_mall": 3})
    ids = room["ids"]
    res = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=room["people"]["linh"]["h"])
    assert res.status_code == 200, res.text
    s = res.json()
    assert s["available"] is True and s["reason"] is None
    assert s["recommended_place_id"] == ids["van_hanh_mall"]
    assert s["margin_vs_second_min"] == 3
    assert [r["place_id"] for r in s["ranking"]] == [ids["van_hanh_mall"], ids["saigon_centre"], ids["dinh_doc_lap"]]
    by_place = {r["place_id"]: r for r in s["ranking"]}
    assert (by_place[ids["van_hanh_mall"]]["total_min"], by_place[ids["van_hanh_mall"]]["max_min"]) == (57, 25)
    assert (by_place[ids["dinh_doc_lap"]]["total_min"], by_place[ids["dinh_doc_lap"]]["max_min"]) == (65, 32)
    assert s["threshold_min"] == 2 and s["travel_mode"] == "TWO_WHEELER"
    # V4, V5 chỉ bỏ phiếu, không chia sẻ vị trí và phòng không có điểm hẹn → bị loại khỏi phép tính
    assert s["excluded_member_count"] == 2 and s["estimated"] is True
    assert {m["nickname"] for m in s["members"]} == {"Host", "Nam", "Linh"}
    assert {m["origin_source"] for m in s["members"]} == {"MEMBER"}
    # ma trận: hàng = thành viên (theo `members`), cột = ứng viên (theo `candidates`)
    col = {c["place_id"]: j for j, c in enumerate(s["candidates"])}
    assert len(s["matrix"]) == 3 and all(len(row) == 3 for row in s["matrix"])
    assert {row[col[ids["van_hanh_mall"]]]["minutes"] for row in s["matrix"]} == {12, 25, 20}
    _no_secret(s)
    assert estimator.calls == 1


def test_tc03_two_tied_places_only(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 2, "saigon_centre": 2, "van_hanh_mall": 1})
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=room["host"]).json()
    ids = room["ids"]
    assert {c["place_id"] for c in s["candidates"]} == {ids["dinh_doc_lap"], ids["saigon_centre"]}
    assert s["recommended_place_id"] == ids["saigon_centre"]  # S 60 < 65
    assert s["margin_vs_second_min"] == 5


def test_no_tie_is_unavailable_and_does_not_call_estimator(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 1})
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=room["host"]).json()
    assert s["available"] is False and s["reason"] == "NO_TIE"
    assert s["ranking"] == [] and s["matrix"] == [] and s["recommended_place_id"] is None
    assert estimator.calls == 0  # Google/estimator chỉ chạy khi có hoà


def test_no_origins_when_nobody_shared_and_no_meeting_point(client: TestClient, estimator: FixedEstimator) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    nam = _join(client, room, "Nam")
    a, b = _place(client, room, host, "A", 10.77, 106.70), _place(client, room, host, "B", 10.78, 106.71)
    for pid in (a, b):
        _vote(client, room, host, pid)
        _vote(client, room, nam, pid)
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=host["h"]).json()
    assert s["available"] is False and s["reason"] == "NO_ORIGINS"
    assert {c["place_id"] for c in s["candidates"]} == {a, b}
    assert s["excluded_member_count"] == 2
    assert estimator.calls == 0


def test_member_without_origin_uses_meeting_point(client: TestClient, estimator: FixedEstimator) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    meet = (10.7769, 106.7009)
    assert client.patch(
        f"/api/v1/rooms/{room['id']}", headers=host["h"], json={"origin_lat": meet[0], "origin_lng": meet[1]}
    ).status_code == 200
    nam = _join(client, room, "Nam")
    _share(client, room, nam, *SECRET["nam"])  # host không chia sẻ → lấy điểm hẹn
    a, b = _place(client, room, host, "A", 10.77, 106.70), _place(client, room, host, "B", 10.80, 106.65)
    for pid in (a, b):
        _vote(client, room, host, pid)
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=nam["h"]).json()
    assert s["available"] is True
    sources = {m["nickname"]: m["origin_source"] for m in s["members"]}
    assert sources == {"Host": "MEETING_POINT", "Nam": "MEMBER"}
    assert s["excluded_member_count"] == 0
    assert str(meet[0]) not in json.dumps(s)


def test_place_without_coords_is_listed_but_never_recommended(client: TestClient, estimator: FixedEstimator) -> None:
    room, people = _trio(client)
    host = people["bao"]
    far = _place(client, room, host, "Far", 10.90, 106.80)
    near = _place(client, room, host, "Near", 10.78, 106.69)
    nocoord = _place(client, room, host, "NoCoord", None, None)
    for pid in (far, near, nocoord):
        _vote(client, room, host, pid)
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=host["h"]).json()
    assert s["available"] is True and s["recommended_place_id"] == near
    assert s["unranked_place_ids"] == [nocoord]
    assert {r["place_id"] for r in s["ranking"]} == {far, near}
    col = {c["place_id"]: j for j, c in enumerate(s["candidates"])}
    assert all(row[col[nocoord]] is None for row in s["matrix"])


def test_more_than_three_tied_places_are_all_considered(client: TestClient, estimator: FixedEstimator) -> None:
    room, people = _trio(client)
    host = people["bao"]
    ids = [_place(client, room, host, f"P{i}", 10.77 + i * 0.01, 106.70) for i in range(5)]
    for pid in ids:
        _vote(client, room, host, pid)
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=host["h"]).json()
    assert len(s["candidates"]) == 5 and len(s["ranking"]) == 5
    assert sorted(r["rank"] for r in s["ranking"]) == [1, 2, 3, 4, 5]


def test_each_suggestion_view_requests_one_matrix_for_all_pairs(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 3, "van_hanh_mall": 3})
    client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=room["host"])
    client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=room["host"])
    assert estimator.calls == 2  # mỗi lần xem gợi ý một yêu cầu ma trận (cache nằm trong estimator thật)


# ── Chốt TRAVEL_TIME ──────────────────────────────────────────────────────────────────────────────
def test_resolve_travel_time_accepts_recommended_and_ignores_client_numbers(
    client: TestClient, estimator: FixedEstimator
) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 3, "van_hanh_mall": 3})
    ids = room["ids"]
    res = client.post(
        f"/api/v1/rooms/{room['id']}/voting/resolve",
        headers=room["host"],
        json={
            "strategy": "TRAVEL_TIME",
            "max_accepted_places": 1,
            # client cố ép kết quả: server phải bỏ qua mọi trường ngoài hợp đồng
            "recommended_place_id": ids["dinh_doc_lap"],
            "ranking": [{"place_id": ids["dinh_doc_lap"], "total_min": 1}],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["tie_break_strategy"] == "TRAVEL_TIME" and body["tie_break_applied"] is True
    status_by_id = {p["id"]: p["status"] for p in body["resolved_places"]}
    assert status_by_id[ids["van_hanh_mall"]] == "ACCEPTED"
    assert status_by_id[ids["dinh_doc_lap"]] == status_by_id[ids["saigon_centre"]] == "REJECTED"
    detail = client.get(f"/api/v1/rooms/{room['id']}", headers=room["host"]).json()
    assert detail["status"] == "FINALIZED" and detail["tie_break_strategy"] == "TRAVEL_TIME"


def test_resolve_travel_time_by_non_host_is_forbidden(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 3, "van_hanh_mall": 3})
    res = client.post(
        f"/api/v1/rooms/{room['id']}/voting/resolve",
        headers=room["people"]["nam"]["h"],
        json={"strategy": "TRAVEL_TIME", "max_accepted_places": 1},
    )
    assert res.status_code == 403


def test_resolve_travel_time_without_origins_falls_back_to_upvotes_then_earliest(
    client: TestClient, estimator: FixedEstimator
) -> None:
    room = _room(client)
    host = {"id": room["host_id"], "h": room["host"]}
    first = _place(client, room, host, "First", 10.77, 106.70)
    second = _place(client, room, host, "Second", 10.78, 106.71)
    for pid in (first, second):
        _vote(client, room, host, pid)
    res = client.post(
        f"/api/v1/rooms/{room['id']}/voting/resolve",
        headers=host["h"],
        json={"strategy": "TRAVEL_TIME", "max_accepted_places": 1},
    )
    assert res.status_code == 200, res.text
    status_by_id = {p["id"]: p["status"] for p in res.json()["resolved_places"]}
    assert status_by_id == {first: "ACCEPTED", second: "REJECTED"}


def test_old_strategy_still_resolves(client: TestClient, estimator: FixedEstimator) -> None:
    room = _tie_setup(client, estimator, {"dinh_doc_lap": 3, "saigon_centre": 3, "van_hanh_mall": 3})
    res = client.post(
        f"/api/v1/rooms/{room['id']}/voting/resolve",
        headers=room["host"],
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
    )
    assert res.status_code == 200
    status_by_id = {p["id"]: p["status"] for p in res.json()["resolved_places"]}
    assert status_by_id[room["ids"]["dinh_doc_lap"]] == "ACCEPTED"  # thêm sớm nhất


def test_new_room_defaults_to_travel_time_and_old_strategies_stay_valid(client: TestClient) -> None:
    room = _room(client)
    assert room["room"]["tie_break_strategy"] == "TRAVEL_TIME"
    other = _room(client, tie_break_strategy="MOST_UPVOTES")
    assert other["room"]["tie_break_strategy"] == "MOST_UPVOTES"


def test_real_haversine_estimator_path(client: TestClient) -> None:
    """Không thay estimator: đường đi qua `get_travel_estimator()` thật (Haversine, không mạng)."""
    from app.domain.patterns.itinerary.travel import reset_travel_estimator

    reset_travel_estimator()
    room, people = _trio(client)
    host = people["bao"]
    near = _place(client, room, host, "Near", PTS["ben_thanh"]["lat"], PTS["ben_thanh"]["lng"])
    far = _place(client, room, host, "Far", 10.95, 106.95)
    for pid in (near, far):
        _vote(client, room, host, pid)
    s = client.get(f"/api/v1/rooms/{room['id']}/tie-break/suggestion", headers=host["h"]).json()
    assert s["available"] and s["recommended_place_id"] == near
    assert {leg["source"] for row in s["matrix"] for leg in row} == {"ESTIMATE"}
    assert s["estimated"] is True
