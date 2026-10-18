from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.core.seed import (
    HOST_MEMBER_ID,
    MEMBER_2_ID,
    MEMBER_3_ID,
    PLACE_1_ID,
    PLACE_2_ID,
    PLACE_3_ID,
    PLACE_4_ID,
    PLACE_5_ID,
    ROOM_ID,
    SCHEDULE_1_ID,
)
from app.domain.enums import (
    MemberRole,
    PlaceCategory,
    PlaceStatus,
    RoomStatus,
    TieBreakStrategyName,
)
from app.domain.models import Member, Place, Room, ScheduleItem, Vote
from app.domain.patterns.event_bus import (
    ConflictDetectedEvent,
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
def recording_bus() -> tuple[InMemoryEventBus, RecordingEventHandler, RecordingEventHandler]:
    """Cung cấp InMemoryEventBus cùng RecordingEventHandler cho Schedule và Conflict."""
    bus = InMemoryEventBus()
    sched_handler = RecordingEventHandler()
    conflict_handler = RecordingEventHandler()
    bus.register(ScheduleUpdatedEvent, sched_handler)
    bus.register(ConflictDetectedEvent, conflict_handler)
    set_event_bus(bus)
    return bus, sched_handler, conflict_handler


async def _create_room(
    client: AsyncClient,
    nickname: str = "HostAutoPlan",
    title: str = "Kế hoạch tự lên lịch",
) -> dict[str, Any]:
    """Helper tạo phòng nhanh và trả về thông tin response."""
    response = await client.post(
        "/api/v1/rooms",
        json={
            "title": title,
            "event_date": "2026-10-24",
            "creator_nickname": nickname,
        },
    )
    assert response.status_code == 201
    return response.json()


async def _join_room(
    client: AsyncClient,
    room_code: str,
    nickname: str = "MemberAutoPlan",
) -> dict[str, Any]:
    """Helper tham gia phòng nhanh cho thành viên."""
    response = await client.post(
        "/api/v1/rooms/join",
        json={
            "room_code": room_code,
            "nickname": nickname,
        },
    )
    assert response.status_code == 200
    return response.json()


async def _create_place(
    client: AsyncClient,
    room_id: str,
    token: str,
    name: str = "Quán Phở",
    category: str = "FOOD",
    lat: float = 10.7769,
    lng: float = 106.7058,
    open_minute: int = 420,
    close_minute: int = 1380,
    cost: int = 60000,
) -> dict[str, Any]:
    """Helper thêm địa điểm vào phòng."""
    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        headers={"X-Member-Token": token},
        json={
            "name": name,
            "address": "123 Nguyễn Huệ, Q1",
            "latitude": lat,
            "longitude": lng,
            "category": category,
            "open_minute": open_minute,
            "close_minute": close_minute,
            "estimated_cost": cost,
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_autoplan_preview_does_not_persist_to_db(client: AsyncClient) -> None:
    """Xem trước Auto-plan trả về lịch trình nhưng không ghi bất kỳ mục nào vào database."""
    room_data = await _create_room(client, "HostPreview")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    await _create_place(client, room_id, token, "Cơm sườn", "FOOD", 10.77, 106.70)
    await _create_place(client, room_id, token, "Trà sữa", "DRINK", 10.78, 106.71)

    # 1. Kiểm tra ban đầu: lịch trình rỗng
    init_res = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
    )
    assert init_res.status_code == 200
    assert len(init_res.json()) == 0

    # 2. Gọi preview Auto-plan
    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={"day_offset": 0},
    )
    assert preview_res.status_code == 200
    data = preview_res.json()
    assert "slots" in data
    assert "dropped" in data
    assert "plan_hash" in data
    assert len(data["slots"]) >= 1
    assert data["total_travel_min"] >= 0
    assert data["total_cost"] > 0

    # 3. Kiểm tra lại sau preview: database vẫn không có lịch trình nào được lưu
    after_res = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": token},
    )
    assert after_res.status_code == 200
    assert len(after_res.json()) == 0


@pytest.mark.asyncio
async def test_autoplan_preview_fallback_when_no_accepted_places(client: AsyncClient) -> None:
    """Khi phòng chưa có quán ACCEPTED, dùng fallback=True chọn quán top-score mỗi category."""
    room_data = await _create_room(client, "HostFallback")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán Cơm", "FOOD")
    p2 = await _create_place(client, room_id, token, "Quán Cafe", "DRINK")

    # Vote cho quán cơm +1
    await client.post(
        f"/api/v1/rooms/{room_id}/places/{p1['id']}/votes",
        headers={"X-Member-Token": token},
        json={"value": 1},
    )

    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={},
    )
    assert preview_res.status_code == 200
    data = preview_res.json()
    assert data["used_fallback"] is True
    slot_place_ids = [s["place_id"] for s in data["slots"]]
    assert p1["id"] in slot_place_ids
    assert p2["id"] in slot_place_ids


@pytest.mark.asyncio
async def test_autoplan_preview_uses_accepted_places_without_fallback(client: AsyncClient) -> None:
    """Khi có quán ACCEPTED, chỉ lấy quán ACCEPTED và used_fallback=False."""
    room_data = await _create_room(client, "HostAccepted")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Quán Cơm", "FOOD")
    await _create_place(client, room_id, token, "Quán Cafe", "DRINK")

    # Host duyệt quán p1 thành ACCEPTED bằng tie-break
    await client.post(
        f"/api/v1/rooms/{room_id}/voting/resolve",
        headers={"X-Member-Token": token},
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
    )

    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={},
    )
    assert preview_res.status_code == 200
    data = preview_res.json()
    assert data["used_fallback"] is False
    assert len(data["slots"]) == 1
    assert data["slots"][0]["place_id"] == p1["id"]


@pytest.mark.asyncio
async def test_autoplan_preview_duration_overrides(client: AsyncClient) -> None:
    """Xem trước với duration_overrides tùy chỉnh thời lượng của từng quán."""
    room_data = await _create_room(client, "HostOverrides")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    p1 = await _create_place(client, room_id, token, "Ăn trưa lâu", "FOOD")
    override_min = 115

    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={"duration_overrides": {p1["id"]: override_min}},
    )
    assert preview_res.status_code == 200
    data = preview_res.json()
    slot = next(s for s in data["slots"] if s["place_id"] == p1["id"])
    assert slot["end_minute"] - slot["start_minute"] == override_min


@pytest.mark.asyncio
async def test_autoplan_apply_forbidden_for_non_host(client: AsyncClient) -> None:
    """Thành viên bình thường (không phải HOST) gọi apply sẽ bị từ chối 403 FORBIDDEN_HOST_ONLY."""
    room_data = await _create_room(client, "HostAdmin")
    room_id = room_data["room"]["id"]
    room_code = room_data["room"]["code"]
    host_token = room_data["member_token"]

    # Thành viên tham gia
    member_data = await _join_room(client, room_code, "NormalMember")
    member_token = member_data["member_token"]

    await _create_place(client, room_id, host_token, "Quán Lẩu", "FOOD")

    # Member có thể preview
    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": member_token},
        json={},
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()

    # Nhưng Member gọi apply bị 403
    apply_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan/apply",
        headers={"X-Member-Token": member_token},
        json={
            "plan_hash": preview_data["plan_hash"],
            "slots": preview_data["slots"],
        },
    )
    assert apply_res.status_code == 403
    assert apply_res.json()["error"]["code"] == "FORBIDDEN_HOST_ONLY"


@pytest.mark.asyncio
async def test_autoplan_apply_stale_plan_hash_returns_409(client: AsyncClient) -> None:
    """Nếu plan_hash không khớp hoặc dữ liệu phòng đã thay đổi, trả về 409 STALE_PLAN."""
    room_data = await _create_room(client, "HostStale")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    await _create_place(client, room_id, token, "Quán 1", "FOOD")
    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={},
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()

    # 1. Thử gửi plan_hash sai lệch
    fake_hash_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan/apply",
        headers={"X-Member-Token": token},
        json={
            "plan_hash": "wrong_invalid_hash_123",
            "slots": preview_data["slots"],
        },
    )
    assert fake_hash_res.status_code == 409
    assert fake_hash_res.json()["error"]["code"] == "STALE_PLAN"

    # 2. Dữ liệu phòng thay đổi sau khi preview (thêm 1 quán mới)
    await _create_place(client, room_id, token, "Quán 2 mới thêm", "DRINK")

    # Áp dụng plan_hash cũ đã lưu trước khi thêm quán
    stale_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan/apply",
        headers={"X-Member-Token": token},
        json={
            "plan_hash": preview_data["plan_hash"],
            "slots": preview_data["slots"],
        },
    )
    assert stale_res.status_code == 409
    assert stale_res.json()["error"]["code"] == "STALE_PLAN"


async def _seed_test_data(session: AsyncSession) -> None:
    """Nạp dữ liệu mẫu DIDAU8 độc lập vào session của test."""
    await session.execute(delete(Room).where((Room.id == ROOM_ID) | (Room.code == "DIDAU8")))
    await session.flush()

    room = Room(
        id=ROOM_ID,
        code="DIDAU8",
        title="Cuối tuần ăn sập Sài Gòn",
        description="Lên kèo ăn uống từ sáng tới đêm thứ 7 cùng nhóm bạn thân",
        event_date=date(2026, 10, 24),
        status=RoomStatus.PLANNING.value,
        tie_break_strategy=TieBreakStrategyName.EARLIEST_SUBMISSION.value,
        budget_limit=500000,
        start_minute=1020,
        end_minute=1380,
    )
    session.add(room)
    await session.flush()

    host = Member(
        id=HOST_MEMBER_ID,
        room_id=ROOM_ID,
        nickname="HoangNam",
        avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
        role=MemberRole.HOST.value,
        token="a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
        is_active=True,
    )
    member2 = Member(
        id=MEMBER_2_ID,
        room_id=ROOM_ID,
        nickname="ThuTrang",
        avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang",
        role=MemberRole.MEMBER.value,
        token="b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
        is_active=True,
    )
    member3 = Member(
        id=MEMBER_3_ID,
        room_id=ROOM_ID,
        nickname="MinhKhoa",
        avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=MinhKhoa",
        role=MemberRole.MEMBER.value,
        token="c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
        is_active=True,
    )
    session.add_all([host, member2, member3])
    await session.flush()

    place1 = Place(
        id=PLACE_1_ID,
        room_id=ROOM_ID,
        submitted_by_id=HOST_MEMBER_ID,
        name="Cà Phê Trứng 3T",
        address="1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM",
        latitude=10.7769,
        longitude=106.7058,
        category=PlaceCategory.DRINK.value,
        status=PlaceStatus.VOTING.value,
        url="https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
        notes="View ngắm bến Bạch Đằng và sông Sài Gòn cực đẹp",
        estimated_cost=55000,
        open_minute=420,
        close_minute=1380,
    )
    place2 = Place(
        id=PLACE_2_ID,
        room_id=ROOM_ID,
        submitted_by_id=MEMBER_2_ID,
        name="Cơm Tấm Ba Ghiền",
        address="84 Đặng Văn Ngữ, P.10, Q.Phú Nhuận, TP.HCM",
        latitude=10.7932,
        longitude=106.6743,
        category=PlaceCategory.FOOD.value,
        status=PlaceStatus.VOTING.value,
        url="https://shopeefood.vn/ho-chi-minh/com-tam-ba-ghien",
        notes="Sườn nướng siêu to khổng lồ đậm vị truyền thống",
        estimated_cost=95000,
        open_minute=450,
        close_minute=1260,
    )
    place3 = Place(
        id=PLACE_3_ID,
        room_id=ROOM_ID,
        submitted_by_id=HOST_MEMBER_ID,
        name="CGV Vincom Center Đồng Khởi",
        address="72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM",
        latitude=10.7781,
        longitude=106.7018,
        category=PlaceCategory.ENTERTAINMENT.value,
        status=PlaceStatus.VOTING.value,
        url="https://www.cgv.vn",
        notes="Xem phim bom tấn cuối tuần phòng chiếu IMAX",
        estimated_cost=150000,
        open_minute=480,
        close_minute=1410,
    )
    place4 = Place(
        id=PLACE_4_ID,
        room_id=ROOM_ID,
        submitted_by_id=MEMBER_3_ID,
        name="Lẩu Dê 404",
        address="436 Nguyễn Thị Thập, Tân Quy, Quận 7, TP.HCM",
        latitude=10.7412,
        longitude=106.7088,
        category=PlaceCategory.FOOD.value,
        status=PlaceStatus.PROPOSED.value,
        url="https://shopeefood.vn/ho-chi-minh/lau-de-404",
        notes="Lẩu dê thơm ngon, nước dùng đậm đà phù hợp ăn tối",
        estimated_cost=180000,
        open_minute=600,
        close_minute=1320,
    )
    place5 = Place(
        id=PLACE_5_ID,
        room_id=ROOM_ID,
        submitted_by_id=MEMBER_2_ID,
        name="Trà Sữa Phê La",
        address="125 Hồ Tùng Mậu, Bến Nghé, Quận 1, TP.HCM",
        latitude=10.7725,
        longitude=106.7032,
        category=PlaceCategory.DRINK.value,
        status=PlaceStatus.PROPOSED.value,
        url="https://phela.vn",
        notes="Ô long sữa chảo đặc sản nốt hương đậm đà",
        estimated_cost=60000,
        open_minute=480,
        close_minute=1380,
    )
    session.add_all([place1, place2, place3, place4, place5])
    await session.flush()

    votes = [
        Vote(place_id=PLACE_1_ID, member_id=HOST_MEMBER_ID, vote_value=1),
        Vote(place_id=PLACE_2_ID, member_id=HOST_MEMBER_ID, vote_value=1),
        Vote(place_id=PLACE_1_ID, member_id=MEMBER_2_ID, vote_value=1),
        Vote(place_id=PLACE_3_ID, member_id=MEMBER_2_ID, vote_value=1),
        Vote(place_id=PLACE_2_ID, member_id=MEMBER_3_ID, vote_value=1),
        Vote(place_id=PLACE_3_ID, member_id=MEMBER_3_ID, vote_value=1),
    ]
    session.add_all(votes)
    await session.flush()

    schedule1 = ScheduleItem(
        id=SCHEDULE_1_ID,
        room_id=ROOM_ID,
        place_id=PLACE_1_ID,
        day_offset=0,
        start_minute=540,
        end_minute=630,
        order_index=0,
        note="Uống cà phê sáng và ngắm tàu thuyền trên sông Sài Gòn",
    )
    session.add(schedule1)
    await session.flush()


@pytest.mark.asyncio
async def test_autoplan_apply_seed_data_conflict_free(
    client: AsyncClient,
    db_session: AsyncSession,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler, RecordingEventHandler],
) -> None:
    """Kiểm thử toàn diện với seed data: preview -> apply -> 0 xung đột và phát đầy đủ sự kiện."""
    # Nạp dữ liệu seed chuẩn vào db_session của bài test
    await _seed_test_data(db_session)

    _bus, sched_handler, conflict_handler = recording_bus
    room_id = str(ROOM_ID)
    host_token = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d"

    # 1. Xem trước lịch trình trên phòng DIDAU8
    preview_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": host_token},
        json={"day_offset": 0},
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert len(preview_data["slots"]) >= 1
    assert preview_data["plan_hash"]

    # 2. Host áp dụng lịch trình
    apply_res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan/apply",
        headers={"X-Member-Token": host_token},
        json={
            "plan_hash": preview_data["plan_hash"],
            "slots": preview_data["slots"],
        },
    )
    assert apply_res.status_code == 200
    applied_items = apply_res.json()
    assert len(applied_items) == len(preview_data["slots"])

    # 3. Lịch trình trong database đã được thay thế chính xác
    get_sched_res = await client.get(
        f"/api/v1/rooms/{room_id}/schedule",
        headers={"X-Member-Token": host_token},
    )
    assert get_sched_res.status_code == 200
    db_items = get_sched_res.json()
    assert len(db_items) == len(preview_data["slots"])

    # 4. Kiểm tra xung đột: Lịch trình tạo tự động hoàn toàn KHÔNG CÓ XUNG ĐỘT (conflict rỗng)
    conflicts_res = await client.get(
        f"/api/v1/rooms/{room_id}/conflicts",
        headers={"X-Member-Token": host_token},
    )
    assert conflicts_res.status_code == 200
    conflicts_data = conflicts_res.json()
    assert conflicts_data == []

    # 5. Kiểm tra phát tán sự kiện: cả ScheduleUpdatedEvent và ConflictDetectedEvent đều được kích hoạt
    assert sched_handler.count() >= 1
    assert conflict_handler.count() >= 1


@pytest.mark.asyncio
async def test_autoplan_auth_and_cross_room_forbidden(client: AsyncClient) -> None:
    """Kiểm tra xác thực thiếu token và truy cập chéo phòng."""
    room_data1 = await _create_room(client, "HostR1", "Phòng 1")
    room_data2 = await _create_room(client, "HostR2", "Phòng 2")

    r1_id = room_data1["room"]["id"]
    r2_token = room_data2["member_token"]

    # 1. Không có token -> 401
    no_token_res = await client.post(f"/api/v1/rooms/{r1_id}/schedule/auto-plan", json={})
    assert no_token_res.status_code == 401
    assert no_token_res.json()["error"]["code"] == "UNAUTHORIZED"

    # 2. Dùng token phòng 2 gọi vào phòng 1 -> 401
    cross_res = await client.post(
        f"/api/v1/rooms/{r1_id}/schedule/auto-plan",
        headers={"X-Member-Token": r2_token},
        json={},
    )
    assert cross_res.status_code == 401
    assert cross_res.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_autoplan_preview_returns_reason_codes_cr06(client: AsyncClient) -> None:
    """Kiểm tra API /schedule/auto-plan (preview) trả về reason_codes trong slots và reason_code trong dropped theo CR-06."""
    room_data = await _create_room(client, "HostAutoCR06", "Phòng Auto CR06")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    # 1. Tạo các quán (1 FOOD, 1 SHOPPING đóng cửa sớm để bị drop)
    p_food = await _create_place(
        client,
        room_id,
        token,
        "Quán Ăn Tối",
        category="FOOD",
        open_minute=1020,
        close_minute=1380,
    )
    p_drop = await _create_place(
        client,
        room_id,
        token,
        "Shop Đóng Cửa",
        category="SHOPPING",
        open_minute=480,
        close_minute=600,
    )

    # Đổi status sang ACCEPTED
    await client.patch(
        f"/api/v1/rooms/{room_id}/places/{p_food['id']}",
        headers={"X-Member-Token": token},
        json={"status": "ACCEPTED"},
    )
    await client.patch(
        f"/api/v1/rooms/{room_id}/places/{p_drop['id']}",
        headers={"X-Member-Token": token},
        json={"status": "ACCEPTED"},
    )

    # 2. Gọi auto-plan preview
    res = await client.post(
        f"/api/v1/rooms/{room_id}/schedule/auto-plan",
        headers={"X-Member-Token": token},
        json={"day_offset": 0},
    )
    assert res.status_code == 200
    data = res.json()

    # Slots phải có reason_codes
    assert len(data["slots"]) >= 1
    for s in data["slots"]:
        assert "reason_codes" in s
        assert len(s["reason_codes"]) == len(s["reasons"])
    assert any(rc["code"] == "MEAL_WINDOW" for s in data["slots"] for rc in s["reason_codes"])

    # Dropped phải có reason_code
    assert len(data["dropped"]) >= 1
    drop_item = next(d for d in data["dropped"] if d["place_id"] == p_drop["id"])
    assert drop_item["reason_code"] == "CLOSED_OR_NO_FIT"
    assert "reason_params" in drop_item

