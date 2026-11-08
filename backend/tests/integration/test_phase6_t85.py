"""T-85: vị trí xuất phát riêng tư (CR-11), state_version (CR-13), giới hạn đề xuất (CR-14).

Dùng TestClient đồng bộ + Postgres thật, mỗi request một session có commit — giống production,
nên cũng chứng minh handler đánh giá xung đột (session riêng) không bị bế tắc với khoá hàng phòng.
"""

import asyncio
import json
from collections.abc import AsyncGenerator, Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.websocket as ws_module
import app.main as main_module
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.models import Member, Room
from app.domain.patterns.event_bus import InMemoryEventBus
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

A_LAT, A_LNG = 10.7712345, 106.6987654  # toạ độ riêng của A: không được lọt ra ngoài
H = "X-Member-Token"


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """TestClient với bus/manager mới, mỗi request một session commit; dọn phòng đã tạo khi xong."""
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


def _room(client: TestClient, **extra: Any) -> dict[str, Any]:
    res = client.post(
        "/api/v1/rooms",
        json={"title": "Phòng T-85", "event_date": "2026-11-20", "creator_nickname": "Host", **extra},
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


def _place(client: TestClient, room: dict[str, Any], headers: dict[str, str], name: str) -> Any:
    return client.post(
        f"/api/v1/rooms/{room['id']}/places",
        headers=headers,
        json={"name": name, "latitude": 10.77, "longitude": 106.7},
    )


def _drain_until_pong(ws: Any) -> list[dict[str, Any]]:
    """Đọc mọi tin đang chờ rồi dừng ở PONG của một PING gửi thêm (các tin trước PONG đã xử lý)."""
    ws.send_json({"type": "PING", "payload": {}})
    out: list[dict[str, Any]] = []
    for _ in range(60):
        msg = ws.receive_json()
        out.append(msg)
        if msg["type"] == "PONG":
            return out
    raise AssertionError("Không nhận được PONG")


def _walk(obj: Any) -> Generator[dict[str, Any], None, None]:
    if isinstance(obj, dict):
        yield obj
        for v in obj.values():
            yield from _walk(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk(v)


def _assert_no_origin_of(obj: Any, secret_member_id: str) -> None:
    """Không có toạ độ A ở bất kỳ đâu, và không mục thành viên nào của A mang khoá origin_*."""
    text = json.dumps(obj, ensure_ascii=False)
    assert str(A_LAT) not in text and str(A_LNG) not in text
    for node in _walk(obj):
        if node.get("id") == secret_member_id or node.get("member_id") == secret_member_id:
            assert "origin_lat" not in node and "origin_lng" not in node


# ---------------------------------------------------------------- CR-11: riêng tư


def test_origin_private_to_owner_across_rest_and_ws(client: TestClient) -> None:
    host_room = _room(client)
    a = {"id": host_room["host_id"], "h": host_room["host"]}
    b = _join(client, host_room, "Bao")
    rid = host_room["id"]

    with client.websocket_connect(f"/ws/rooms/{rid}?token={b['token']}") as b_ws:
        b_ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        _drain_until_pong(b_ws)

        res = client.patch(
            f"/api/v1/rooms/{rid}/members/me",
            headers=a["h"],
            json={"origin_lat": A_LAT, "origin_lng": A_LNG},
        )
        assert res.status_code == 200
        own = res.json()
        assert (own["origin_lat"], own["origin_lng"], own["has_origin"]) == (A_LAT, A_LNG, True)
        assert res.headers["X-State-Version"] == "2"  # B vào phòng đã là +1

        # Chính chủ đọc lại được
        mine = client.get("/api/v1/members/me", headers=a["h"]).json()
        assert (mine["origin_lat"], mine["origin_lng"]) == (A_LAT, A_LNG)

        # B: mọi endpoint REST
        seen: list[Any] = []
        for path in (
            "/api/v1/members/me",
            f"/api/v1/rooms/{rid}",
            f"/api/v1/rooms/{rid}/places",
            f"/api/v1/rooms/{rid}/schedule",
        ):
            r = client.get(path, headers=b["h"])
            assert r.status_code == 200, (path, r.text)
            seen.append(r.json())
        assert seen[0]["has_origin"] is False and seen[0]["origin_lat"] is None
        detail = seen[1]
        a_entry = next(m for m in detail["members"] if m["id"] == a["id"])
        assert a_entry["has_origin"] is True

        # B: WS — MEMBER_UPDATED chỉ có cờ, và ROOM_STATE_SYNC không có toạ độ của A
        msgs = _drain_until_pong(b_ws)
        updated = next(m for m in msgs if m["type"] == "MEMBER_UPDATED")
        assert updated["payload"] == {"member_id": a["id"], "has_origin": True}
        assert updated["state_version"] == 2
        b_ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        msgs += _drain_until_pong(b_ws)
        sync = next(m for m in msgs if m["type"] == "ROOM_STATE_SYNC")
        sync_a = next(m for m in sync["payload"]["members"] if m["id"] == a["id"])
        assert sync_a["has_origin"] is True
        seen.append(msgs)

        _assert_no_origin_of(seen, a["id"])

    # A nhận lại toạ độ của chính mình qua ROOM_STATE_SYNC
    with client.websocket_connect(f"/ws/rooms/{rid}?token={a['h'][H]}") as a_ws:
        a_ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        sync = next(m for m in _drain_until_pong(a_ws) if m["type"] == "ROOM_STATE_SYNC")
        own_entry = next(m for m in sync["payload"]["members"] if m["id"] == a["id"])
        assert (own_entry["origin_lat"], own_entry["origin_lng"]) == (A_LAT, A_LNG)


def test_member_joined_event_has_origin_flag_only(client: TestClient) -> None:
    room = _room(client)
    with client.websocket_connect(f"/ws/rooms/{room['id']}?token={room['host'][H]}") as ws:
        _join(client, room, "Moi")
        msg = next(m for m in _drain_until_pong(ws) if m["type"] == "MEMBER_JOINED")
        assert msg["payload"]["member"]["has_origin"] is False
        assert "origin_lat" not in msg["payload"]["member"]
        assert msg["state_version"] == 1


def test_origin_clear_and_validation(client: TestClient) -> None:
    room = _room(client)
    url = f"/api/v1/rooms/{room['id']}/members/me"
    h = room["host"]

    assert client.patch(url, headers=h, json={"origin_lat": 10.7, "origin_lng": 106.7}).status_code == 200
    cleared = client.patch(url, headers=h, json={"origin_lat": None, "origin_lng": None})
    assert cleared.status_code == 200
    body = cleared.json()
    assert (body["origin_lat"], body["origin_lng"], body["has_origin"]) == (None, None, False)
    assert client.get("/api/v1/members/me", headers=h).json()["origin_lat"] is None

    # Nửa cặp / thiếu trường / ngoài biên → 422
    for bad in (
        {"origin_lat": 10.7, "origin_lng": None},
        {"origin_lat": None, "origin_lng": 106.7},
        {"origin_lat": 10.7},
        {},
        {"origin_lat": 91, "origin_lng": 106.7},
        {"origin_lat": 10.7, "origin_lng": 181},
    ):
        res = client.patch(url, headers=h, json=bad)
        assert res.status_code == 422, bad
    # Sau lần 422 vẫn là trạng thái đã xoá
    assert client.get("/api/v1/members/me", headers=h).json()["has_origin"] is False

    # Không sửa được vị trí qua phòng khác
    other = _room(client)
    assert (
        client.patch(
            f"/api/v1/rooms/{other['id']}/members/me",
            headers=h,
            json={"origin_lat": 1.0, "origin_lng": 1.0},
        ).status_code
        == 401
    )


# ---------------------------------------------------------------- CR-13: state_version


def test_state_version_increments_by_one_and_is_on_every_ws_message(client: TestClient) -> None:
    room = _room(client)
    rid = room["id"]
    assert room["room"]["state_version"] == 0
    guest = _join(client, room, "Khach")  # +1 (MEMBER_JOINED)
    host_h, guest_h = room["host"], guest["h"]

    with client.websocket_connect(f"/ws/rooms/{rid}?token={room['host'][H]}") as ws:
        ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {}})
        first = _drain_until_pong(ws)
        sync = next(m for m in first if m["type"] == "ROOM_STATE_SYNC")
        assert sync["state_version"] == sync["payload"]["state_version"] == 1
        assert sync["payload"]["room"]["state_version"] == 1

        versions: list[int] = [1]

        def step(res: Any, n: int = 1) -> None:
            # Mỗi tin WS thay đổi trạng thái +1; T-87: thao tác đổi ưu tiên quán phát thêm PRIORITY_UPDATED (+1)
            assert res.status_code < 300, res.text
            v = int(res.headers["X-State-Version"])
            assert v == versions[-1] + n, f"thao tác phát {n} tin phải tăng đúng {n}"
            versions.append(v)

        r = client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"title": "Đổi tên"})
        step(r)
        assert r.json()["state_version"] == versions[-1]  # body khớp header
        p = _place(client, room, guest_h, "Quán A")
        step(p, 2)  # PLACE_ADDED + PRIORITY_UPDATED
        place_id = p.json()["id"]
        step(client.post(f"/api/v1/rooms/{rid}/places/{place_id}/votes", headers=host_h, json={"vote_value": 1}), 2)
        step(
            client.patch(f"/api/v1/rooms/{rid}/members/me", headers=guest_h, json={"origin_lat": 10.7, "origin_lng": 106.7}),
            2,
        )
        # Xoá quán cuối cùng: không còn gì để xếp → không có PRIORITY_UPDATED
        step(client.delete(f"/api/v1/rooms/{rid}/places/{place_id}", headers=guest_h))

        # Đọc thuần không đổi số, nhưng vẫn mang header
        g = client.get(f"/api/v1/rooms/{rid}", headers=host_h)
        assert g.headers["X-State-Version"] == str(versions[-1])
        assert g.json()["state_version"] == versions[-1]

        # Tin tạm thời mang số hiện tại, không làm số tăng
        ws.send_json({"type": "CHAT_MESSAGE", "payload": {"message": "xin chào"}})
        ws.send_json({"type": "TYPING_PLACE", "payload": {"is_typing": True}})
        msgs = _drain_until_pong(ws)

    assert msgs, "phải nhận được tin"
    for m in msgs:
        assert isinstance(m.get("state_version"), int), f"{m['type']} thiếu state_version"
    stateful = [m for m in msgs if m["type"] not in ("CHAT_MESSAGE", "PONG", "TYPING_PLACE")]
    seen_versions = sorted({m["state_version"] for m in stateful})
    # Không tin nào trễ/mất: các số đã thấy liên tiếp từ 2 tới số cuối (CONFLICTS_UPDATED dùng lại số cha)
    assert seen_versions == list(range(2, versions[-1] + 1)), [(m["type"], m["state_version"]) for m in stateful]
    for m in msgs:
        if m["type"] in ("CHAT_MESSAGE", "PONG"):
            assert m["state_version"] == versions[-1]

    # DB khớp
    async def _db_version() -> int:
        async with Session() as s:
            return (await s.execute(select(Room.state_version).where(Room.id == rid))).scalar_one()

    assert asyncio.run(_db_version()) == versions[-1]


# ---------------------------------------------------------------- CR-14: giới hạn đề xuất


def test_place_limit_default_two_then_409_delete_and_host_unlimited(client: TestClient) -> None:
    room = _room(client)
    rid = room["id"]
    assert room["room"]["max_places_per_member"] == 2
    host_h = room["host"]
    guest = _join(client, room, "Khach")

    first = _place(client, room, host_h, "Q1")
    assert first.status_code == 201
    assert _place(client, room, host_h, "Q2").status_code == 201
    over = _place(client, room, host_h, "Q3")
    assert over.status_code == 409
    err = over.json()["error"]
    assert err["code"] == "PLACE_LIMIT_REACHED"
    assert err["details"] == {"limit": 2, "used": 2}

    # Giới hạn tính theo từng người
    assert _place(client, room, guest["h"], "K1").status_code == 201

    # Xoá một quán rồi thêm lại được
    assert client.delete(f"/api/v1/rooms/{rid}/places/{first.json()['id']}", headers=host_h).status_code in (200, 204)
    assert _place(client, room, host_h, "Q3").status_code == 201
    assert _place(client, room, host_h, "Q4").status_code == 409

    # Chỉ HOST đổi được; ngoài 1–10 là 422
    assert client.patch(f"/api/v1/rooms/{rid}", headers=guest["h"], json={"max_places_per_member": 5}).status_code == 403
    for bad in (0, 11):
        assert client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"max_places_per_member": bad}).status_code == 422

    # Host nâng lên 3 → thêm được; đặt null → bỏ giới hạn
    r3 = client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"max_places_per_member": 3})
    assert r3.status_code == 200 and r3.json()["max_places_per_member"] == 3
    assert _place(client, room, host_h, "Q4").status_code == 201
    assert _place(client, room, host_h, "Q5").status_code == 409
    unl = client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"max_places_per_member": None})
    assert unl.status_code == 200 and unl.json()["max_places_per_member"] is None
    for i in range(4):
        assert _place(client, room, host_h, f"Q{10 + i}").status_code == 201

    # PATCH không nhắc tới trường này thì giữ nguyên (không bị coi là null)
    client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"max_places_per_member": 4})
    client.patch(f"/api/v1/rooms/{rid}", headers=host_h, json={"title": "Chỉ đổi tên"})
    assert client.get(f"/api/v1/rooms/{rid}", headers=host_h).json()["max_places_per_member"] == 4


def test_create_room_accepts_limit_field(client: TestClient) -> None:
    assert _room(client, max_places_per_member=1)["room"]["max_places_per_member"] == 1
    assert _room(client, max_places_per_member=None)["room"]["max_places_per_member"] is None
    bad = client.post(
        "/api/v1/rooms",
        json={"title": "x", "event_date": "2026-11-20", "creator_nickname": "H", "max_places_per_member": 11},
    )
    assert bad.status_code == 422


def test_legacy_room_with_null_limit_has_no_limit(client: TestClient) -> None:
    """Phòng cũ (cột NULL, như sau migration) không bị giới hạn."""
    room = _room(client)

    async def _set_null() -> None:
        async with Session() as s:
            r = (await s.execute(select(Room).where(Room.id == room["id"]))).scalar_one()
            r.max_places_per_member = None
            await s.commit()

    asyncio.run(_set_null())
    for i in range(4):
        assert _place(client, room, room["host"], f"Cu{i}").status_code == 201


def test_db_rejects_half_origin_pair(client: TestClient) -> None:
    room = _room(client)

    async def _bad() -> None:
        async with Session() as s:
            m = (await s.execute(select(Member).where(Member.id == room["host_id"]))).scalar_one()
            m.origin_lat = 10.7
            m.origin_lng = None
            await s.commit()

    with pytest.raises(Exception, match="chk_members_origin_pair"):
        asyncio.run(_bad())
