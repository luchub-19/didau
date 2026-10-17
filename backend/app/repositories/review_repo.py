from abc import ABC, abstractmethod
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.review import PlaceReview
from app.repositories.base import BaseRepository


class IReviewRepository(ABC):
    """Interface truy vấn đánh giá nội bộ (PlaceReview) theo CR-02."""

    @abstractmethod
    async def list_by_external_key(self, external_key: str) -> list[PlaceReview]:
        """Lấy toàn bộ review của một quán, mới cập nhật nhất xếp trước."""

    @abstractmethod
    async def upsert(
        self,
        member_id: UUID,
        external_key: str,
        room_id: UUID | None,
        nickname: str,
        rating: int,
        comment: str | None,
        tags: list[str],
    ) -> PlaceReview:
        """Tạo hoặc ghi đè review của thành viên cho quán (duy nhất theo member + external_key)."""


class ReviewRepository(BaseRepository, IReviewRepository):
    """Hiện thực hóa IReviewRepository với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_by_external_key(self, external_key: str) -> list[PlaceReview]:
        stmt = (
            select(PlaceReview)
            .where(PlaceReview.external_key == external_key)
            .order_by(PlaceReview.updated_at.desc(), PlaceReview.id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def upsert(
        self,
        member_id: UUID,
        external_key: str,
        room_id: UUID | None,
        nickname: str,
        rating: int,
        comment: str | None,
        tags: list[str],
    ) -> PlaceReview:
        stmt = select(PlaceReview).where(
            PlaceReview.member_id == member_id,
            PlaceReview.external_key == external_key,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            existing.room_id = room_id
            existing.nickname = nickname
            existing.rating = rating
            existing.comment = comment
            existing.tags = tags
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        review = PlaceReview(
            member_id=member_id,
            external_key=external_key,
            room_id=room_id,
            nickname=nickname,
            rating=rating,
            comment=comment,
            tags=tags,
        )
        self.session.add(review)
        await self.session.flush()
        await self.session.refresh(review)
        return review
