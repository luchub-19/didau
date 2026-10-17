from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import select
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
