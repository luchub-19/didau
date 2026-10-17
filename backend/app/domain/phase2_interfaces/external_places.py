from abc import ABC, abstractmethod
from typing import Any


class IExternalPlacesProvider(ABC):
    """Phase 2: Đồng bộ trực tiếp Google Places / OpenStreetMap theo CONTRACTS.md."""

    @abstractmethod
    async def search_places(
        self,
        query: str,
        lat: float,
        lng: float,
    ) -> list[dict[str, Any]]:
        """Tìm kiếm địa điểm từ dịch vụ bản đồ bên ngoài quanh tọa độ chỉ định.

        Args:
            query: Từ khóa tìm kiếm (ví dụ: "quán phở", "cà phê").
            lat: Vĩ độ tâm tìm kiếm.
            lng: Kinh độ tâm tìm kiếm.

        Returns:
            Danh sách các địa điểm phù hợp kèm thông tin chi tiết.
        """
