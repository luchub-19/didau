from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.core.time_utils import now_utc

T = TypeVar("T")


class WebSocketEnvelope(BaseModel, Generic[T]):
    """Chuẩn đóng gói khung dữ liệu WebSocket {type, payload, ts} theo CONTRACTS.md."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    type: str = Field(description="Tên sự kiện dạng SCREAMING_SNAKE_CASE")
    payload: T = Field(default_factory=dict, description="Nội dung dữ liệu của sự kiện")
    ts: int = Field(
        default_factory=lambda: int(now_utc().timestamp() * 1000),
        description="Mốc thời gian phát sinh sự kiện (epoch millisecond UTC)",
    )


class SocketErrorPayload(BaseModel):
    """Payload thông báo lỗi socket (Server -> Client)."""

    code: str
    message: str
    details: dict[str, Any] | None = None


class TypingPlacePayload(BaseModel):
    """Payload báo hiệu thành viên đang nhập địa điểm (Client <-> Server)."""

    is_typing: bool = True
    nickname: str | None = None
    member_id: UUID | str | None = None


class SubscribeRoomPayload(BaseModel):
    """Payload yêu cầu đồng bộ toàn diện phòng (Client -> Server)."""

    room_id: UUID


class RoomStateSyncPayload(BaseModel):
    """Payload đồng bộ toàn bộ dữ liệu phòng khi vừa kết nối (Server -> Client)."""

    room: dict[str, Any]
    members: list[dict[str, Any]]
    places: list[dict[str, Any]]
    schedule: list[dict[str, Any]]
    conflicts: list[dict[str, Any]]
