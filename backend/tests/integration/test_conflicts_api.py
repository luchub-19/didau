from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.conflicts
import app.api.v1.places
import app.api.v1.schedule
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.enums import ConflictLevel, PlaceStatus
from app.domain.patterns.event_bus import (
    ConflictDetectedEvent,
    InMemoryEventBus,
    RecordingEventHandler,
)
from app.main import app
from app.services.conflict_service import (
    register_conflict_evaluation_handlers,
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
    bus.register(ConflictDetectedEvent, handler)
    set_event_bus(bus)
    return bus, handler


async def _create_room(
    client: AsyncClient,
    nickname: str = "HostConflict",
    title: str = "Phòng kiểm tra xung đột",
    budget_limit: int | None = None,
) -> dict[str, Any]:
    """Helper tạo phòng nhanh và trả về thông tin response."""
    payload: dict[str, Any] = {
        "title": title,
        "event_date": "2026-11-25",
        "creator_nickname": nickname,
    }
    if budget_limit is not None:
        payload["budget_limit"] = budget_limit

    response = await client.post("/api/v1/rooms", json=payload)
    assert response.status_code == 201
    return response.json()


async def _create_place(
    client: AsyncClient,
    room_id: str,
    token: str,
    name: str = "Quán ăn",
    open_minute: int | None = 480,
    close_minute: int | None = 1320,
    latitude: float | None = 10.7769,
    longitude: float | None = 106.7009,
    estimated_cost: int = 50000,
) -> dict[str, Any]:
    """Helper thêm địa điểm vào phòng."""
    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        headers={"X-Member-Token": token},
        json={
            "name": name,
            "address": "Địa chỉ test",
            "open_minute": open_minute,
            "close_minute": close_minute,
            "latitude": latitude,
            "longitude": longitude,
            "estimated_cost": estimated_cost,
        },
    )
    assert response.status_code == 201
    return response.json()


async def _add_schedule(
    client: AsyncClient,
    room_id: str,
    token: str,
    place_id: str,
    start_minute: int,
    end_minute: int,
    day_offset: int = 0,
) -> dict[str, Any]:
    """Helper thêm mục lịch trình."""
    response = await client.post(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
        json={
            "place_id": place_id,
            "day_offset": day_offset,
            "start_minute": start_minute,
            "end_minute": end_minute,
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_get_conflicts_empty(client: AsyncClient) -> None:
    """Khi phòng chưa có xung đột, GET /conflicts trả về mảng rỗng."""
    room_data = await _create_room(client, "HostEmpty")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.get(
        f"/api/v1/rooms/{room_id}/conflicts",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_evaluate_conflicts_time_overlap_critical(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Tiêu chí chính T-12: Khi xếp lịch 2 quán đè giờ nhau (09:00-10:00 và 09:30-10:30), API trả về TIME_OVERLAP mức CRITICAL."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostTime")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Cà Phê Trứng 3T")
    p2 = await _create_place(client, room_id, token, "Cơm Tấm Ba Ghiền")

    # Mục 1: 09:00 - 10:00 (540 - 600)
    s1 = await _add_schedule(client, room_id, token, p1["id"], 540, 600)
    # Mục 2: 09:30 - 10:30 (570 - 630)
    s2 = await _add_schedule(client, room_id, token, p2["id"], 570, 630)

    # Kích hoạt đánh giá thủ công POST /api/v1/rooms/{room_id}/conflicts/evaluate
    response = await client.post(
        f"/api/v1/rooms/{room_id}/conflicts/evaluate",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    conflicts = response.json()
    assert len(conflicts) >= 1

    overlap_conflict = next((c for c in conflicts if c["rule_code"] == "TIME_OVERLAP"), None)
    assert overlap_conflict is not None
    assert overlap_conflict["level"] == ConflictLevel.CRITICAL.value
    assert overlap_conflict["entity_type"] == "SCHEDULE"
    assert s1["id"] in [str(eid) for eid in overlap_conflict["entity_ids"]]
    assert s2["id"] in [str(eid) for eid in overlap_conflict["entity_ids"]]
    assert "Trùng lặp thời gian" in overlap_conflict["message"]

    # Kiểm tra event ConflictDetectedEvent đã phát
    assert handler.count() >= 1
    last_event = handler.last_event
    assert isinstance(last_event, ConflictDetectedEvent)
    assert str(last_event.room_id) == room_id

    # Kiểm tra GET /conflicts cũng trả về kết quả đã lưu trong DB
    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/conflicts",
        headers={"X-Member-Token": token},
    )
    assert get_res.status_code == 200
    saved_conflicts = get_res.json()
    assert len(saved_conflicts) >= 1
    assert any(c["rule_code"] == "TIME_OVERLAP" for c in saved_conflicts)


@pytest.mark.asyncio
async def test_evaluate_conflicts_opening_hours_error(client: AsyncClient) -> None:
    """Xếp lịch ngoài khung giờ mở cửa của quán trả về OPENING_HOURS mức ERROR."""
    room_data = await _create_room(client, "HostHours")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    # Quán mở từ 10:00 (600) đến 22:00 (1320)
    p = await _create_place(
        client,
        room_id,
        token,
        "Quán Mở Muộn",
        open_minute=600,
        close_minute=1320,
    )

    # Xếp lịch lúc 08:00 - 09:30 (480 - 570)
    await _add_schedule(client, room_id, token, p["id"], 480, 570)

    response = await client.post(
        f"/api/v1/rooms/{room_id}/conflicts/evaluate",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    conflicts = response.json()

    hours_conflict = next((c for c in conflicts if c["rule_code"] == "OPENING_HOURS"), None)
    assert hours_conflict is not None
    assert hours_conflict["level"] == ConflictLevel.ERROR.value
    assert hours_conflict["entity_type"] == "SCHEDULE"


@pytest.mark.asyncio
async def test_evaluate_conflicts_travel_time_warning(client: AsyncClient) -> None:
    """Khoảng thời gian nghỉ giữa 2 quán xa nhau không đủ di chuyển trả về TRAVEL_TIME mức WARNING."""
    room_data = await _create_room(client, "HostTravel")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    # Điểm 1: Quận 1 (10.7769, 106.7009)
    p1 = await _create_place(
        client,
        room_id,
        token,
        "Quán Quận 1",
        latitude=10.7769,
        longitude=106.7009,
    )
    # Điểm 2: Thủ Đức / Làng Đại học (10.8700, 106.8030) cách ~15km (cần ~40-45 phút di chuyển)
    p2 = await _create_place(
        client,
        room_id,
        token,
        "Quán Thủ Đức",
        latitude=10.8700,
        longitude=106.8030,
    )

    # Quán 1: 08:00 - 09:00 (480 - 540)
    await _add_schedule(client, room_id, token, p1["id"], 480, 540)
    # Quán 2: 09:05 - 10:00 (545 - 600) -> Nghỉ có 5 phút trong khi cách 15km
    await _add_schedule(client, room_id, token, p2["id"], 545, 600)

    response = await client.post(
        f"/api/v1/rooms/{room_id}/conflicts/evaluate",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    conflicts = response.json()

    travel_conflict = next((c for c in conflicts if c["rule_code"] == "TRAVEL_TIME"), None)
    assert travel_conflict is not None
    assert travel_conflict["level"] == ConflictLevel.WARNING.value
    assert "Thời gian di chuyển không đủ" in travel_conflict["message"]


@pytest.mark.asyncio
async def test_evaluate_conflicts_budget_threshold_warning(client: AsyncClient) -> None:
    """Tổng chi phí địa điểm được chấp nhận vượt quá ngân sách phòng trả về BUDGET_EXCEEDED."""
    # Phòng có ngân sách 100,000 VND
    room_data = await _create_room(client, "HostBudget", budget_limit=100000)
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    # Thêm địa điểm giá 150,000 VND
    p = await _create_place(
        client,
        room_id,
        token,
        "Nhà hàng sang trọng",
        estimated_cost=150000,
    )

    # Chuyển trạng thái địa điểm sang ACCEPTED để tính ngân sách
    await client.patch(
        f"/api/v1/rooms/{room_id}/places/{p['id']}",
        headers={"X-Member-Token": token},
        json={"status": PlaceStatus.ACCEPTED.value},
    )

    response = await client.post(
        f"/api/v1/rooms/{room_id}/conflicts/evaluate",
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 200
    conflicts = response.json()

    budget_conflict = next((c for c in conflicts if c["rule_code"] == "BUDGET_THRESHOLD"), None)
    assert budget_conflict is not None
    assert budget_conflict["level"] == ConflictLevel.WARNING.value
    assert "Vượt ngân sách" in budget_conflict["message"]


@pytest.mark.asyncio
async def test_conflict_evaluation_handler_background_execution(
    client: AsyncClient,
) -> None:
    """Kiểm tra ConflictEvaluationHandler tự động đánh giá và lưu xung đột ngầm khi nhận ScheduleUpdatedEvent."""
    bus = InMemoryEventBus(raise_exceptions=True)
    # Đăng ký handler tự động với session factory của test
    register_conflict_evaluation_handlers(bus, session_factory=TestSessionLocal)
    set_event_bus(bus)

    room_data = await _create_room(client, "HostAuto")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán Sáng")
    p2 = await _create_place(client, room_id, token, "Quán Trưa")

    # Tạo 2 mục đè giờ
    await _add_schedule(client, room_id, token, p1["id"], 540, 600)
    await _add_schedule(client, room_id, token, p2["id"], 570, 630)

    # Sau khi 2 mục được tạo, ScheduleUpdatedEvent được phát -> ConflictEvaluationHandler đã chạy ngầm
    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/conflicts",
        headers={"X-Member-Token": token},
    )
    assert get_res.status_code == 200
    saved_conflicts = get_res.json()
    assert len(saved_conflicts) >= 1
    assert any(c["rule_code"] == "TIME_OVERLAP" for c in saved_conflicts)


@pytest.mark.asyncio
async def test_conflicts_auth_unauthorized(client: AsyncClient) -> None:
    """Truy cập endpoint conflicts khi thiếu token hoặc sai phòng trả về 401 UNAUTHORIZED."""
    r1 = await _create_room(client, "Host1")
    r2 = await _create_room(client, "Host2")

    # Thiếu token
    res1 = await client.get(f"/api/v1/rooms/{r1['room']['id']}/conflicts")
    assert res1.status_code == 401
    assert res1.json()["error"]["code"] == "UNAUTHORIZED"

    # Token phòng khác
    res2 = await client.get(
        f"/api/v1/rooms/{r1['room']['id']}/conflicts",
        headers={"X-Member-Token": r2["member_token"]},
    )
    assert res2.status_code == 401
    assert res2.json()["error"]["code"] == "UNAUTHORIZED"
