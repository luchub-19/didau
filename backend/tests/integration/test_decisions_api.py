from collections import defaultdict
from datetime import date, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import (
    get_current_host,
    get_current_member,
)
from app.api.v1.decisions import get_decision_service
from app.api.v1.router import api_router, register_exception_handlers
from app.core.exceptions import (
    ForbiddenHostOnlyError,
    UnauthorizedError,
)
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import (
    DecisionMode,
    DecisionStatus,
    MemberRole,
    PlaceCategory,
    PlaceStatus,
    RoomStatus,
    TieBreakStrategyName,
)
from app.domain.models import DecisionSession, DecisionSwipe, Member, Place, Room
from app.domain.patterns.event_bus import (
    DecisionProgressEvent,
    DecisionResolvedEvent,
    DecisionStartedEvent,
    InMemoryEventBus,
    PlaceStatusChangedEvent,
    RecordingEventHandler,
    VotingResolvedEvent,
)
from app.main import app
from app.repositories import (
    IDecisionRepository,
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IVoteRepository,
)
from app.services.decision_service import DecisionService
from app.services.voting_service import VotingService

if not any(getattr(r, "prefix", "") == "/api/v1" for r in app.routes):
    app.include_router(api_router)
register_exception_handlers(app)


# ==============================================================================
# In-Memory Repositories cho Test
# ==============================================================================


class InMemoryRoomRepo(IRoomRepository):
    def __init__(self) -> None:
        self.rooms: dict[UUID, Room] = {}

    async def get_by_id(self, room_id: UUID) -> Room | None:
        return self.rooms.get(room_id)

    async def get_by_code(self, code: str) -> Room | None:
        for r in self.rooms.values():
            if r.code == code:
                return r
        return None

    async def create(self, room_data: dict[str, Any]) -> Room:
        r = Room(
            id=room_data.get("id") or generate_uuid(),
            code=room_data.get("code") or "ROOM12",
            title=room_data.get("title") or "Test Room",
            event_date=room_data.get("event_date") or date.today(),
            city=room_data.get("city") or "HCM",
            origin_lat=room_data.get("origin_lat", 10.7769),
            origin_lng=room_data.get("origin_lng", 106.7009),
            start_minute=room_data.get("start_minute", 1020),
            end_minute=room_data.get("end_minute", 1380),
            budget_limit=room_data.get("budget_limit"),
            status=room_data.get("status") or RoomStatus.PLANNING.value,
        )
        self.rooms[r.id] = r
        return r

    async def update(self, room_id: UUID, update_data: dict[str, Any]) -> Room | None:
        r = self.rooms.get(room_id)
        if not r:
            return None
        for k, v in update_data.items():
            setattr(r, k, v)
        return r


class InMemoryMemberRepo(IMemberRepository):
    def __init__(self) -> None:
        self.members: dict[UUID, Member] = {}

    async def get_by_token(self, token: str) -> Member | None:
        for m in self.members.values():
            if m.token == token:
                return m
        return None

    async def get_by_room_and_nickname(self, room_id: UUID, nickname: str) -> Member | None:
        for m in self.members.values():
            if m.room_id == room_id and m.nickname == nickname:
                return m
        return None

    async def list_by_room(self, room_id: UUID) -> list[Member]:
        return [m for m in self.members.values() if m.room_id == room_id]

    async def create(self, member_data: dict[str, Any]) -> Member:
        m = Member(
            id=member_data.get("id") or generate_uuid(),
            room_id=member_data["room_id"],
            nickname=member_data["nickname"],
            role=member_data.get("role") or MemberRole.MEMBER.value,
            token=member_data.get("token") or f"token-{uuid4()}",
        )
        self.members[m.id] = m
        return m

    async def update_last_active(self, member_id: UUID) -> None:
        pass


class InMemoryPlaceRepo(IPlaceRepository):
    def __init__(self) -> None:
        self.places: dict[UUID, Place] = {}

    async def get_by_id(self, place_id: UUID) -> Place | None:
        return self.places.get(place_id)

    async def list_by_room(self, room_id: UUID) -> list[Place]:
        return [p for p in self.places.values() if p.room_id == room_id]

    async def create(self, place_data: dict[str, Any]) -> Place:
        p = Place(
            id=place_data.get("id") or generate_uuid(),
            room_id=place_data["room_id"],
            name=place_data["name"],
            category=place_data.get("category", PlaceCategory.FOOD.value),
            status=place_data.get("status", PlaceStatus.PROPOSED.value),
            source=place_data.get("source", "MANUAL"),
            created_at=place_data.get("created_at") or now_utc(),
            latitude=place_data.get("latitude", 10.7769),
            longitude=place_data.get("longitude", 106.7009),
            open_minute=place_data.get("open_minute", 480),
            close_minute=place_data.get("close_minute", 1320),
            estimated_cost=place_data.get("estimated_cost", 50000),
            submitted_by_id=place_data.get("submitted_by_id") or generate_uuid(),
        )
        self.places[p.id] = p
        return p

    async def update(self, place_id: UUID, update_data: dict[str, Any]) -> Place | None:
        p = self.places.get(place_id)
        if not p:
            return None
        for k, v in update_data.items():
            setattr(p, k, v)
        return p

    async def delete(self, place_id: UUID) -> bool:
        if place_id in self.places:
            del self.places[place_id]
            return True
        return False


class InMemoryVoteRepo(IVoteRepository):
    def __init__(self) -> None:
        self.votes: dict[tuple[UUID, UUID], int] = {}

    async def get_vote(self, place_id: UUID, member_id: UUID) -> int | None:
        return self.votes.get((place_id, member_id))

    async def upsert_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> int:
        self.votes[(place_id, member_id)] = vote_value
        return vote_value

    async def delete_vote(self, place_id: UUID, member_id: UUID) -> bool:
        if (place_id, member_id) in self.votes:
            del self.votes[(place_id, member_id)]
            return True
        return False

    async def get_vote_summary_by_room(self, room_id: UUID) -> dict[UUID, dict[str, int]]:
        summary: dict[UUID, dict[str, int]] = defaultdict(
            lambda: {"upvotes": 0, "downvotes": 0, "score": 0}
        )
        for (pid, _mid), val in self.votes.items():
            if val == 1:
                summary[pid]["upvotes"] += 1
            elif val == -1:
                summary[pid]["downvotes"] += 1
            summary[pid]["score"] = summary[pid]["upvotes"] - summary[pid]["downvotes"]
        return summary


class InMemoryDecisionRepo(IDecisionRepository):
    def __init__(self) -> None:
        self.sessions: dict[UUID, DecisionSession] = {}
        self.swipes: dict[tuple[UUID, UUID, UUID], DecisionSwipe] = {}

    async def get_by_id(self, session_id: UUID) -> DecisionSession | None:
        return self.sessions.get(session_id)

    async def get_open_session_by_room(self, room_id: UUID) -> DecisionSession | None:
        for s in self.sessions.values():
            if s.room_id == room_id and s.status == DecisionStatus.OPEN.value:
                return s
        return None

    async def create_session(self, session_data: dict[str, Any]) -> DecisionSession:
        s = DecisionSession(
            id=session_data.get("id") or generate_uuid(),
            room_id=session_data["room_id"],
            mode=session_data["mode"],
            status=session_data.get("status", DecisionStatus.OPEN.value),
            category=session_data.get("category"),
            candidate_place_ids=session_data.get("candidate_place_ids", []),
            seed=session_data["seed"],
            result_place_id=session_data.get("result_place_id"),
            result_payload=session_data.get("result_payload"),
            created_by_id=session_data["created_by_id"],
            created_at=session_data.get("created_at") or now_utc(),
            closes_at=session_data.get("closes_at"),
        )
        self.sessions[s.id] = s
        return s

    async def update_session(
        self, session_id: UUID, update_data: dict[str, Any]
    ) -> DecisionSession | None:
        s = self.sessions.get(session_id)
        if not s:
            return None
        for k, v in update_data.items():
            setattr(s, k, v)
        return s

    async def upsert_swipe(
        self, session_id: UUID, member_id: UUID, place_id: UUID, liked: bool
    ) -> DecisionSwipe:
        key = (session_id, member_id, place_id)
        if key in self.swipes:
            self.swipes[key].liked = liked
            return self.swipes[key]
        swipe = DecisionSwipe(
            session_id=session_id,
            member_id=member_id,
            place_id=place_id,
            liked=liked,
        )
        self.swipes[key] = swipe
        return swipe

    async def list_swipes_by_session(self, session_id: UUID) -> list[DecisionSwipe]:
        return [sw for sw in self.swipes.values() if sw.session_id == session_id]


# ==============================================================================
# Fixtures
# ==============================================================================


@pytest.fixture
def mock_env():
    room_repo = InMemoryRoomRepo()
    member_repo = InMemoryMemberRepo()
    place_repo = InMemoryPlaceRepo()
    vote_repo = InMemoryVoteRepo()
    decision_repo = InMemoryDecisionRepo()
    event_bus = InMemoryEventBus()

    recording_handler = RecordingEventHandler()
    event_bus.register(DecisionStartedEvent, recording_handler)
    event_bus.register(DecisionProgressEvent, recording_handler)
    event_bus.register(DecisionResolvedEvent, recording_handler)
    event_bus.register(VotingResolvedEvent, recording_handler)
    event_bus.register(PlaceStatusChangedEvent, recording_handler)

    voting_service = VotingService(
        vote_repo=vote_repo,
        place_repo=place_repo,
        room_repo=room_repo,
        member_repo=member_repo,
        event_bus=event_bus,
    )
    decision_service = DecisionService(
        decision_repo=decision_repo,
        room_repo=room_repo,
        place_repo=place_repo,
        member_repo=member_repo,
        vote_repo=vote_repo,
        voting_service=voting_service,
        event_bus=event_bus,
    )
    return {
        "room_repo": room_repo,
        "member_repo": member_repo,
        "place_repo": place_repo,
        "vote_repo": vote_repo,
        "decision_repo": decision_repo,
        "event_bus": event_bus,
        "decision_service": decision_service,
        "recording_handler": recording_handler,
    }


@pytest.fixture
async def setup_test_room(mock_env):
    room_repo = mock_env["room_repo"]
    member_repo = mock_env["member_repo"]
    place_repo = mock_env["place_repo"]

    room = await room_repo.create({"title": "Phòng ăn tối thứ 7"})
    host = await member_repo.create({
        "room_id": room.id,
        "nickname": "HostUser",
        "role": MemberRole.HOST.value,
        "token": "host-token-123",
    })
    member = await member_repo.create({
        "room_id": room.id,
        "nickname": "MemberUser",
        "role": MemberRole.MEMBER.value,
        "token": "member-token-456",
    })
    place1 = await place_repo.create({
        "room_id": room.id,
        "name": "Phở Hòa",
        "category": PlaceCategory.FOOD.value,
        "submitted_by_id": host.id,
    })
    place2 = await place_repo.create({
        "room_id": room.id,
        "name": "Bún Bò Cô Ba",
        "category": PlaceCategory.FOOD.value,
        "submitted_by_id": member.id,
    })
    place3 = await place_repo.create({
        "room_id": room.id,
        "name": "Cà phê 3T",
        "category": PlaceCategory.DRINK.value,
        "submitted_by_id": member.id,
    })

    return {
        "room": room,
        "host": host,
        "member": member,
        "places": [place1, place2, place3],
    }


@pytest.fixture
async def client(mock_env, setup_test_room):
    decision_service = mock_env["decision_service"]
    member_repo = mock_env["member_repo"]

    app.dependency_overrides[get_decision_service] = lambda: decision_service

    async def _mock_get_current_member(
        x_member_token: str | None = None,
    ) -> Member:
        if not x_member_token:
            raise UnauthorizedError("Missing token")
        m = await member_repo.get_by_token(x_member_token)
        if not m:
            raise UnauthorizedError("Invalid token")
        return m

    async def _mock_get_current_host(
        x_member_token: str | None = None,
    ) -> Member:
        m = await _mock_get_current_member(x_member_token)
        if m.role != MemberRole.HOST.value:
            raise ForbiddenHostOnlyError("Chỉ Host mới có quyền")
        return m

    from fastapi import Header

    async def _override_current_member(
        x_member_token: str | None = Header(None, alias="X-Member-Token"),
    ) -> Member:
        return await _mock_get_current_member(x_member_token)

    async def _override_current_host(
        x_member_token: str | None = Header(None, alias="X-Member-Token"),
    ) -> Member:
        return await _mock_get_current_host(x_member_token)

    app.dependency_overrides[get_current_member] = _override_current_member
    app.dependency_overrides[get_current_host] = _override_current_host

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ==============================================================================
# Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_member_cannot_create_decision_session_returns_403(client, setup_test_room):
    """Tiêu chí 1: Thành viên thông thường (MEMBER) không thể mở phiên chọn hộ (403)."""
    room = setup_test_room["room"]
    member = setup_test_room["member"]

    response = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": member.token},
        json={"mode": "WHEEL", "category": "FOOD"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["error"]["code"] == "FORBIDDEN_HOST_ONLY"


@pytest.mark.asyncio
async def test_two_open_sessions_returns_409(client, setup_test_room):
    """Tiêu chí 2: Phòng đã có phiên OPEN thì tạo thêm phiên thứ 2 bị trả 409 CONFLICT."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]

    # Phiên 1: thành công
    resp1 = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={"mode": "WHEEL", "category": "FOOD"},
    )
    assert resp1.status_code == 201

    # Phiên 2: trùng -> 409
    resp2 = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={"mode": "SMART", "category": "FOOD"},
    )
    assert resp2.status_code == 409
    assert resp2.json()["error"]["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_seed_persisted_and_returned_wheel_mode(client, setup_test_room, mock_env):
    """Tiêu chí 3: Seed được lưu, trả về trong response và broadcast trong sự kiện DECISION_STARTED."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]
    recording = mock_env["recording_handler"]

    resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "WHEEL",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
            "weighted": False,
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    assert "seed" in data
    assert isinstance(data["seed"], int)
    assert data["seed"] > 0
    assert data["session"]["seed"] == data["seed"]
    assert data["result_place_id"] in [str(places[0].id), str(places[1].id)]
    assert "stop_angle_deg" in data["result_payload"]

    # Kiểm tra sự kiện WebSocket DECISION_STARTED
    started_events = [e for e in recording.received_events if isinstance(e, DecisionStartedEvent)]
    assert len(started_events) >= 1
    assert started_events[-1].seed == data["seed"]
    assert started_events[-1].mode == "WHEEL"


@pytest.mark.asyncio
async def test_create_decision_ladder_mode(client, setup_test_room):
    """Tạo phiên LADDER (Thang may mắn) thành công, trả về cấu trúc thang và kết quả."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]

    resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "LADDER",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["session"]["mode"] == "LADDER"
    assert "n_columns" in data["result_payload"]
    assert data["result_place_id"] in [str(places[0].id), str(places[1].id)]


@pytest.mark.asyncio
async def test_create_decision_smart_mode(client, setup_test_room):
    """Tạo phiên SMART (Gợi ý 1 chạm) trả về điểm số và lý do cụ thể."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]

    resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "SMART",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["session"]["mode"] == "SMART"
    assert data["result_place_id"] is not None
    assert "score" in data["result_payload"]
    assert "reasons" in data["result_payload"]


@pytest.mark.asyncio
async def test_swipe_duplicate_overwrites(client, setup_test_room, mock_env):
    """Tiêu chí 4: Quẹt thẻ trùng cho cùng 1 địa điểm sẽ ghi đè kết quả, không tạo duplicate."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]
    decision_repo = mock_env["decision_repo"]

    # 1. Tạo phiên SWIPE
    create_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "SWIPE",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["session"]["id"]

    # 2. Lần quẹt 1: Like
    swipe1 = await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": host.token},
        json={"place_id": str(places[0].id), "liked": True},
    )
    assert swipe1.status_code == 200
    assert swipe1.json()["liked"] is True

    # 3. Lần quẹt 2 (trùng): Dislike
    swipe2 = await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": host.token},
        json={"place_id": str(places[0].id), "liked": False},
    )
    assert swipe2.status_code == 200
    assert swipe2.json()["liked"] is False

    # 4. Kiểm tra repo chỉ có 1 bản ghi duy nhất với liked = False
    swipes = await decision_repo.list_swipes_by_session(UUID(session_id))
    assert len(swipes) == 1
    assert swipes[0].liked is False


@pytest.mark.asyncio
async def test_expired_session_fails_and_auto_closes(client, setup_test_room, mock_env):
    """Tiêu chí 5: Phiên hết hạn thì tự đóng và chặn quẹt thẻ."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]
    decision_repo = mock_env["decision_repo"]

    # Tạo phiên SWIPE với closes_at trong quá khứ
    past_time = now_utc() - timedelta(seconds=10)
    session = await decision_repo.create_session({
        "room_id": room.id,
        "mode": DecisionMode.SWIPE.value,
        "status": DecisionStatus.OPEN.value,
        "candidate_place_ids": [str(places[0].id)],
        "seed": 999,
        "created_by_id": host.id,
        "closes_at": past_time,
    })

    # Thử quẹt thẻ khi đã hết hạn -> trả 422 hoặc 400
    resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session.id}/swipes",
        headers={"X-Member-Token": host.token},
        json={"place_id": str(places[0].id), "liked": True},
    )
    assert resp.status_code in (400, 422)
    assert "hết hạn" in resp.json()["error"]["message"]

    # Phiên tự động được chuyển sang EXPIRED
    updated = await decision_repo.get_by_id(session.id)
    assert updated.status == DecisionStatus.EXPIRED.value


@pytest.mark.asyncio
async def test_swipe_progress_and_auto_tally_with_tie_subwheel(client, setup_test_room, mock_env):
    """Phiên SWIPE phát DECISION_PROGRESS và tự động quay vòng quay con khi hòa điểm."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    member = setup_test_room["member"]
    places = setup_test_room["places"]
    recording = mock_env["recording_handler"]
    decision_repo = mock_env["decision_repo"]

    create_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "SWIPE",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    session_id = create_resp.json()["session"]["id"]

    # Host quẹt cả 2 quán
    await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": host.token},
        json={"place_id": str(places[0].id), "liked": True},
    )
    await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": host.token},
        json={"place_id": str(places[1].id), "liked": True},
    )

    # Member quẹt cả 2 quán -> hòa điểm (cả 2 quán đều 2 likes)
    await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": member.token},
        json={"place_id": str(places[0].id), "liked": True},
    )
    await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/swipes",
        headers={"X-Member-Token": member.token},
        json={"place_id": str(places[1].id), "liked": True},
    )

    # Kiểm tra sự kiện DECISION_PROGRESS được phát tán
    progress_events = [e for e in recording.received_events if isinstance(e, DecisionProgressEvent)]
    assert len(progress_events) >= 1
    assert progress_events[-1].total_members == 2

    # Vì hòa, tự sinh sub_wheel
    s_obj = await decision_repo.get_by_id(UUID(session_id))
    assert s_obj.result_place_id is not None
    assert "sub_wheel" in s_obj.result_payload


@pytest.mark.asyncio
async def test_accept_decision_resolves_voting_and_accepts_place(client, setup_test_room, mock_env):
    """Tiêu chí 6: Host chấp nhận kết quả -> quán chuyển ACCEPTED và phát VOTING_RESOLVED(GROUP_DECISION)."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]
    recording = mock_env["recording_handler"]
    place_repo = mock_env["place_repo"]

    # 1. Tạo phiên WHEEL
    create_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "WHEEL",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    session_id = create_resp.json()["session"]["id"]
    winner_id = create_resp.json()["result_place_id"]

    # 2. Host gọi accept
    accept_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/accept",
        headers={"X-Member-Token": host.token},
    )
    assert accept_resp.status_code == 200
    data = accept_resp.json()
    assert data["strategy"] == TieBreakStrategyName.GROUP_DECISION.value
    assert data["session"]["status"] == DecisionStatus.RESOLVED.value

    # 3. Quán thắng được chuyển sang ACCEPTED trong database
    winner_place = await place_repo.get_by_id(UUID(winner_id))
    assert winner_place.status == PlaceStatus.ACCEPTED

    # 4. Kiểm tra sự kiện VotingResolvedEvent và DecisionResolvedEvent
    resolved_events = [e for e in recording.received_events if isinstance(e, VotingResolvedEvent)]
    assert len(resolved_events) >= 1
    assert resolved_events[-1].strategy == TieBreakStrategyName.GROUP_DECISION.value
    assert UUID(winner_id) in resolved_events[-1].accepted_place_ids

    dec_resolved_events = [e for e in recording.received_events if isinstance(e, DecisionResolvedEvent)]
    assert len(dec_resolved_events) >= 1
    assert dec_resolved_events[-1].status == DecisionStatus.RESOLVED.value


@pytest.mark.asyncio
async def test_cancel_decision(client, setup_test_room, mock_env):
    """Host hủy phiên chọn hộ, session chuyển sang CANCELLED và phát DECISION_RESOLVED(CANCELLED)."""
    room = setup_test_room["room"]
    host = setup_test_room["host"]
    places = setup_test_room["places"]
    recording = mock_env["recording_handler"]

    create_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={
            "mode": "WHEEL",
            "candidate_place_ids": [str(places[0].id), str(places[1].id)],
        },
    )
    session_id = create_resp.json()["session"]["id"]

    cancel_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions/{session_id}/cancel",
        headers={"X-Member-Token": host.token},
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["session"]["status"] == DecisionStatus.CANCELLED.value

    cancel_events = [e for e in recording.received_events if isinstance(e, DecisionResolvedEvent)]
    assert len(cancel_events) >= 1
    assert cancel_events[-1].status == DecisionStatus.CANCELLED.value


@pytest.mark.asyncio
async def test_hints_endpoint(client, setup_test_room):
    """GET /rooms/{id}/decisions/hints trả về danh sách hints và smart_picks."""
    room = setup_test_room["room"]
    member = setup_test_room["member"]

    resp = await client.get(
        f"/api/v1/rooms/{room.id}/decisions/hints",
        headers={"X-Member-Token": member.token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "hints" in data
    assert "smart_picks" in data
    assert len(data["smart_picks"]) <= 3


@pytest.mark.asyncio
async def test_hints_endpoint_returns_reason_codes_cr06(client, setup_test_room):
    """GET /rooms/{id}/decisions/hints trả về smart_picks có reason_codes và SMART session có reason_codes trong result_payload theo CR-06."""
    room = setup_test_room["room"]
    member = setup_test_room["member"]
    host = setup_test_room["host"]

    # 1. GET /hints
    resp = await client.get(
        f"/api/v1/rooms/{room.id}/decisions/hints",
        headers={"X-Member-Token": member.token},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "smart_picks" in data
    assert len(data["smart_picks"]) >= 1
    for pick in data["smart_picks"]:
        assert "reason_codes" in pick
        assert len(pick["reason_codes"]) == len(pick["reasons"])

    # 2. POST /decisions (mode: SMART)
    smart_resp = await client.post(
        f"/api/v1/rooms/{room.id}/decisions",
        headers={"X-Member-Token": host.token},
        json={"mode": "SMART"},
    )
    assert smart_resp.status_code == 201
    smart_data = smart_resp.json()
    assert smart_data["result_payload"] is not None
    assert "reason_codes" in smart_data["result_payload"]
    assert isinstance(smart_data["result_payload"]["reason_codes"], list)

