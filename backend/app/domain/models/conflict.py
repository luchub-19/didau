from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc

if TYPE_CHECKING:
    from app.domain.models.room import Room


class Conflict(Base):
    """Bảng conflicts: Nhật ký xung đột hệ thống ghi nhận theo CONTRACTS.md."""

    __tablename__ = "conflicts"
    __table_args__ = (
        Index("idx_conflicts_room_id", "room_id"),
        Index("idx_conflicts_resolved", "resolved"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    room_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    level: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    entity_ids: Mapped[list[Any]] = mapped_column(
        JSON().with_variant(postgresql.JSONB(astext_type=Text()), "postgresql"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    resolved: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )

    # Relationships
    room: Mapped["Room"] = relationship(
        "Room",
        back_populates="conflicts",
    )
