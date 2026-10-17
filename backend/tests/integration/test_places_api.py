from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Import router và endpoint places để đảm bảo đăng ký vào app
import app.api.v1.places
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.models.vote import Vote
from app.domain.patterns.event_bus import (
    InMemoryEventBus,
    PlaceAddedEvent,
    PlaceDeletedEvent,
    PlaceStatusChangedEvent,
    RecordingEventHandler,
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

# Gắn router và handlers vào app
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
    """EventBus giả lập kèm handler ghi nhận sự kiện phục vụ kiểm thử."""
    bus = InMemoryEventBus()
    handler = RecordingEventHandler()
    bus.register(PlaceAddedEvent, handler)
    bus.register(PlaceDeletedEvent, handler)
    bus.register(PlaceStatusChangedEvent, handler)
    set_event_bus(bus)
    return bus, handler


async def _create_room(client: AsyncClient, nickname: str = "HostUser") -> dict:
    """Helper tạo phòng và trả về payload phản hồi gồm room, creator_member, member_token."""
    response = await client.post(
        "/api/v1/rooms",
        json={
            "title": "Kèo Cà Phê Cuối Tuần",
            "event_date": "2026-10-25",
            "creator_nickname": nickname,
            "creator_avatar_url": "https://avatar.example.com/host.png",
        },
    )
    assert response.status_code == 201
    return response.json()


async def _join_room(client: AsyncClient, room_code: str, nickname: str = "MemberUser") -> dict:
    """Helper tham gia phòng bằng mã chia sẻ."""
    response = await client.post(
        "/api/v1/rooms/join",
        json={
            "room_code": room_code,
            "nickname": nickname,
        },
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
async def test_create_place_success_auto_category_drink(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Thêm địa điểm với từ khóa 'Cà Phê' tự động phân loại thành DRINK và phát PlaceAddedEvent."""
    _, handler = recording_bus
    room_data = await _create_room(client, "NamHost")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]
    host_member_id = room_data["creator_member"]["id"]

    place_payload = {
        "name": "Cà Phê Trứng 3T",
        "address": "1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM",
        "latitude": 10.7769,
        "longitude": 106.7058,
        "category": "OTHER",
        "url": "https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
        "notes": "View bờ sông Sài Gòn cực đẹp",
        "estimated_cost": 55000,
        "open_minute": 420,
        "close_minute": 1380,
    }

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json=place_payload,
        headers={"X-Member-Token": token},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Cà Phê Trứng 3T"
    # Auto-detected category
    assert body["category"] == "DRINK"
    assert body["status"] == "PROPOSED"
    assert body["estimated_cost"] == 55000
    assert body["open_minute"] == 420
    assert body["close_minute"] == 1380
    assert body["upvotes"] == 0
    assert body["downvotes"] == 0
    assert body["score"] == 0
    assert body["current_user_vote"] == 0
    assert body["submitted_by"]["id"] == host_member_id
    assert body["submitted_by"]["nickname"] == "NamHost"
    assert body["submitted_by_nickname"] == "NamHost"

    # Kiểm tra PlaceAddedEvent được phát
    assert len(handler.received_events) == 1
    event = handler.received_events[0]
    assert isinstance(event, PlaceAddedEvent)
    assert event.name == "Cà Phê Trứng 3T"
    cat_val = (
        event.category.value if isinstance(event.category, PlaceCategory) else str(event.category)
    )
    assert cat_val == "DRINK"


@pytest.mark.asyncio
async def test_create_place_success_auto_category_food(
    client: AsyncClient,
) -> None:
    """Thêm địa điểm 'Phở Bò Bát Đàn' tự động phân loại thành FOOD."""
    room_data = await _create_room(client, "NamHost2")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={
            "name": "Phở Bò Gia Truyền Bát Đàn",
            "category": "OTHER",
            "estimated_cost": 60000,
        },
        headers={"X-Member-Token": token},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "FOOD"


@pytest.mark.asyncio
async def test_create_place_success_auto_category_entertainment(
    client: AsyncClient,
) -> None:
    """Thêm địa điểm 'Rạp chiếu phim CGV' tự động phân loại thành ENTERTAINMENT."""
    room_data = await _create_room(client, "NamHost3")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={
            "name": "Rạp Chiếu Phim CGV Sư Vạn Hạnh",
            "category": "OTHER",
        },
        headers={"X-Member-Token": token},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "ENTERTAINMENT"


@pytest.mark.asyncio
async def test_create_place_explicit_category_preserved(
    client: AsyncClient,
) -> None:
    """Nếu client chỉ định rõ ràng category (không phải OTHER), hệ thống tôn trọng category đó."""
    room_data = await _create_room(client, "NamHost4")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={
            "name": "The Coffee House",
            "category": "FOOD",  # Khách chọn FOOD thay vì để auto detect thành DRINK
        },
        headers={"X-Member-Token": token},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "FOOD"


@pytest.mark.asyncio
async def test_create_place_validation_empty_name(client: AsyncClient) -> None:
    """Tên địa điểm trống hoặc chỉ chứa khoảng trắng phải trả về 422 VALIDATION_ERROR."""
    room_data = await _create_room(client, "NamHost5")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "   "},
        headers={"X-Member-Token": token},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_create_place_unauthorized_missing_token(client: AsyncClient) -> None:
    """Thiếu X-Member-Token phải trả về lỗi 401 UNAUTHORIZED."""
    room_data = await _create_room(client, "NamHost6")
    room_id = room_data["room"]["id"]

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Bún Bò"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_create_place_forbidden_different_room(client: AsyncClient) -> None:
    """Thành viên của phòng A không được phép thêm địa điểm vào phòng B."""
    room_a = await _create_room(client, "HostA")
    room_b = await _create_room(client, "HostB")

    token_b = room_b["member_token"]
    room_a_id = room_a["room"]["id"]

    response = await client.post(
        f"/api/v1/rooms/{room_a_id}/places",
        json={"name": "Quán Trà Sữa"},
        headers={"X-Member-Token": token_b},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_list_places_with_votes_and_current_user_vote(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Lấy danh sách địa điểm thể hiện đúng điểm vote và lá phiếu của thành viên hiện tại."""
    room_data = await _create_room(client, "HostVote")
    room_id = room_data["room"]["id"]
    host_token = room_data["member_token"]
    host_member_id = room_data["creator_member"]["id"]
    room_code = room_data["room"]["code"]

    # Member 2 tham gia
    join_data = await _join_room(client, room_code, "MemberVote")
    member_token = join_data["member_token"]
    member_id = join_data["member"]["id"]

    # Thêm 2 địa điểm
    resp1 = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Cà phê Gió Mát", "category": "DRINK", "estimated_cost": 40000},
        headers={"X-Member-Token": host_token},
    )
    assert resp1.status_code == 201
    place1_id = resp1.json()["id"]

    resp2 = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Lẩu Dê Đồng Quê", "category": "FOOD", "estimated_cost": 250000},
        headers={"X-Member-Token": member_token},
    )
    assert resp2.status_code == 201
    place2_id = resp2.json()["id"]

    # Thêm phiếu vote vào database trực tiếp cho place 1: Host (+1), Member (+1) -> score=2, upvotes=2
    v1 = Vote(place_id=place1_id, member_id=host_member_id, vote_value=1)
    v2 = Vote(place_id=place1_id, member_id=member_id, vote_value=1)
    # Place 2: Member (-1) -> score=-1, downvotes=1
    v3 = Vote(place_id=place2_id, member_id=member_id, vote_value=-1)
    db_session.add_all([v1, v2, v3])
    await db_session.flush()

    # Member gọi GET danh sách
    response = await client.get(
        f"/api/v1/rooms/{room_id}/places",
        headers={"X-Member-Token": member_token},
    )
    assert response.status_code == 200
    places_list = response.json()
    assert len(places_list) == 2

    p1 = next(p for p in places_list if p["id"] == place1_id)
    assert p1["upvotes"] == 2
    assert p1["downvotes"] == 0
    assert p1["score"] == 2
    assert p1["current_user_vote"] == 1
    assert p1["submitted_by_nickname"] == "HostVote"

    p2 = next(p for p in places_list if p["id"] == place2_id)
    assert p2["upvotes"] == 0
    assert p2["downvotes"] == 1
    assert p2["score"] == -1
    assert p2["current_user_vote"] == -1
    assert p2["submitted_by_nickname"] == "MemberVote"


@pytest.mark.asyncio
async def test_get_place_by_id_success_and_not_found(client: AsyncClient) -> None:
    """Lấy chi tiết một địa điểm theo ID và xử lý khi ID không tồn tại."""
    room_data = await _create_room(client, "HostGet")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Trà Sữa Koi Thé", "category": "DRINK"},
        headers={"X-Member-Token": token},
    )
    place_id = create_res.json()["id"]

    # Lấy thông tin thành công
    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        headers={"X-Member-Token": token},
    )
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Trà Sữa Koi Thé"

    # Lấy ID ngẫu nhiên không tồn tại
    fake_id = str(uuid4())
    not_found_res = await client.get(
        f"/api/v1/rooms/{room_id}/places/{fake_id}",
        headers={"X-Member-Token": token},
    )
    assert not_found_res.status_code == 404
    assert not_found_res.json()["error"]["code"] == "PLACE_NOT_FOUND"


@pytest.mark.asyncio
async def test_update_place_by_submitter(client: AsyncClient) -> None:
    """Người đề xuất có quyền cập nhật thông tin địa điểm."""
    room_data = await _create_room(client, "HostPatch")
    room_id = room_data["room"]["id"]
    code = room_data["room"]["code"]

    join_data = await _join_room(client, code, "MemberSubmitter")
    member_token = join_data["member_token"]

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Cơm Tấm", "notes": "Ghi chú cũ"},
        headers={"X-Member-Token": member_token},
    )
    place_id = create_res.json()["id"]

    # Cập nhật ghi chú và chi phí
    patch_res = await client.patch(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        json={"notes": "Ghi chú đã cập nhật", "estimated_cost": 45000},
        headers={"X-Member-Token": member_token},
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["notes"] == "Ghi chú đã cập nhật"
    assert body["estimated_cost"] == 45000


@pytest.mark.asyncio
async def test_update_place_by_host_publishes_status_changed_event(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Chủ phòng (HOST) cập nhật trạng thái địa điểm thành ACCEPTED kích hoạt PlaceStatusChangedEvent."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostAdmin")
    room_id = room_data["room"]["id"]
    host_token = room_data["member_token"]
    code = room_data["room"]["code"]

    join_data = await _join_room(client, code, "MemberAuthor")
    member_token = join_data["member_token"]

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Bún Đậu A Chảnh", "category": "FOOD"},
        headers={"X-Member-Token": member_token},
    )
    place_id = create_res.json()["id"]

    # Host đổi trạng thái sang ACCEPTED
    patch_res = await client.patch(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        json={"status": "ACCEPTED"},
        headers={"X-Member-Token": host_token},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "ACCEPTED"

    # Kiểm tra sự kiện PlaceStatusChangedEvent
    status_events = [e for e in handler.received_events if isinstance(e, PlaceStatusChangedEvent)]
    assert len(status_events) == 1
    ev = status_events[0]
    st_val = ev.new_status.value if isinstance(ev.new_status, PlaceStatus) else str(ev.new_status)
    assert st_val == "ACCEPTED"


@pytest.mark.asyncio
async def test_update_place_forbidden_for_other_member(client: AsyncClient) -> None:
    """Thành viên khác (không phải submitter, không phải host) không được phép sửa địa điểm."""
    room_data = await _create_room(client, "HostPerm")
    room_id = room_data["room"]["id"]
    code = room_data["room"]["code"]

    user1 = await _join_room(client, code, "UserOne")
    user2 = await _join_room(client, code, "UserTwo")

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Ốc Đêm"},
        headers={"X-Member-Token": user1["member_token"]},
    )
    place_id = create_res.json()["id"]

    # User 2 cố gắng sửa quán do User 1 tạo
    patch_res = await client.patch(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        json={"notes": "Hacker edit"},
        headers={"X-Member-Token": user2["member_token"]},
    )
    assert patch_res.status_code == 403
    assert patch_res.json()["error"]["code"] == "FORBIDDEN_HOST_ONLY"


@pytest.mark.asyncio
async def test_delete_place_by_submitter_publishes_event(
    client: AsyncClient,
    recording_bus: tuple[InMemoryEventBus, RecordingEventHandler],
) -> None:
    """Người đề xuất xóa địa điểm thành công và phát PlaceDeletedEvent."""
    _, handler = recording_bus
    room_data = await _create_room(client, "HostDel")
    room_id = room_data["room"]["id"]
    token = room_data["member_token"]

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Ăn Cần Xóa"},
        headers={"X-Member-Token": token},
    )
    place_id = create_res.json()["id"]

    # Xóa địa điểm
    del_res = await client.delete(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        headers={"X-Member-Token": token},
    )
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # Kiểm tra PlaceDeletedEvent
    del_events = [e for e in handler.received_events if isinstance(e, PlaceDeletedEvent)]
    assert len(del_events) == 1
    assert str(del_events[0].place_id) == str(place_id)

    # Lấy lại địa điểm phải báo 404
    get_res = await client.get(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        headers={"X-Member-Token": token},
    )
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_delete_place_by_host(client: AsyncClient) -> None:
    """Chủ phòng (HOST) có quyền xóa địa điểm do thành viên khác đề xuất."""
    room_data = await _create_room(client, "HostDel2")
    room_id = room_data["room"]["id"]
    host_token = room_data["member_token"]
    code = room_data["room"]["code"]

    user1 = await _join_room(client, code, "MemberA")
    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Quán Chè Bưởi"},
        headers={"X-Member-Token": user1["member_token"]},
    )
    place_id = create_res.json()["id"]

    # Host xóa quán
    del_res = await client.delete(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        headers={"X-Member-Token": host_token},
    )
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True


@pytest.mark.asyncio
async def test_delete_place_forbidden_for_other_member(client: AsyncClient) -> None:
    """Thành viên khác không được phép xóa địa điểm không do mình đề xuất."""
    room_data = await _create_room(client, "HostDel3")
    room_id = room_data["room"]["id"]
    code = room_data["room"]["code"]

    user1 = await _join_room(client, code, "MemberCreator")
    user2 = await _join_room(client, code, "MemberOther")

    create_res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={"name": "Bánh Mì Huỳnh Hoa"},
        headers={"X-Member-Token": user1["member_token"]},
    )
    place_id = create_res.json()["id"]

    # User 2 cố gắng xóa
    del_res = await client.delete(
        f"/api/v1/rooms/{room_id}/places/{place_id}",
        headers={"X-Member-Token": user2["member_token"]},
    )
    assert del_res.status_code == 403
    assert del_res.json()["error"]["code"] == "FORBIDDEN_HOST_ONLY"


@pytest.mark.asyncio
async def test_create_place_persists_cr02_fields(client: AsyncClient) -> None:
    """CreatePlaceRequest nhận trường CR-02 (source, external_id, ...) thì phải lưu và trả lại đúng."""
    room_data = await _create_room(client, "NamHost")
    room_id = room_data["room"]["id"]
    headers = {"X-Member-Token": room_data["member_token"]}

    response = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={
            "name": "Quán X",
            "source": "OSM",
            "external_id": "osm:node/1",
            "cuisine": "vietnamese",
            "opening_hours_raw": "Mo-Su 08:00-22:00",
            "coords_source": "OSM",
        },
        headers=headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "OSM"
    assert body["external_id"] == "osm:node/1"
    assert body["cuisine"] == "vietnamese"
    assert body["opening_hours_raw"] == "Mo-Su 08:00-22:00"
    assert body["coords_source"] == "OSM"


@pytest.mark.asyncio
async def test_create_place_duplicate_external_id_returns_409(client: AsyncClient) -> None:
    """CR-03: trùng (room_id, external_id) trả 409 PLACE_ALREADY_ADDED kèm place_id đã có."""
    room_data = await _create_room(client, "NamHost")
    room_id = room_data["room"]["id"]
    headers = {"X-Member-Token": room_data["member_token"]}
    body = {"name": "Quán Y", "source": "OSM", "external_id": "osm:node/2"}

    first = await client.post(f"/api/v1/rooms/{room_id}/places", json=body, headers=headers)
    assert first.status_code == 201

    second = await client.post(f"/api/v1/rooms/{room_id}/places", json=body, headers=headers)
    assert second.status_code == 409
    error = second.json()["error"]
    assert error["code"] == "PLACE_ALREADY_ADDED"
    assert error["details"]["place_id"] == first.json()["id"]
