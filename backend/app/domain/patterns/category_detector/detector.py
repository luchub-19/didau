from abc import ABC, abstractmethod

from app.domain.enums import PlaceCategory


class IPlaceCategoryDetector(ABC):
    """Interface nhận diện danh mục địa điểm (PlaceCategory)."""

    @abstractmethod
    def detect(
        self,
        name: str,
        address: str | None = None,
        url: str | None = None,
        tags: list[str] | None = None,
    ) -> PlaceCategory:
        """Nhận diện danh mục của địa điểm dựa trên văn bản và đường dẫn.

        Args:
            name: Tên địa điểm.
            address: Địa chỉ địa điểm (nếu có).
            url: Đường dẫn tham chiếu (ShopeeFood, Grab, Booking, Agoda,... nếu có).
            tags: Danh sách nhãn tag (nếu có).

        Returns:
            PlaceCategory tương ứng đã nhận diện được.
        """
