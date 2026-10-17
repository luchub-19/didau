from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import (
    DecisionMode,
    DecisionStatus,
    MemberRole,
    PlaceCategory,
    PlaceStatus,
)


def _extract_attr(obj: Any, attr: str, default: Any = None) -> Any:
    """Helper trích xuất thuộc tính từ đối tượng object hoặc dict."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(attr, default)
    return getattr(obj, attr, default)


class DomainEvent(BaseModel):
    """Lớp cơ sở cho mọi Domain Event trong hệ thống Đi Đâu."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    event_id: UUID = Field(default_factory=generate_uuid)
    room_id: UUID
    occurred_at: datetime = Field(default_factory=now_utc)

    @property
    def event_type(self) -> str:
        """Tên định danh sự kiện dạng SCREAMING_SNAKE_CASE theo WebSocket CONTRACTS."""
        return self.__class__.__name__

    def to_envelope_payload(self) -> dict[str, Any]:
        """Chuyển đổi dữ liệu sự kiện thành payload chuẩn gửi qua WebSocket."""
        return self.model_dump(mode="json", exclude={"event_id", "room_id", "occurred_at"})

    def to_envelope(self) -> dict[str, Any]:
        """Đóng gói sự kiện thành WebSocket Envelope hoàn chỉnh {type, payload, ts}."""
        return {
            "type": self.event_type,
            "payload": self.to_envelope_payload(),
            "ts": int(self.occurred_at.timestamp() * 1000),
        }


class MemberJoinedEvent(DomainEvent):
    """Sự kiện thành viên mới tham gia phòng (MEMBER_JOINED)."""

    member_id: UUID
    nickname: str
    role: MemberRole | str = MemberRole.MEMBER
    avatar_url: str | None = None
    member: Any | None = None

    @model_validator(mode="before")
    @classmethod
    def _populate_from_member(cls, data: Any) -> Any:
        if isinstance(data, dict):
            member_obj = data.get("member")
            if member_obj is not None:
                if "member_id" not in data or data["member_id"] is None:
                    data["member_id"] = _extract_attr(member_obj, "id")
                if "nickname" not in data or data["nickname"] is None:
                    data["nickname"] = _extract_attr(member_obj, "nickname")
                if "role" not in data or data["role"] is None:
                    data["role"] = _extract_attr(member_obj, "role", MemberRole.MEMBER)
                if "avatar_url" not in data or data["avatar_url"] is None:
                    data["avatar_url"] = _extract_attr(member_obj, "avatar_url")
                if "room_id" not in data or data["room_id"] is None:
                    data["room_id"] = _extract_attr(member_obj, "room_id")
        return data

    @property
    def event_type(self) -> str:
        return "MEMBER_JOINED"

    def to_envelope_payload(self) -> dict[str, Any]:
        role_val = self.role.value if isinstance(self.role, MemberRole) else str(self.role)
        member_data: dict[str, Any] = {
            "id": str(self.member_id),
            "nickname": self.nickname,
            "role": role_val,
        }
        if self.avatar_url:
            member_data["avatar_url"] = self.avatar_url
        return {"member": member_data}


class MemberLeftEvent(DomainEvent):
    """Sự kiện thành viên rời phòng hoặc ngắt kết nối (MEMBER_LEFT)."""

    member_id: UUID
    nickname: str | None = None

    @property
    def event_type(self) -> str:
        return "MEMBER_LEFT"

    def to_envelope_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"member_id": str(self.member_id)}
        if self.nickname:
            payload["nickname"] = self.nickname
        return payload


class PlaceAddedEvent(DomainEvent):
    """Sự kiện địa điểm mới được đề xuất vào phòng (PLACE_ADDED)."""

    place_id: UUID
    name: str
    category: PlaceCategory | str = PlaceCategory.OTHER
    submitted_by_id: UUID | None = None
    estimated_cost: int = 0
    open_minute: int | None = None
    close_minute: int | None = None
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None
    place: Any | None = None

    @model_validator(mode="before")
    @classmethod
    def _populate_from_place(cls, data: Any) -> Any:
        if isinstance(data, dict):
            place_obj = data.get("place")
            if place_obj is not None:
                if "place_id" not in data or data["place_id"] is None:
                    data["place_id"] = _extract_attr(place_obj, "id")
                if "name" not in data or data["name"] is None:
                    data["name"] = _extract_attr(place_obj, "name", "")
                if "category" not in data or data["category"] is None:
                    data["category"] = _extract_attr(place_obj, "category", PlaceCategory.OTHER)
                if "submitted_by_id" not in data or data["submitted_by_id"] is None:
                    data["submitted_by_id"] = _extract_attr(place_obj, "submitted_by_id")
                if "estimated_cost" not in data or data["estimated_cost"] is None:
                    data["estimated_cost"] = _extract_attr(place_obj, "estimated_cost", 0)
                if "open_minute" not in data or data["open_minute"] is None:
                    data["open_minute"] = _extract_attr(place_obj, "open_minute")
                if "close_minute" not in data or data["close_minute"] is None:
                    data["close_minute"] = _extract_attr(place_obj, "close_minute")
                if "latitude" not in data or data["latitude"] is None:
                    data["latitude"] = _extract_attr(place_obj, "latitude")
                if "longitude" not in data or data["longitude"] is None:
                    data["longitude"] = _extract_attr(place_obj, "longitude")
                if "address" not in data or data["address"] is None:
                    data["address"] = _extract_attr(place_obj, "address")
                if "room_id" not in data or data["room_id"] is None:
                    data["room_id"] = _extract_attr(place_obj, "room_id")
        return data

    @property
    def event_type(self) -> str:
        return "PLACE_ADDED"

    def to_envelope_payload(self) -> dict[str, Any]:
        cat_val = (
            self.category.value if isinstance(self.category, PlaceCategory) else str(self.category)
        )
        data: dict[str, Any] = {
            "id": str(self.place_id),
            "name": self.name,
            "category": cat_val,
            "estimated_cost": self.estimated_cost,
        }
        if self.submitted_by_id:
            data["submitted_by_id"] = str(self.submitted_by_id)
        if self.open_minute is not None:
            data["open_minute"] = self.open_minute
        if self.close_minute is not None:
            data["close_minute"] = self.close_minute
        if self.latitude is not None:
            data["latitude"] = self.latitude
        if self.longitude is not None:
            data["longitude"] = self.longitude
        if self.address:
            data["address"] = self.address
        return {"place": data}


class PlaceDeletedEvent(DomainEvent):
    """Sự kiện địa điểm bị xóa khỏi phòng (PLACE_DELETED)."""

    place_id: UUID

    @property
    def event_type(self) -> str:
        return "PLACE_DELETED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {"place_id": str(self.place_id)}


class VoteCastEvent(DomainEvent):
    """Sự kiện thành viên bỏ phiếu, đổi phiếu hoặc hủy phiếu cho địa điểm (VOTE_UPDATED)."""

    place_id: UUID
    member_id: UUID
    vote_value: int  # 1 (UPVOTE), -1 (DOWNVOTE), 0 (Hủy vote)
    upvotes: int = 0
    downvotes: int = 0
    score: int = 0

    @property
    def event_type(self) -> str:
        return "VOTE_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {
            "place_id": str(self.place_id),
            "upvotes": self.upvotes,
            "downvotes": self.downvotes,
            "score": self.score,
        }


class PlaceStatusChangedEvent(DomainEvent):
    """Sự kiện trạng thái địa điểm thay đổi, ví dụ ACCEPTED, REJECTED (PLACE_UPDATED)."""

    place_id: UUID
    new_status: PlaceStatus | str
    old_status: PlaceStatus | str | None = None
    place: Any | None = None

    @model_validator(mode="before")
    @classmethod
    def _populate_from_place(cls, data: Any) -> Any:
        if isinstance(data, dict):
            place_obj = data.get("place")
            if place_obj is not None:
                if "place_id" not in data or data["place_id"] is None:
                    data["place_id"] = _extract_attr(place_obj, "id")
                if "new_status" not in data or data["new_status"] is None:
                    data["new_status"] = _extract_attr(
                        place_obj, "status", PlaceStatus.PROPOSED
                    )
                if "room_id" not in data or data["room_id"] is None:
                    data["room_id"] = _extract_attr(place_obj, "room_id")
        return data

    @property
    def event_type(self) -> str:
        return "PLACE_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        status_val = (
            self.new_status.value
            if isinstance(self.new_status, PlaceStatus)
            else str(self.new_status)
        )
        return {
            "place": {
                "id": str(self.place_id),
                "status": status_val,
            }
        }


class VotingResolvedEvent(DomainEvent):
    """Sự kiện Chủ phòng đã chốt kết quả vote bằng TieBreak (VOTING_RESOLVED)."""

    strategy: str
    accepted_place_ids: list[UUID] = Field(default_factory=list)

    @property
    def event_type(self) -> str:
        return "VOTING_RESOLVED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "accepted_place_ids": [str(pid) for pid in self.accepted_place_ids],
        }


class RoomUpdatedEvent(DomainEvent):
    """Sự kiện cấu hình phòng thay đổi (ROOM_UPDATED, CR-03)."""

    room: dict[str, Any] = Field(default_factory=dict)

    @property
    def event_type(self) -> str:
        return "ROOM_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {"room": self.room}


class ScheduleUpdatedEvent(DomainEvent):
    """Sự kiện lịch trình được sắp xếp hoặc cập nhật (SCHEDULE_UPDATED)."""

    items: list[dict[str, Any]] = Field(default_factory=list)
    updated_by_id: UUID | None = None

    @property
    def event_type(self) -> str:
        return "SCHEDULE_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {"items": self.items}


class ConflictDetectedEvent(DomainEvent):
    """Sự kiện phát hiện hoặc làm mới danh sách xung đột (CONFLICTS_UPDATED)."""

    conflicts: list[dict[str, Any]] = Field(default_factory=list)

    @property
    def event_type(self) -> str:
        return "CONFLICTS_UPDATED"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {"conflicts": self.conflicts}


class DecisionStartedEvent(DomainEvent):
    """Sự kiện phiên chọn hộ bắt đầu (DECISION_STARTED, CR-02)."""

    session_id: UUID
    mode: DecisionMode | str
    candidate_place_ids: list[Any] = Field(default_factory=list)
    seed: int
    result_place_id: UUID | None = None
    result_payload: dict[str, Any] | None = None
    closes_at: datetime | None = None

    @property
    def event_type(self) -> str:
        return "DECISION_STARTED"

    def to_envelope_payload(self) -> dict[str, Any]:
        mode_val = self.mode.value if isinstance(self.mode, DecisionMode) else str(self.mode)
        return {
            "session_id": str(self.session_id),
            "mode": mode_val,
            "candidate_place_ids": [str(pid) for pid in self.candidate_place_ids],
            "seed": self.seed,
            "result_place_id": str(self.result_place_id) if self.result_place_id else None,
            "result_payload": self.result_payload,
            "closes_at": self.closes_at.isoformat() if self.closes_at else None,
        }


class DecisionProgressEvent(DomainEvent):
    """Sự kiện cập nhật tiến độ người đã swipe (DECISION_PROGRESS, CR-02)."""

    session_id: UUID
    done_member_ids: list[Any] = Field(default_factory=list)
    total_members: int

    @property
    def event_type(self) -> str:
        return "DECISION_PROGRESS"

    def to_envelope_payload(self) -> dict[str, Any]:
        return {
            "session_id": str(self.session_id),
            "done_member_ids": [str(mid) for mid in self.done_member_ids],
            "total_members": self.total_members,
        }


class DecisionResolvedEvent(DomainEvent):
    """Sự kiện phiên chọn hộ đã chốt kết quả (DECISION_RESOLVED, CR-02)."""

    session_id: UUID
    result_place_id: UUID | None = None
    status: DecisionStatus | str = DecisionStatus.RESOLVED

    @property
    def event_type(self) -> str:
        return "DECISION_RESOLVED"

    def to_envelope_payload(self) -> dict[str, Any]:
        status_val = self.status.value if isinstance(self.status, DecisionStatus) else str(self.status)
        return {
            "session_id": str(self.session_id),
            "result_place_id": str(self.result_place_id) if self.result_place_id else None,
            "status": status_val,
        }

