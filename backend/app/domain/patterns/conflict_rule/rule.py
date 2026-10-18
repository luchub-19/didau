from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import ConflictLevel
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary


class ConflictResult(BaseModel):
    """Kết quả cảnh báo xung đột sinh ra từ IConflictRule (theo CONTRACTS.md, CR-06)."""

    rule_code: str
    level: ConflictLevel
    message: str
    entity_type: str
    entity_ids: list[UUID]
    params: dict[str, Any] = Field(default_factory=dict)


class ConflictContext(BaseModel):
    """Ngữ cảnh dữ liệu phòng để đánh giá xung đột (theo CONTRACTS.md)."""

    room_id: UUID
    budget_limit: int | None = None
    places: list[PlaceVoteSummary] = Field(default_factory=list)
    schedule_items: list[dict[str, Any]] = Field(default_factory=list)


class IConflictRule(ABC):
    """Interface quy tắc kiểm tra xung đột (Specification / Strategy Pattern)."""

    @property
    @abstractmethod
    def rule_code(self) -> str:
        """Mã định danh quy tắc (TIME_OVERLAP, TRAVEL_TIME, ...)."""

    @abstractmethod
    def evaluate(self, context: ConflictContext) -> list[ConflictResult]:
        """Đánh giá xung đột trên ngữ cảnh dữ liệu phòng.

        Args:
            context: Ngữ cảnh thông tin phòng, ngân sách, địa điểm và lịch trình.

        Returns:
            Danh sách các ConflictResult được phát hiện.
        """

