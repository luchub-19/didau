from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc

if TYPE_CHECKING:
    from app.domain.models.place import Place
    from app.domain.models.room import Room


class ScheduleItem(Base):
    """Bảng schedule_items: Lịch trình thời gian cho các địa điểm theo CONTRACTS.md."""

    __tablename__ = "schedule_items"
    __table_args__ = (
        CheckConstraint("day_offset >= 0", name="chk_schedule_day_offset"),
        CheckConstraint(
            "start_minute >= 0 AND start_minute <= 1439",
            name="chk_schedule_start_minute",
        ),
        CheckConstraint(
            "end_minute >= 0 AND end_minute <= 1439",
            name="chk_schedule_end_minute",
        ),
        CheckConstraint("start_minute < end_minute", name="chk_schedule_minutes"),
        Index("idx_schedule_room_id", "room_id"),
        Index("idx_schedule_place_id", "place_id"),
        Index("idx_schedule_day_order", "room_id", "day_offset", "start_minute"),
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
    place_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("places.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_offset: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    start_minute: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    end_minute: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    order_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
    note: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        default=now_utc,
    )

    # Relationships
    room: Mapped["Room"] = relationship(
        "Room",
        back_populates="schedule_items",
    )
    place: Mapped["Place"] = relationship(
        "Place",
        back_populates="schedule_items",
    )
