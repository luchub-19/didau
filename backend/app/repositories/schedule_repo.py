from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.time_utils import now_utc
from app.domain.models.schedule import ScheduleItem
from app.repositories.base import BaseRepository, IScheduleRepository


class ScheduleRepository(BaseRepository, IScheduleRepository):
    """Triển khai truy vấn dữ liệu lịch trình (ScheduleItem) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_by_room(self, room_id: UUID) -> list[ScheduleItem]:
        """Lấy danh sách các mục lịch trình theo phòng, sắp xếp theo thời gian."""
        stmt = (
            select(ScheduleItem)
            .options(selectinload(ScheduleItem.place))
            .where(ScheduleItem.room_id == room_id)
            .order_by(
                ScheduleItem.day_offset.asc(),
                ScheduleItem.start_minute.asc(),
                ScheduleItem.order_index.asc(),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, item_data: dict[str, Any]) -> ScheduleItem:
        """Tạo mục lịch trình mới."""
        data = dict(item_data)
        if "room_id" in data and isinstance(data["room_id"], str):
            data["room_id"] = UUID(data["room_id"])
        if "place_id" in data and isinstance(data["place_id"], str):
            data["place_id"] = UUID(data["place_id"])

        item = ScheduleItem(**data)
        self.session.add(item)
        await self.session.flush()
        await self.session.refresh(item)

        # Nạp eager place
        stmt = (
            select(ScheduleItem)
            .options(selectinload(ScheduleItem.place))
            .where(ScheduleItem.id == item.id)
        )
        refreshed = await self.session.execute(stmt)
        return refreshed.scalar_one_or_none() or item

    async def bulk_update(
        self,
        room_id: UUID,
        items: list[dict[str, Any]],
    ) -> list[ScheduleItem]:
        """Cập nhật hàng loạt các mục lịch trình (sắp xếp kéo thả, đổi khung giờ)."""
        for item_data in items:
            raw_id = item_data.get("id")
            if raw_id is None:
                continue
            item_id = UUID(str(raw_id)) if not isinstance(raw_id, UUID) else raw_id

            stmt = select(ScheduleItem).where(
                ScheduleItem.id == item_id,
                ScheduleItem.room_id == room_id,
            )
            result = await self.session.execute(stmt)
            sched_item = result.scalar_one_or_none()
            if sched_item is not None:
                for field in (
                    "day_offset",
                    "start_minute",
                    "end_minute",
                    "order_index",
                    "note",
                ):
                    if field in item_data:
                        setattr(sched_item, field, item_data[field])
                sched_item.updated_at = now_utc()

        await self.session.flush()
        return await self.list_by_room(room_id)

    async def delete(self, item_id: UUID) -> bool:
        """Xóa mục lịch trình theo UUID."""
        item = await self.session.get(ScheduleItem, item_id)
        if item is None:
            return False

        await self.session.delete(item)
        await self.session.flush()
        return True
