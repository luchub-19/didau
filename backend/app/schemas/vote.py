from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.domain.enums import PlaceStatus, TieBreakStrategyName


class CastVoteRequest(BaseModel):
    """Dữ liệu yêu cầu bỏ phiếu cho địa điểm theo CONTRACTS.md."""

    vote_value: int = Field(
        ...,
        ge=-1,
        le=1,
        description="Giá trị lá phiếu: 1 (Upvote), -1 (Downvote), 0 (Neutral/Hủy)",
    )


class VoteResponse(BaseModel):
    """Dữ liệu phản hồi chuẩn sau khi bỏ/hủy phiếu theo CONTRACTS.md."""

    model_config = ConfigDict(from_attributes=True)

    place_id: UUID
    upvotes: int = 0
    downvotes: int = 0
    score: int = 0
    current_user_vote: int = 0


class ResolveVotingRequest(BaseModel):
    """Dữ liệu yêu cầu chốt kết quả bình chọn (chỉ HOST) theo CONTRACTS.md."""

    strategy: TieBreakStrategyName = Field(
        ...,
        description="Tên chiến lược phân định hòa phiếu",
    )
    max_accepted_places: int = Field(
        ...,
        gt=0,
        description="Số lượng địa điểm tối đa được chấp nhận (ACCEPTED)",
    )


class ResolvedPlaceResponse(BaseModel):
    """Thông tin địa điểm sau khi chốt kết quả bình chọn."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    status: PlaceStatus
    score: int = 0
    upvotes: int = 0


class ResolveVotingResponse(BaseModel):
    """Dữ liệu phản hồi sau khi chốt kết quả bình chọn theo CONTRACTS.md."""

    resolved_places: list[ResolvedPlaceResponse]
    tie_break_applied: bool = False
    tie_break_strategy: str
