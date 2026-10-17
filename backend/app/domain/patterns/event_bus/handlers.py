import logging
from typing import Any

from app.domain.patterns.event_bus.bus import CallableEventHandler, IEventHandler

logger = logging.getLogger(__name__)


class LoggingEventHandler(IEventHandler[Any]):
    """Handler ghi nhật ký (log) các Domain Event phát tán trong hệ thống."""

    def __init__(self, level: int = logging.INFO) -> None:
        self.level = level

    async def handle(self, event: Any) -> None:
        logger.log(
            self.level,
            "Domain Event dispatched: %s | data=%s",
            type(event).__name__,
            repr(event),
        )


class RecordingEventHandler(IEventHandler[Any]):
    """Handler lưu trữ các sự kiện nhận được vào bộ nhớ phục vụ kiểm thử và debug."""

    def __init__(self) -> None:
        self.received_events: list[Any] = []

    async def handle(self, event: Any) -> None:
        self.received_events.append(event)

    def count(self) -> int:
        return len(self.received_events)

    def clear(self) -> None:
        self.received_events.clear()

    @property
    def last_event(self) -> Any | None:
        return self.received_events[-1] if self.received_events else None


class WebSocketBroadcastHandler(IEventHandler[Any]):
    """Handler lắng nghe Domain Event và broadcast WebSocket Envelope tới các client trong phòng."""

    def __init__(self, manager: Any) -> None:
        self.manager = manager

    async def handle(self, event: Any) -> None:
        """Xử lý Domain Event và broadcast tới các WebSocket clients."""
        room_id = getattr(event, "room_id", None)
        if room_id is None:
            return

        if hasattr(event, "to_envelope"):
            envelope = event.to_envelope()
        else:
            from app.core.time_utils import now_utc

            envelope = {
                "type": getattr(event, "event_type", type(event).__name__),
                "payload": getattr(event, "to_envelope_payload", dict)(),
                "ts": int(now_utc().timestamp() * 1000),
            }


        await self.manager.broadcast_to_room(room_id, envelope)


def register_websocket_broadcast_handlers(
    event_bus: Any,
    manager: Any,
) -> WebSocketBroadcastHandler:
    """Đăng ký WebSocketBroadcastHandler vào EventBus cho toàn bộ Domain Event."""
    handler = WebSocketBroadcastHandler(manager)

    from app.domain.patterns.event_bus.events import (
        ConflictDetectedEvent,
        DomainEvent,
        MemberJoinedEvent,
        MemberLeftEvent,
        PlaceAddedEvent,
        PlaceDeletedEvent,
        PlaceStatusChangedEvent,
        ScheduleUpdatedEvent,
        VoteCastEvent,
        VotingResolvedEvent,
    )

    event_bus.register(DomainEvent, handler)
    event_bus.register(MemberJoinedEvent, handler)
    event_bus.register(MemberLeftEvent, handler)
    event_bus.register(PlaceAddedEvent, handler)
    event_bus.register(PlaceDeletedEvent, handler)
    event_bus.register(VoteCastEvent, handler)
    event_bus.register(PlaceStatusChangedEvent, handler)
    event_bus.register(VotingResolvedEvent, handler)
    event_bus.register(ScheduleUpdatedEvent, handler)
    event_bus.register(ConflictDetectedEvent, handler)
    return handler


__all__ = [
    "CallableEventHandler",
    "IEventHandler",
    "LoggingEventHandler",
    "RecordingEventHandler",
    "WebSocketBroadcastHandler",
    "register_websocket_broadcast_handlers",
]

