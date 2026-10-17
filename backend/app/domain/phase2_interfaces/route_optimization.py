from abc import ABC, abstractmethod
from uuid import UUID


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
