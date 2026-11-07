from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.domain.enums import MemberRole


class MemberResponse(BaseModel):
    """Thành viên ở dạng CÔNG KHAI: người khác chỉ thấy `has_origin`, không có toạ độ (CR-11)."""

    id: UUID
    room_id: UUID
    nickname: str
    avatar_url: str | None = None
    role: MemberRole | str = Field(default=MemberRole.MEMBER)
    is_active: bool = True
    has_origin: bool = False
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SelfMemberResponse(MemberResponse):
    """Thành viên ở dạng DÀNH CHO CHÍNH CHỦ: kèm toạ độ xuất phát riêng (CR-11).

    Chỉ dùng cho `GET /members/me`, phản hồi `PATCH .../members/me`, tạo/vào phòng (chính người
    gọi) và mục của chính người nhận trong `ROOM_STATE_SYNC`. Không bao giờ dùng cho người khác.
    """

    origin_lat: float | None = None
    origin_lng: float | None = None


class RoomDetailMemberResponse(BaseModel):
    """Schema biểu diễn thành viên trong danh sách chi tiết phòng (GET /api/v1/rooms/{room_id})."""

    id: UUID
    nickname: str
    avatar_url: str | None = None
    role: MemberRole | str = Field(default=MemberRole.MEMBER)
    is_active: bool = True
    has_origin: bool = False

    model_config = ConfigDict(from_attributes=True)


class UpdateMyOriginRequest(BaseModel):
    """Payload `PATCH /rooms/{room_id}/members/me` (CR-11).

    Cả hai phải có mặt trong body: cả hai `null` = xoá vị trí; chỉ một `null` hoặc thiếu = 422.
    """

    origin_lat: float | None = Field(..., ge=-90.0, le=90.0, description="Vĩ độ xuất phát")
    origin_lng: float | None = Field(..., ge=-180.0, le=180.0, description="Kinh độ xuất phát")

    @model_validator(mode="after")
    def _both_or_none(self) -> Self:
        if (self.origin_lat is None) != (self.origin_lng is None):
            # PydanticCustomError (không phải ValueError) để `errors()` serialize được thành JSON 422
            raise PydanticCustomError(
                "origin_pair",
                "origin_lat và origin_lng phải cùng có giá trị hoặc cùng là null.",
            )
        return self
