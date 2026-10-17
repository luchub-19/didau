from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID


class IExpenseSplittingService(ABC):
    """Phase 2: Tính toán chia hóa đơn theo nhóm theo CONTRACTS.md."""

    @abstractmethod
    async def calculate_split(
        self,
        room_id: UUID,
        expenses: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Tính toán phân bổ chi phí giữa các thành viên trong phòng.

        Args:
            room_id: ID của phòng cần tính toán chi phí.
            expenses: Danh sách các khoản chi tiêu (người trả, số tiền, thành viên tham gia).

        Returns:
            Bảng tổng hợp chi phí, số tiền mỗi người cần đóng/nhận và các giao dịch thanh toán đề xuất.
        """
