from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models.conflict import Conflict
from app.domain.patterns.conflict_rule.rule import ConflictResult
from app.repositories.base import BaseRepository, IConflictRepository


class ConflictRepository(BaseRepository, IConflictRepository):
    """Triển khai truy vấn dữ liệu cảnh báo xung đột (Conflict) với SQLAlchemy 2.0 Async."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def list_by_room(self, room_id: UUID) -> list[Conflict]:
        """Lấy danh sách xung đột đã ghi nhận của phòng theo thứ tự phát hiện."""
        stmt = (
            select(Conflict)
            .where(Conflict.room_id == room_id)
            .order_by(Conflict.created_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def replace_conflicts(
        self,
        room_id: UUID,
        conflicts: list[ConflictResult],
    ) -> list[Conflict]:
        """Xóa toàn bộ xung đột cũ của phòng và lưu trữ danh sách xung đột mới."""
        delete_stmt = delete(Conflict).where(Conflict.room_id == room_id)
        await self.session.execute(delete_stmt)

        created_conflicts: list[Conflict] = []
        for cr in conflicts:
            level_val = cr.level.value if hasattr(cr.level, "value") else str(cr.level)
            entity_ids_json = [str(eid) for eid in cr.entity_ids]

            conflict = Conflict(
                room_id=room_id,
                rule_code=cr.rule_code,
                level=level_val,
                message=cr.message,
                entity_type=cr.entity_type,
                entity_ids=entity_ids_json,
                params=cr.params or {},
                resolved=False,
            )
            self.session.add(conflict)
            created_conflicts.append(conflict)

        await self.session.flush()
        for item in created_conflicts:
            await self.session.refresh(item)
        return created_conflicts
