import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

import pytest

from app.domain.enums import MemberRole, PlaceCategory, PlaceStatus
from app.domain.patterns.event_bus import (
    CallableEventHandler,
    ConflictDetectedEvent,
    DomainEvent,
    IEventBus,
    IEventHandler,
    InMemoryEventBus,
    LoggingEventHandler,
    MemberJoinedEvent,
    MemberLeftEvent,
    PlaceAddedEvent,
    PlaceDeletedEvent,
    PlaceStatusChangedEvent,
    RecordingEventHandler,
    ScheduleUpdatedEvent,
    VoteCastEvent,
    VotingResolvedEvent,
)


class DummyCustomHandler(IEventHandler[Any]):
    def __init__(self) -> None:
        self.invoked = False
        self.last_event: Any = None

    async def handle(self, event: Any) -> None:
        self.invoked = True
        self.last_event = event


class FailingHandler(IEventHandler[Any]):
    async def handle(self, event: Any) -> None:
        raise RuntimeError("Handler execution failure")


@pytest.fixture
def bus() -> InMemoryEventBus:
    """Fixture cung cấp một InMemoryEventBus mới cho mỗi test case."""
    return InMemoryEventBus()


@pytest.fixture
def room_id() -> UUID:
    return uuid4()


# ==============================================================================
# 1. Domain Event Creation & Envelope Serialization Tests
# ==============================================================================


def test_domain_event_base_properties(room_id: UUID) -> None:
    event = DomainEvent(room_id=room_id)
    assert isinstance(event.event_id, UUID)
    assert event.room_id == room_id
    assert isinstance(event.occurred_at, datetime)
    assert event.occurred_at.tzinfo is not None

    envelope = event.to_envelope()
    assert envelope["type"] == "DomainEvent"
    assert isinstance(envelope["ts"], int)
    assert envelope["ts"] > 0


def test_member_joined_event_creation_and_envelope(room_id: UUID) -> None:
    member_id = uuid4()
    event = MemberJoinedEvent(
        room_id=room_id,
        member_id=member_id,
        nickname="MinhTrang",
        role=MemberRole.HOST,
        avatar_url="https://avatar.local/minh.png",
    )
    assert event.event_type == "MEMBER_JOINED"
    assert event.nickname == "MinhTrang"
    assert event.role == MemberRole.HOST

    envelope = event.to_envelope()
    assert envelope["type"] == "MEMBER_JOINED"
    assert envelope["payload"] == {
        "member": {
            "id": str(member_id),
            "nickname": "MinhTrang",
            "role": "HOST",
            "avatar_url": "https://avatar.local/minh.png",
        }
    }


def test_member_joined_event_populate_from_member_obj(room_id: UUID) -> None:
    member_id = uuid4()
    member_dict = {
        "id": member_id,
        "room_id": room_id,
        "nickname": "ThanhTung",
        "role": MemberRole.MEMBER,
        "avatar_url": None,
    }
    event = MemberJoinedEvent(member=member_dict, room_id=room_id)  # type: ignore[arg-type]
    assert event.member_id == member_id
    assert event.nickname == "ThanhTung"
    assert event.role == MemberRole.MEMBER
    assert event.avatar_url is None


def test_member_left_event(room_id: UUID) -> None:
    member_id = uuid4()
    event = MemberLeftEvent(room_id=room_id, member_id=member_id, nickname="ThanhTung")
    assert event.event_type == "MEMBER_LEFT"
    envelope = event.to_envelope()
    assert envelope["type"] == "MEMBER_LEFT"
    assert envelope["payload"] == {"member_id": str(member_id), "nickname": "ThanhTung"}


def test_place_added_event_creation_and_envelope(room_id: UUID) -> None:
    place_id = uuid4()
    sub_id = uuid4()
    event = PlaceAddedEvent(
        room_id=room_id,
        place_id=place_id,
        name="Quán Nướng Ngói Sài Gòn",
        category=PlaceCategory.FOOD,
        submitted_by_id=sub_id,
        estimated_cost=150000,
        open_minute=600,
        close_minute=1320,
        latitude=10.7769,
        longitude=106.7058,
        address="123 Nguyễn Thị Minh Khai, Q.1",
    )
    assert event.event_type == "PLACE_ADDED"
    envelope = event.to_envelope()
    assert envelope["type"] == "PLACE_ADDED"
    assert envelope["payload"]["place"] == {
        "id": str(place_id),
        "name": "Quán Nướng Ngói Sài Gòn",
        "category": "FOOD",
        "estimated_cost": 150000,
        "submitted_by_id": str(sub_id),
        "open_minute": 600,
        "close_minute": 1320,
        "latitude": 10.7769,
        "longitude": 106.7058,
        "address": "123 Nguyễn Thị Minh Khai, Q.1",
    }


def test_place_added_event_populate_from_place_obj(room_id: UUID) -> None:
    place_id = uuid4()
    place_obj = {
        "id": place_id,
        "name": "Phở Phú Vương",
        "category": PlaceCategory.FOOD,
        "estimated_cost": 75000,
        "room_id": room_id,
    }
    event = PlaceAddedEvent(place=place_obj, room_id=room_id)  # type: ignore[arg-type]
    assert event.place_id == place_id
    assert event.name == "Phở Phú Vương"
    assert event.category == PlaceCategory.FOOD
    assert event.estimated_cost == 75000


def test_place_deleted_event(room_id: UUID) -> None:
    place_id = uuid4()
    event = PlaceDeletedEvent(room_id=room_id, place_id=place_id)
    assert event.event_type == "PLACE_DELETED"
    envelope = event.to_envelope()
    assert envelope["payload"] == {"place_id": str(place_id)}


def test_vote_cast_event(room_id: UUID) -> None:
    place_id = uuid4()
    member_id = uuid4()
    event = VoteCastEvent(
        room_id=room_id,
        place_id=place_id,
        member_id=member_id,
        vote_value=1,
        upvotes=4,
        downvotes=1,
        score=3,
    )
    assert event.event_type == "VOTE_UPDATED"
    envelope = event.to_envelope()
    assert envelope["type"] == "VOTE_UPDATED"
    assert envelope["payload"] == {
        "place_id": str(place_id),
        "upvotes": 4,
        "downvotes": 1,
        "score": 3,
    }


def test_place_status_changed_event(room_id: UUID) -> None:
    place_id = uuid4()
    event = PlaceStatusChangedEvent(
        room_id=room_id,
        place_id=place_id,
        old_status=PlaceStatus.PROPOSED,
        new_status=PlaceStatus.ACCEPTED,
    )
    assert event.event_type == "PLACE_UPDATED"
    envelope = event.to_envelope()
    assert envelope["payload"] == {
        "place": {
            "id": str(place_id),
            "status": "ACCEPTED",
        }
    }


def test_place_status_changed_from_place_obj(room_id: UUID) -> None:
    place_id = uuid4()
    place_dict = {
        "id": place_id,
        "status": PlaceStatus.ACCEPTED,
        "room_id": room_id,
    }
    event = PlaceStatusChangedEvent(place=place_dict, room_id=room_id)  # type: ignore[arg-type]
    assert event.place_id == place_id
    assert event.new_status == PlaceStatus.ACCEPTED


def test_voting_resolved_event(room_id: UUID) -> None:
    p1 = uuid4()
    p2 = uuid4()
    event = VotingResolvedEvent(
        room_id=room_id,
        strategy="MOST_UPVOTES",
        accepted_place_ids=[p1, p2],
    )
    assert event.event_type == "VOTING_RESOLVED"
    envelope = event.to_envelope()
    assert envelope["payload"] == {
        "strategy": "MOST_UPVOTES",
        "accepted_place_ids": [str(p1), str(p2)],
    }


def test_schedule_updated_event(room_id: UUID) -> None:
    items = [{"id": str(uuid4()), "start_minute": 540, "end_minute": 630}]
    event = ScheduleUpdatedEvent(room_id=room_id, items=items)
    assert event.event_type == "SCHEDULE_UPDATED"
    envelope = event.to_envelope()
    assert envelope["payload"] == {"items": items}


def test_conflict_detected_event(room_id: UUID) -> None:
    conflicts = [{"rule_code": "TIME_OVERLAP", "level": "CRITICAL"}]
    event = ConflictDetectedEvent(room_id=room_id, conflicts=conflicts)
    assert event.event_type == "CONFLICTS_UPDATED"
    envelope = event.to_envelope()
    assert envelope["payload"] == {"conflicts": conflicts}


# ==============================================================================
# 2. Registration, Unregistration & Bus Management Tests
# ==============================================================================


def test_register_and_unregister_handler_instance(bus: InMemoryEventBus) -> None:
    assert isinstance(bus, IEventBus)
    handler = DummyCustomHandler()
    assert bus.handler_count() == 0

    bus.register(PlaceAddedEvent, handler)
    assert bus.handler_count() == 1
    assert bus.handler_count(PlaceAddedEvent) == 1
    assert bus.handler_count(VoteCastEvent) == 0

    # Không nhân đôi nếu đăng ký lại cùng handler
    bus.register(PlaceAddedEvent, handler)
    assert bus.handler_count() == 1

    # Unregister
    removed = bus.unregister(PlaceAddedEvent, handler)
    assert removed is True
    assert bus.handler_count() == 0

    # Unregister lần nữa trả về False
    assert bus.unregister(PlaceAddedEvent, handler) is False


def test_register_and_unregister_coroutine_callback(bus: InMemoryEventBus) -> None:
    async def sample_callback(event: MemberJoinedEvent) -> None:
        pass

    bus.register(MemberJoinedEvent, sample_callback)
    assert bus.handler_count(MemberJoinedEvent) == 1

    # Unregister bằng chính hàm sample_callback
    removed = bus.unregister(MemberJoinedEvent, sample_callback)
    assert removed is True
    assert bus.handler_count(MemberJoinedEvent) == 0


def test_subscribe_decorator(bus: InMemoryEventBus) -> None:
    received = []

    @bus.subscribe(VoteCastEvent)
    async def on_vote(event: VoteCastEvent) -> None:
        received.append(event)

    assert bus.handler_count(VoteCastEvent) == 1


def test_register_invalid_types(bus: InMemoryEventBus) -> None:
    with pytest.raises(TypeError, match="event_type phải là một class/type"):
        bus.register("NotAType", DummyCustomHandler())  # type: ignore[arg-type]

    with pytest.raises(TypeError, match="handler phải kế thừa IEventHandler hoặc là một async callable"):
        bus.register(PlaceAddedEvent, 12345)  # type: ignore[arg-type]


def test_clear_bus(bus: InMemoryEventBus) -> None:
    h1 = DummyCustomHandler()
    h2 = DummyCustomHandler()
    bus.register(PlaceAddedEvent, h1)
    bus.register(VoteCastEvent, h2)
    assert bus.handler_count() == 2

    bus.clear()
    assert bus.handler_count() == 0


# ==============================================================================
# 3. Asynchronous Publishing & Dispatching Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_publish_triggers_registered_handlers_with_correct_payload(
    bus: InMemoryEventBus, room_id: UUID
) -> None:
    received_events: list[PlaceAddedEvent] = []

    async def handler_fn(event: PlaceAddedEvent) -> None:
        received_events.append(event)

    handler_obj = DummyCustomHandler()

    bus.register(PlaceAddedEvent, handler_fn)
    bus.register(PlaceAddedEvent, handler_obj)

    place_id = uuid4()
    event = PlaceAddedEvent(
        room_id=room_id,
        place_id=place_id,
        name="Cà phê Trứng 3T",
        category=PlaceCategory.DRINK,
    )

    await bus.publish(event)

    assert len(received_events) == 1
    assert received_events[0] is event
    assert received_events[0].name == "Cà phê Trứng 3T"
    assert received_events[0].category == PlaceCategory.DRINK

    assert handler_obj.invoked is True
    assert handler_obj.last_event is event


@pytest.mark.asyncio
async def test_publish_isolates_different_event_types(
    bus: InMemoryEventBus, room_id: UUID
) -> None:
    place_events: list[Any] = []
    vote_events: list[Any] = []

    bus.register(PlaceAddedEvent, lambda e: place_events.append(e))  # type: ignore[arg-type]
    bus.register(VoteCastEvent, lambda e: vote_events.append(e))  # type: ignore[arg-type]

    place_event = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Quán Ăn")
    await bus.publish(place_event)

    assert len(place_events) == 1
    assert len(vote_events) == 0

    vote_event = VoteCastEvent(
        room_id=room_id, place_id=uuid4(), member_id=uuid4(), vote_value=1
    )
    await bus.publish(vote_event)

    assert len(place_events) == 1
    assert len(vote_events) == 1


@pytest.mark.asyncio
async def test_polymorphic_event_dispatch(bus: InMemoryEventBus, room_id: UUID) -> None:
    all_events: list[Any] = []
    place_events: list[Any] = []

    # Đăng ký lắng nghe class cha DomainEvent
    bus.register(DomainEvent, lambda e: all_events.append(e))  # type: ignore[arg-type]
    # Đăng ký lắng nghe PlaceAddedEvent cụ thể
    bus.register(PlaceAddedEvent, lambda e: place_events.append(e))  # type: ignore[arg-type]

    e1 = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Địa điểm 1")
    e2 = MemberJoinedEvent(room_id=room_id, member_id=uuid4(), nickname="User1")

    await bus.publish(e1)
    await bus.publish(e2)

    # all_events nhận cả 2 sự kiện vì đều kế thừa DomainEvent
    assert len(all_events) == 2
    assert all_events[0] is e1
    assert all_events[1] is e2

    # place_events chỉ nhận e1
    assert len(place_events) == 1
    assert place_events[0] is e1


@pytest.mark.asyncio
async def test_publish_none_or_no_handlers(bus: InMemoryEventBus, room_id: UUID) -> None:
    # Không có handler nào đăng ký
    event = ScheduleUpdatedEvent(room_id=room_id, items=[])
    await bus.publish(event)  # Không bị crash

    # Publish None
    await bus.publish(None)  # Không bị crash


@pytest.mark.asyncio
async def test_sequential_execution_mode(room_id: UUID) -> None:
    bus = InMemoryEventBus(concurrent=False)
    execution_order: list[int] = []

    async def h1(event: Any) -> None:
        await asyncio.sleep(0.02)
        execution_order.append(1)

    async def h2(event: Any) -> None:
        await asyncio.sleep(0.01)
        execution_order.append(2)

    bus.register(DomainEvent, h1)
    bus.register(DomainEvent, h2)

    await bus.publish(DomainEvent(room_id=room_id))
    # Trong chế độ tuần tự, h1 phải hoàn thành trước h2 dù h1 sleep lâu hơn
    assert execution_order == [1, 2]


@pytest.mark.asyncio
async def test_concurrent_execution_mode(room_id: UUID) -> None:
    bus = InMemoryEventBus(concurrent=True)
    completion_order: list[int] = []

    async def h1(event: Any) -> None:
        await asyncio.sleep(0.04)
        completion_order.append(1)

    async def h2(event: Any) -> None:
        await asyncio.sleep(0.01)
        completion_order.append(2)

    bus.register(DomainEvent, h1)
    bus.register(DomainEvent, h2)

    await bus.publish(DomainEvent(room_id=room_id))
    # Trong chế độ song song, h2 sleep ít hơn nên kết thúc trước h1
    assert completion_order == [2, 1]


# ==============================================================================
# 4. Error Handling & Resilience Tests
# ==============================================================================


@pytest.mark.asyncio
async def test_error_isolation_when_raise_exceptions_false(
    bus: InMemoryEventBus, room_id: UUID
) -> None:
    bus.raise_exceptions = False

    failing = FailingHandler()
    working = DummyCustomHandler()

    bus.register(PlaceAddedEvent, failing)
    bus.register(PlaceAddedEvent, working)

    event = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Test Place")
    # Không raise exception ra ngoài
    await bus.publish(event)

    # Handler bình thường vẫn được chạy thành công
    assert working.invoked is True
    assert working.last_event is event


@pytest.mark.asyncio
async def test_error_propagation_when_raise_exceptions_true(
    bus: InMemoryEventBus, room_id: UUID
) -> None:
    bus.raise_exceptions = True

    failing = FailingHandler()
    bus.register(PlaceAddedEvent, failing)

    event = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Test Place")
    with pytest.raises(RuntimeError, match="Handler execution failure"):
        await bus.publish(event)


@pytest.mark.asyncio
async def test_error_propagation_sequential_mode(room_id: UUID) -> None:
    bus = InMemoryEventBus(concurrent=False, raise_exceptions=True)
    failing = FailingHandler()
    bus.register(PlaceAddedEvent, failing)

    event = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Test Place")
    with pytest.raises(RuntimeError, match="Handler execution failure"):
        await bus.publish(event)


# ==============================================================================
# 5. Predefined Handlers Tests (RecordingEventHandler & LoggingEventHandler)
# ==============================================================================


@pytest.mark.asyncio
async def test_recording_event_handler(bus: InMemoryEventBus, room_id: UUID) -> None:
    recorder = RecordingEventHandler()
    bus.register(DomainEvent, recorder)

    e1 = PlaceAddedEvent(room_id=room_id, place_id=uuid4(), name="Place 1")
    e2 = VoteCastEvent(room_id=room_id, place_id=uuid4(), member_id=uuid4(), vote_value=1)

    assert recorder.count() == 0
    assert recorder.last_event is None

    await bus.publish(e1)
    assert recorder.count() == 1
    assert recorder.last_event is e1

    await bus.publish(e2)
    assert recorder.count() == 2
    assert recorder.last_event is e2

    recorder.clear()
    assert recorder.count() == 0


@pytest.mark.asyncio
async def test_logging_event_handler(bus: InMemoryEventBus, room_id: UUID) -> None:
    logger_handler = LoggingEventHandler()
    bus.register(DomainEvent, logger_handler)

    event = MemberJoinedEvent(room_id=room_id, member_id=uuid4(), nickname="HoangNam")
    # Kiểm tra thực thi không lỗi
    await bus.publish(event)


def test_callable_event_handler_repr() -> None:
    async def sample_fn(e: Any) -> None:
        pass

    handler = CallableEventHandler(sample_fn)
    assert "sample_fn" in repr(handler)
    assert handler.callback is sample_fn
