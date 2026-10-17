from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_utc
from app.domain.models.member import Member
from app.repositories.base import BaseRepository, IMemberRepository


class MemberRepository(BaseRepository, IMemberRepository):
    """Triển khai truy vấn dữ liệu thành viên (Member) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_token(self, token: str) -> Member | None:
        """Tìm kiếm thành viên thông qua member_token bảo mật."""
        clean_token = token.strip()
        stmt = select(Member).where(Member.token == clean_token)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_room_and_nickname(self, room_id: UUID, nickname: str) -> Member | None:
        """Kiểm tra sự tồn tại của nickname trong một phòng cụ thể."""
        clean_nickname = nickname.strip()
        stmt = select(Member).where(
            Member.room_id == room_id,
            Member.nickname == clean_nickname,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_room(self, room_id: UUID) -> list[Member]:
        """Lấy toàn bộ danh sách thành viên trong phòng theo thứ tự tham gia."""
        stmt = (
            select(Member)
            .where(Member.room_id == room_id)
            .order_by(Member.joined_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, member_data: dict[str, Any]) -> Member:
        """Tạo thành viên mới trong phòng."""
        data = dict(member_data)
        if "room_id" in data and isinstance(data["room_id"], str):
            data["room_id"] = UUID(data["room_id"])
        if "nickname" in data:
            data["nickname"] = str(data["nickname"]).strip()

        member = Member(**data)
        self.session.add(member)
        await self.session.flush()
        await self.session.refresh(member)
        return member

    async def update_last_active(self, member_id: UUID) -> None:
        """Cập nhật timestamp hoạt động gần nhất của thành viên."""
        stmt = (
            update(Member)
            .where(Member.id == member_id)
            .values(last_active_at=now_utc())
        )
        await self.session.execute(stmt)
        await self.session.flush()
