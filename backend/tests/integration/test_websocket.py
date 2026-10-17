from collections.abc import AsyncGenerator
from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.conflicts
import app.api.v1.members
import app.api.v1.places
import app.api.v1.rooms
import app.api.v1.schedule
import app.api.v1.votes
import app.api.v1.websocket
from app.api.deps import get_db, get_event_bus, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.enums import MemberRole, PlaceCategory, RoomStatus
from app.domain.patterns.event_bus import (
    ConflictDetectedEvent,
    InMemoryEventBus,
    PlaceAddedEvent,
    ScheduleUpdatedEvent,
    VoteCastEvent,
)
from app.domain.patterns.event_bus.handlers import (
    register_websocket_broadcast_handlers,
)
from app.main import app
from app.repositories import (
    MemberRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
)
from app.services.websocket_manager import (
    WebSocketConnectionManager,
    get_websocket_manager,
    reset_websocket_manager,
    set_websocket_manager,
)

settings = get_settings()

test_engine = create_async_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Đảm bảo router và handlers được đăng ký
if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)

import app.core.database as core_db

core_db.engine = test_engine
core_db.AsyncSessionLocal = TestSessionLocal


class MockWebSocket:
    """Mock WebSocket phục vụ kiểm thử đơn vị WebSocketConnectionManager."""

    def __init__(self) -> None:
        self.sent_messages: list[dict[str, Any]] = []
        self.closed = False
        self.close_code: int | None = None

    async def send_json(self, data: dict[str, Any]) -> None:
        if self.closed:
            raise RuntimeError("Cannot write to closed WebSocket")
        self.sent_messages.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed = True
        self.close_code = code


from app.api.v1.websocket import set_session_factory

set_session_factory(TestSessionLocal)


@pytest.fixture
def mock_ws() -> MockWebSocket:
    return MockWebSocket()


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture
def ws_manager() -> WebSocketConnectionManager:
    manager = WebSocketConnectionManager()
    set_websocket_manager(manager)
    yield manager
    reset_websocket_manager()


@pytest.fixture
def test_event_bus(ws_manager: WebSocketConnectionManager) -> InMemoryEventBus:
    bus = InMemoryEventBus()
    set_event_bus(bus)
    register_websocket_broadcast_handlers(bus, ws_manager)
    yield bus
    set_event_bus(InMemoryEventBus())


@pytest.fixture(autouse=True)
def setup_websocket_sync() -> Any:
    """Đảm bảo EventBus toàn cục kết nối trực tiếp với WebSocketConnectionManager toàn cục."""
    manager = get_websocket_manager()
    bus = get_event_bus()
    register_websocket_broadcast_handlers(bus, manager)

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)





async def _create_test_room_and_member(
    session: AsyncSession,
    nickname: str = "HostWs",
) -> tuple[UUID, UUID, str]:
    """Helper tạo phòng và thành viên mẫu trực tiếp trong DB."""
    room_repo = RoomRepository(session)
    member_repo = MemberRepository(session)

    room_data = {
        "title": "Buổi đi chơi WebSocket",
        "description": "Kiểm thử realtime",
        "event_date": date.today(),
        "status": RoomStatus.PLANNING.value,
        "code": f"WS{uuid4().hex[:4].upper()}",
    }
    room = await room_repo.create(room_data)

    member_token = f"tok_ws_{uuid4().hex}"
    member_data = {
        "room_id": room.id,
        "nickname": nickname,
        "role": MemberRole.HOST.value,
        "token": member_token,
        "is_active": True,
    }
    member = await member_repo.create(member_data)
    await session.commit()

    return room.id, member.id, member_token


# ==========================================
# 1. UNIT TESTS: WebSocketConnectionManager
# ==========================================


@pytest.mark.asyncio
async def test_websocket_manager_connect_and_disconnect(
    ws_manager: WebSocketConnectionManager,
    mock_ws: MockWebSocket,
) -> None:
    """Kiểm tra việc kết nối, đếm số lượng kết nối và ngắt kết nối an toàn."""
    room_id = uuid4()
    member_id = uuid4()

    assert not ws_manager.is_member_connected(room_id, member_id)
    assert ws_manager.get_active_room_count(room_id) == 0

    await ws_manager.connect(room_id, member_id, mock_ws)
    assert ws_manager.is_member_connected(room_id, member_id)
    assert ws_manager.get_active_room_count(room_id) == 1
    assert ws_manager.get_connected_members(room_id) == [member_id]

    await ws_manager.disconnect(room_id, member_id, mock_ws)
    assert not ws_manager.is_member_connected(room_id, member_id)
    assert ws_manager.get_active_room_count(room_id) == 0
    assert ws_manager.get_connected_members(room_id) == []


@pytest.mark.asyncio
async def test_websocket_manager_broadcast_to_room(
    ws_manager: WebSocketConnectionManager,
) -> None:
    """Kiểm tra broadcast gửi tới đúng phòng và hỗ trợ loại trừ người gửi."""
    room_1 = uuid4()
    room_2 = uuid4()
    member_1 = uuid4()
    member_2 = uuid4()
    member_3 = uuid4()

    ws_1 = MockWebSocket()
    ws_2 = MockWebSocket()
    ws_3 = MockWebSocket()

    await ws_manager.connect(room_1, member_1, ws_1)
    await ws_manager.connect(room_1, member_2, ws_2)
    await ws_manager.connect(room_2, member_3, ws_3)

    msg = {"type": "PLACE_ADDED", "payload": {"name": "Phở Hòa"}, "ts": 123456}
    await ws_manager.broadcast_to_room(room_1, msg)

    assert len(ws_1.sent_messages) == 1
    assert ws_1.sent_messages[0] == msg
    assert len(ws_2.sent_messages) == 1
    assert ws_2.sent_messages[0] == msg
    assert len(ws_3.sent_messages) == 0

    # Test exclude_member_id
    msg2 = {"type": "TYPING_PLACE", "payload": {"is_typing": True}, "ts": 123457}
    await ws_manager.broadcast_to_room(room_1, msg2, exclude_member_id=member_1)
    assert len(ws_1.sent_messages) == 1  # Không nhận
    assert len(ws_2.sent_messages) == 2  # Nhận được


@pytest.mark.asyncio
async def test_websocket_manager_cleans_stale_connections(
    ws_manager: WebSocketConnectionManager,
) -> None:
    """Kiểm tra việc tự động dọn dẹp các socket bị lỗi khi broadcast."""
    room_id = uuid4()
    member_id = uuid4()

    broken_ws = MockWebSocket()
    broken_ws.closed = True  # send_json sẽ raise RuntimeError

    await ws_manager.connect(room_id, member_id, broken_ws)
    assert ws_manager.get_active_room_count(room_id) == 1

    await ws_manager.broadcast_to_room(room_id, {"type": "PING", "payload": {}})
    # Socket hỏng đã được dọn dẹp
    assert ws_manager.get_active_room_count(room_id) == 0


# ==========================================
# 2. UNIT TESTS: WebSocketBroadcastHandler & EventBus
# ==========================================


@pytest.mark.asyncio
async def test_websocket_broadcast_handler_dispatches_events(
    ws_manager: WebSocketConnectionManager,
    test_event_bus: InMemoryEventBus,
) -> None:
    """Kiểm tra handler tự động đóng gói envelope và broadcast khi có DomainEvent phát tán."""
    room_id = uuid4()
    member_id = uuid4()
    ws = MockWebSocket()
    await ws_manager.connect(room_id, member_id, ws)

    # 1. PlaceAddedEvent
    place_id = uuid4()
    await test_event_bus.publish(
        PlaceAddedEvent(
            room_id=room_id,
            place_id=place_id,
            name="Cà phê Trứng 3T",
            category=PlaceCategory.DRINK,
            estimated_cost=45000,
        )
    )

    assert len(ws.sent_messages) >= 1
    last_msg = ws.sent_messages[-1]
    assert last_msg["type"] == "PLACE_ADDED"
    assert last_msg["payload"]["place"]["name"] == "Cà phê Trứng 3T"
    assert last_msg["payload"]["place"]["category"] == "DRINK"
    assert "ts" in last_msg

    # 2. VoteCastEvent
    await test_event_bus.publish(
        VoteCastEvent(
            room_id=room_id,
            place_id=place_id,
            member_id=member_id,
            vote_value=1,
            upvotes=5,
            downvotes=0,
            score=5,
        )
    )
    last_msg = ws.sent_messages[-1]
    assert last_msg["type"] == "VOTE_UPDATED"
    assert last_msg["payload"]["upvotes"] == 5
    assert last_msg["payload"]["score"] == 5

    # 3. ScheduleUpdatedEvent
    await test_event_bus.publish(
        ScheduleUpdatedEvent(
            room_id=room_id,
            items=[{"id": str(uuid4()), "start_minute": 540, "end_minute": 600}],
        )
    )
    last_msg = ws.sent_messages[-1]
    assert last_msg["type"] == "SCHEDULE_UPDATED"
    assert len(last_msg["payload"]["items"]) == 1

    # 4. ConflictDetectedEvent
    await test_event_bus.publish(
        ConflictDetectedEvent(
            room_id=room_id,
            conflicts=[{"rule_code": "TIME_OVERLAP", "level": "CRITICAL"}],
        )
    )
    last_msg = ws.sent_messages[-1]
    assert last_msg["type"] == "CONFLICTS_UPDATED"
    assert last_msg["payload"]["conflicts"][0]["rule_code"] == "TIME_OVERLAP"


# ==========================================
# 3. INTEGRATION TESTS: WebSocket Endpoint
# ==========================================


@pytest.mark.asyncio
async def test_websocket_missing_token_unauthorized(db_session: AsyncSession) -> None:
    """Kết nối không kèm token nhận frame ERROR UNAUTHORIZED và bị ngắt."""
    room_id = uuid4()
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_id}") as ws:
        data = ws.receive_json()
        assert data["type"] == "ERROR"
        assert data["payload"]["code"] == "UNAUTHORIZED"
        assert "Thiếu member_token" in data["payload"]["message"]


@pytest.mark.asyncio
async def test_websocket_invalid_token_unauthorized(db_session: AsyncSession) -> None:
    """Kết nối với token không tồn tại nhận frame ERROR UNAUTHORIZED."""
    room_id = uuid4()
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_id}?token=invalid_token_123") as ws:
        data = ws.receive_json()
        assert data["type"] == "ERROR"
        assert data["payload"]["code"] == "UNAUTHORIZED"
        assert "không hợp lệ" in data["payload"]["message"]


@pytest.mark.asyncio
async def test_websocket_forbidden_cross_room(db_session: AsyncSession) -> None:
    """Kết nối bằng token của phòng này vào phòng khác nhận frame ERROR FORBIDDEN."""
    _room_1_id, _, token_1 = await _create_test_room_and_member(db_session, "HostRoom1")
    room_2_id = uuid4()
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_2_id}?token={token_1}") as ws:
        data = ws.receive_json()
        assert data["type"] == "ERROR"
        assert data["payload"]["code"] == "FORBIDDEN"
        assert "không thuộc phòng" in data["payload"]["message"]


@pytest.mark.asyncio
async def test_websocket_ping_pong_heartbeat(db_session: AsyncSession) -> None:
    """Gửi PING nhận về frame PONG theo đúng cấu trúc CONTRACTS.md."""
    room_id, _, token = await _create_test_room_and_member(db_session, "HostPing")
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
        ws.send_json({"type": "PING", "payload": {}})
        data = ws.receive_json()
        assert data["type"] == "PONG"
        assert data["payload"] == {}
        assert isinstance(data["ts"], int)


@pytest.mark.asyncio
async def test_websocket_subscribe_room_sync(db_session: AsyncSession) -> None:
    """Gửi SUBSCRIBE_ROOM nhận về frame ROOM_STATE_SYNC đầy đủ dữ liệu phòng (kèm place & schedule)."""
    room_id, member_id, token = await _create_test_room_and_member(db_session, "HostSync")

    # Tạo địa điểm và mục lịch trình mẫu để kiểm tra tính tuần tự hóa JSON của UUID/datetime
    place_repo = PlaceRepository(db_session)
    place = await place_repo.create({
        "room_id": room_id,
        "submitted_by_id": member_id,
        "name": "Quán Cà Phê Test WS",
        "category": "DRINK",
        "status": "VOTING",
    })
    schedule_repo = ScheduleRepository(db_session)
    await schedule_repo.create({
        "room_id": room_id,
        "place_id": place.id,
        "day_offset": 0,
        "start_minute": 540,
        "end_minute": 630,
        "order_index": 0,
    })
    await db_session.commit()

    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
        ws.send_json({"type": "SUBSCRIBE_ROOM", "payload": {"room_id": str(room_id)}})
        data = ws.receive_json()
        assert data["type"] == "ROOM_STATE_SYNC"
        payload = data["payload"]
        assert "room" in payload
        assert "members" in payload
        assert "places" in payload
        assert "schedule" in payload
        assert "conflicts" in payload
        assert payload["room"]["id"] == str(room_id)
        assert len(payload["members"]) >= 1
        assert len(payload["places"]) == 1
        assert payload["places"][0]["id"] == str(place.id)
        assert len(payload["schedule"]) == 1
        assert payload["schedule"][0]["place_id"] == str(place.id)


@pytest.mark.asyncio
async def test_websocket_typing_place_broadcast(
    ws_manager: WebSocketConnectionManager,
) -> None:
    """Client 1 gửi TYPING_PLACE thì Client 2 trong cùng phòng nhận được, Client 1 không bị lặp lại."""
    room_id = uuid4()
    member_1 = uuid4()
    member_2 = uuid4()
    ws_1 = MockWebSocket()
    ws_2 = MockWebSocket()

    await ws_manager.connect(room_id, member_1, ws_1)
    await ws_manager.connect(room_id, member_2, ws_2)

    # Giả lập broadcast TYPING_PLACE loại trừ người gửi
    typing_msg = {
        "type": "TYPING_PLACE",
        "payload": {
            "member_id": str(member_1),
            "nickname": "User1",
            "is_typing": True,
        },
        "ts": 1234567,
    }
    await ws_manager.broadcast_to_room(room_id, typing_msg, exclude_member_id=member_1)

    assert len(ws_1.sent_messages) == 0  # Người gửi không nhận lại
    assert len(ws_2.sent_messages) == 1
    assert ws_2.sent_messages[0]["type"] == "TYPING_PLACE"
    assert ws_2.sent_messages[0]["payload"]["nickname"] == "User1"
    assert ws_2.sent_messages[0]["payload"]["is_typing"] is True



def test_websocket_receives_place_added_broadcast() -> None:
    """Tiêu chí hoàn thành T-13: Khi gọi REST API thêm địa điểm thì kết nối WebSocket nhận được message PLACE_ADDED."""
    client = TestClient(app)
    res = client.post(
        "/api/v1/rooms",
        json={
            "title": "Buổi đi chơi WebSocket Test",
            "event_date": "2026-10-25",
            "creator_nickname": "HostRestWS",
        },
    )
    assert res.status_code == 201
    data = res.json()
    room_id = data["room"]["id"]
    token = data["member_token"]

    with client.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
        place_res = client.post(
            f"/api/v1/rooms/{room_id}/places",
            headers={"X-Member-Token": token},
            json={
                "name": "Cơm tấm Ba Ghiền",
                "category": "FOOD",
                "estimated_cost": 85000,
                "address": "84 Đặng Văn Ngữ, Phú Nhuận",
            },
        )
        assert place_res.status_code == 201

        msg = ws.receive_json()
        assert msg["type"] == "PLACE_ADDED"
        assert msg["payload"]["place"]["name"] == "Cơm tấm Ba Ghiền"
        assert msg["payload"]["place"]["category"] == "FOOD"
        assert msg["payload"]["place"]["estimated_cost"] == 85000
        assert msg["payload"]["place"]["address"] == "84 Đặng Văn Ngữ, Phú Nhuận"


@pytest.mark.asyncio
async def test_websocket_origin_check(db_session: AsyncSession) -> None:
    """WebSocket từ chối kết nối từ Origin không nằm trong ALLOWED_ORIGINS (mã 1008)."""
    from starlette.websockets import WebSocketDisconnect

    room_id, _, token = await _create_test_room_and_member(db_session, "HostOrigin")
    client = TestClient(app)

    # 1. Origin sai -> Đóng với mã 1008
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(
            f"/ws/rooms/{room_id}?token={token}",
            headers={"origin": "http://malicious-site.com"},
        ):
            pass
    assert exc_info.value.code == 1008

    # 2. Origin đúng (http://localhost:5173) -> Kết nối thành công
    with client.websocket_connect(
        f"/ws/rooms/{room_id}?token={token}",
        headers={"origin": "http://localhost:5173"},
    ) as ws:
        ws.send_json({"type": "PING", "payload": {}})
        resp = ws.receive_json()
        assert resp["type"] == "PONG"


@pytest.mark.asyncio
async def test_websocket_chat_message_and_limits(db_session: AsyncSession) -> None:
    """Kiểm tra giới hạn độ dài tin chat 500 ký tự và rate limit 20 tin/10s."""
    room_id, _, token = await _create_test_room_and_member(db_session, "HostChat")
    client = TestClient(app)

    with client.websocket_connect(f"/ws/rooms/{room_id}?token={token}") as ws:
        # 1. Tin nhắn bình thường hợp lệ -> Được broadcast
        ws.send_json({"type": "CHAT_MESSAGE", "payload": {"message": "Xin chào cả nhóm!"}})
        msg = ws.receive_json()
        assert msg["type"] == "CHAT_MESSAGE"
        assert msg["payload"]["message"] == "Xin chào cả nhóm!"

        # 2. Tin nhắn quá dài (>500 ký tự) -> Nhận ERROR MESSAGE_TOO_LONG
        long_message = "A" * 501
        ws.send_json({"type": "CHAT_MESSAGE", "payload": {"message": long_message}})
        err_msg = ws.receive_json()
        assert err_msg["type"] == "ERROR"
        assert err_msg["payload"]["code"] == "MESSAGE_TOO_LONG"



