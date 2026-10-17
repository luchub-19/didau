from abc import ABC, abstractmethod
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import PlaceCategory, PlaceStatus


class PlaceVoteSummary(BaseModel):
    """Thông tin tóm tắt địa điểm và điểm bình chọn (DTO theo CONTRACTS.md)."""

    place_id: UUID
    name: str
    category: PlaceCategory = PlaceCategory.OTHER
    status: PlaceStatus = PlaceStatus.PROPOSED
    submitted_by_id: UUID
    estimated_cost: int = 0
    open_minute: int | None = None
    close_minute: int | None = None
    created_at: datetime
    upvotes: int = 0
    downvotes: int = 0
    score: int = 0
    latitude: float | None = None
    longitude: float | None = None
    address: str | None = None


class TieBreakContext(BaseModel):
    """Ngữ cảnh dùng để giải quyết hòa phiếu (theo CONTRACTS.md)."""

    room_id: UUID
    host_member_id: UUID
    already_accepted_categories: list[PlaceCategory] = Field(default_factory=list)


class ITieBreakStrategy(ABC):
    """Interface chiến lược phân định hòa phiếu (Strategy Pattern)."""

    @property
    @abstractmethod
    def strategy_name(self) -> str:
        """Tên định danh của chiến lược."""

    @abstractmethod
    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        """Sắp xếp lại danh sách các địa điểm hòa phiếu theo mức độ ưu tiên.

        Args:
            candidates: Danh sách địa điểm cần phân định thứ tự ưu tiên.
            context: Ngữ cảnh thông tin phòng, host và các danh mục đã chấp nhận.

        Returns:
            Danh sách địa điểm đã được sắp xếp theo thứ tự ưu tiên từ cao xuống thấp.
        """
