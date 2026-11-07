from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_utc
from app.domain.models.room import Room
from app.repositories.base import BaseRepository, IRoomRepository


class RoomRepository(BaseRepository, IRoomRepository):
    """Triển khai truy vấn dữ liệu phòng (Room) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(self, room_id: UUID) -> Room | None:
        """Lấy thông tin phòng theo UUID."""
        stmt = select(Room).where(Room.id == room_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Room | None:
        """Lấy thông tin phòng theo mã chia sẻ (code 6 ký tự)."""
        clean_code = code.strip().upper()
        stmt = select(Room).where(Room.code == clean_code)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, room_data: dict[str, Any]) -> Room:
        """Tạo phòng mới từ dữ liệu dict."""
        data = dict(room_data)
        if "event_date" in data and isinstance(data["event_date"], str):
            data["event_date"] = date.fromisoformat(data["event_date"])

        room = Room(**data)
        self.session.add(room)
        await self.session.flush()
        await self.session.refresh(room)
        return room

    async def update(self, room_id: UUID, update_data: dict[str, Any]) -> Room | None:
        """Cập nhật các trường thông tin phòng."""
        room = await self.get_by_id(room_id)
        if room is None:
            return None

        data = dict(update_data)
        if "event_date" in data and isinstance(data["event_date"], str):
            data["event_date"] = date.fromisoformat(data["event_date"])

        for key, value in data.items():
            if hasattr(room, key):
                setattr(room, key, value)

        room.updated_at = now_utc()
        await self.session.flush()
        await self.session.refresh(room)
        return room

    async def bump_state_version(self, room_id: UUID) -> int:
        """Tăng state_version nguyên tử bằng một câu UPDATE ... RETURNING (CR-13).

        Câu UPDATE khoá hàng phòng đến hết transaction nên hai thay đổi đồng thời
        được tuần tự hoá và nhận hai số liên tiếp khác nhau.
        """
        stmt = (
            update(Room)
            .where(Room.id == room_id)
            # Giữ nguyên updated_at: đổi state_version không phải thay đổi cấu hình phòng
            .values(state_version=Room.state_version + 1, updated_at=Room.updated_at)
            .returning(Room.state_version)
        )
        result = await self.session.execute(stmt)
        new_version = result.scalar_one_or_none()
        return int(new_version or 0)

    async def get_state_version(self, room_id: UUID) -> int:
        """Đọc state_version hiện tại của phòng."""
        stmt = select(Room.state_version).where(Room.id == room_id)
        result = await self.session.execute(stmt)
        value = result.scalar_one_or_none()
        return int(value or 0)

    async def lock_for_update(self, room_id: UUID) -> None:
        """SELECT ... FOR NO KEY UPDATE hàng phòng.

        Dùng NO KEY UPDATE (không phải FOR UPDATE) vì FOR UPDATE xung đột với khoá KEY SHARE của
        kiểm tra khoá ngoại khi session khác (vd. handler xung đột) INSERT bản ghi con của phòng,
        gây treo. NO KEY UPDATE vẫn tuần tự hoá các request cùng phòng (và cùng mức với bump).
        """
        stmt = select(Room.id).where(Room.id == room_id).with_for_update(key_share=True)
        await self.session.execute(stmt)
