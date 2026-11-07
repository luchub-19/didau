from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.patterns.conflict_rule.rule import ConflictResult


class BaseRepository:
    """Lớp cơ sở cho toàn bộ Repositories thao tác qua AsyncSession."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session


class IRoomRepository(ABC):
    """Interface quản trị truy vấn thực thể Room theo CONTRACTS.md."""

    @abstractmethod
    async def get_by_id(self, room_id: UUID) -> Any | None:
        """Lấy thông tin phòng theo ID."""

    @abstractmethod
    async def get_by_code(self, code: str) -> Any | None:
        """Lấy thông tin phòng theo mã chia sẻ (room_code)."""

    @abstractmethod
    async def create(self, room_data: dict[str, Any]) -> Any:
        """Tạo mới một phòng."""

    @abstractmethod
    async def update(self, room_id: UUID, update_data: dict[str, Any]) -> Any | None:
        """Cập nhật thông tin phòng."""

    async def bump_state_version(self, room_id: UUID) -> int:
        """Tăng `rooms.state_version` thêm 1 trong transaction hiện tại và trả số mới (CR-13).

        Mặc định không làm gì (repo giả lập trong test không có cột này) và trả 0.
        """
        return 0

    async def get_state_version(self, room_id: UUID) -> int:
        """Đọc `rooms.state_version` hiện tại (0 nếu không có phòng)."""
        return 0

    async def lock_for_update(self, room_id: UUID) -> None:
        """Khoá hàng phòng đến hết transaction để tuần tự hoá thao tác cùng phòng (CR-14)."""


class IMemberRepository(ABC):
    """Interface quản trị truy vấn thực thể Member theo CONTRACTS.md."""

    @abstractmethod
    async def get_by_token(self, token: str) -> Any | None:
        """Lấy thành viên theo secret token."""

    @abstractmethod
    async def get_by_room_and_nickname(self, room_id: UUID, nickname: str) -> Any | None:
        """Lấy thành viên theo room_id và nickname."""

    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> list[Any]:
        """Lấy danh sách thành viên trong phòng."""

    @abstractmethod
    async def create(self, member_data: dict[str, Any]) -> Any:
        """Tạo mới một thành viên."""

    @abstractmethod
    async def update_last_active(self, member_id: UUID) -> None:
        """Cập nhật thời điểm hoạt động cuối cùng của thành viên."""

    async def set_origin(
        self, member_id: UUID, origin_lat: float | None, origin_lng: float | None
    ) -> Any | None:
        """Ghi vị trí xuất phát riêng của thành viên (cả hai None = xoá) (CR-11)."""
        raise NotImplementedError


class IPlaceRepository(ABC):
    """Interface quản trị truy vấn thực thể Place theo CONTRACTS.md."""

    @abstractmethod
    async def get_by_id(self, place_id: UUID) -> Any | None:
        """Lấy thông tin địa điểm theo ID."""

    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> list[Any]:
        """Lấy danh sách các địa điểm trong phòng."""

    @abstractmethod
    async def create(self, place_data: dict[str, Any]) -> Any:
        """Thêm mới địa điểm đề xuất."""

    @abstractmethod
    async def update(self, place_id: UUID, update_data: dict[str, Any]) -> Any | None:
        """Cập nhật thông tin địa điểm."""

    @abstractmethod
    async def delete(self, place_id: UUID) -> bool:
        """Xóa địa điểm theo ID."""


class IVoteRepository(ABC):
    """Interface quản trị truy vấn thực thể Vote theo CONTRACTS.md."""

    @abstractmethod
    async def get_vote(self, place_id: UUID, member_id: UUID) -> Any | None:
        """Lấy lá phiếu của thành viên cho địa điểm cụ thể."""

    @abstractmethod
    async def upsert_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> Any:
        """Bỏ phiếu hoặc cập nhật lá phiếu (+1, -1, 0)."""

    @abstractmethod
    async def delete_vote(self, place_id: UUID, member_id: UUID) -> bool:
        """Hủy/Rút lá phiếu bầu."""

    @abstractmethod
    async def get_vote_summary_by_room(self, room_id: UUID) -> dict[UUID, dict[str, int]]:
        """Tổng hợp kết quả vote (upvotes, downvotes, score) của toàn bộ địa điểm trong phòng."""


class IScheduleRepository(ABC):
    """Interface quản trị truy vấn thực thể ScheduleItem theo CONTRACTS.md."""

    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> list[Any]:
        """Lấy danh sách lịch trình theo phòng, sắp xếp theo thời gian."""

    @abstractmethod
    async def create(self, item_data: dict[str, Any]) -> Any:
        """Tạo một mục lịch trình mới."""

    @abstractmethod
    async def bulk_update(self, room_id: UUID, items: list[dict[str, Any]]) -> list[Any]:
        """Cập nhật hàng loạt các mục lịch trình (kéo thả sắp xếp, đổi giờ)."""

    @abstractmethod
    async def delete(self, item_id: UUID) -> bool:
        """Xóa mục lịch trình theo ID."""


class IConflictRepository(ABC):
    """Interface quản trị truy vấn thực thể Conflict theo CONTRACTS.md."""

    @abstractmethod
    async def list_by_room(self, room_id: UUID) -> list[Any]:
        """Lấy danh sách các cảnh báo xung đột được ghi nhận cho phòng."""

    @abstractmethod
    async def replace_conflicts(
        self,
        room_id: UUID,
        conflicts: list[ConflictResult],
    ) -> list[Any]:
        """Thay thế toàn bộ cảnh báo xung đột hiện tại của phòng bằng danh sách mới."""
