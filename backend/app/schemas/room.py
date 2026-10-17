from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import RoomStatus, TieBreakStrategyName
from app.schemas.member import MemberResponse, RoomDetailMemberResponse


class CreateRoomRequest(BaseModel):
    """Payload tạo phòng mới theo CONTRACTS.md."""

    title: str = Field(..., min_length=1, max_length=255, description="Tiêu đề buổi đi chơi")
    description: str | None = Field(default=None, description="Mô tả chi tiết")
    event_date: date = Field(..., description="Ngày diễn ra sự kiện (YYYY-MM-DD)")
    creator_nickname: str = Field(
        ..., min_length=1, max_length=100, description="Biệt danh người tạo (Host)"
    )
    creator_avatar_url: str | None = Field(default=None, description="URL avatar người tạo")
    budget_limit: int | None = Field(default=None, ge=0, description="Hạn mức ngân sách (VNĐ)")
    tie_break_strategy: TieBreakStrategyName | str = Field(
        default=TieBreakStrategyName.EARLIEST_SUBMISSION,
        description="Chiến lược phân định hòa phiếu",
    )


class RoomResponse(BaseModel):
    """Thông tin phòng chuẩn theo CONTRACTS.md."""

    id: UUID
    code: str
    title: str
    description: str | None = None
    event_date: date
    status: RoomStatus | str = RoomStatus.PLANNING
    tie_break_strategy: TieBreakStrategyName | str = TieBreakStrategyName.EARLIEST_SUBMISSION
    budget_limit: int | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class CreateRoomResponse(BaseModel):
    """Kết quả phản hồi khi tạo phòng mới thành công (201 Created)."""

    room: RoomResponse
    creator_member: MemberResponse
    member_token: str


class JoinRoomRequest(BaseModel):
    """Payload tham gia phòng theo CONTRACTS.md."""

    room_code: str = Field(..., min_length=1, max_length=10, description="Mã chia sẻ phòng")
    nickname: str = Field(..., min_length=1, max_length=100, description="Biệt danh thành viên")
    avatar_url: str | None = Field(default=None, description="URL avatar thành viên")


class JoinRoomResponse(BaseModel):
    """Kết quả phản hồi khi tham gia phòng thành công (200 OK)."""

    room: RoomResponse
    member: MemberResponse
    member_token: str


class RoomDetailResponse(BaseModel):
    """Thông tin chi tiết toàn diện của phòng (GET /api/v1/rooms/{room_id})."""

    id: UUID
    code: str
    title: str
    description: str | None = None
    event_date: date
    status: RoomStatus | str = RoomStatus.PLANNING
    tie_break_strategy: TieBreakStrategyName | str = TieBreakStrategyName.EARLIEST_SUBMISSION
    budget_limit: int | None = None
    members: list[RoomDetailMemberResponse] = Field(default_factory=list)
    total_places: int = 0
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
