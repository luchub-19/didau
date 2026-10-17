from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.time_utils import now_utc
from app.domain.models.place import Place
from app.repositories.base import BaseRepository, IPlaceRepository


class PlaceRepository(BaseRepository, IPlaceRepository):
    """Triển khai truy vấn dữ liệu địa điểm (Place) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(self, place_id: UUID) -> Place | None:
        """Lấy thông tin địa điểm theo UUID kèm thông tin người đề xuất."""
        stmt = (
            select(Place)
            .options(selectinload(Place.submitted_by))
            .where(Place.id == place_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_room(self, room_id: UUID) -> list[Place]:
        """Lấy danh sách các địa điểm trong phòng theo thứ tự đề xuất."""
        stmt = (
            select(Place)
            .options(selectinload(Place.submitted_by))
            .where(Place.room_id == room_id)
            .order_by(Place.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, place_data: dict[str, Any]) -> Place:
        """Thêm mới địa điểm đề xuất."""
        data = dict(place_data)
        if "room_id" in data and isinstance(data["room_id"], str):
            data["room_id"] = UUID(data["room_id"])
        if "submitted_by_id" in data and isinstance(data["submitted_by_id"], str):
            data["submitted_by_id"] = UUID(data["submitted_by_id"])

        place = Place(**data)
        self.session.add(place)
        await self.session.flush()
        # Nạp lại quan hệ submitted_by nếu có
        await self.session.refresh(place)
        return await self.get_by_id(place.id) or place

    async def update(self, place_id: UUID, update_data: dict[str, Any]) -> Place | None:
        """Cập nhật thông tin địa điểm."""
        place = await self.get_by_id(place_id)
        if place is None:
            return None

        data = dict(update_data)
        for key, value in data.items():
            if hasattr(place, key):
                setattr(place, key, value)

        place.updated_at = now_utc()
        await self.session.flush()
        await self.session.refresh(place)
        return place

    async def delete(self, place_id: UUID) -> bool:
        """Xóa địa điểm theo UUID."""
        place = await self.session.get(Place, place_id)
        if place is None:
            return False

        await self.session.delete(place)
        await self.session.flush()
        return True
