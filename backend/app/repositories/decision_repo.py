from abc import ABC, abstractmethod
from typing import Any
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enums import DecisionStatus
from app.domain.models.decision import DecisionSession, DecisionSwipe
from app.repositories.base import BaseRepository


class IDecisionRepository(ABC):
    """Interface quản trị truy vấn thực thể DecisionSession và DecisionSwipe theo CR-02."""

    @abstractmethod
    async def get_by_id(self, session_id: UUID) -> DecisionSession | None:
        """Lấy phiên chọn hộ theo ID."""

    @abstractmethod
    async def get_open_session_by_room(self, room_id: UUID) -> DecisionSession | None:
        """Lấy phiên chọn hộ đang mở (OPEN) trong phòng nếu có."""

    @abstractmethod
    async def create_session(self, session_data: dict[str, Any]) -> DecisionSession:
        """Tạo mới một phiên chọn hộ."""

    @abstractmethod
    async def update_session(
        self, session_id: UUID, update_data: dict[str, Any]
    ) -> DecisionSession | None:
        """Cập nhật thông tin phiên chọn hộ."""

    @abstractmethod
    async def upsert_swipe(
        self, session_id: UUID, member_id: UUID, place_id: UUID, liked: bool
    ) -> DecisionSwipe:
        """Ghi nhận hoặc ghi đè lượt quẹt thẻ của thành viên."""

    @abstractmethod
    async def list_swipes_by_session(self, session_id: UUID) -> list[DecisionSwipe]:
        """Lấy danh sách tất cả các lượt quẹt thẻ của một phiên."""


class DecisionRepository(BaseRepository, IDecisionRepository):
    """Hiện thực hóa truy vấn DecisionSession và DecisionSwipe sử dụng SQLAlchemy Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_by_id(self, session_id: UUID) -> DecisionSession | None:
        stmt = select(DecisionSession).where(DecisionSession.id == session_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_open_session_by_room(self, room_id: UUID) -> DecisionSession | None:
        stmt = select(DecisionSession).where(
            DecisionSession.room_id == room_id,
            DecisionSession.status == DecisionStatus.OPEN.value,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_session(self, session_data: dict[str, Any]) -> DecisionSession:
        new_session = DecisionSession(**session_data)
        self.session.add(new_session)
        await self.session.flush()
        await self.session.refresh(new_session)
        return new_session

    async def update_session(
        self, session_id: UUID, update_data: dict[str, Any]
    ) -> DecisionSession | None:
        stmt = (
            update(DecisionSession)
            .where(DecisionSession.id == session_id)
            .values(**update_data)
            .returning(DecisionSession)
        )
        result = await self.session.execute(stmt)
        updated = result.scalar_one_or_none()
        if updated:
            await self.session.flush()
        return updated

    async def upsert_swipe(
        self, session_id: UUID, member_id: UUID, place_id: UUID, liked: bool
    ) -> DecisionSwipe:
        stmt = select(DecisionSwipe).where(
            DecisionSwipe.session_id == session_id,
            DecisionSwipe.member_id == member_id,
            DecisionSwipe.place_id == place_id,
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            existing.liked = liked
            await self.session.flush()
            return existing

        new_swipe = DecisionSwipe(
            session_id=session_id,
            member_id=member_id,
            place_id=place_id,
            liked=liked,
        )
        self.session.add(new_swipe)
        await self.session.flush()
        return new_swipe

    async def list_swipes_by_session(self, session_id: UUID) -> list[DecisionSwipe]:
        stmt = select(DecisionSwipe).where(DecisionSwipe.session_id == session_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
