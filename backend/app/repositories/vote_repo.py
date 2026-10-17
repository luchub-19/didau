from uuid import UUID

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_utils import now_utc
from app.domain.models.place import Place
from app.domain.models.vote import Vote
from app.repositories.base import BaseRepository, IVoteRepository


class VoteRepository(BaseRepository, IVoteRepository):
    """Triển khai truy vấn dữ liệu bỏ phiếu (Vote) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def get_vote(self, place_id: UUID, member_id: UUID) -> Vote | None:
        """Lấy lá phiếu của thành viên cho một địa điểm cụ thể."""
        stmt = select(Vote).where(
            Vote.place_id == place_id,
            Vote.member_id == member_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_vote(self, place_id: UUID, member_id: UUID, vote_value: int) -> Vote:
        """Bỏ phiếu hoặc cập nhật phiếu bầu đã có (+1, -1, 0)."""
        existing_vote = await self.get_vote(place_id, member_id)
        if existing_vote is not None:
            existing_vote.vote_value = vote_value
            existing_vote.updated_at = now_utc()
            await self.session.flush()
            await self.session.refresh(existing_vote)
            return existing_vote

        new_vote = Vote(
            place_id=place_id,
            member_id=member_id,
            vote_value=vote_value,
        )
        self.session.add(new_vote)
        await self.session.flush()
        await self.session.refresh(new_vote)
        return new_vote

    async def delete_vote(self, place_id: UUID, member_id: UUID) -> bool:
        """Rút/Hủy lá phiếu bầu của thành viên."""
        vote = await self.get_vote(place_id, member_id)
        if vote is None:
            return False

        await self.session.delete(vote)
        await self.session.flush()
        return True

    async def get_vote_summary_by_room(self, room_id: UUID) -> dict[UUID, dict[str, int]]:
        """Tổng hợp điểm số của toàn bộ địa điểm trong phòng qua SQL Aggregation.

        Trả về:
            dict[place_id, {"upvotes": int, "downvotes": int, "score": int}]
        """
        stmt = (
            select(
                Place.id,
                func.coalesce(
                    func.sum(case((Vote.vote_value == 1, 1), else_=0)),
                    0,
                ).label("upvotes"),
                func.coalesce(
                    func.sum(case((Vote.vote_value == -1, 1), else_=0)),
                    0,
                ).label("downvotes"),
                func.coalesce(
                    func.sum(Vote.vote_value),
                    0,
                ).label("score"),
            )
            .outerjoin(Vote, Place.id == Vote.place_id)
            .where(Place.room_id == room_id)
            .group_by(Place.id)
        )
        result = await self.session.execute(stmt)
        summary: dict[UUID, dict[str, int]] = {}
        for row in result.all():
            summary[row[0]] = {
                "upvotes": int(row[1]),
                "downvotes": int(row[2]),
                "score": int(row[3]),
            }
        return summary
