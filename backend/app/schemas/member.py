from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import MemberRole


class MemberResponse(BaseModel):
    """Schema biểu diễn thông tin thành viên theo CONTRACTS.md."""

    id: UUID
    room_id: UUID
    nickname: str
    avatar_url: str | None = None
    role: MemberRole | str = Field(default=MemberRole.MEMBER)
    is_active: bool = True
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RoomDetailMemberResponse(BaseModel):
    """Schema biểu diễn thành viên trong danh sách chi tiết phòng (GET /api/v1/rooms/{room_id})."""

    id: UUID
    nickname: str
    avatar_url: str | None = None
    role: MemberRole | str = Field(default=MemberRole.MEMBER)
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)
