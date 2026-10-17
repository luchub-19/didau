from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.places
import app.api.v1.schedule
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.patterns.event_bus import (
    InMemoryEventBus,
    RecordingEventHandler,
    ScheduleUpdatedEvent,
)
from app.main import app

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

if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Cung cấp database session cho test và rollback sau test."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Cung cấp AsyncClient với database session override."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def recording_bus() -> tuple[InMemoryEventBus, RecordingEventHandler]:
    """Cung cấp InMemoryEventBus cùng RecordingEventHandler."""
    bus = InMemoryEventBus()
    handler = RecordingEventHandler()
    bus.register(ScheduleUpdatedEvent, handler)
    set_event_bus(bus)
    return bus, handler


async def _create_room(
    client: AsyncClient,
    nickname: str = "HostLich",
    title: str = "Kế hoạch đi chơi",
) -> dict[str, Any]:
    """Helper tạo phòng nhanh và trả về thông tin response."""
    response = await client.post(
        "/api/v1/rooms",
        json={
            "title": title,
            "event_date": "2026-11-20",
            "creator_nickname": nickname,
        },
    )
    assert response.status_code == 201
    return response.json()


async def _create_place(
    client: AsyncClient,
    room_id: str,
    token: str,
    name: str = "Cà phê 3T",
    open_minute: int = 480,
    close_minute: int = 1320,
) -> dict[str, Any]:
    """Helper thêm địa điểm vào phòng."""
    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        headers={"X-Member-Token": token},
        json={
            "name": name,
            "address": "123 Lê Lợi, Q1",
            "open_minute": open_minute,
            "close_minute": close_minute,
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_get_schedule_empty(client: AsyncClient) -> None:
    """Lấy danh sách lịch trình khi phòng chưa có mục nào trả về mảng rỗng."""
    room_data = await _create_room(client, "HostTest")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_schedule_item_success_and_publishes_event(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Thêm địa điểm vào lịch trình thành công và phát ScheduleUpdatedEvent."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostNam")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    place_data = await _create_place(client, room_id, token, "Cà Phê Trứng 3T")
    place_id = place_data["id"]

    payload = {
        "place_id": place_id,
        "day_offset": 0,
        "start_minute": 540,  # 09:00
        "end_minute": 630,  # 10:30
        "note": "Uống cà phê sáng và ngắm tàu thuyền",
    }
    response = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json=payload,
    )
    assert response.status_code == 201
    data = response.json()

    assert data["room_id"] == room_id
    assert data["place_id"] == place_id
    assert data["place_name"] == "Cà Phê Trứng 3T"
    assert data["place_address"] == "123 Lê Lợi, Q1"
    assert data["day_offset"] == 0
    assert data["start_minute"] == 540
    assert data["end_minute"] == 630
    assert data["order_index"] == 0
    assert data["note"] == "Uống cà phê sáng và ngắm tàu thuyền"
    assert "conflicts" in data

    # Kiểm tra event đã phát
    assert handler.count() >= 1
    last_event = handler.last_event
    assert isinstance(last_event, ScheduleUpdatedEvent)
    assert str(last_event.room_id) == room_id
    assert len(last_event.items) == 1


@pytest.mark.asyncio
async def test_create_schedule_item_validation_start_gte_end(
    client: AsyncClient,
) -> None:
    """Ràng buộc start_minute >= end_minute trả về 422 VALIDATION_ERROR."""
    room_data = await _create_room(client, "HostCheck")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    place_data = await _create_place(client, room_id, token, "Quán ăn trưa")
    place_id = place_data["id"]

    # start_minute = 600, end_minute = 540 (ngược giờ)
    response = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={
            "place_id": place_id,
            "day_offset": 0,
            "start_minute": 600,
            "end_minute": 540,
        },
    )
    assert response.status_code == 422
    err = response.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"

    # start_minute == end_minute
    response_eq = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={
            "place_id": place_id,
            "day_offset": 0,
            "start_minute": 600,
            "end_minute": 600,
        },
    )
    assert response_eq.status_code == 422


@pytest.mark.asyncio
async def test_create_schedule_item_place_not_found(client: AsyncClient) -> None:
    """Thêm địa điểm không tồn tại trả về 404 PLACE_NOT_FOUND."""
    room_data = await _create_room(client, "HostPlace")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={
            "place_id": str(uuid4()),
            "day_offset": 0,
            "start_minute": 540,
            "end_minute": 600,
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PLACE_NOT_FOUND"


@pytest.mark.asyncio
async def test_create_schedule_item_cross_room_forbidden(client: AsyncClient) -> None:
    """Địa điểm thuộc phòng khác không được phép thêm vào lịch phòng hiện tại."""
    room1 = await _create_room(client, "HostR1", "Phòng 1")
    room2 = await _create_room(client, "HostR2", "Phòng 2")

    p1 = await _create_place(client, room1["room"]["id"], room1["member_token"], "Quán Phòng 1")

    # Dùng token phòng 2 để thêm địa điểm phòng 1 vào lịch phòng 2
    response = await client.post(
        f"/api/v1/rooms/{room2['room']['id']}/schedule",
        headers={"X-Member-Token": room2["member_token"]},
        json={
            "place_id": p1["id"],
            "day_offset": 0,
            "start_minute": 540,
            "end_minute": 600,
        },
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PLACE_NOT_FOUND"


@pytest.mark.asyncio
async def test_schedule_auth_unauthorized(client: AsyncClient) -> None:
    """Thiếu token hoặc dùng token phòng khác trả về 401 UNAUTHORIZED."""
    room1 = await _create_room(client, "Host1")
    room2 = await _create_room(client, "Host2")

    # Thiếu token
    res_no_token = await client.get(f"/api/v1/rooms/{room1['room']['id']}/schedule")
    assert res_no_token.status_code == 401
    assert res_no_token.json()["error"]["code"] == "UNAUTHORIZED"

    # Sai phòng
    res_wrong_token = await client.get(
        f"/api/v1/rooms/{room1['room']['id']}/schedule",
        headers={"X-Member-Token": room2["member_token"]},
    )
    assert res_wrong_token.status_code == 401
    assert res_wrong_token.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_schedule_get_ordered_items(client: AsyncClient) -> None:
    """Lấy danh sách lịch trình sắp xếp theo ngày và thời gian bắt đầu."""
    room_data = await _create_room(client, "HostSort")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Ăn trưa")
    p2 = await _create_place(client, room_id, token, "Ăn sáng")

    # Thêm ăn trưa (12:00) trước
    await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p1["id"], "day_offset": 0, "start_minute": 720, "end_minute": 780},
    )
    # Thêm ăn sáng (08:00) sau
    await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p2["id"], "day_offset": 0, "start_minute": 480, "end_minute": 540},
    )

    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
    )
    assert get_res.status_code == 200
    items = get_res.json()
    assert len(items) == 2
    # Ăn sáng (480) phải đứng trước Ăn trưa (720)
    assert items[0]["place_name"] == "Ăn sáng"
    assert items[0]["start_minute"] == 480
    assert items[1]["place_name"] == "Ăn trưa"
    assert items[1]["start_minute"] == 720


@pytest.mark.asyncio
async def test_bulk_update_schedule_success_and_publishes_event(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Bulk update thay đổi thứ tự và giờ của các mục lịch trình."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostBulk")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán 1")
    p2 = await _create_place(client, room_id, token, "Quán 2")

    res1 = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p1["id"], "day_offset": 0, "start_minute": 500, "end_minute": 560},
    )
    res2 = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p2["id"], "day_offset": 0, "start_minute": 600, "end_minute": 660},
    )

    item1_id = res1.json()["id"]
    item2_id = res2.json()["id"]

    # Đảo lại giờ: item2 trước, item1 sau
    bulk_payload = {
        "items": [
            {
                "id": item1_id,
                "day_offset": 0,
                "start_minute": 700,
                "end_minute": 760,
                "order_index": 1,
            },
            {
                "id": item2_id,
                "day_offset": 0,
                "start_minute": 500,
                "end_minute": 560,
                "order_index": 0,
            },
        ]
    }

    put_res = await client.put(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json=bulk_payload,
    )
    assert put_res.status_code == 200
    updated_items = put_res.json()
    assert len(updated_items) == 2

    # item2 (500) phải đứng đầu
    assert updated_items[0]["id"] == item2_id
    assert updated_items[0]["start_minute"] == 500
    assert updated_items[1]["id"] == item1_id
    assert updated_items[1]["start_minute"] == 700

    # Kiểm tra event được phát
    assert handler.count() >= 1
    last_event = handler.last_event
    assert isinstance(last_event, ScheduleUpdatedEvent)


@pytest.mark.asyncio
async def test_bulk_update_validation_invalid_minutes(client: AsyncClient) -> None:
    """Bulk update với start_minute >= end_minute trả về 422."""
    room_data = await _create_room(client, "HostBulkFail")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán A")
    res1 = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p1["id"], "day_offset": 0, "start_minute": 500, "end_minute": 560},
    )

    invalid_payload = {
        "items": [
            {
                "id": res1.json()["id"],
                "day_offset": 0,
                "start_minute": 600,
                "end_minute": 500,
                "order_index": 0,
            }
        ]
    }
    response = await client.put(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json=invalid_payload,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_delete_schedule_item_success_and_not_found(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Xóa mục lịch trình thành công và kiểm tra xóa ID không tồn tại báo 404."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostDel")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán Xóa")
    res_create = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p1["id"], "day_offset": 0, "start_minute": 500, "end_minute": 560},
    )
    item_id = res_create.json()["id"]

    # Xóa mục thành công
    del_res = await client.delete(
        f"/api/v1/rooms/{room_id}/schedule/{item_id}",
        headers={"X-Member-Token": token},
    )
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True
    assert del_res.json()["item_id"] == item_id
    assert handler.count() >= 1

    # Lấy lại lịch trình phải rỗng
    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
    )
    assert get_res.json() == []

    # Xóa lại lần 2 báo 404
    del_again = await client.delete(
        f"/api/v1/rooms/{room_id}/schedule/{item_id}",
        headers={"X-Member-Token": token},
    )
    assert del_again.status_code == 404
    assert del_again.json()["error"]["code"] == "SCHEDULE_ITEM_NOT_FOUND"


@pytest.mark.asyncio
async def test_instant_conflict_detection_on_create(client: AsyncClient) -> None:
    """Khi thêm 2 mục bị trùng khung giờ (09:00-10:00 và 09:30-10:30), API trả về cảnh báo xung đột tức thời."""
    room_data = await _create_room(client, "HostConflict")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Cà Phê Trứng 3T")
    p2 = await _create_place(client, room_id, token, "Cơm Tấm Ba Ghiền")

    # Mục 1: 09:00 - 10:00 (540 - 600)
    res1 = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p1["id"], "day_offset": 0, "start_minute": 540, "end_minute": 600},
    )
    assert res1.status_code == 201

    # Mục 2: 09:30 - 10:30 (570 - 630) -> Trùng giờ với mục 1
    res2 = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={"place_id": p2["id"], "day_offset": 0, "start_minute": 570, "end_minute": 630},
    )
    assert res2.status_code == 201
    data2 = res2.json()

    assert "conflicts" in data2
    conflicts = data2["conflicts"]
    assert len(conflicts) > 0

    time_overlap = next((c for c in conflicts if c["rule_code"] == "TIME_OVERLAP"), None)
    assert time_overlap is not None
    assert time_overlap["level"] == "CRITICAL"
    assert "Trùng lặp thời gian" in time_overlap["message"]
