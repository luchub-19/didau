from abc import ABC, abstractmethod
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from app.domain.patterns.itinerary.planner import DroppedPlace, PlanConstraints, PlannedSlot
    from app.domain.patterns.tie_break.strategy import PlaceVoteSummary


class IRouteOptimizationService(ABC):
    """Phase 2: Thuật toán tối ưu hóa lộ trình di chuyển qua nhiều địa điểm theo CONTRACTS.md."""

    @abstractmethod
    async def optimize_route(self, place_ids: list[UUID]) -> list[UUID]:
        """Sắp xếp lại thứ tự danh sách ID các địa điểm nhằm tối ưu hóa tổng quãng đường và thời gian di chuyển.

        Args:
            place_ids: Danh sách các UUID địa điểm cần ghé thăm.

        Returns:
            Danh sách các UUID địa điểm đã được sắp xếp theo thứ tự tối ưu.
        """

    @abstractmethod
    async def plan_day(
        self,
        places: "list[PlaceVoteSummary]",
        constraints: "PlanConstraints",
    ) -> "tuple[list[PlannedSlot], list[DroppedPlace]]":
        """Tự xếp lịch cho các địa điểm theo ràng buộc giờ, giờ mở cửa và thời gian di chuyển.

        Returns:
            (các slot đã xếp, các địa điểm bị loại kèm lý do).
        """
