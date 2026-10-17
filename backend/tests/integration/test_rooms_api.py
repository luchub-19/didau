from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.enums import MemberRole, RoomStatus
from app.domain.models import Room
from app.domain.patterns.event_bus import (
    InMemoryEventBus,
    MemberJoinedEvent,
    RecordingEventHandler,
    RoomUpdatedEvent,
)
from app.main import app

settings = get_settings()

# Cấu hình engine và session riêng cho test
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

# Đảm bảo router và exception handlers được gắn vào app
if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Cung cấp database session cho test, dọn dẹp các bản ghi liên quan sau test."""
    async with TestSessionLocal() as session:
        yield session
        # Clean up rooms created during tests
        await session.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Cung cấp AsyncClient với dependency override trỏ vào test session."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def test_event_bus() -> InMemoryEventBus:
    """Cung cấp InMemoryEventBus độc lập cho từng test case."""
    bus = InMemoryEventBus()
    set_event_bus(bus)
    return bus


# ============================================================================
# 1. TEST POST /api/v1/rooms (TẠO PHÒNG MỚI)
# ============================================================================


@pytest.mark.asyncio
async def test_create_room_success(client: AsyncClient, db_session: AsyncSession) -> None:
    """Tạo phòng mới thành công trả về 201 Created và dữ liệu chuẩn CONTRACTS.md."""
    payload = {
        "title": "Cuối tuần ăn sập Sài Gòn",
        "description": "Lên kèo ăn uống từ sáng tới đêm thứ 7",
        "event_date": "2026-10-24",
        "creator_nickname": "HoangNam",
        "creator_avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
        "budget_limit": 500000,
        "tie_break_strategy": "EARLIEST_SUBMISSION",
    }

    response = await client.post("/api/v1/rooms", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert "room" in data
    assert "creator_member" in data
    assert "member_token" in data

    room_data = data["room"]
    assert room_data["title"] == payload["title"]
    assert room_data["description"] == payload["description"]
    assert room_data["event_date"] == payload["event_date"]
    assert room_data["status"] == RoomStatus.PLANNING.value
    assert room_data["tie_break_strategy"] == "EARLIEST_SUBMISSION"
    assert room_data["budget_limit"] == 500000
    assert len(room_data["code"]) == 6
    assert "id" in room_data
    assert "created_at" in room_data
    assert "updated_at" in room_data

    member_data = data["creator_member"]
    assert member_data["nickname"] == "HoangNam"
    assert member_data["role"] == MemberRole.HOST.value
    assert member_data["is_active"] is True
    assert member_data["room_id"] == room_data["id"]

    assert isinstance(data["member_token"], str)
    assert len(data["member_token"]) > 20

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == room_data["id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_room_validation_error_missing_fields(client: AsyncClient) -> None:
    """Tạo phòng thiếu các trường bắt buộc trả về lỗi 422 chuẩn ApiErrorEnvelope."""
    # Thiếu title và creator_nickname
    response = await client.post("/api/v1/rooms", json={"event_date": "2026-10-24"})
    assert response.status_code == 422
    err = response.json()
    assert "error" in err
    assert err["error"]["code"] == "VALIDATION_ERROR"
    assert "message" in err["error"]


@pytest.mark.asyncio
async def test_create_room_empty_title_or_nickname(client: AsyncClient) -> None:
    """Tạo phòng với title hoặc nickname chỉ chứa khoảng trắng."""
    payload = {
        "title": "   ",
        "creator_nickname": "HoangNam",
        "event_date": "2026-10-24",
    }
    response = await client.post("/api/v1/rooms", json=payload)
    assert response.status_code == 422
    err = response.json()
    assert "error" in err
    assert err["error"]["code"] == "VALIDATION_ERROR"


# ============================================================================
# 2. TEST POST /api/v1/rooms/join (THAM GIA PHÒNG)
# ============================================================================


@pytest.mark.asyncio
async def test_join_room_success_and_publish_event(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Tham gia phòng thành công, trả về 200 OK và phát sự kiện MemberJoinedEvent."""
    # 1. Đăng ký subscriber lắng nghe MemberJoinedEvent
    recording_handler = RecordingEventHandler()
    test_event_bus.register(MemberJoinedEvent, recording_handler)

    # 2. Tạo phòng trước
    create_res = await client.post(
        "/api/v1/rooms",
        json={
            "title": "Kèo đi Đà Lạt",
            "event_date": "2026-11-01",
            "creator_nickname": "ChuPhong",
        },
    )
    assert create_res.status_code == 201
    room_code = create_res.json()["room"]["code"]
    room_id = create_res.json()["room"]["id"]

    # 3. Tham gia phòng với mã thường (kiểm tra tính case-insensitive)
    join_payload = {
        "room_code": room_code.lower(),
        "nickname": "ThuTrang",
        "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang",
    }
    join_res = await client.post("/api/v1/rooms/join", json=join_payload)
    assert join_res.status_code == 200

    join_data = join_res.json()
    assert "room" in join_data
    assert "member" in join_data
    assert "member_token" in join_data

    assert join_data["room"]["code"] == room_code.upper()
    assert join_data["member"]["nickname"] == "ThuTrang"
    assert join_data["member"]["role"] == MemberRole.MEMBER.value
    assert join_data["member"]["is_active"] is True
    assert join_data["member"]["avatar_url"] == join_payload["avatar_url"]

    # 4. Kiểm tra sự kiện đã được phát qua EventBus
    assert recording_handler.count() == 1
    published_event = recording_handler.last_event
    assert published_event is not None
    assert str(published_event.room_id) == room_id
    assert published_event.nickname == "ThuTrang"
    assert published_event.event_type == "MEMBER_JOINED"

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == room_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_join_room_not_found(client: AsyncClient) -> None:
    """Tham gia phòng với mã không tồn tại trả về 404 ROOM_NOT_FOUND chuẩn."""
    response = await client.post(
        "/api/v1/rooms/join",
        json={"room_code": "NONEX9", "nickname": "NguoiLa"},
    )
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "ROOM_NOT_FOUND"


@pytest.mark.asyncio
async def test_join_room_nickname_taken(client: AsyncClient, db_session: AsyncSession) -> None:
    """Tham gia phòng với nickname đã tồn tại trong cùng phòng trả về 409 NICKNAME_TAKEN."""
    # 1. Tạo phòng với host "ThanhHost"
    create_res = await client.post(
        "/api/v1/rooms",
        json={
            "title": "Phòng thử nghiệm trùng tên",
            "event_date": "2026-11-05",
            "creator_nickname": "ThanhHost",
        },
    )
    room_code = create_res.json()["room"]["code"]
    room_id = create_res.json()["room"]["id"]

    # 2. Join với nickname trùng tên host "ThanhHost"
    dup_host_res = await client.post(
        "/api/v1/rooms/join",
        json={"room_code": room_code, "nickname": "ThanhHost"},
    )
    assert dup_host_res.status_code == 409
    assert dup_host_res.json()["error"]["code"] == "NICKNAME_TAKEN"

    # 3. Join thành công thành viên thứ 2 "ThanhMember"
    ok_res = await client.post(
        "/api/v1/rooms/join",
        json={"room_code": room_code, "nickname": "ThanhMember"},
    )
    assert ok_res.status_code == 200

    # 4. Người thứ 3 cố tình đặt tên "ThanhMember" -> 409
    dup_member_res = await client.post(
        "/api/v1/rooms/join",
        json={"room_code": room_code, "nickname": "ThanhMember"},
    )
    assert dup_member_res.status_code == 409
    assert dup_member_res.json()["error"]["code"] == "NICKNAME_TAKEN"

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == room_id))
    await db_session.commit()


# ============================================================================
# 3. TEST GET /api/v1/rooms/{room_id} (LẤY CHI TIẾT PHÒNG & AUTH)
# ============================================================================


@pytest.mark.asyncio
async def test_get_room_details_success(client: AsyncClient, db_session: AsyncSession) -> None:
    """Lấy chi tiết phòng với X-Member-Token hợp lệ trả về 200 OK và danh sách thành viên."""
    # 1. Tạo phòng
    create_res = await client.post(
        "/api/v1/rooms",
        json={
            "title": "Chi tiết phòng ăn uống",
            "description": "Thử nghiệm lấy chi tiết phòng",
            "event_date": "2026-10-30",
            "creator_nickname": "HostChiTiet",
            "budget_limit": 300000,
        },
    )
    room_id = create_res.json()["room"]["id"]
    host_token = create_res.json()["member_token"]
    room_code = create_res.json()["room"]["code"]

    # 2. Thành viên thứ 2 join phòng
    join_res = await client.post(
        "/api/v1/rooms/join",
        json={"room_code": room_code, "nickname": "MemberChiTiet"},
    )
    member_token = join_res.json()["member_token"]

    # 3. Gọi GET /api/v1/rooms/{room_id} bằng host_token
    res_host = await client.get(
        f"/api/v1/rooms/{room_id}",
        headers={"X-Member-Token": host_token},
    )
    assert res_host.status_code == 200
    detail = res_host.json()
    assert detail["id"] == room_id
    assert detail["title"] == "Chi tiết phòng ăn uống"
    assert detail["budget_limit"] == 300000
    assert detail["total_places"] == 0
    assert len(detail["members"]) == 2

    # Kiểm tra cấu trúc thành viên trong danh sách
    nicknames = [m["nickname"] for m in detail["members"]]
    assert "HostChiTiet" in nicknames
    assert "MemberChiTiet" in nicknames

    # 4. Gọi GET /api/v1/rooms/{room_id} bằng member_token cũng thành công
    res_member = await client.get(
        f"/api/v1/rooms/{room_id}",
        headers={"X-Member-Token": member_token},
    )
    assert res_member.status_code == 200

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == room_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_room_unauthorized_missing_token(client: AsyncClient) -> None:
    """Truy cập GET /api/v1/rooms/{room_id} không truyền header X-Member-Token trả về 401 UNAUTHORIZED."""
    fake_room_id = str(uuid4())
    response = await client.get(f"/api/v1/rooms/{fake_room_id}")
    assert response.status_code == 401
    err = response.json()
    assert err["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_get_room_unauthorized_invalid_token(client: AsyncClient) -> None:
    """Truy cập GET /api/v1/rooms/{room_id} với token không tồn tại trả về 401 UNAUTHORIZED."""
    fake_room_id = str(uuid4())
    response = await client.get(
        f"/api/v1/rooms/{fake_room_id}",
        headers={"X-Member-Token": "non-existent-token-abc"},
    )
    assert response.status_code == 401
    err = response.json()
    assert err["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_get_room_forbidden_other_room_member(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Thành viên phòng A cố tình truy vấn phòng B bị từ chối với 401 UNAUTHORIZED."""
    # Tạo phòng A
    res_a = await client.post(
        "/api/v1/rooms",
        json={"title": "Phòng A", "event_date": "2026-10-25", "creator_nickname": "HostA"},
    )
    room_a_id = res_a.json()["room"]["id"]
    token_a = res_a.json()["member_token"]

    # Tạo phòng B
    res_b = await client.post(
        "/api/v1/rooms",
        json={"title": "Phòng B", "event_date": "2026-10-25", "creator_nickname": "HostB"},
    )
    room_b_id = res_b.json()["room"]["id"]

    # Dùng token của phòng A truy cập phòng B
    response = await client.get(
        f"/api/v1/rooms/{room_b_id}",
        headers={"X-Member-Token": token_a},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id.in_([room_a_id, room_b_id])))
    await db_session.commit()


@pytest.mark.asyncio
async def test_get_current_member_me_endpoint(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Endpoint GET /api/v1/members/me trả về thông tin thành viên của token."""
    res = await client.post(
        "/api/v1/rooms",
        json={"title": "Phòng test me", "event_date": "2026-11-10", "creator_nickname": "UserMe"},
    )
    token = res.json()["member_token"]
    room_id = res.json()["room"]["id"]

    me_res = await client.get("/api/v1/members/me", headers={"X-Member-Token": token})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["nickname"] == "UserMe"
    assert me_data["role"] == MemberRole.HOST.value
    assert me_data["is_active"] is True

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == room_id))
    await db_session.commit()


@pytest.mark.asyncio
async def test_create_room_rate_limit_exceeded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Tạo phòng quá 5 lần/phút/IP nhận lỗi HTTP 429 RATE_LIMIT_EXCEEDED."""
    headers = {"X-Forwarded-For": "198.51.100.99"}
    payload = {
        "title": "Phòng Test Rate Limit",
        "event_date": "2026-11-20",
        "creator_nickname": "Spammer",
    }
    # 5 lần đầu thành công (201)
    created_ids = []
    for _ in range(5):
        res = await client.post("/api/v1/rooms", json=payload, headers=headers)
        assert res.status_code == 201
        created_ids.append(res.json()["room"]["id"])

    # Lần thứ 6 bị chặn với 429
    res6 = await client.post("/api/v1/rooms", json=payload, headers=headers)
    assert res6.status_code == 429
    data = res6.json()
    assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"

    # Dọn dẹp
    from uuid import UUID
    await db_session.execute(delete(Room).where(Room.id.in_([UUID(rid) for rid in created_ids])))
    await db_session.commit()


# ============================================================================
# PATCH /api/v1/rooms/{room_id} (CR-03)
# ============================================================================


@pytest.mark.asyncio
async def test_update_room_host_sets_origin_and_broadcasts(
    client: AsyncClient, test_event_bus: InMemoryEventBus
) -> None:
    """Host đổi điểm hẹn/khung giờ: 200, lưu DB, GET trả đúng và phát ROOM_UPDATED."""
    created = (
        await client.post(
            "/api/v1/rooms",
            json={"title": "Kèo", "event_date": "2026-10-25", "creator_nickname": "Host"},
        )
    ).json()
    room_id = created["room"]["id"]
    headers = {"X-Member-Token": created["member_token"]}
    recorder = RecordingEventHandler()
    test_event_bus.register(RoomUpdatedEvent, recorder)

    response = await client.patch(
        f"/api/v1/rooms/{room_id}",
        json={"origin_lat": 10.7769, "origin_lng": 106.7009, "city": "HN", "start_minute": 600},
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["origin_lat"] == 10.7769
    assert body["city"] == "HN"
    assert body["start_minute"] == 600
    assert body["end_minute"] == 1380

    detail = (await client.get(f"/api/v1/rooms/{room_id}", headers=headers)).json()
    assert detail["origin_lng"] == 106.7009
    assert detail["city"] == "HN"
    assert detail["start_minute"] == 600

    assert recorder.count() == 1
    assert recorder.last_event.to_envelope()["type"] == "ROOM_UPDATED"
    assert recorder.last_event.to_envelope()["payload"]["room"]["id"] == room_id


@pytest.mark.asyncio
async def test_update_room_member_forbidden_and_invalid_window(client: AsyncClient) -> None:
    """Member gọi PATCH nhận 403; start >= end nhận 422."""
    created = (
        await client.post(
            "/api/v1/rooms",
            json={"title": "Kèo", "event_date": "2026-10-25", "creator_nickname": "Host"},
        )
    ).json()
    room_id = created["room"]["id"]
    joined = (
        await client.post(
            "/api/v1/rooms/join",
            json={"room_code": created["room"]["code"], "nickname": "Khach"},
        )
    ).json()

    forbidden = await client.patch(
        f"/api/v1/rooms/{room_id}",
        json={"title": "Đổi tên"},
        headers={"X-Member-Token": joined["member_token"]},
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["error"]["code"] == "FORBIDDEN_HOST_ONLY"

    invalid = await client.patch(
        f"/api/v1/rooms/{room_id}",
        json={"start_minute": 1300, "end_minute": 1200},
        headers={"X-Member-Token": created["member_token"]},
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
