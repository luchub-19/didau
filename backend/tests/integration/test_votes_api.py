from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.api.v1.places
from app.api.deps import get_db, set_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.config import get_settings
from app.domain.models import Room
from app.domain.patterns.event_bus import (
    InMemoryEventBus,
    PlaceStatusChangedEvent,
    RecordingEventHandler,
    VoteCastEvent,
    VotingResolvedEvent,
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


async def _create_room_and_join(
    client: AsyncClient,
    title: str = "Phòng Vote Test",
    host_nickname: str = "HostVote",
    member_nickname: str | None = None,
) -> dict:
    """Helper: Tạo phòng, tùy chọn thêm 1 member join. Trả dict kết quả."""
    # Tạo phòng
    create_res = await client.post(
        "/api/v1/rooms",
        json={
            "title": title,
            "event_date": "2026-11-15",
            "creator_nickname": host_nickname,
            "budget_limit": 1000000,
        },
    )
    assert create_res.status_code == 201
    room_data = create_res.json()["room"]
    room_id = room_data["id"]
    room_code = room_data["code"]
    host_token = create_res.json()["member_token"]
    host_member_id = create_res.json()["creator_member"]["id"]

    result = {
        "room_id": room_id,
        "room_code": room_code,
        "host_token": host_token,
        "host_member_id": host_member_id,
    }

    if member_nickname:
        join_res = await client.post(
            "/api/v1/rooms/join",
            json={"room_code": room_code, "nickname": member_nickname},
        )
        assert join_res.status_code == 200
        result["member_token"] = join_res.json()["member_token"]
        result["member_id"] = join_res.json()["member"]["id"]

    return result


async def _add_place(
    client: AsyncClient,
    room_id: str,
    token: str,
    name: str,
    category: str = "OTHER",
    estimated_cost: int = 50000,
) -> dict:
    """Helper: Thêm địa điểm vào phòng, trả về JSON response."""
    res = await client.post(
        f"/api/v1/rooms/{room_id}/places",
        json={
            "name": name,
            "category": category,
            "estimated_cost": estimated_cost,
        },
        headers={"X-Member-Token": token},
    )
    assert res.status_code == 201
    return res.json()


# ============================================================================
# 1. TEST POST /api/v1/rooms/{room_id}/places/{place_id}/votes (BỎ PHIẾU)
# ============================================================================


@pytest.mark.asyncio
async def test_cast_upvote_success(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Bỏ phiếu Upvote (+1) thành công trả về score chính xác và phát sự kiện VoteCastEvent."""
    recording = RecordingEventHandler()
    test_event_bus.register(VoteCastEvent, recording)

    info = await _create_room_and_join(client, member_nickname="MemberVote1")
    place = await _add_place(client, info["room_id"], info["host_token"], "Phở Bát Đàn")

    # Host vote +1
    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["place_id"] == place["id"]
    assert data["upvotes"] == 1
    assert data["downvotes"] == 0
    assert data["score"] == 1
    assert data["current_user_vote"] == 1

    # Kiểm tra sự kiện VoteCastEvent đã phát
    assert recording.count() == 1
    event = recording.last_event
    assert event is not None
    assert str(event.place_id) == place["id"]
    assert event.vote_value == 1

    # Dọn dẹp
    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_downvote_success(client: AsyncClient, db_session: AsyncSession) -> None:
    """Bỏ phiếu Downvote (-1) thành công trả về điểm số chính xác."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán nhậu XYZ")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["upvotes"] == 0
    assert data["downvotes"] == 1
    assert data["score"] == -1
    assert data["current_user_vote"] == -1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_change_vote_upvote_to_downvote(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Thay đổi phiếu từ Upvote sang Downvote thành công."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Bún chả Hà Nội")

    # Vote +1 lần đầu
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Đổi sang -1
    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["upvotes"] == 0
    assert data["downvotes"] == 1
    assert data["score"] == -1
    assert data["current_user_vote"] == -1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_multiple_members_vote(client: AsyncClient, db_session: AsyncSession) -> None:
    """Nhiều thành viên bỏ phiếu, tổng điểm tính toán chính xác."""
    info = await _create_room_and_join(client, member_nickname="Voter2")
    place = await _add_place(client, info["room_id"], info["host_token"], "Cơm Tấm Ba Ghiền")

    # Host vote +1
    res1 = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res1.status_code == 200

    # Member vote -1
    res2 = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["member_token"]},
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["upvotes"] == 1
    assert data2["downvotes"] == 1
    assert data2["score"] == 0
    assert data2["current_user_vote"] == -1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_vote_place_not_found(client: AsyncClient, db_session: AsyncSession) -> None:
    """Bỏ phiếu cho địa điểm không tồn tại trả về 404 PLACE_NOT_FOUND."""
    info = await _create_room_and_join(client)
    fake_place_id = str(uuid4())

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{fake_place_id}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PLACE_NOT_FOUND"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_vote_unauthorized(client: AsyncClient, db_session: AsyncSession) -> None:
    """Bỏ phiếu không truyền token trả về 401 UNAUTHORIZED."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán test auth")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


# ============================================================================
# 2. TEST DELETE /api/v1/rooms/{room_id}/places/{place_id}/votes (HỦY PHIẾU)
# ============================================================================


@pytest.mark.asyncio
async def test_retract_vote_success(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Rút phiếu bầu thành công, trả về current_user_vote = 0 và phát sự kiện."""
    recording = RecordingEventHandler()
    test_event_bus.register(VoteCastEvent, recording)

    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Trà sữa Gong Cha")

    # Vote trước
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Rút phiếu
    res = await client.delete(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["place_id"] == place["id"]
    assert data["upvotes"] == 0
    assert data["downvotes"] == 0
    assert data["score"] == 0
    assert data["current_user_vote"] == 0

    # Sự kiện rút phiếu (vote_value=0) đã phát
    assert recording.count() >= 2  # vote + retract
    retract_event = recording.last_event
    assert retract_event is not None
    assert retract_event.vote_value == 0

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_retract_vote_no_prior_vote(client: AsyncClient, db_session: AsyncSession) -> None:
    """Rút phiếu khi chưa từng vote vẫn trả 200 OK và score = 0."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán chưa vote")

    res = await client.delete(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["current_user_vote"] == 0
    assert data["score"] == 0

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


# ============================================================================
# 3. TEST POST /api/v1/rooms/{room_id}/voting/resolve (CHỐT VOTE)
# ============================================================================


@pytest.mark.asyncio
async def test_resolve_voting_basic(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Chốt vote với max_accepted_places=1 và EARLIEST_SUBMISSION, địa điểm điểm cao nhất ACCEPTED."""
    resolved_recording = RecordingEventHandler()
    test_event_bus.register(VotingResolvedEvent, resolved_recording)

    info = await _create_room_and_join(client, member_nickname="VoterResolve")
    place1 = await _add_place(
        client, info["room_id"], info["host_token"], "Quán A", estimated_cost=100000
    )
    place2 = await _add_place(
        client, info["room_id"], info["host_token"], "Quán B", estimated_cost=200000
    )

    # place1 gets 2 upvotes, place2 gets 1 upvote
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place1['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place1['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["member_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place2['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Resolve
    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert "resolved_places" in data
    assert "tie_break_applied" in data
    assert data["tie_break_strategy"] == "EARLIEST_SUBMISSION"

    # place1 (score=2) should be ACCEPTED, place2 (score=1) REJECTED
    resolved = data["resolved_places"]
    assert len(resolved) == 2

    accepted = [p for p in resolved if p["status"] == "ACCEPTED"]
    rejected = [p for p in resolved if p["status"] == "REJECTED"]
    assert len(accepted) == 1
    assert len(rejected) == 1
    assert accepted[0]["id"] == place1["id"]
    assert rejected[0]["id"] == place2["id"]

    # Kiểm tra sự kiện VotingResolvedEvent đã phát
    assert resolved_recording.count() == 1
    event = resolved_recording.last_event
    assert event is not None
    assert event.strategy == "EARLIEST_SUBMISSION"
    assert len(event.accepted_place_ids) == 1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_with_tie_break_most_upvotes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Chốt vote với 2 quán hòa điểm, chiến lược MOST_UPVOTES phân định."""
    info = await _create_room_and_join(client, member_nickname="VoterTie")

    # Thêm 2 quán
    place1 = await _add_place(client, info["room_id"], info["host_token"], "Quán Hòa A")
    place2 = await _add_place(client, info["room_id"], info["host_token"], "Quán Hòa B")

    # Cả 2 cùng score = 0 (hòa nhau, 1 upvote mỗi place từ host và member xen kẽ)
    # place1: host +1, member -1 => score=0, upvotes=1
    # place2: host -1, member +1 => score=0, upvotes=1
    # Cả 2 hòa hoàn toàn, MOST_UPVOTES sẽ dùng created_at tiebreak phụ
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place1['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place1['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["member_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place2['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["host_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place2['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["member_token"]},
    )

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "MOST_UPVOTES", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["tie_break_applied"] is True
    assert data["tie_break_strategy"] == "MOST_UPVOTES"

    # Đảm bảo có 1 ACCEPTED và 1 REJECTED
    accepted = [p for p in data["resolved_places"] if p["status"] == "ACCEPTED"]
    rejected = [p for p in data["resolved_places"] if p["status"] == "REJECTED"]
    assert len(accepted) == 1
    assert len(rejected) == 1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_forbidden_non_host(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Thành viên MEMBER cố gắng chốt vote bị từ chối 403 FORBIDDEN_HOST_ONLY."""
    info = await _create_room_and_join(client, member_nickname="NonHostVoter")
    await _add_place(client, info["room_id"], info["host_token"], "Quán Bị Cấm")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
        headers={"X-Member-Token": info["member_token"]},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN_HOST_ONLY"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_invalid_strategy(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Chốt vote với tên chiến lược không tồn tại trả về lỗi validation."""
    info = await _create_room_and_join(client)
    await _add_place(client, info["room_id"], info["host_token"], "Quán Invalid")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "INVALID_STRATEGY_XYZ", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    # Pydantic sẽ reject strategy không thuộc TieBreakStrategyName enum
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_accept_all(client: AsyncClient, db_session: AsyncSession) -> None:
    """Chốt vote với max_accepted_places lớn hơn tổng số quán, tất cả ACCEPTED."""
    info = await _create_room_and_join(client)
    await _add_place(client, info["room_id"], info["host_token"], "Quán Alpha")
    await _add_place(client, info["room_id"], info["host_token"], "Quán Beta")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 10},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    accepted = [p for p in data["resolved_places"] if p["status"] == "ACCEPTED"]
    assert len(accepted) == 2

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_vote_score_consistency_after_multiple_operations(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Kiểm tra tính nhất quán điểm số qua nhiều thao tác vote/retract/change."""
    info = await _create_room_and_join(client, member_nickname="VoterConsistency")
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán nhất quán")

    # Host: +1
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Member: +1
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["member_token"]},
    )

    # Host đổi sang -1
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": -1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Member rút phiếu
    res = await client.delete(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        headers={"X-Member-Token": info["member_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    # Kết quả: Host=-1, Member=0 => upvotes=0, downvotes=1, score=-1
    assert data["upvotes"] == 0
    assert data["downvotes"] == 1
    assert data["score"] == -1

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_vote_room_access_cross_room(client: AsyncClient, db_session: AsyncSession) -> None:
    """Thành viên phòng A không thể vote cho địa điểm phòng B."""
    # Tạo phòng A
    info_a = await _create_room_and_join(client, title="Phòng A Vote", host_nickname="HostA_Vote")
    place_a = await _add_place(client, info_a["room_id"], info_a["host_token"], "Quán A")

    # Tạo phòng B
    info_b = await _create_room_and_join(client, title="Phòng B Vote", host_nickname="HostB_Vote")

    # Token phòng B thử vote quán phòng A
    res = await client.post(
        f"/api/v1/rooms/{info_a['room_id']}/places/{place_a['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info_b["host_token"]},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"

    await db_session.execute(
        delete(Room).where(Room.id.in_([info_a["room_id"], info_b["room_id"]]))
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_vote_neutral_zero(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Bỏ phiếu trung lập 0, current_user_vote nhận 0 và phát sự kiện VoteCastEvent."""
    recording = RecordingEventHandler()
    test_event_bus.register(VoteCastEvent, recording)

    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán Neutral")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 0},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["current_user_vote"] == 0
    assert data["score"] == 0
    assert data["upvotes"] == 0
    assert data["downvotes"] == 0

    assert recording.count() == 1
    event = recording.last_event
    assert event is not None
    assert event.vote_value == 0

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_vote_finalized_room(client: AsyncClient, db_session: AsyncSession) -> None:
    """Phòng đã chốt kết quả (FINALIZED) không thể tiếp tục bỏ phiếu (400 ROOM_STATUS_INVALID)."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán Finalized")

    # Host chốt vote để đưa phòng về trạng thái FINALIZED
    resolve_res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert resolve_res.status_code == 200

    # Thử bỏ phiếu tiếp
    vote_res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert vote_res.status_code == 400
    assert vote_res.json()["error"]["code"] == "ROOM_STATUS_INVALID"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_retract_vote_finalized_room(client: AsyncClient, db_session: AsyncSession) -> None:
    """Phòng đã chốt kết quả (FINALIZED) không thể rút phiếu (400 ROOM_STATUS_INVALID)."""
    info = await _create_room_and_join(client)
    place = await _add_place(client, info["room_id"], info["host_token"], "Quán Finalized Retract")

    # Vote trước khi chốt
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Chốt vote
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    # Thử rút phiếu
    del_res = await client.delete(
        f"/api/v1/rooms/{info['room_id']}/places/{place['id']}/votes",
        headers={"X-Member-Token": info["host_token"]},
    )
    assert del_res.status_code == 400
    assert del_res.json()["error"]["code"] == "ROOM_STATUS_INVALID"

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_cast_vote_place_belongs_to_other_room(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Địa điểm thuộc phòng B khi gọi vote dưới path phòng A trả về 404 PLACE_NOT_FOUND."""
    info_a = await _create_room_and_join(client, title="Phòng A Check", host_nickname="HostA_Chk")
    info_b = await _create_room_and_join(client, title="Phòng B Check", host_nickname="HostB_Chk")
    place_b = await _add_place(client, info_b["room_id"], info_b["host_token"], "Quán Thuộc B")

    res = await client.post(
        f"/api/v1/rooms/{info_a['room_id']}/places/{place_b['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info_a["host_token"]},
    )
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "PLACE_NOT_FOUND"

    await db_session.execute(
        delete(Room).where(Room.id.in_([info_a["room_id"], info_b["room_id"]]))
    )
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_creator_priority(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Hai địa điểm hòa điểm, CREATOR_PRIORITY ưu tiên địa điểm do chính HOST đề xuất."""
    info = await _create_room_and_join(client, member_nickname="MemberCreatorPri")

    # Host tạo quán 1, Member tạo quán 2
    place_host = await _add_place(client, info["room_id"], info["host_token"], "Quán của Host")
    place_member = await _add_place(
        client, info["room_id"], info["member_token"], "Quán của Member"
    )

    # Cả hai cùng có 1 upvote từ host
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place_host['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    await client.post(
        f"/api/v1/rooms/{info['room_id']}/places/{place_member['id']}/votes",
        json={"vote_value": 1},
        headers={"X-Member-Token": info["host_token"]},
    )

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "CREATOR_PRIORITY", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["tie_break_applied"] is True

    accepted = [p for p in data["resolved_places"] if p["status"] == "ACCEPTED"]
    assert len(accepted) == 1
    assert accepted[0]["id"] == place_host["id"]

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()


@pytest.mark.asyncio
async def test_resolve_voting_publishes_status_changed_events(
    client: AsyncClient, db_session: AsyncSession, test_event_bus: InMemoryEventBus
) -> None:
    """Chốt vote phát sự kiện PlaceStatusChangedEvent cho từng địa điểm."""
    recording = RecordingEventHandler()
    test_event_bus.register(PlaceStatusChangedEvent, recording)

    info = await _create_room_and_join(client)
    place1 = await _add_place(client, info["room_id"], info["host_token"], "Quán Event 1")
    place2 = await _add_place(client, info["room_id"], info["host_token"], "Quán Event 2")

    res = await client.post(
        f"/api/v1/rooms/{info['room_id']}/voting/resolve",
        json={"strategy": "EARLIEST_SUBMISSION", "max_accepted_places": 1},
        headers={"X-Member-Token": info["host_token"]},
    )
    assert res.status_code == 200

    # Phải có 2 sự kiện PlaceStatusChangedEvent (1 cho place1 và 1 cho place2)
    assert recording.count() == 2
    recorded_place_ids = {str(e.place_id) for e in recording.received_events}
    assert place1["id"] in recorded_place_ids
    assert place2["id"] in recorded_place_ids

    await db_session.execute(delete(Room).where(Room.id == info["room_id"]))
    await db_session.commit()
